/* Proxy para o n8n.
 *
 * Antes existia uma única N8N_WEBHOOK_URL, mas o projeto tem cinco workflows,
 * cada um com seu próprio path de webhook. Só um deles era alcançável.
 * Agora o evento do payload escolhe o workflow de destino.
 *
 * Configuração no Netlify (uma das duas formas):
 *   N8N_BASE_URL       ex.: https://n8n.seudominio.com.br/webhook
 *   N8N_WEBHOOK_URL    fallback: URL única, usada quando não há BASE_URL
 *   N8N_WEBHOOK_SECRET opcional, enviado como x-achilles-secret
 */

const ROUTES = {
  "lead.created": "achilles-lead-intake",
  "public_chat_completed": "achilles-lead-intake",
  "lead.qualify": "achilles-lead-qualification",
  "campaign.queue": "achilles-message-queue",
  "proposal.followup": "achilles-follow-up",
  "report.weekly": "achilles-weekly-report",
  "manual_test": "achilles-lead-intake"
};

export default async (request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Método não permitido" }, { status: 405 });
  }

  const baseUrl = Netlify.env.get("N8N_BASE_URL");
  const singleUrl = Netlify.env.get("N8N_WEBHOOK_URL");
  const secret = Netlify.env.get("N8N_WEBHOOK_SECRET");

  if (!baseUrl && !singleUrl) {
    return Response.json(
      { error: "n8n não configurado", detail: "Defina N8N_BASE_URL (recomendado) ou N8N_WEBHOOK_URL nas variáveis do Netlify." },
      { status: 503 }
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Payload inválido" }, { status: 400 });
  }

  const event = String(payload.event || "").trim();
  const path = ROUTES[event];

  if (baseUrl && !path) {
    return Response.json(
      { error: "Evento desconhecido", event, aceitos: Object.keys(ROUTES) },
      { status: 400 }
    );
  }

  const target = baseUrl ? `${baseUrl.replace(/\/+$/, "")}/${path}` : singleUrl;

  // Timeout: sem isto, um n8n fora do ar deixava a interface pendurada.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-achilles-secret": secret } : {})
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const text = await response.text();
    let result;
    try { result = JSON.parse(text); } catch { result = { message: text || "Evento encaminhado" }; }

    return Response.json({ ...result, _workflow: path || "webhook-unico" }, { status: response.status });
  } catch (error) {
    const aborted = error.name === "AbortError";
    return Response.json(
      {
        error: aborted ? "n8n não respondeu a tempo" : "Falha ao encaminhar evento",
        details: error.message,
        event
      },
      { status: aborted ? 504 : 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
};
