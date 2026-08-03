/* Entrada segura de leads do chatbot público.
 *
 * O navegador não pode usar SUPABASE_SERVICE_ROLE_KEY. Esta Function valida
 * um payload pequeno e grava o lead na organização configurada no Netlify.
 *
 * Variáveis:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ACHILLES_ORGANIZATION_SLUG=achilles-media
 *   PUBLIC_LEAD_ALLOWED_ORIGINS=https://app.achillesmedia.com.br,... (opcional)
 */

function originAllowed(request) {
  const allowed = (Netlify.env.get("PUBLIC_LEAD_ALLOWED_ORIGINS") || "")
    .split(",").map(v => v.trim()).filter(Boolean);
  if (!allowed.length) return true;
  const origin = request.headers.get("origin") || "";
  return allowed.includes(origin);
}

function clean(value, max = 300) {
  return String(value || "").trim().slice(0, max);
}

function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) digits = `55${digits}`;
  return digits.slice(0, 20);
}

function scoreLead(lead) {
  const service = String(lead.service || "").toLowerCase();
  let score = 55;
  if (Number(lead.value || 0) >= 2500) score += 10;
  if (service.includes("sistema") || service.includes("automação") || service.includes("automacao")) score += 10;
  if (String(lead.phone || "").replace(/\D/g, "").length >= 12) score += 5;
  if (lead.email) score += 5;
  return Math.max(0, Math.min(score, 100));
}

async function supabase(path, options = {}) {
  const base = (Netlify.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
  const key = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!base || !key) throw new Error("Supabase server-side não configurado");
  const response = await fetch(`${base}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(data?.message || data?.error || `Supabase HTTP ${response.status}`);
  return data;
}

export default async (request) => {
  if (request.method !== "POST") return Response.json({ error: "Método não permitido" }, { status: 405 });
  if (!originAllowed(request)) return Response.json({ error: "Origem não autorizada" }, { status: 403 });

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Payload inválido" }, { status: 400 }); }

  // Campo honeypot reservado. O chat oficial não o preenche.
  if (body.website_confirm) return Response.json({ ok: true });

  const lead = {
    company: clean(body.company, 140) || "Sem empresa",
    contact: clean(body.contact, 120),
    phone: normalizePhone(body.phone),
    email: clean(body.email, 160),
    service: clean(body.service, 160),
    source: "Chat do site",
    stage: "new",
    value: Math.max(0, Math.min(Number(body.value || 0), 100000000)),
    last_contact: new Date().toISOString().slice(0, 10),
    next_action: "Realizar diagnóstico",
    notes: clean(body.notes, 1000)
  };

  if (!lead.contact || !lead.phone) {
    return Response.json({ error: "Nome e telefone são obrigatórios" }, { status: 400 });
  }
  lead.score = scoreLead(lead);

  try {
    const slug = encodeURIComponent(Netlify.env.get("ACHILLES_ORGANIZATION_SLUG") || "achilles-media");
    const orgs = await supabase(`organizations?slug=eq.${slug}&select=id&limit=1`);
    const organizationId = orgs?.[0]?.id;
    if (!organizationId) throw new Error("Organização configurada não encontrada no Supabase");

    const phone = encodeURIComponent(lead.phone);
    const existing = await supabase(`leads?organization_id=eq.${organizationId}&phone=eq.${phone}&select=id,company,contact,phone,score&limit=1`);

    if (existing?.length) {
      const id = existing[0].id;
      const updated = await supabase(`leads?id=eq.${encodeURIComponent(id)}&organization_id=eq.${organizationId}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          service: lead.service,
          notes: lead.notes,
          last_contact: lead.last_contact,
          next_action: lead.next_action,
          score: lead.score
        })
      });
      return Response.json({ ok: true, created: false, lead: updated?.[0] || existing[0] });
    }

    const id = `lead_web_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
    const created = await supabase("leads", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ id, organization_id: organizationId, ...lead })
    });
    return Response.json({ ok: true, created: true, lead: created?.[0] || { id, ...lead } }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
};
