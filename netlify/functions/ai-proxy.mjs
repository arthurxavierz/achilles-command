import { requireInternalAuth, authError } from '../lib/auth.mjs';
const SYSTEM_PROMPTS = {
  assistant: `Você é o Achilles Assistant, auxiliar operacional interno da Achilles Media. Responda em português do Brasil, de forma direta, sem emojis e sem inventar dados. Use somente o contexto recebido. Ajude com CRM, prospects, propostas, projetos, tarefas e atendimentos. Quando faltar informação, diga objetivamente o que falta.`,
  outreach: `Você escreve primeiras abordagens comerciais da Achilles Media. Produza mensagens curtas, naturais e personalizadas para WhatsApp. Não use emojis, não invente fatos, não faça promessas exageradas e não diga que analisou algo que não aparece no contexto. Priorize uma abertura humana e uma pergunta simples.`,
  support: `Você auxilia no atendimento da Achilles Media. Responda em português do Brasil, de forma objetiva, profissional e natural. Use somente o contexto recebido. Se a solicitação exigir decisão humana, valor comercial definitivo ou informação ausente, sinalize a necessidade de encaminhamento.`
};

export default async (request) => {
  if (request.method !== "POST") return Response.json({ error: "Método não permitido" }, { status: 405 });
  const auth = await requireInternalAuth(request);
  if (!auth.ok) return authError(auth);

  const provider = (Netlify.env.get("AI_PROVIDER") || "none").toLowerCase();
  const model = Netlify.env.get("AI_MODEL");
  const body = await request.json();
  const task = String(body.task || "assistant").toLowerCase();
  const prompt = String(body.prompt || "").slice(0, 12000);
  const context = JSON.stringify(body.context || {}).slice(0, 40000);
  const system = SYSTEM_PROMPTS[task] || SYSTEM_PROMPTS.assistant;

  if (!prompt) return Response.json({ error: "Prompt obrigatório" }, { status: 400 });
  if (provider === "none") return Response.json({ error: "Provedor de IA ainda não configurado" }, { status: 503 });

  try {
    if (provider === "anthropic") {
      const key = Netlify.env.get("ANTHROPIC_API_KEY");
      if (!key) throw new Error("ANTHROPIC_API_KEY não configurada");
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model || "claude-haiku-4-5",
          max_tokens: task === "outreach" ? 220 : 1200,
          system,
          messages: [{ role: "user", content: `Contexto:\n${context}\n\nSolicitação:\n${prompt}` }]
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Falha na Anthropic");
      const text = data.content?.filter(item => item.type === "text").map(item => item.text).join("\n") || "Resposta concluída.";
      return Response.json({ text, provider, model: data.model });
    }

    if (provider === "openai") {
      const key = Netlify.env.get("OPENAI_API_KEY");
      if (!key) throw new Error("OPENAI_API_KEY não configurada");
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: model || "gpt-5-mini", instructions: system, input: `Contexto:\n${context}\n\nSolicitação:\n${prompt}`, store: false })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Falha na OpenAI");
      const text = data.output_text || data.output?.flatMap(item => item.content || []).find(item => item.type === "output_text")?.text || "Resposta concluída.";
      return Response.json({ text, provider, model: data.model });
    }

    return Response.json({ error: "Provedor não suportado" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
};
