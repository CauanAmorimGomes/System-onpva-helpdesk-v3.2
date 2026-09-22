<?php
/**
 * db.php — Camada de persistência via arquivos JSON
 * absprinter © 2025
 *
 * Salva os dados em /data/{resource}.json
 * Inicializa com os dados mock na primeira execução.
 */

class DB
{
    private string $path;
    private array  $data;

    public function __construct(private string $resource)
    {
        $dir = __DIR__ . '/data';
        if (!is_dir($dir)) mkdir($dir, 0755, true);

        $this->path = "$dir/$resource.json";

        if (!file_exists($this->path)) {
            $this->seed();
        }

        $this->data = json_decode(file_get_contents($this->path), true) ?? [];
    }

    // ── CRUD ─────────────────────────────────────────────────────────────────

    public function all(): array
    {
        return $this->data;
    }

    public function find(string $id): ?array
    {
        return $this->data[$id] ?? null;
    }

    public function insert(string $id, array $record): void
    {
        $this->data = array_merge([$id => $record], $this->data); // prepend
        $this->persist();
    }

    public function update(string $id, array $record): void
    {
        $this->data[$id] = $record;
        $this->persist();
    }

    public function delete(string $id): void
    {
        unset($this->data[$id]);
        $this->persist();
    }

    // ── Persistence ──────────────────────────────────────────────────────────

    private function persist(): void
    {
        file_put_contents(
            $this->path,
            json_encode($this->data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
            LOCK_EX
        );
    }

    // ── Seed (dados mock iniciais) ────────────────────────────────────────────

    private function seed(): void
    {
        $seeds = [
            'tickets' => $this->seedTickets(),
            'team'    => $this->seedTeam(),
            'kb'      => $this->seedKB(),
        ];

        $data = $seeds[$this->resource] ?? [];
        file_put_contents(
            $this->path,
            json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
            LOCK_EX
        );
    }

    private function seedTickets(): array
    {
        $tickets = [
            ['id'=>'#0042','subject'=>'Impressora atolando papel frequentemente','category'=>'Impressora','requester'=>'Cauan Gomes','assignee'=>'Ana Lima','priority'=>'Crítica','status'=>'Aberto','sla'=>85,'created'=>'2025-03-28','serial'=>'HP-3L8ZK1F9Q2','model'=>'Lexmark MX611','dept'=>'TI','desc'=>'Impressora atolando em papel A4 75g/m². Já limpei o caminho mas persiste. Ocorre principalmente nas primeiras 5 páginas.','comments'=>[['author'=>'Ana Lima','text'=>'Verificando o sensor de papel. Possível desgaste do rolete de alimentação.','time'=>'10h30']]],
            ['id'=>'#0041','subject'=>'Toner preto acabou — MX722adhe','category'=>'Suprimentos','requester'=>'Mariana Oliveira','assignee'=>'Ricardo Silva','priority'=>'Alta','status'=>'Em andamento','sla'=>62,'created'=>'2025-03-27','serial'=>'HP-3L8ZK1F9Q2','model'=>'Lexmark MX722adhe','dept'=>'Administrativo','desc'=>'Toner preto esgotado. Impressora com mensagem de erro e bloqueada.','comments'=>[['author'=>'Ricardo Silva','text'=>'Pedido de toner realizado. Chega amanhã.','time'=>'09h15']]],
            ['id'=>'#0040','subject'=>'Sem conexão com impressora de rede','category'=>'Rede','requester'=>'João Costa','assignee'=>'Cauan Gomes','priority'=>'Alta','status'=>'Resolvido','sla'=>100,'created'=>'2025-03-26','serial'=>'EP-9Q1X7M4K2L','model'=>'Epson L1250','dept'=>'Financeiro','desc'=>'Impressora sumiu da rede após update do Windows 11. Driver corrompido.','comments'=>[['author'=>'Cauan Gomes','text'=>'Reinstalei o driver via Windows Update. Resolvido.','time'=>'14h20']]],
            ['id'=>'#0039','subject'=>'Erro de fusão — Lexmark MS611de','category'=>'Impressora','requester'=>'Paulo Ferreira','assignee'=>'Ricardo Silva','priority'=>'Crítica','status'=>'Em andamento','sla'=>30,'created'=>'2025-03-25','serial'=>'PR-7X2M9Q4L1Z','model'=>'Lexmark MS611de','dept'=>'Operacional','desc'=>'Erro 920 na tela (fusão). Impressão com manchas quentes.','comments'=>[]],
            ['id'=>'#0038','subject'=>'Solicitar papel A4 — estoque zerado','category'=>'Suprimentos','requester'=>'Ana Lima','assignee'=>'Cauan Gomes','priority'=>'Média','status'=>'Resolvido','sla'=>100,'created'=>'2025-03-24','serial'=>'','model'=>'','dept'=>'TI','desc'=>'Estoque de papel A4 75g/m² zerado. Necessário urgente para setor financeiro.','comments'=>[['author'=>'Cauan Gomes','text'=>'Compra realizada. 10 resmas chegando quinta.','time'=>'11h00']]],
            ['id'=>'#0037','subject'=>'Configurar VPN para home office','category'=>'TI','requester'=>'Cauan Gomes','assignee'=>'Cauan Gomes','priority'=>'Baixa','status'=>'Fechado','sla'=>100,'created'=>'2025-03-23','serial'=>'','model'=>'','dept'=>'TI','desc'=>'Usuário precisando de VPN para trabalho remoto. Configurar OpenVPN.','comments'=>[['author'=>'Cauan Gomes','text'=>'Configurado. Arquivo .ovpn enviado por e-mail.','time'=>'16h45']]],
            ['id'=>'#0036','subject'=>'Impressora Epson L1250 — tinta ciano fraca','category'=>'Impressora','requester'=>'Mariana Oliveira','assignee'=>'Ana Lima','priority'=>'Média','status'=>'Aberto','sla'=>70,'created'=>'2025-03-22','serial'=>'BR-5Z8L2XQ9F1','model'=>'Epson L1250','dept'=>'Marketing','desc'=>'Ciano saindo muito fraco mesmo com 76% de tinta. Possível entupimento de cabeçote.','comments'=>[]],
            ['id'=>'#0035','subject'=>'Reset de senha — sistema financeiro','category'=>'TI','requester'=>'João Costa','assignee'=>'Cauan Gomes','priority'=>'Alta','status'=>'Resolvido','sla'=>100,'created'=>'2025-03-21','serial'=>'','model'=>'','dept'=>'Financeiro','desc'=>'Usuário bloqueado após 5 tentativas erradas. Resetar senha TOTVS.','comments'=>[['author'=>'Cauan Gomes','text'=>'Senha resetada. Enviada por e-mail seguro.','time'=>'08h30']]],
            ['id'=>'#0034','subject'=>'Impressora não imprime duplex','category'=>'Impressora','requester'=>'Paulo Ferreira','assignee'=>'Ana Lima','priority'=>'Baixa','status'=>'Aberto','sla'=>90,'created'=>'2025-03-20','serial'=>'SN-A9F3K2L8X7','model'=>'Lexmark MX522','dept'=>'RH','desc'=>'Opção de duplex sumiu após atualização de driver.','comments'=>[]],
            ['id'=>'#0033','subject'=>'Toner magenta crítico — MX522','category'=>'Suprimentos','requester'=>'Ricardo Silva','assignee'=>'Cauan Gomes','priority'=>'Alta','status'=>'Aberto','sla'=>45,'created'=>'2025-03-19','serial'=>'EP-9Q1X7M4K2L','model'=>'Lexmark MX522','dept'=>'TI','desc'=>'Toner magenta em 15%. Solicitar reposição urgente.','comments'=>[]],
        ];

        return array_column($tickets, null, 'id');
    }

    private function seedTeam(): array
    {
        $members = [
            ['id'=>'AL','name'=>'Ana Lima','initials'=>'AL','role'=>'Suporte Sênior','dept'=>'Suporte','online'=>true,'tickets'=>42,'sla'=>95,'color'=>'#f59e0b,#ef4444'],
            ['id'=>'CG','name'=>'Cauan Gomes','initials'=>'CG','role'=>'Administrador','dept'=>'TI','online'=>true,'tickets'=>38,'sla'=>91,'color'=>'#6366f1,#8b5cf6'],
            ['id'=>'RS','name'=>'Ricardo Silva','initials'=>'RS','role'=>'Técnico TI','dept'=>'TI','online'=>true,'tickets'=>31,'sla'=>84,'color'=>'#10b981,#06b6d4'],
            ['id'=>'MO','name'=>'Mariana Oliveira','initials'=>'MO','role'=>'Suporte','dept'=>'Suporte','online'=>true,'tickets'=>27,'sla'=>88,'color'=>'#ec4899,#f43f5e'],
            ['id'=>'JC','name'=>'João Costa','initials'=>'JC','role'=>'Técnico','dept'=>'TI','online'=>false,'tickets'=>15,'sla'=>79,'color'=>'#475569,#334155'],
            ['id'=>'PF','name'=>'Paulo Ferreira','initials'=>'PF','role'=>'Técnico','dept'=>'TI','online'=>false,'tickets'=>19,'sla'=>71,'color'=>'#f59e0b,#84cc16'],
        ];
        return array_column($members, null, 'id');
    }

    private function seedKB(): array
    {
        $articles = [
            ['id'=>1,'title'=>'Como limpar papel atolado na MX611','cat'=>'Impressora','views'=>234,'tags'=>['atolamento','MX611'],'body'=>'<p>1. Desligue a impressora e aguarde 5 minutos.</p><p>2. Abra a tampa traseira e remova o papel com cuidado.</p>'],
            ['id'=>2,'title'=>'Troca de toner Lexmark — passo a passo','cat'=>'Suprimentos','views'=>189,'tags'=>['toner','substituição','lexmark'],'body'=>'<p>1. Acesse o menu Configurações > Manutenção.</p><p>2. Aguarde a liberação e troque o cartucho.</p>'],
            ['id'=>3,'title'=>'Impressora offline — diagnóstico rápido','cat'=>'Impressora','views'=>312,'tags'=>['offline','rede','diagnóstico'],'body'=>'<p>1. Verifique cabo e conexão Wi-Fi.</p><p>2. Reinicie o spooler via services.msc.</p>'],
            ['id'=>4,'title'=>'Configurar impressora em rede Windows','cat'=>'Rede','views'=>156,'tags'=>['rede','driver','windows'],'body'=>'<p>1. Acesse Painel de Controle > Dispositivos e Impressoras.</p><p>2. Adicionar impressora de rede pelo IP.</p>'],
            ['id'=>5,'title'=>'Recarregar tinta Epson EcoTank L1250','cat'=>'Suprimentos','views'=>98,'tags'=>['tinta','epson','ecotank'],'body'=>'<p>Use apenas tinta Epson original. Nunca ultrapasse a linha MAX.</p>'],
        ];
        return array_column($articles, null, 'id');
    }
}
