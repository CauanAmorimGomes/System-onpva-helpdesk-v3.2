# Inova+ Helpdesk — API PHP

Backend REST para o Inova+ Helpdesk. Persiste dados em arquivos JSON na pasta `/data/`.
Não requer banco de dados — funciona com qualquer hospedagem PHP 8.0+.

---

## Estrutura de Arquivos

```
inova-helpdesk/
├── api.php          ← Roteador REST (único ponto de entrada)
├── db.php           ← Camada de persistência JSON (não exponha diretamente)
├── api.js           ← Cliente JS que substitui data.js
├── .htaccess        ← Segurança e cache
├── data/            ← Criado automaticamente na primeira execução
│   ├── tickets.json
│   ├── team.json
│   └── kb.json
├── style.css
├── alerts.css
├── auth.js
├── alerts.js
├── tickets.js
├── dashboard.js
├── dashboard.html
├── tickets.html
├── ... (demais páginas)
```

---

## Integração no Frontend

Substitua `data.js` por `api.js` nas tags `<script>` das páginas:

```html
<!-- Antes -->
<script src="data.js"></script>

<!-- Depois -->
<script src="data.js"></script>   <!-- mantém os dados mock como fallback -->
<script src="api.js"></script>    <!-- sobrescreve com chamadas reais -->
```

`api.js` carrega os dados do servidor ao inicializar e redireciona todas as operações
de escrita (criar, atualizar, fechar, comentar) para a API PHP automaticamente.

---

## Referência da API

### Base URL
```
/api.php
```

---

### Tickets

#### `GET /api.php?resource=tickets`
Lista todos os tickets.

**Filtros opcionais via query string:**
| Parâmetro  | Exemplo           | Descrição                        |
|------------|-------------------|----------------------------------|
| `status`   | `Aberto`          | Filtra por status                |
| `priority` | `Crítica`         | Filtra por prioridade            |
| `category` | `Impressora`      | Filtra por categoria             |
| `search`   | `toner`           | Busca em assunto, ID, solicitante|

```bash
curl "http://localhost/api.php?resource=tickets&status=Aberto&priority=Crítica"
```

**Resposta 200:**
```json
[
  {
    "id": "#0042",
    "subject": "Impressora atolando papel frequentemente",
    "category": "Impressora",
    "priority": "Crítica",
    "status": "Aberto",
    "sla": 85,
    ...
  }
]
```

---

#### `GET /api.php?resource=tickets&id=#0042`
Retorna um ticket específico.

```bash
curl "http://localhost/api.php?resource=tickets&id=%230042"
```

---

#### `POST /api.php?resource=tickets`
Cria um novo ticket.

**Body JSON:**
```json
{
  "subject":   "Toner magenta vazio",
  "category":  "Suprimentos",
  "desc":      "Impressora bloqueada por falta de toner magenta.",
  "priority":  "Alta",
  "dept":      "TI",
  "requester": "João Costa",
  "serial":    "SN-A9F3K2L8X7",
  "model":     "Lexmark MX522"
}
```

**Campos obrigatórios:** `subject`, `category`, `desc`

**Resposta 201:**
```json
{
  "message": "Ticket criado com sucesso.",
  "ticket": { "id": "#0043", ... }
}
```

---

#### `PUT /api.php?resource=tickets&id=#0042`
Atualiza campos de um ticket existente.

```bash
curl -X PUT "http://localhost/api.php?resource=tickets&id=%230042" \
  -H "Content-Type: application/json" \
  -d '{"status": "Resolvido", "sla": 100}'
```

**Campos editáveis:** `subject`, `category`, `assignee`, `priority`, `status`, `sla`, `desc`, `serial`, `model`, `dept`

**Resposta 200:**
```json
{
  "message": "Ticket atualizado.",
  "ticket": { ... }
}
```

---

#### `DELETE /api.php?resource=tickets&id=#0042`
Remove um ticket permanentemente.

```bash
curl -X DELETE "http://localhost/api.php?resource=tickets&id=%230042"
```

**Resposta 200:**
```json
{ "message": "Ticket #0042 removido com sucesso." }
```

---

#### `POST /api.php?resource=tickets&action=reply&id=#0042`
Adiciona um comentário ao histórico do ticket.

```json
{
  "author": "Ana Lima",
  "text":   "Peça solicitada ao fornecedor."
}
```

---

### Equipe

#### `GET /api.php?resource=team`
Lista todos os membros da equipe.

#### `PUT /api.php?resource=team&id=AL`
Atualiza dados de um membro (`role`, `dept`, `online`, `tickets`, `sla`).

---

### Base de Conhecimento

#### `GET /api.php?resource=kb`
Lista artigos. Filtros: `cat`, `search`.

#### `POST /api.php?resource=kb`
Cria novo artigo. Obrigatório: `title`, `cat`.

#### `DELETE /api.php?resource=kb&id=1`
Remove artigo.

---

## Códigos de Resposta

| Código | Significado                        |
|--------|------------------------------------|
| 200    | OK                                 |
| 201    | Criado com sucesso                 |
| 204    | Sem conteúdo (OPTIONS preflight)   |
| 400    | Requisição inválida (campo ausente)|
| 404    | Recurso não encontrado             |
| 405    | Método não permitido               |
| 500    | Erro interno do servidor           |

---

## Requisitos

- PHP **8.0+** com `mod_rewrite` ativado
- Permissão de escrita na pasta `/data/` (criada automaticamente)
- Apache ou Nginx com suporte a `.htaccess`

### Nginx (equivalente ao .htaccess)
```nginx
location /data/ {
    deny all;
}
location ~* ^/(db\.php)$ {
    deny all;
}
```

---

## Segurança

- `db.php` é bloqueado via `.htaccess` (acesso direto retorna 403)
- Pasta `/data/` é bloqueada via `RewriteRule`
- Todos os inputs passam por `htmlspecialchars` + `strip_tags`
- CORS configurável via headers em `api.php`
