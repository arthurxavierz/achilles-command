/* Proxy seguro para a ponte local de captação.
 *
 * Variáveis no Netlify:
 *   SCRAPER_SERVICE_URL    ex.: https://captacao.achillesmedia.com.br
 *   SCRAPER_SERVICE_SECRET mesmo segredo de scraper/.env
 *
 * O scraping é assíncrono: "start" cria o job rapidamente e "status" faz
 * polling. Assim nenhuma Function precisa ficar aberta durante os minutos de
 * execução do navegador headless.
 */

async function forward(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { message: text }; }
    return { response, data };
  } finally {
    clearTimeout(timeout);
  }
}

export default async (request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Método não permitido" }, { status: 405 });
  }

  const base = (Netlify.env.get("SCRAPER_SERVICE_URL") || "").replace(/\/+$/, "");
  const secret = Netlify.env.get("SCRAPER_SERVICE_SECRET") || "";
  if (!base) {
    return Response.json({
      error: "Captação ainda não configurada",
      detail: "Defina SCRAPER_SERVICE_URL no Netlify e inicie a ponte local da pasta scraper."
    }, { status: 503 });
  }

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Payload inválido" }, { status: 400 }); }

  const action = String(body.action || "").trim();
  const headers = {
    "Content-Type": "application/json",
    ...(secret ? { "x-achilles-secret": secret } : {})
  };

  try {
    if (action === "health") {
      const { response, data } = await forward(`${base}/health`, { headers });
      return Response.json(data, { status: response.status });
    }

    if (action === "start") {
      const segment = String(body.segment || "").trim().slice(0, 100);
      const city = String(body.city || "").trim().slice(0, 100);
      if (!segment || !city) return Response.json({ error: "Segmento e cidade são obrigatórios" }, { status: 400 });

      const query = `${segment} em ${city}`;
      const payload = {
        query,
        depth: Math.max(1, Math.min(Number(body.depth || 1), 5)),
        email: Boolean(body.email)
      };
      const { response, data } = await forward(`${base}/jobs`, {
        method: "POST", headers, body: JSON.stringify(payload)
      });
      return Response.json(data, { status: response.status });
    }

    if (action === "status") {
      const jobId = String(body.jobId || "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
      if (!jobId) return Response.json({ error: "jobId obrigatório" }, { status: 400 });
      const { response, data } = await forward(`${base}/jobs/${jobId}`, { headers });
      return Response.json(data, { status: response.status });
    }

    return Response.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error) {
    const timedOut = error.name === "AbortError";
    return Response.json({
      error: timedOut ? "A ponte de captação não respondeu a tempo" : "Falha ao conectar à ponte de captação",
      detail: error.message
    }, { status: timedOut ? 504 : 502 });
  }
};
