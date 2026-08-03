/* ==========================================================================
   Achilles Command — núcleo compartilhado
   Carregado por index.html (painel) e chat.html (chatbot público).

   Existe porque o painel e o chatbot são páginas separadas que precisam
   compartilhar regras e registro de contatos. No modo publicado, o chatbot
   também envia o lead para uma Function segura que grava no Supabase.

   Também centraliza a regra de score usada no cadastro manual.
   ========================================================================== */

(() => {
  "use strict";

  const CFG = window.ACHILLES_CONFIG || {};
  const STORAGE_KEY = CFG.demoMode ? "achilles-command-demo-v1" : "achilles-command-cache-v1";

  const todayISO = () => new Date().toISOString().slice(0, 10);
  const uid = (prefix = "id") => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  /* --- score ---------------------------------------------------------------
     Score simples do CRM. O captador possui um score próprio de oportunidade
     digital, calculado no servidor durante a busca. */
  function scoreLead(lead = {}) {
    const service = String(lead.service || "").toLowerCase();
    let score = 55;
    if (lead.source === "Indicação") score += 15;
    if (Number(lead.value || 0) >= 2500) score += 10;
    if (service.includes("sistema") || service.includes("automação") || service.includes("automacao")) score += 10;
    if (String(lead.phone || "").replace(/\D/g, "").length >= 12) score += 5;
    if (lead.email) score += 5;
    return Math.max(0, Math.min(score, 100));
  }

  /* --- acesso ao armazenamento --------------------------------------------
     Leitura tolerante: o chatbot pode rodar antes do painel ter salvo algo. */
  function readStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeStore(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (error) {
      console.warn("Achilles: falha ao gravar no armazenamento local", error);
      return false;
    }
  }

  /* --- registro de atividade ----------------------------------------------
     O feed "Atividade recente" do painel estava congelado nos dados de
     exemplo porque nenhuma ação escrevia nele. */
  function pushActivity(store, title, description) {
    if (!store) return;
    if (!Array.isArray(store.activities)) store.activities = [];
    store.activities.unshift({
      id: uid("act"),
      title,
      description,
      time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      at: new Date().toISOString()
    });
    store.activities = store.activities.slice(0, 50);
  }

  /* --- entrada de lead -----------------------------------------------------
     Ponto único de entrada, usado pelo painel e pelo chatbot público.
     Deduplica por telefone para o mesmo contato não virar dois cards. */
  function addLead(input = {}, options = {}) {
    const store = readStore() || {};
    if (!Array.isArray(store.leads)) store.leads = [];

    const phoneDigits = String(input.phone || "").replace(/\D/g, "");
    const existing = phoneDigits
      ? store.leads.find(l => String(l.phone || "").replace(/\D/g, "") === phoneDigits)
      : null;

    if (existing) {
      existing.lastContact = todayISO();
      if (input.notes) existing.notes = input.notes;
      if (input.service) existing.service = input.service;
      existing.score = scoreLead({ ...existing, ...input });
      pushActivity(store, "Contato retomado", `${existing.company} voltou a interagir por ${input.source || "canal digital"}.`);
      writeStore(store);
      return { lead: existing, created: false };
    }

    const lead = {
      id: input.id || uid("lead"),
      company: input.company || "Sem empresa",
      contact: input.contact || "",
      phone: input.phone || "",
      email: input.email || "",
      service: input.service || "",
      source: input.source || "Chat do site",
      stage: input.stage || "new",
      value: Number(input.value || 0),
      lastContact: todayISO(),
      nextAction: input.nextAction || "Realizar diagnóstico",
      notes: input.notes || "",
      createdAt: todayISO()
    };
    lead.score = Number.isFinite(input.score) ? input.score : scoreLead(lead);

    store.leads.unshift(lead);
    pushActivity(store, "Lead captado", `${lead.company} entrou por ${lead.source} com score ${lead.score}.`);
    writeStore(store);
    return { lead, created: true };
  }

  /* --- registro de contato por WhatsApp ------------------------------------
     Antes, "Abrir WhatsApp" só abria uma aba e nada ficava registrado.
     Agora o envio manual vira histórico auditável. */
  function logWhatsAppContact(leadId, text) {
    const store = readStore();
    if (!store) return null;
    const lead = (store.leads || []).find(l => l.id === leadId);
    if (!lead) return null;

    lead.lastContact = todayISO();
    if (!Array.isArray(lead.touchpoints)) lead.touchpoints = [];
    lead.touchpoints.unshift({ id: uid("tp"), channel: "whatsapp", direction: "out", text, at: new Date().toISOString() });
    lead.touchpoints = lead.touchpoints.slice(0, 30);

    pushActivity(store, "Mensagem enviada", `WhatsApp aberto para ${lead.company}.`);
    writeStore(store);
    return lead;
  }

  /* --- captação pública ----------------------------------------------------
     No site publicado, grava o lead diretamente no Supabase por uma Function
     server-side. No modo local, a falha é tolerada e o fluxo continua. */
  async function sendLeadToServer(payload = {}) {
    const url = CFG.leadIntakeUrl || "/.netlify/functions/lead-intake";
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return { ok: false, error: result.error || `HTTP ${response.status}`, result };
      return { ok: true, result };
    } catch (error) {
      return { ok: false, error: error.message, offline: true };
    }
  }

  window.AchillesCore = {
    STORAGE_KEY, todayISO, uid,
    scoreLead, readStore, writeStore,
    pushActivity, addLead, logWhatsAppContact, sendLeadToServer
  };
})();
