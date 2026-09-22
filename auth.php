<?php
/**
 * auth.php — API de Autenticação Inova+ Helpdesk
 * absprinter © 2025
 *
 * Endpoints (POST com JSON):
 *   action=login        → { email, password, fingerprint }
 *   action=logout       → (Authorization: Bearer <token>)
 *   action=refresh      → { refresh_token }
 *   action=register     → { name, email, password, dept }
 *   action=me           → (Authorization: Bearer <token>)
 *   action=change_pass  → { current_password, new_password } + Authorization
 *   action=forgot       → { email }
 *   action=reset        → { token, new_password }
 *   action=verify_mfa   → { user_id, code }
 */

declare(strict_types=1);

// ── Config ───────────────────────────────────────────────────────────────────
define('JWT_SECRET',         'inova_secret_2025_absprinter_' . php_uname('n'));
define('JWT_TTL',            8 * 3600);           // 8 horas
define('JWT_REFRESH_TTL',    30 * 24 * 3600);     // 30 dias
define('MAX_ATTEMPTS',       5);
define('LOCKOUT_SECONDS',    30);
define('DATA_DIR',           __DIR__ . '/data');
define('USERS_FILE',         DATA_DIR . '/users.json');
define('SESSIONS_FILE',      DATA_DIR . '/sessions.json');
define('RATE_FILE',          DATA_DIR . '/rate_limits.json');
define('AUDIT_FILE',         DATA_DIR . '/audit.log');

// ── Headers ───────────────────────────────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// ── Filesystem init ───────────────────────────────────────────────────────────
if (!is_dir(DATA_DIR)) mkdir(DATA_DIR, 0750, true);
foreach ([USERS_FILE, SESSIONS_FILE, RATE_FILE] as $f) {
    if (!file_exists($f)) file_put_contents($f, '{}', LOCK_EX);
}

// Seed initial users if empty
if (file_get_contents(USERS_FILE) === '{}') seedUsers();

// ── Router ────────────────────────────────────────────────────────────────────
$body = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $body['action'] ?? ($_GET['action'] ?? '');

try {
    match($action) {
        'login'       => handleLogin($body),
        'logout'      => handleLogout(),
        'refresh'     => handleRefresh($body),
        'register'    => handleRegister($body),
        'me'          => handleMe(),
        'change_pass' => handleChangePassword($body),
        'forgot'      => handleForgot($body),
        'reset'       => handleReset($body),
        'verify_mfa'  => handleVerifyMFA($body),
        default       => jsonError(404, "Ação '$action' não encontrada."),
    };
} catch (Throwable $e) {
    jsonError(500, 'Erro interno: ' . $e->getMessage());
}

// ══════════════════════════════════════════════════════════════════════════════
// HANDLERS
// ══════════════════════════════════════════════════════════════════════════════

function handleLogin(array $body): void
{
    $email    = trim($body['email']    ?? '');
    $password = $body['password']      ?? '';
    $fp       = sanitize($body['fingerprint'] ?? '');
    $ip       = getClientIP();

    if (!$email || !$password) jsonError(400, 'E-mail e senha são obrigatórios.');

    // Rate limiting
    if (!RateLimit::check("login:$ip")) {
        $wait = RateLimit::lockoutRemaining("login:$ip");
        jsonError(429, "Muitas tentativas. Aguarde {$wait}s.");
    }

    $users = loadUsers();
    $user  = null;
    foreach ($users as $u) {
        if (strtolower($u['email']) === strtolower($email)) { $user = $u; break; }
    }

    if (!$user || !password_verify($password, $user['password_hash'])) {
        RateLimit::record("login:$ip");
        audit('LOGIN_FAIL', ['email' => $email, 'ip' => $ip]);
        jsonError(401, 'E-mail ou senha incorretos.');
    }

    if (!($user['active'] ?? true)) {
        jsonError(403, 'Conta desativada. Contate o administrador.');
    }

    RateLimit::reset("login:$ip");

    $safeUser = safeUser($user);

    // MFA required?
    if ($user['mfa_enabled'] ?? false) {
        $mfaCode = generateMFACode();
        storeMFACode($user['id'], $mfaCode);
        // In production: send via email/SMS
        // sendMFAEmail($user['email'], $mfaCode);
        audit('MFA_SENT', ['user_id' => $user['id'], 'ip' => $ip]);
        json200(['success' => true, 'require_mfa' => true, 'user_id' => $user['id'],
                 '_dev_code' => $mfaCode]); // REMOVE _dev_code in production
        return;
    }

    $token        = JWT::encode(['sub' => $user['id'], 'role' => $user['role'], 'email' => $user['email']], JWT_TTL);
    $refreshToken = JWT::encode(['sub' => $user['id'], 'type' => 'refresh'], JWT_REFRESH_TTL);

    storeSession($user['id'], $token, $refreshToken, $fp, $ip);
    updateLastLogin($user['id']);
    audit('LOGIN_OK', ['user_id' => $user['id'], 'ip' => $ip]);

    json200(['success' => true, 'user' => $safeUser, 'token' => $token, 'refresh_token' => $refreshToken]);
}

function handleLogout(): void
{
    $token = getBearerToken();
    if ($token) {
        $payload = JWT::verify($token);
        if ($payload) {
            revokeSession($payload['sub'] ?? 0, $token);
            audit('LOGOUT', ['user_id' => $payload['sub'] ?? 0, 'ip' => getClientIP()]);
        }
    }
    json200(['success' => true, 'message' => 'Logout realizado.']);
}

function handleRefresh(array $body): void
{
    $refreshToken = $body['refresh_token'] ?? '';
    if (!$refreshToken) jsonError(400, 'refresh_token obrigatório.');

    $payload = JWT::verify($refreshToken);
    if (!$payload || ($payload['type'] ?? '') !== 'refresh') {
        jsonError(401, 'Refresh token inválido ou expirado.');
    }

    $users = loadUsers();
    $user  = $users[$payload['sub']] ?? null;
    if (!$user || !($user['active'] ?? true)) jsonError(401, 'Usuário não encontrado.');

    $newToken = JWT::encode(['sub' => $user['id'], 'role' => $user['role'], 'email' => $user['email']], JWT_TTL);
    audit('TOKEN_REFRESH', ['user_id' => $user['id'], 'ip' => getClientIP()]);

    json200(['success' => true, 'token' => $newToken]);
}

function handleRegister(array $body): void
{
    $name     = sanitize($body['name']     ?? '');
    $email    = trim(strtolower($body['email']    ?? ''));
    $password = $body['password'] ?? '';
    $dept     = sanitize($body['dept']     ?? 'TI');

    if (!$name || !$email || !$password) jsonError(400, 'Campos obrigatórios ausentes.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) jsonError(400, 'E-mail inválido.');
    if (strlen($password) < 8) jsonError(400, 'Senha deve ter no mínimo 8 caracteres.');

    $users = loadUsers();
    foreach ($users as $u) {
        if (strtolower($u['email']) === $email) jsonError(409, 'E-mail já cadastrado.');
    }

    $id = count($users) + 1;
    $initials = implode('', array_map(fn($w) => strtoupper($w[0]), array_slice(explode(' ', $name), 0, 2)));

    $users[$id] = [
        'id'            => $id,
        'name'          => $name,
        'email'         => $email,
        'password_hash' => password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]),
        'role'          => 'pending', // Requires admin approval
        'initials'      => $initials,
        'dept'          => $dept,
        'mfa_enabled'   => false,
        'active'        => false,     // Inactive until approved
        'created_at'    => date('Y-m-d H:i:s'),
        'last_login'    => null,
    ];

    saveUsers($users);
    audit('REGISTER', ['email' => $email, 'ip' => getClientIP()]);

    json200(['success' => true, 'message' => 'Conta criada. Aguarde aprovação do administrador.']);
}

function handleMe(): void
{
    $token   = getBearerToken();
    $payload = $token ? JWT::verify($token) : null;
    if (!$payload) jsonError(401, 'Token inválido ou expirado.');

    $users = loadUsers();
    $user  = $users[$payload['sub']] ?? null;
    if (!$user) jsonError(404, 'Usuário não encontrado.');

    json200(['success' => true, 'user' => safeUser($user)]);
}

function handleChangePassword(array $body): void
{
    $token   = getBearerToken();
    $payload = $token ? JWT::verify($token) : null;
    if (!$payload) jsonError(401, 'Não autenticado.');

    $currentPass = $body['current_password'] ?? '';
    $newPass     = $body['new_password']     ?? '';

    if (strlen($newPass) < 8) jsonError(400, 'Nova senha deve ter no mínimo 8 caracteres.');

    $users = loadUsers();
    $user  = &$users[$payload['sub']];
    if (!$user) jsonError(404, 'Usuário não encontrado.');
    if (!password_verify($currentPass, $user['password_hash'])) jsonError(401, 'Senha atual incorreta.');

    $user['password_hash'] = password_hash($newPass, PASSWORD_BCRYPT, ['cost' => 12]);
    $user['updated_at']    = date('Y-m-d H:i:s');
    saveUsers($users);
    audit('CHANGE_PASSWORD', ['user_id' => $payload['sub'], 'ip' => getClientIP()]);

    json200(['success' => true, 'message' => 'Senha alterada com sucesso.']);
}

function handleForgot(array $body): void
{
    $email = trim(strtolower($body['email'] ?? ''));
    if (!$email) jsonError(400, 'E-mail obrigatório.');

    // Always return success to prevent email enumeration
    $users = loadUsers();
    foreach ($users as $user) {
        if (strtolower($user['email']) === $email) {
            $resetToken = bin2hex(random_bytes(32));
            storeResetToken($user['id'], $resetToken);
            // sendResetEmail($email, $resetToken); // Implement with PHPMailer/SMTP
            audit('FORGOT_PASSWORD', ['email' => $email, 'ip' => getClientIP()]);
            break;
        }
    }

    json200(['success' => true, 'message' => 'Se o e-mail estiver cadastrado, você receberá um link em breve.']);
}

function handleReset(array $body): void
{
    $resetToken = $body['token']        ?? '';
    $newPass    = $body['new_password'] ?? '';

    if (!$resetToken || strlen($newPass) < 8) jsonError(400, 'Dados inválidos.');

    $userId = validateResetToken($resetToken);
    if (!$userId) jsonError(400, 'Token de recuperação inválido ou expirado.');

    $users = loadUsers();
    if (!isset($users[$userId])) jsonError(404, 'Usuário não encontrado.');

    $users[$userId]['password_hash'] = password_hash($newPass, PASSWORD_BCRYPT, ['cost' => 12]);
    $users[$userId]['updated_at']    = date('Y-m-d H:i:s');
    saveUsers($users);
    invalidateResetToken($resetToken);
    audit('RESET_PASSWORD', ['user_id' => $userId, 'ip' => getClientIP()]);

    json200(['success' => true, 'message' => 'Senha redefinida com sucesso.']);
}

function handleVerifyMFA(array $body): void
{
    $userId = (int)($body['user_id'] ?? 0);
    $code   = preg_replace('/\D/', '', $body['code'] ?? '');

    if (!$userId || strlen($code) !== 6) jsonError(400, 'Dados inválidos.');

    if (!validateMFACode($userId, $code)) {
        jsonError(401, 'Código inválido ou expirado.');
    }

    $users = loadUsers();
    $user  = $users[$userId] ?? null;
    if (!$user) jsonError(404, 'Usuário não encontrado.');

    $token        = JWT::encode(['sub' => $user['id'], 'role' => $user['role'], 'email' => $user['email']], JWT_TTL);
    $refreshToken = JWT::encode(['sub' => $user['id'], 'type' => 'refresh'], JWT_REFRESH_TTL);

    storeSession($userId, $token, $refreshToken, '', getClientIP());
    updateLastLogin($userId);
    audit('MFA_OK', ['user_id' => $userId, 'ip' => getClientIP()]);

    json200(['success' => true, 'user' => safeUser($user), 'token' => $token, 'refresh_token' => $refreshToken]);
}

// ══════════════════════════════════════════════════════════════════════════════
// JWT
// ══════════════════════════════════════════════════════════════════════════════
class JWT
{
    static function encode(array $payload, int $ttl = 3600): string
    {
        $payload['iat'] = time();
        $payload['exp'] = time() + $ttl;

        $header    = base64url(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $body      = base64url(json_encode($payload));
        $signature = base64url(hash_hmac('sha256', "$header.$body", JWT_SECRET, true));

        return "$header.$body.$signature";
    }

    static function verify(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) return null;

        [$header, $body, $sig] = $parts;
        $expected = base64url(hash_hmac('sha256', "$header.$body", JWT_SECRET, true));

        if (!hash_equals($expected, $sig)) return null;

        $payload = json_decode(base64_decode(strtr($body, '-_', '+/')), true);
        if (!$payload) return null;
        if (isset($payload['exp']) && $payload['exp'] < time()) return null;

        return $payload;
    }
}

function base64url(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

// ══════════════════════════════════════════════════════════════════════════════
// RATE LIMITER
// ══════════════════════════════════════════════════════════════════════════════
class RateLimit
{
    static function check(string $key): bool
    {
        $data = self::load();
        $now  = time();
        $attempts = array_filter($data[$key] ?? [], fn($t) => $now - $t < 300);
        return count($attempts) < MAX_ATTEMPTS;
    }

    static function record(string $key): void
    {
        $data = self::load();
        $now  = time();
        $data[$key] = array_merge(
            array_filter($data[$key] ?? [], fn($t) => $now - $t < 300),
            [$now]
        );
        self::save($data);
    }

    static function reset(string $key): void
    {
        $data = self::load();
        unset($data[$key]);
        self::save($data);
    }

    static function lockoutRemaining(string $key): int
    {
        $data     = self::load();
        $attempts = $data[$key] ?? [];
        if (empty($attempts)) return 0;
        return max(0, LOCKOUT_SECONDS - (time() - max($attempts)));
    }

    private static function load(): array { return json_decode(file_get_contents(RATE_FILE), true) ?? []; }
    private static function save(array $d): void { file_put_contents(RATE_FILE, json_encode($d), LOCK_EX); }
}

// ══════════════════════════════════════════════════════════════════════════════
// DATA HELPERS
// ══════════════════════════════════════════════════════════════════════════════
function loadUsers(): array  { return json_decode(file_get_contents(USERS_FILE), true) ?? []; }
function saveUsers(array $u): void { file_put_contents(USERS_FILE, json_encode($u, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX); }

function safeUser(array $user): array
{
    return array_filter($user, fn($k) => !in_array($k, ['password_hash', 'mfa_secret', 'reset_token']), ARRAY_FILTER_USE_KEY);
}

function updateLastLogin(int $userId): void
{
    $users = loadUsers();
    if (isset($users[$userId])) {
        $users[$userId]['last_login'] = date('Y-m-d H:i:s');
        saveUsers($users);
    }
}

function storeSession(int $userId, string $token, string $refresh, string $fp, string $ip): void
{
    $sessions = json_decode(file_get_contents(SESSIONS_FILE), true) ?? [];
    $sessions[md5($token)] = [
        'user_id'       => $userId,
        'refresh_token' => $refresh,
        'fingerprint'   => $fp,
        'ip'            => $ip,
        'created_at'    => date('Y-m-d H:i:s'),
        'expires_at'    => date('Y-m-d H:i:s', time() + JWT_TTL),
    ];
    // Cleanup old sessions
    $sessions = array_filter($sessions, fn($s) => strtotime($s['expires_at']) > time());
    file_put_contents(SESSIONS_FILE, json_encode($sessions, JSON_PRETTY_PRINT), LOCK_EX);
}

function revokeSession(int $userId, string $token): void
{
    $sessions = json_decode(file_get_contents(SESSIONS_FILE), true) ?? [];
    unset($sessions[md5($token)]);
    file_put_contents(SESSIONS_FILE, json_encode($sessions, JSON_PRETTY_PRINT), LOCK_EX);
}

function generateMFACode(): string { return str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT); }

function storeMFACode(int $userId, string $code): void
{
    $f = DATA_DIR . "/mfa_$userId.json";
    file_put_contents($f, json_encode(['code' => $code, 'exp' => time() + 300]), LOCK_EX);
}

function validateMFACode(int $userId, string $code): bool
{
    $f = DATA_DIR . "/mfa_$userId.json";
    if (!file_exists($f)) return false;
    $d = json_decode(file_get_contents($f), true);
    if (!$d || $d['exp'] < time()) { unlink($f); return false; }
    $ok = hash_equals($d['code'], $code);
    if ($ok) unlink($f);
    return $ok;
}

function storeResetToken(int $userId, string $token): void
{
    $f = DATA_DIR . "/reset_$userId.json";
    file_put_contents($f, json_encode(['token' => $token, 'exp' => time() + 3600]), LOCK_EX);
}

function validateResetToken(string $token): int|false
{
    foreach (glob(DATA_DIR . '/reset_*.json') as $f) {
        $d = json_decode(file_get_contents($f), true);
        if ($d && $d['token'] === $token && $d['exp'] > time()) {
            preg_match('/reset_(\d+)\.json/', $f, $m);
            return (int)($m[1] ?? 0);
        }
    }
    return false;
}

function invalidateResetToken(string $token): void
{
    foreach (glob(DATA_DIR . '/reset_*.json') as $f) {
        $d = json_decode(file_get_contents($f), true);
        if ($d && $d['token'] === $token) { unlink($f); break; }
    }
}

function audit(string $event, array $context = []): void
{
    $line = date('Y-m-d H:i:s') . ' | ' . $event . ' | ' . json_encode($context) . PHP_EOL;
    file_put_contents(AUDIT_FILE, $line, FILE_APPEND | LOCK_EX);
}

function getBearerToken(): ?string
{
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/Bearer\s+(.+)/i', $h, $m)) return $m[1];
    return null;
}

function getClientIP(): string
{
    foreach (['HTTP_CF_CONNECTING_IP','HTTP_X_FORWARDED_FOR','REMOTE_ADDR'] as $h) {
        if (!empty($_SERVER[$h])) return explode(',', $_SERVER[$h])[0];
    }
    return '0.0.0.0';
}

function sanitize(string $v): string { return htmlspecialchars(strip_tags(trim($v)), ENT_QUOTES, 'UTF-8'); }
function json200(array $d): never    { http_response_code(200); echo json_encode($d, JSON_UNESCAPED_UNICODE); exit; }
function jsonError(int $c, string $m): never { http_response_code($c); echo json_encode(['success' => false, 'error' => $m], JSON_UNESCAPED_UNICODE); exit; }

function seedUsers(): void
{
    $users = [
        1 => ['id'=>1,'name'=>'Cauan Gomes','email'=>'cauan.gomes@techub.com','password_hash'=>password_hash('mudar@1254',PASSWORD_BCRYPT,['cost'=>12]),'role'=>'admin','initials'=>'CG','dept'=>'TI','mfa_enabled'=>true,'active'=>true,'created_at'=>date('Y-m-d H:i:s'),'last_login'=>null],
        2 => ['id'=>2,'name'=>'Ana Lima','email'=>'ana.lima@absprinter.com','password_hash'=>password_hash('mudar@1254',PASSWORD_BCRYPT,['cost'=>12]),'role'=>'agent','initials'=>'AL','dept'=>'Suporte','mfa_enabled'=>false,'active'=>true,'created_at'=>date('Y-m-d H:i:s'),'last_login'=>null],
        3 => ['id'=>3,'name'=>'Ricardo Silva','email'=>'ricardo.silva@absprinter.com','password_hash'=>password_hash('mudar@1254',PASSWORD_BCRYPT,['cost'=>12]),'role'=>'agent','initials'=>'RS','dept'=>'TI','mfa_enabled'=>false,'active'=>true,'created_at'=>date('Y-m-d H:i:s'),'last_login'=>null],
        4 => ['id'=>4,'name'=>'Mariana Oliveira','email'=>'mariana@absprinter.com','password_hash'=>password_hash('mudar@1254',PASSWORD_BCRYPT,['cost'=>12]),'role'=>'agent','initials'=>'MO','dept'=>'Suporte','mfa_enabled'=>false,'active'=>true,'created_at'=>date('Y-m-d H:i:s'),'last_login'=>null],
    ];
    saveUsers($users);
}
