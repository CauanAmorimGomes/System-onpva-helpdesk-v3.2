#!/usr/bin/env python3
"""
ai_server.py — Servidor de IA para Inova+ Helpdesk
absprinter © 2025

Inicia um servidor HTTP local que recebe mensagens do chat e responde
como um agente de suporte inteligente, com conhecimento total dos tickets.

Uso:
    python3 ai_server.py [--port 5050]

Endpoint:
    POST http://localhost:5050/ai/chat
    Body: { "ticket": {...}, "message": "...", "history": [...] }
    Response: { "reply": "...", "actions": [...], "confidence": 0.92 }
"""

import json
import re
import random
import time
import datetime
import argparse
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

# ── KNOWLEDGE BASE ────────────────────────────────────────────────────────────
# Banco de conhecimento técnico: problemas + diagnósticos + soluções
KNOWLEDGE_BASE = {
    "impressora_papel_atolado": {
        "keywords": ["atol", "papel", "atolado", "atolando", "preso", "travado", "jam"],
        "solutions": [
            "Desligue a impressora e aguarde 3 minutos para a unidade de fusão esfriar.",
            "Abra todas as tampas (frontal, traseira e lateral) e remova o papel com cuidado, sem rasgar.",
            "Verifique se há fragmentos de papel — até um pequeno pedaço pode causar atolamentos recorrentes.",
            "Limpe os roletes de alimentação com um pano umedecido com álcool isopropílico 70%.",
            "Certifique-se de que o papel está dentro das especificações: A4, 75g/m², sem umidade.",
            "Reative e imprima uma página de teste antes de retomar o uso normal.",
        ],
        "causes": ["Rolete de alimentação desgastado", "Papel úmido ou fora do padrão", "Fragmento de papel residual", "Sensor de papel com sujeira"],
        "priority": "Alta",
        "estimated_time": "30-60 minutos",
        "escalate_if": "O problema persistir após 3 tentativas de limpeza — possível substituição de rolete",
    },
    "impressora_toner_vazio": {
        "keywords": ["toner", "cartucho", "vazio", "acabou", "esgotado", "preto", "magenta", "ciano", "amarelo", "tinta"],
        "solutions": [
            "Confirme o modelo exato da impressora e o número de peça do toner no manual ou na etiqueta traseira.",
            "Verifique o estoque interno antes de solicitar pedido — consulte o arquivo de suprimentos.",
            "Para toner com nível abaixo de 10%: agite o cartucho horizontalmente 5x para redistribuir o toner residual (prolonga em ~200 páginas).",
            "Solicite o pedido via sistema com urgência se o nível estiver abaixo de 15%.",
            "Toners Lexmark MX611/MX722: peça referência 56F4X00 (extra-alta capacidade, 20.000 pág).",
            "Toners Lexmark MS611de: peça 56F4000 (6.000 pág) ou 56F4U00 (ultra).",
        ],
        "causes": ["Uso intensivo", "Toner não requisitado em tempo hábil", "Estimativa de páginas incorreta"],
        "priority": "Alta",
        "estimated_time": "Entrega em 1-2 dias úteis",
        "escalate_if": "Impressora com erro de hardware além do toner",
    },
    "impressora_offline": {
        "keywords": ["offline", "desconectada", "rede", "não encontra", "não aparece", "conexão", "driver", "wifi", "ip"],
        "solutions": [
            "Verifique se a impressora está ligada e com rede ativa (luz de rede piscando).",
            "No Windows: Painel de Controle → Dispositivos e Impressoras → clique com botão direito → 'Ver o que está sendo impresso' → desfaça 'Usar impressora offline'.",
            "Reinicie o Spooler de Impressão: Win+R → services.msc → 'Print Spooler' → Reiniciar.",
            "Verifique o IP da impressora: imprima a página de configuração de rede (hold botão OK 3s).",
            "Se o IP mudou: delete o driver e reinstale apontando para o novo IP.",
            "Driver corrompido: desinstale via 'Programas e Recursos' e baixe o driver atual no site do fabricante.",
        ],
        "causes": ["IP dinâmico alterado", "Spooler corrompido", "Driver desatualizado", "Update do Windows quebrou driver"],
        "priority": "Alta",
        "estimated_time": "15-45 minutos",
        "escalate_if": "Impressora não aparece nem com IP fixo e ping sem resposta — problema de hardware de rede",
    },
    "impressora_fusao": {
        "keywords": ["fusão", "fuser", "erro 920", "mancha", "quente", "borrão", "derrete", "ondulado", "920", "fusora"],
        "solutions": [
            "PARE O USO IMEDIATAMENTE — erro de fusão pode causar danos permanentes ao mecanismo.",
            "Anote o código de erro exato exibido na tela (ex: 920.06, 920.37).",
            "Desligue a impressora e aguarde 15 minutos para resfriamento completo.",
            "Reinicie e observe se o erro persiste — alguns erros de fusão são temporários por superaquecimento.",
            "Se o erro persistir: a unidade de fusão precisa ser substituída. Custo estimado: R$180-450 dependendo do modelo.",
            "Para Lexmark MS611de: peça da fusora é 40X8016 (110V) ou 40X8017 (220V).",
        ],
        "causes": ["Fusora próxima do fim de vida útil", "Superaquecimento por uso contínuo", "Tensão elétrica instável"],
        "priority": "Crítica",
        "estimated_time": "Substituição: 2-3 horas incluindo resfriamento",
        "escalate_if": "Sempre — este problema requer técnico especializado",
    },
    "impressora_qualidade": {
        "keywords": ["qualidade", "fraco", "desbotado", "ciano", "risca", "linha", "faixa", "cabeçote", "borrão", "manchas"],
        "solutions": [
            "Imprima uma página de teste de qualidade (Menu → Relatórios → Página de qualidade).",
            "Para impressoras a jato de tinta (Epson): Execute limpeza de cabeçote: Menu → Manutenção → Limpeza de cabeçote.",
            "Se o ciano estiver fraco mas com nível acima de 50%: o cabeçote pode estar entupido.",
            "Execute 2-3 ciclos de limpeza com intervalo de 5 minutos entre cada um.",
            "Se não resolver: limpeza manual do cabeçote com cotonete e água destilada (cuidado extremo).",
            "Para laser: limpe o tambor com pano antiestático seco.",
        ],
        "causes": ["Cabeçote entupido por inatividade", "Toner/tinta de baixa qualidade", "Tambor desgastado"],
        "priority": "Média",
        "estimated_time": "30-90 minutos",
        "escalate_if": "Qualidade não melhorar após 3 ciclos de limpeza — possível troca de cabeçote",
    },
    "impressora_duplex": {
        "keywords": ["duplex", "frente e verso", "dos lados", "recto verso", "double sided"],
        "solutions": [
            "Verifique se o driver instalado é o correto para o modelo com a função duplex.",
            "No aplicativo: Arquivo → Imprimir → Propriedades → aba 'Acabamento' → marque 'Imprimir nos dois lados'.",
            "Atualize o driver: acesse o site do fabricante e baixe a versão mais recente.",
            "Se sumiu após update: desinstale o driver atual e reinstale a versão anterior estável.",
            "Verifique se a impressora tem unidade de duplex física instalada (verifique tampas laterais).",
        ],
        "causes": ["Driver atualizado perdeu configuração", "Driver incorreto instalado"],
        "priority": "Baixa",
        "estimated_time": "15-30 minutos",
        "escalate_if": "Raramente necessário — problema resolvido com reinstalação do driver",
    },
    "ti_senha_reset": {
        "keywords": ["senha", "reset", "bloqueado", "login", "acesso", "esqueceu", "expirou", "password"],
        "solutions": [
            "Verifique se o bloqueio é por tentativas incorretas ou expiração de senha.",
            "No Active Directory: ADUC → clique com botão direito no usuário → 'Redefinir senha'.",
            "Marque 'O usuário deve alterar a senha no próximo logon' por questão de segurança.",
            "Desbloqueie a conta: clique com botão direito → Propriedades → aba Conta → desmarque 'Conta bloqueada'.",
            "Envie a nova senha temporária por canal seguro (não por e-mail em texto simples).",
            "Para sistemas legados (TOTVS, etc.): acesse o console de administração e redefina diretamente.",
        ],
        "causes": ["5+ tentativas de login incorretas", "Senha expirada por política", "Bloqueio manual de segurança"],
        "priority": "Alta",
        "estimated_time": "5-10 minutos",
        "escalate_if": "Conta de administrador — requer autorização de gerência",
    },
    "ti_vpn": {
        "keywords": ["vpn", "remoto", "home office", "tunnel", "openvpn", "wireguard", "acesso remoto"],
        "solutions": [
            "Baixe o cliente OpenVPN na versão 2.6.x no site oficial (openvpn.net).",
            "Importe o arquivo .ovpn fornecido pelo administrador de TI.",
            "Insira as credenciais corporativas quando solicitado.",
            "Teste a conexão acessando um recurso interno (ex: drive compartilhado).",
            "Se houver erro de certificado: verifique se a data/hora do computador está correta.",
            "Para MFA: aguarde a solicitação do código OTP após as credenciais.",
        ],
        "causes": ["Novo acesso configurado", "Arquivo .ovpn expirado", "Certificado desatualizado"],
        "priority": "Baixa",
        "estimated_time": "15-20 minutos",
        "escalate_if": "Erro de certificado SSL após correção de data/hora",
    },
    "suprimentos_papel": {
        "keywords": ["papel", "resma", "a4", "estoque", "folha", "suprimento"],
        "solutions": [
            "Verifique o estoque atual no sistema de almoxarifado.",
            "Solicite ao responsável de compras com urgência se o estoque estiver zerado.",
            "Especificação correta: papel A4 75g/m² branco — não usar papéis reciclados em impressoras laser.",
            "Quantidade mínima de estoque recomendada: 5 resmas (500 folhas cada) por impressora.",
            "Fornecedor homologado: consulte o cadastro de fornecedores no sistema.",
        ],
        "causes": ["Controle de estoque deficiente", "Consumo acima do previsto"],
        "priority": "Média",
        "estimated_time": "Entrega em 1-2 dias úteis",
        "escalate_if": "Necessidade urgente — considere compra de emergência em papelaria local",
    },
}

# ── PERSONAS DA IA ────────────────────────────────────────────────────────────
AI_PERSONA = {
    "name": "Inova IA",
    "role": "Assistente de Suporte Técnico",
    "traits": [
        "Responde sempre em português do Brasil",
        "É direto e objetivo mas empático",
        "Usa linguagem técnica mas acessível",
        "Sempre dá passos numerados quando há procedimentos",
        "Menciona prazos e responsáveis quando relevante",
        "Pergunta informações específicas quando necessário",
        "Nunca inventa informações — admite limitações",
    ],
}

# ── TEMPLATES DE RESPOSTA ─────────────────────────────────────────────────────
GREETINGS = [
    "Olá! Analisei o chamado **{id}** sobre *{subject}*.",
    "Bom dia! Estou analisando o chamado **{id}**.",
    "Olá! Vi o chamado **{id}** e já tenho algumas informações.",
    "Oi! Analisei os detalhes do **{id}**.",
]

CLOSINGS = [
    "Precisa de mais alguma informação?",
    "Fico à disposição para mais detalhes.",
    "Alguma dúvida sobre esses passos?",
    "Me avise se precisar de mais suporte.",
    "Conseguiu resolver? Pode marcar o chamado como resolvido quando concluir.",
]

UNCERTAINTY = [
    "Não tenho informação específica sobre isso, mas posso escalar para um técnico especializado.",
    "Esse caso específico está além do meu banco de conhecimento — vou sinalizar para revisão.",
    "Não encontrei solução documentada para isso. Recomendo escalar para análise técnica presencial.",
]


# ── AI ENGINE ─────────────────────────────────────────────────────────────────
class TicketAI:

    def __init__(self):
        self.response_cache: dict = {}

    def analyze_ticket(self, ticket: dict) -> dict:
        """Analisa o ticket e retorna diagnóstico estruturado."""
        category = ticket.get("category", "").lower()
        subject  = ticket.get("subject", "").lower()
        desc     = ticket.get("desc", "").lower()
        full_text = f"{subject} {desc}"

        matched_kb = None
        best_score = 0

        for kb_key, kb_data in KNOWLEDGE_BASE.items():
            score = sum(1 for kw in kb_data["keywords"] if kw in full_text)
            if score > best_score:
                best_score = score
                matched_kb = kb_data

        return {
            "kb": matched_kb,
            "confidence": min(0.95, 0.5 + best_score * 0.15),
            "category": category,
            "is_critical": ticket.get("priority") in ["Crítica", "Alta"],
            "sla": ticket.get("sla", 100),
        }

    def generate_reply(self, ticket: dict, user_message: str, history: list) -> dict:
        """Gera resposta contextualizada ao ticket e mensagem do usuário."""
        msg_lower = user_message.lower().strip()
        analysis  = self.analyze_ticket(ticket)
        kb        = analysis["kb"]

        ticket_id  = ticket.get("id", "#????")
        subject    = ticket.get("subject", "chamado")
        status     = ticket.get("status", "Aberto")
        priority   = ticket.get("priority", "Média")
        assignee   = ticket.get("assignee", "técnico")
        sla        = ticket.get("sla", 100)
        model      = ticket.get("model", "")
        serial     = ticket.get("serial", "")
        category   = ticket.get("category", "")
        desc       = ticket.get("desc", "")

        actions = []
        reply_parts = []

        # ── Saudação inicial (primeira mensagem) ───────────────────────
        is_first = len(history) <= 1
        if is_first:
            greeting = random.choice(GREETINGS).format(id=ticket_id, subject=subject)
            reply_parts.append(greeting)

        # ── Urgência por SLA ───────────────────────────────────────────
        if sla <= 20 and is_first:
            reply_parts.append(f"\n⚠️ **Atenção:** Este chamado está com SLA em {sla}% — prazo crítico! Vou priorizar a análise.")
            actions.append({"type": "sla_alert", "label": "SLA Crítico", "color": "red"})

        # ── Detecta intenção da mensagem ───────────────────────────────
        intent = self._detect_intent(msg_lower)

        if intent == "status_check":
            reply_parts.append(self._status_response(ticket))

        elif intent == "solution_request" or is_first:
            if kb:
                reply_parts.append(self._solution_response(kb, ticket, is_first))
                actions.append({"type": "solution_found", "label": "Solução encontrada", "color": "green"})
            else:
                reply_parts.append(self._generic_support(ticket))

        elif intent == "escalate":
            reply_parts.append(self._escalation_response(ticket, kb))
            actions.append({"type": "escalate", "label": "Escalar chamado", "color": "orange"})

        elif intent == "confirm_resolved":
            reply_parts.append(self._resolved_response(ticket))
            actions.append({"type": "resolve", "label": "Marcar Resolvido", "color": "green"})

        elif intent == "more_info":
            reply_parts.append(self._request_info(ticket))

        elif intent == "deadline":
            reply_parts.append(self._deadline_response(ticket, kb))

        else:
            # Resposta genérica contextualizada
            if kb:
                reply_parts.append(self._contextual_follow_up(msg_lower, ticket, kb))
            else:
                reply_parts.append(self._generic_follow_up(msg_lower, ticket))

        # ── Fechamento ─────────────────────────────────────────────────
        if not any(x in msg_lower for x in ["obrigad", "valeu", "resolvido", "ok", "perfeito"]):
            reply_parts.append(f"\n\n_{random.choice(CLOSINGS)}_")

        reply = "\n".join(filter(None, reply_parts))

        return {
            "reply": reply,
            "actions": actions,
            "confidence": analysis["confidence"],
            "ai_name": AI_PERSONA["name"],
            "timestamp": datetime.datetime.now().strftime("%H:%M"),
        }

    # ── INTENT DETECTION ──────────────────────────────────────────────────────
    def _detect_intent(self, msg: str) -> str:
        intents = {
            "status_check":     ["status", "andamento", "atualização", "como está", "progresso", "novidades"],
            "solution_request": ["como", "resolver", "solução", "ajuda", "não funciona", "problema", "erro", "fix", "corrigir"],
            "escalate":         ["escalar", "técnico", "presencial", "urgent", "grave", "crítico", "não consegui"],
            "confirm_resolved":  ["resolvido", "funcionou", "corrigido", "ok agora", "deu certo", "resolveu"],
            "more_info":        ["mais inform", "detalhe", "especif", "qual", "quais", "quando", "onde"],
            "deadline":         ["prazo", "quando", "quanto tempo", "previsão", "sla", "urgente"],
        }
        for intent, keywords in intents.items():
            if any(kw in msg for kw in keywords):
                return intent
        return "general"

    # ── RESPONSE BUILDERS ─────────────────────────────────────────────────────
    def _status_response(self, ticket: dict) -> str:
        status   = ticket.get("status", "Aberto")
        assignee = ticket.get("assignee", "não atribuído")
        sla      = ticket.get("sla", 100)
        created  = ticket.get("created", "—")

        icons = {"Aberto": "🔵", "Em andamento": "🟡", "Resolvido": "✅", "Fechado": "⚫"}
        icon = icons.get(status, "●")

        sla_info = ""
        if sla <= 20: sla_info = f" — ⚠️ **SLA crítico: {sla}%**"
        elif sla <= 50: sla_info = f" — ⏱ SLA em {sla}%"
        else: sla_info = f" — SLA OK: {sla}%"

        return (
            f"**Status atual do chamado:**\n\n"
            f"{icon} **{status}**{sla_info}\n"
            f"👤 Responsável: **{assignee}**\n"
            f"📅 Aberto em: {created}\n\n"
            f"{'O chamado está sendo tratado ativamente.' if status == 'Em andamento' else 'Aguardando atendimento na fila.'}"
        )

    def _solution_response(self, kb: dict, ticket: dict, is_first: bool) -> str:
        model    = ticket.get("model", "")
        parts    = []

        if is_first:
            parts.append(f"\n\n**🔍 Diagnóstico:**")
            if kb.get("causes"):
                causes = kb["causes"][:3]
                parts.append("Causas mais prováveis:")
                parts.append("\n".join(f"• {c}" for c in causes))

        parts.append(f"\n**🛠 Passos para resolução:**")
        solutions = kb.get("solutions", [])
        for i, step in enumerate(solutions, 1):
            parts.append(f"{i}. {step}")

        if kb.get("estimated_time"):
            parts.append(f"\n⏱ **Tempo estimado:** {kb['estimated_time']}")

        if model:
            parts.append(f"🖨 **Modelo:** {model}")

        if kb.get("escalate_if"):
            parts.append(f"\n⬆️ **Escalar se:** {kb['escalate_if']}")

        return "\n".join(parts)

    def _escalation_response(self, ticket: dict, kb: dict | None) -> str:
        return (
            f"**Entendido — vou escalar este chamado.**\n\n"
            f"📋 Registrarei as informações coletadas e direcionarei para um técnico especializado.\n\n"
            f"**Dados que serão enviados:**\n"
            f"• Chamado: {ticket.get('id')}\n"
            f"• Categoria: {ticket.get('category')}\n"
            f"• Prioridade: {ticket.get('priority')}\n"
            f"• Modelo: {ticket.get('model') or 'não informado'}\n"
            f"• Serial: {ticket.get('serial') or 'não informado'}\n\n"
            f"Um técnico entrará em contato em até **2 horas** (prioridade {ticket.get('priority', 'Média')})."
        )

    def _resolved_response(self, ticket: dict) -> str:
        return (
            f"✅ **Ótimo! Fico feliz que tenha resolvido.**\n\n"
            f"Você pode marcar o chamado **{ticket.get('id')}** como **Resolvido** "
            f"clicando no botão acima para fechar oficialmente.\n\n"
            f"Resumo do atendimento ficará registrado no histórico para futuras referências."
        )

    def _request_info(self, ticket: dict) -> str:
        category = ticket.get("category", "")
        questions = {
            "Impressora": [
                "Qual o código de erro exato exibido na tela?",
                "O problema ocorre em qualquer tipo de documento ou somente em alguns?",
                "Quando foi a última manutenção preventiva?",
            ],
            "TI": [
                "Qual sistema operacional e versão?",
                "O problema ocorre para todos os usuários ou somente para você?",
                "Quando começou — houve alguma atualização ou instalação recente?",
            ],
            "Suprimentos": [
                "Qual a quantidade atual em estoque?",
                "Qual o consumo médio mensal?",
                "Já tem pedido em andamento?",
            ],
        }
        qs = questions.get(category, [
            "Pode descrever o problema com mais detalhes?",
            "Quando o problema começou?",
            "Já tentou alguma solução antes de abrir o chamado?",
        ])

        return (
            f"Para analisar melhor o chamado, preciso de algumas informações adicionais:\n\n"
            + "\n".join(f"❓ {q}" for q in qs[:3])
        )

    def _deadline_response(self, ticket: dict, kb: dict | None) -> str:
        priority = ticket.get("priority", "Média")
        sla      = ticket.get("sla", 100)

        sla_times = {
            "Crítica": "2h resposta / 4h resolução",
            "Alta":    "4h resposta / 8h resolução",
            "Média":   "8h resposta / 24h resolução",
            "Baixa":   "24h resposta / 72h resolução",
        }
        sla_str = sla_times.get(priority, "8h / 24h")

        estimated = kb.get("estimated_time", "variável") if kb else "a verificar"

        return (
            f"**⏱ Informações de prazo:**\n\n"
            f"• **SLA contratual ({priority}):** {sla_str}\n"
            f"• **SLA atual do chamado:** {sla}%\n"
            f"• **Tempo técnico estimado:** {estimated}\n\n"
            f"{'⚠️ **Atenção:** O prazo está crítico. Priorizando atendimento.' if sla <= 30 else '✅ Ainda dentro do prazo contratual.'}"
        )

    def _contextual_follow_up(self, msg: str, ticket: dict, kb: dict) -> str:
        # Tenta responder contextualmente com base na KB
        for kw in kb.get("keywords", []):
            if kw in msg:
                solutions = kb.get("solutions", [])
                if solutions:
                    step = random.choice(solutions)
                    return f"Sobre isso: **{step}**\n\nSe isso não resolver, posso aprofundar a análise."
        return self._generic_follow_up(msg, ticket)

    def _generic_follow_up(self, msg: str, ticket: dict) -> str:
        responses = [
            f"Entendido. Com base no chamado **{ticket.get('id')}**, vou verificar esse ponto específico.\n\nPode me dar mais detalhes para que eu possa ajudar com mais precisão?",
            f"Boa pergunta. Para o chamado de **{ticket.get('category', 'suporte')}**, recomendo verificar o histórico de manutenção do equipamento. Tem acesso a esse log?",
            f"Certo. Analisando o contexto do **{ticket.get('id')}**, o próximo passo seria confirmar se o problema é consistente ou intermitente. Como está se comportando agora?",
        ]
        return random.choice(responses)

    def _generic_support(self, ticket: dict) -> str:
        category = ticket.get("category", "")
        return (
            f"Analisei o chamado **{ticket.get('id')}** de {category}.\n\n"
            f"Não encontrei um procedimento específico documentado para este caso, "
            f"mas posso ajudar com:\n\n"
            f"1. Coleta de mais informações para diagnóstico\n"
            f"2. Verificação do histórico de chamados similares\n"
            f"3. Escalação para técnico especializado\n\n"
            f"O que prefere fazer?"
        )


# ── HTTP HANDLER ──────────────────────────────────────────────────────────────
ai_engine = TicketAI()


class AIHandler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {format % args}")

    def _send_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/ai/health":
            self._json(200, {"status": "ok", "version": "1.0", "name": AI_PERSONA["name"]})
        elif parsed.path == "/ai/knowledge":
            # Retorna resumo do banco de conhecimento
            summary = {k: {"keywords": v["keywords"][:3], "priority": v.get("priority")} for k, v in KNOWLEDGE_BASE.items()}
            self._json(200, {"knowledge_base": summary, "total_entries": len(KNOWLEDGE_BASE)})
        else:
            self._json(404, {"error": "Rota não encontrada"})

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path not in ("/ai/chat", "/ai/analyze"):
            self._json(404, {"error": "Rota não encontrada"})
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            body   = self.rfile.read(length)
            data   = json.loads(body)
        except Exception as e:
            self._json(400, {"error": f"JSON inválido: {e}"})
            return

        # Simula latência realista (200-800ms)
        delay = random.uniform(0.2, 0.8)
        time.sleep(delay)

        if parsed.path == "/ai/chat":
            ticket  = data.get("ticket", {})
            message = data.get("message", "")
            history = data.get("history", [])

            if not ticket or not message:
                self._json(400, {"error": "ticket e message são obrigatórios"})
                return

            result = ai_engine.generate_reply(ticket, message, history)
            self._json(200, result)

        elif parsed.path == "/ai/analyze":
            ticket   = data.get("ticket", {})
            analysis = ai_engine.analyze_ticket(ticket)

            # Gera análise mais completa
            kb = analysis.get("kb")
            response = {
                "ticket_id": ticket.get("id"),
                "confidence": analysis["confidence"],
                "category_detected": analysis["category"],
                "is_critical": analysis["is_critical"],
                "sla_status": "crítico" if ticket.get("sla", 100) <= 20 else "atenção" if ticket.get("sla", 100) <= 50 else "ok",
                "recommended_priority": kb.get("priority") if kb else ticket.get("priority"),
                "estimated_resolution": kb.get("estimated_time") if kb else "não estimado",
                "knowledge_match": bool(kb),
                "should_escalate": analysis["is_critical"] and ticket.get("sla", 100) <= 30,
                "summary": f"Chamado de {ticket.get('category', 'suporte')} com {'alta' if analysis['is_critical'] else 'média'} criticidade.",
            }
            self._json(200, response)

    def _json(self, status: int, data: dict):
        body = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", len(body))
        self._send_cors()
        self.end_headers()
        self.wfile.write(body)


# ── ENTRY POINT ───────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Inova+ AI Server")
    parser.add_argument("--port", type=int, default=5050, help="Porta (padrão: 5050)")
    parser.add_argument("--host", default="127.0.0.1", help="Host (padrão: 127.0.0.1)")
    args = parser.parse_args()

    server = HTTPServer((args.host, args.port), AIHandler)
    url    = f"http://{args.host}:{args.port}"

    print(f"""
╔══════════════════════════════════════════════════════╗
║         Inova+ AI Server — {AI_PERSONA['name']}          ║
╠══════════════════════════════════════════════════════╣
║  Servidor: {url:<42} ║
║  Health:   {url}/ai/health{' '*27}║
║  Chat:     POST {url}/ai/chat{' '*22}║
║  Analyze:  POST {url}/ai/analyze{' '*19}║
╚══════════════════════════════════════════════════════╝

  Pressione Ctrl+C para encerrar.
""")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Servidor encerrado.")
        server.shutdown()


if __name__ == "__main__":
    main()
