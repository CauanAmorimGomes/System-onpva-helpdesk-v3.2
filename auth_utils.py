#!/usr/bin/env python3
"""
auth_utils.py — Utilitários de Autenticação Inova+ Helpdesk
absprinter © 2025

Uso:
  python3 auth_utils.py hash <senha>
  python3 auth_utils.py verify <senha> <hash>
  python3 auth_utils.py token <user_id> [--role admin] [--ttl 28800]
  python3 auth_utils.py decode <token>
  python3 auth_utils.py audit [--tail 50]
  python3 auth_utils.py sessions [--user_id 1]
  python3 auth_utils.py add-user --name "Nome" --email "e@mail.com" --password "senha" --role agent
  python3 auth_utils.py list-users
  python3 auth_utils.py deactivate --user_id 2
"""

import argparse
import base64
import hashlib
import hmac
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ── Tente importar bcrypt (opcional, fallback para sha256) ────────────────────
try:
    import bcrypt
    BCRYPT_AVAILABLE = True
except ImportError:
    BCRYPT_AVAILABLE = False
    print("⚠️  bcrypt não instalado. Use: pip install bcrypt", file=sys.stderr)

# ── Config ────────────────────────────────────────────────────────────────────
JWT_SECRET  = "inova_secret_2025_absprinter"
DATA_DIR    = Path(__file__).parent / "data"
USERS_FILE  = DATA_DIR / "users.json"
SESSIONS_FILE = DATA_DIR / "sessions.json"
AUDIT_FILE  = DATA_DIR / "audit.log"

DATA_DIR.mkdir(exist_ok=True)


# ══════════════════════════════════════════════════════════════════════════════
# BCRYPT / HASHING
# ══════════════════════════════════════════════════════════════════════════════

def hash_password(password: str, rounds: int = 12) -> str:
    """Gera hash bcrypt da senha."""
    if BCRYPT_AVAILABLE:
        salt   = bcrypt.gensalt(rounds=rounds)
        hashed = bcrypt.hashpw(password.encode(), salt)
        return hashed.decode()
    else:
        # Fallback: SHA-256 com salt (menos seguro — instale bcrypt em produção)
        salt   = os.urandom(32).hex()
        digest = hashlib.sha256(f"{salt}:{password}".encode()).hexdigest()
        return f"sha256:{salt}:{digest}"


def verify_password(password: str, hashed: str) -> bool:
    """Verifica senha contra hash."""
    if hashed.startswith("sha256:"):
        _, salt, digest = hashed.split(":", 2)
        return hashlib.sha256(f"{salt}:{password}".encode()).hexdigest() == digest
    if BCRYPT_AVAILABLE:
        try:
            return bcrypt.checkpw(password.encode(), hashed.encode())
        except Exception:
            return False
    return False


# ══════════════════════════════════════════════════════════════════════════════
# JWT (HS256)
# ══════════════════════════════════════════════════════════════════════════════

def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(data: str) -> bytes:
    padding = 4 - len(data) % 4
    if padding < 4:
        data += "=" * padding
    return base64.urlsafe_b64decode(data)


def jwt_encode(payload: dict, ttl: int = 28800, secret: str = JWT_SECRET) -> str:
    """Cria um JWT HS256."""
    payload = {**payload, "iat": int(time.time()), "exp": int(time.time()) + ttl}
    header  = _b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body    = _b64url_encode(json.dumps(payload, ensure_ascii=False).encode())
    sig_raw = hmac.new(secret.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest()
    sig     = _b64url_encode(sig_raw)
    return f"{header}.{body}.{sig}"


def jwt_decode(token: str, secret: str = JWT_SECRET, verify: bool = True) -> dict | None:
    """Decodifica e verifica um JWT."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None

        header, body, sig = parts
        expected = _b64url_encode(
            hmac.new(secret.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest()
        )
        if verify and not hmac.compare_digest(expected, sig):
            return None

        payload = json.loads(_b64url_decode(body))
        if verify and payload.get("exp", 0) < time.time():
            return None

        return payload
    except Exception:
        return None


# ══════════════════════════════════════════════════════════════════════════════
# USER MANAGEMENT
# ══════════════════════════════════════════════════════════════════════════════

def load_users() -> dict:
    if not USERS_FILE.exists():
        return {}
    return json.loads(USERS_FILE.read_text(encoding="utf-8") or "{}")


def save_users(users: dict) -> None:
    USERS_FILE.write_text(json.dumps(users, ensure_ascii=False, indent=2), encoding="utf-8")


def add_user(name: str, email: str, password: str, role: str = "agent", dept: str = "TI") -> dict:
    users = load_users()
    email = email.lower().strip()

    # Check duplicate
    for u in users.values():
        if u["email"] == email:
            raise ValueError(f"E-mail '{email}' já cadastrado.")

    new_id = str(max((int(k) for k in users.keys()), default=0) + 1)
    initials = "".join(w[0].upper() for w in name.split()[:2])

    users[new_id] = {
        "id":            int(new_id),
        "name":          name,
        "email":         email,
        "password_hash": hash_password(password),
        "role":          role,
        "initials":      initials,
        "dept":          dept,
        "mfa_enabled":   False,
        "active":        True,
        "created_at":    datetime.now(timezone.utc).isoformat(),
        "last_login":    None,
    }
    save_users(users)
    return users[new_id]


def deactivate_user(user_id: int) -> None:
    users = load_users()
    key   = str(user_id)
    if key not in users:
        raise ValueError(f"Usuário {user_id} não encontrado.")
    users[key]["active"]     = False
    users[key]["updated_at"] = datetime.now(timezone.utc).isoformat()
    save_users(users)


# ══════════════════════════════════════════════════════════════════════════════
# SESSIONS
# ══════════════════════════════════════════════════════════════════════════════

def load_sessions() -> dict:
    if not SESSIONS_FILE.exists():
        return {}
    return json.loads(SESSIONS_FILE.read_text(encoding="utf-8") or "{}")


def list_sessions(user_id: int | None = None) -> list[dict]:
    sessions = load_sessions()
    result   = list(sessions.values())
    if user_id is not None:
        result = [s for s in result if s.get("user_id") == user_id]
    # Filter out expired
    now = datetime.now(timezone.utc).isoformat()
    return [s for s in result if s.get("expires_at", "") > now]


# ══════════════════════════════════════════════════════════════════════════════
# AUDIT LOG
# ══════════════════════════════════════════════════════════════════════════════

def tail_audit(n: int = 50) -> list[str]:
    if not AUDIT_FILE.exists():
        return []
    lines = AUDIT_FILE.read_text(encoding="utf-8").splitlines()
    return lines[-n:]


def write_audit(event: str, context: dict) -> None:
    line = f"{datetime.now(timezone.utc).isoformat()} | {event} | {json.dumps(context)}\n"
    with open(AUDIT_FILE, "a", encoding="utf-8") as f:
        f.write(line)


# ══════════════════════════════════════════════════════════════════════════════
# CLI
# ══════════════════════════════════════════════════════════════════════════════

def _print_json(data: Any) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Inova+ Auth Utilities")
    sub    = parser.add_subparsers(dest="command", required=True)

    # hash
    h = sub.add_parser("hash", help="Gera hash bcrypt de uma senha")
    h.add_argument("password")
    h.add_argument("--rounds", type=int, default=12)

    # verify
    v = sub.add_parser("verify", help="Verifica senha contra hash")
    v.add_argument("password")
    v.add_argument("hash")

    # token
    t = sub.add_parser("token", help="Gera um JWT para um usuário")
    t.add_argument("user_id", type=int)
    t.add_argument("--role", default="agent")
    t.add_argument("--email", default="")
    t.add_argument("--name",  default="")
    t.add_argument("--ttl",   type=int, default=28800)

    # decode
    d = sub.add_parser("decode", help="Decodifica um JWT")
    d.add_argument("token")
    d.add_argument("--no-verify", action="store_true")

    # audit
    a = sub.add_parser("audit", help="Exibe log de auditoria")
    a.add_argument("--tail", type=int, default=50)
    a.add_argument("--filter", default="")

    # sessions
    s = sub.add_parser("sessions", help="Lista sessões ativas")
    s.add_argument("--user_id", type=int, default=None)

    # add-user
    au = sub.add_parser("add-user", help="Adiciona um usuário")
    au.add_argument("--name",     required=True)
    au.add_argument("--email",    required=True)
    au.add_argument("--password", required=True)
    au.add_argument("--role",     default="agent")
    au.add_argument("--dept",     default="TI")

    # list-users
    sub.add_parser("list-users", help="Lista todos os usuários")

    # deactivate
    da = sub.add_parser("deactivate", help="Desativa um usuário")
    da.add_argument("--user_id", type=int, required=True)

    args = parser.parse_args()

    match args.command:
        case "hash":
            result = hash_password(args.password, args.rounds)
            print(f"Hash: {result}")

        case "verify":
            ok = verify_password(args.password, args.hash)
            print("✅ Senha correta" if ok else "❌ Senha incorreta")
            sys.exit(0 if ok else 1)

        case "token":
            token = jwt_encode(
                {"sub": args.user_id, "role": args.role, "email": args.email, "name": args.name},
                ttl=args.ttl,
            )
            print(f"Token JWT:\n{token}")
            decoded = jwt_decode(token)
            exp_dt  = datetime.fromtimestamp(decoded["exp"], tz=timezone.utc)
            print(f"\nExpira em: {exp_dt.strftime('%d/%m/%Y %H:%M:%S UTC')}")

        case "decode":
            payload = jwt_decode(args.token, verify=not args.no_verify)
            if payload is None:
                print("❌ Token inválido ou expirado")
                sys.exit(1)
            if "exp" in payload:
                payload["_expires_at"] = datetime.fromtimestamp(payload["exp"], tz=timezone.utc).strftime("%d/%m/%Y %H:%M:%S UTC")
                payload["_expired"]    = payload["exp"] < time.time()
            _print_json(payload)

        case "audit":
            lines = tail_audit(args.tail)
            if args.filter:
                lines = [l for l in lines if args.filter.lower() in l.lower()]
            if not lines:
                print("Nenhum registro encontrado.")
            else:
                for line in lines:
                    # Color by event type
                    if "FAIL" in line or "ERROR" in line:
                        print(f"\033[91m{line}\033[0m")
                    elif "OK" in line or "SUCCESS" in line:
                        print(f"\033[92m{line}\033[0m")
                    else:
                        print(line)

        case "sessions":
            sessions = list_sessions(args.user_id)
            if not sessions:
                print("Nenhuma sessão ativa encontrada.")
            else:
                _print_json(sessions)
                print(f"\nTotal: {len(sessions)} sessão(ões) ativa(s)")

        case "add-user":
            user = add_user(args.name, args.email, args.password, args.role, args.dept)
            print(f"✅ Usuário criado: {user['name']} (ID: {user['id']})")

        case "list-users":
            users = load_users()
            if not users:
                print("Nenhum usuário cadastrado.")
            else:
                for u in users.values():
                    status = "✅" if u.get("active") else "❌"
                    print(f"{status} [{u['id']:>2}] {u['name']:<20} {u['email']:<35} {u['role']:<10} {u['dept']}")

        case "deactivate":
            deactivate_user(args.user_id)
            print(f"✅ Usuário {args.user_id} desativado.")

        case _:
            parser.print_help()


if __name__ == "__main__":
    main()
