(() => {
  "use strict";

  const CFG = window.ACHILLES_CONFIG || {};
  const app = document.getElementById("app");
  const STORAGE_KEY = CFG.demoMode ? "achilles-command-demo-v1" : "achilles-command-cache-v1";
  const SESSION_KEY = "achilles-command-session";

  const icons = {
    dashboard: '<path d="M3 3h7v7H3zM14 3h7v4h-7zM14 11h7v10h-7zM3 14h7v7H3z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    message: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    folder: '<path d="M3 4h6l2 3h10v13H3z"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
    bolt: '<path d="m13 2-9 12h7l-1 8 9-12h-7z"/>',
    spark: '<path d="m12 3-1.7 4.3L6 9l4.3 1.7L12 15l1.7-4.3L18 9l-4.3-1.7Z"/><path d="m5 15-.8 2.2L2 18l2.2.8L5 21l.8-2.2L8 18l-2.2-.8Z"/><path d="m19 14-.8 2.2L16 17l2.2.8L19 20l.8-2.2L22 17l-2.2-.8Z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.09a1.7 1.7 0 0 0-1.1-1.57 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3V9.6h.09A1.7 1.7 0 0 0 4.66 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.5 4.66a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.38.27.63.64.6 1.1V10h1v4h-.09A1.7 1.7 0 0 0 19.4 15Z"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 7-3 9h18c0-2-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    arrow: '<path d="m9 18 6-6-6-6"/>',
    trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
    money: '<circle cx="12" cy="12" r="9"/><path d="M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8M12 6v12"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4h8v3M3 12h18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    external: '<path d="M15 3h6v6M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    play: '<path d="m8 5 11 7-11 7z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    refresh: '<path d="M20 7h-6V1M4 17h6v6"/><path d="M20 7a9 9 0 0 0-15-3L2 7M4 17a9 9 0 0 0 15 3l3-3"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v5M14 11v5"/>',
    filter: '<path d="M4 5h16M7 12h10M10 19h4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    logout: '<path d="M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z"/><path d="M9 3v15M15 6v15"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 20h16"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'
  };

  const icon = (name, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.spark}</svg>`;
  const uid = (prefix = "id") => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]);
  const money = value => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(value || 0));
  const shortDate = value => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(value));
  const todayISO = () => new Date().toISOString().slice(0, 10);

  const seed = {
    leads: [
      { id:"lead_1", company:"Campbell Advocacia", contact:"Johnny Campbell", phone:"5534991112233", email:"johnny@campbell.com.br", service:"Landing page", source:"Instagram", stage:"proposal", score:91, value:1500, lastContact:"2026-07-29", nextAction:"Revisar proposta", notes:"Busca posicionamento digital e captação de contatos." },
      { id:"lead_2", company:"Avenida Veículos", contact:"Carlos Avenida", phone:"5534992020404", email:"", service:"Sistema de gestão", source:"Indicação", stage:"diagnosis", score:86, value:6800, lastContact:"2026-07-28", nextAction:"Validar escopo", notes:"CRM, estoque de veículos e painel operacional." },
      { id:"lead_3", company:"Clínica Aurora", contact:"Camila Souza", phone:"5534993131414", email:"camila@clinicaaurora.com", service:"Chatbot e agenda", source:"Site", stage:"new", score:74, value:2600, lastContact:"2026-07-29", nextAction:"Responder diagnóstico", notes:"Atendimento fora do horário e agendamento." },
      { id:"lead_4", company:"InfoTech Patrocínio", contact:"João Mendes", phone:"5534994242424", email:"contato@infotech.com", service:"SEO e site", source:"WhatsApp", stage:"negotiation", score:82, value:2300, lastContact:"2026-07-26", nextAction:"Follow-up comercial", notes:"Aguardando retorno sobre condição de pagamento." },
      { id:"lead_5", company:"Fazenda Boa Vista", contact:"Marcelo", phone:"5534995353535", email:"", service:"Sistema operacional", source:"Indicação", stage:"won", score:95, value:9200, lastContact:"2026-07-25", nextAction:"Iniciar onboarding", notes:"Gestão de estoque, frota e tarefas da equipe." },
      { id:"lead_6", company:"Vellure Perfumes", contact:"Mariana", phone:"5534996464646", email:"", service:"E-commerce", source:"Relacionamento", stage:"won", score:88, value:3100, lastContact:"2026-07-23", nextAction:"Acompanhar publicação", notes:"Projeto em etapa final de domínio e publicação." },
      { id:"lead_7", company:"Roberto Vida Nova", contact:"Roberto", phone:"5534997575757", email:"", service:"Site profissional", source:"Prospecção", stage:"lost", score:42, value:1499, lastContact:"2026-07-10", nextAction:"Retomar em 30 dias", notes:"Pausou investimento por prioridade financeira." },
      { id:"lead_8", company:"Victor Restaurante", contact:"Victor", phone:"5534998686868", email:"", service:"Cardápio digital", source:"Indicação", stage:"diagnosis", score:68, value:850, lastContact:"2026-07-29", nextAction:"Confirmar cardápio", notes:"Quer facilitar pedidos de marmitex no WhatsApp." }
    ],
    conversations: [
      { id:"conv_1", leadId:"lead_3", name:"Camila Souza", company:"Clínica Aurora", phone:"5534993131414", status:"bot", unread:2, lastAt:"21:18", summary:"Dúvida sobre atendimento automático e agenda.", messages:[
        { id:"m1", direction:"in", text:"Boa noite. Vocês fazem um robô que responde e já agenda a consulta?", time:"21:14" },
        { id:"m2", direction:"bot", text:"Fazemos sim. A solução pode responder dúvidas, coletar dados e encaminhar o agendamento. Posso entender como vocês organizam a agenda hoje?", time:"21:15" },
        { id:"m3", direction:"in", text:"Hoje é tudo pela recepção e pelo WhatsApp mesmo.", time:"21:18" }
      ]},
      { id:"conv_2", leadId:"lead_1", name:"Johnny Campbell", company:"Campbell Advocacia", phone:"5534991112233", status:"human", unread:0, lastAt:"17:42", summary:"Proposta pronta para revisão.", messages:[
        { id:"m4", direction:"in", text:"Pode me mandar os detalhes da página e o prazo?", time:"17:31" },
        { id:"m5", direction:"out", text:"Perfeito. Estruturei o projeto com apresentação do escritório, áreas de atuação e contato direto. Vou finalizar a proposta e te envio ainda hoje.", time:"17:42" }
      ]},
      { id:"conv_3", leadId:"lead_4", name:"João Mendes", company:"InfoTech Patrocínio", phone:"5534994242424", status:"paused", unread:0, lastAt:"seg", summary:"Cliente avaliando condição de pagamento.", messages:[
        { id:"m6", direction:"out", text:"João, deixei a proposta organizada com site, SEO inicial e suporte. Quando conseguir avaliar, me chama que ajustamos os próximos passos.", time:"seg" }
      ]}
    ],
    campaigns: [
      { id:"camp_1", name:"Retomada de propostas", status:"draft", audience:"Propostas sem resposta há 7 dias", message:"Olá, {{nome}}. Passei para saber se conseguiu avaliar a proposta que preparamos para a {{empresa}}. Posso esclarecer algum ponto?", total:8, sent:0, replies:0, createdAt:"2026-07-29" },
      { id:"camp_2", name:"Diagnóstico gratuito", status:"ready", audience:"Leads locais qualificados", message:"Olá, {{nome}}. Analisei a presença digital da {{empresa}} e identifiquei alguns pontos que podem melhorar conversão e atendimento. Posso te mostrar em uma conversa rápida?", total:14, sent:4, replies:2, createdAt:"2026-07-28" },
      { id:"camp_3", name:"Pós-entrega sites", status:"completed", audience:"Clientes com projeto concluído", message:"Olá, {{nome}}. Como foi a experiência após a publicação do projeto? Sua resposta ajuda a Achilles a melhorar cada entrega.", total:5, sent:5, replies:4, createdAt:"2026-07-22" }
    ],
    projects: [
      { id:"proj_1", client:"Vellure Perfumes", name:"Publicação do e-commerce", status:"review", progress:86, due:"2026-08-01", value:3100, description:"Revisão final, domínio, SSL e publicação." },
      { id:"proj_2", client:"Fazenda Boa Vista", name:"Sistema de gestão operacional", status:"planning", progress:18, due:"2026-09-15", value:9200, description:"Mapeamento dos módulos, perfis e banco de dados." },
      { id:"proj_3", client:"Achilles Media", name:"Achilles Command", status:"active", progress:44, due:"2026-08-18", value:0, description:"CRM, campanhas, automações e central de gestão." },
      { id:"proj_4", client:"Campbell Advocacia", name:"Landing page institucional", status:"waiting", progress:8, due:"2026-08-22", value:1500, description:"Aguardando aprovação da proposta e materiais." }
    ],
    proposals: [
      { id:"prop_1", leadId:"lead_1", client:"Campbell Advocacia", service:"Landing page", value:1500, status:"review", validUntil:"2026-08-05", createdAt:"2026-07-29" },
      { id:"prop_2", leadId:"lead_4", client:"InfoTech Patrocínio", service:"Site e SEO", value:2300, status:"sent", validUntil:"2026-08-02", createdAt:"2026-07-25" },
      { id:"prop_3", leadId:"lead_2", client:"Avenida Veículos", service:"Sistema de gestão", value:6800, status:"draft", validUntil:"2026-08-10", createdAt:"2026-07-28" }
    ],
    tasks: [
      { id:"task_1", title:"Revisar proposta Campbell", projectId:"proj_4", project:"Landing page institucional", assignee:"arthur", due:"2026-07-29", priority:"high", done:false },
      { id:"task_2", title:"Validar DNS da Vellure", projectId:"proj_1", project:"Publicação do e-commerce", assignee:"arthur", due:"2026-07-30", priority:"medium", done:false },
      { id:"task_3", title:"Mapear módulos da Fazenda Boa Vista", projectId:"proj_2", project:"Sistema de gestão operacional", assignee:"arthur", due:"2026-08-01", priority:"medium", done:false },
      { id:"task_4", title:"Publicar e-commerce da Vellure", projectId:"proj_1", project:"Publicação do e-commerce", assignee:"", due:"2026-08-01", priority:"high", done:false },
      { id:"task_5", title:"Preparar campanha de retomada", projectId:"proj_3", project:"Achilles Command", assignee:"arthur", due:"2026-07-29", priority:"low", done:true }
    ],
    team: [
      { id:"arthur", name:"Arthur", initials:"AX", role:"Direção" }
    ],
    automations: [
      { id:"auto_1", name:"Entrada de lead", description:"Valida, registra e classifica novos contatos.", active:true, executions:38, success:97, lastRun:"há 12 min", webhook:"lead-intake" },
      { id:"auto_2", name:"Qualificação comercial", description:"Analisa a necessidade e sugere a próxima pergunta.", active:true, executions:21, success:95, lastRun:"há 24 min", webhook:"lead-qualification" },
      { id:"auto_3", name:"Fila de mensagens", description:"Prepara campanhas para envio manual ou oficial.", active:true, executions:14, success:100, lastRun:"hoje, 18:20", webhook:"message-queue" },
      { id:"auto_4", name:"Follow-up programado", description:"Cria tarefas quando uma proposta fica sem resposta.", active:true, executions:46, success:98, lastRun:"hoje, 08:00", webhook:"follow-up" },
      { id:"auto_5", name:"Relatório gerencial", description:"Consolida indicadores e pontos de atenção.", active:false, executions:3, success:100, lastRun:"segunda, 08:00", webhook:"weekly-report" }
    ],
    services: [
      { id:"svc_1", name:"Landing page", basePrice:1500 },
      { id:"svc_2", name:"Site profissional", basePrice:2400 },
      { id:"svc_3", name:"Chatbot", basePrice:2800 },
      { id:"svc_4", name:"Sistema de gestão", basePrice:6500 },
      { id:"svc_5", name:"Automação de processo", basePrice:3200 }
    ],
    prospects: [],
    settings: {
      company:"Achilles Media",
      notificationEmail:"contato@achillesmedia.com.br",
      whatsappNumber:"5541984991690",
      botName:"Assistente Achilles",
      businessHours:"Segunda a sexta, 8h às 18h",
      humanHandoff:"Quero falar com uma pessoa",
      assistantMode:"rules",
      supabaseConnected:false,
      aiConnected:false,
      officialWhatsappConnected:false,
      prospectingEngine:"native"
    },
    activities: [
      { id:"act_1", title:"Lead classificado", description:"Clínica Aurora recebeu score 74.", time:"há 12 min" },
      { id:"act_2", title:"Proposta atualizada", description:"Campbell Advocacia está pronta para revisão.", time:"há 1 h" },
      { id:"act_3", title:"Campanha preparada", description:"Retomada de propostas recebeu 8 contatos.", time:"há 3 h" },
      { id:"act_4", title:"Projeto avançou", description:"Vellure Perfumes chegou a 86%.", time:"ontem" }
    ]
  };

  let state = {
    route: "dashboard",
    loggedIn: sessionStorage.getItem(SESSION_KEY) === "1",
    mobileOpen: false,
    selectedConversation: "conv_1",
    settingsTab: "general",
    data: loadData(),
    modal: null,
    assistantMessages: [],
    prospecting: { results: [], origin: null, query: "", city: "", state: "MG", radiusKm: 20, limit: 30, loading: false, view: "split" }
  };

  let supabaseClient = null;
  if (!CFG.demoMode && CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase) {
    supabaseClient = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  }

  async function internalApiHeaders() {
    const headers={"Content-Type":"application/json"};
    if(supabaseClient){
      try {
        const {data}=await supabaseClient.auth.getSession();
        if(data?.session?.access_token) headers.Authorization=`Bearer ${data.session.access_token}`;
      } catch {}
    }
    return headers;
  }

  function loadData() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return { ...structuredClone(seed), ...JSON.parse(stored) };
      if (CFG.demoMode) return structuredClone(seed);
      return {
        leads: [], prospects: [], conversations: [], campaigns: [], projects: [], proposals: [], tasks: [],
        automations: structuredClone(seed.automations), services: structuredClone(seed.services),
        settings: structuredClone(seed.settings), activities: []
      };
    } catch {
      return CFG.demoMode ? structuredClone(seed) : { leads: [], prospects: [], conversations: [], campaigns: [], projects: [], proposals: [], tasks: [], automations: structuredClone(seed.automations), services: structuredClone(seed.services), settings: structuredClone(seed.settings), activities: [] };
    }
  }

  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  }

  /* Registra no feed "Atividade recente", que antes ficava congelado nos
     dados de exemplo porque nenhuma ação escrevia nele. */
  function logActivity(title, description) {
    if (!Array.isArray(state.data.activities)) state.data.activities = [];
    state.data.activities.unshift({
      id: uid("act"), title, description,
      time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      at: new Date().toISOString()
    });
    state.data.activities = state.data.activities.slice(0, 50);
  }

  async function syncRecord(table, record) {
    if (!supabaseClient) return;
    try {
      await supabaseClient.from(table).upsert(toRemoteRecord(record, table));
    } catch (error) {
      console.warn("Falha ao sincronizar", table, error);
    }
  }

  async function loadRemoteData() {
    if (!supabaseClient) return;
    const tables = ["leads", "prospects", "conversations", "campaigns", "projects", "proposals", "tasks", "automations", "services"];
    for (const table of tables) {
      const { data, error } = await supabaseClient.from(table).select("*").order("created_at", { ascending: false });
      if (!error && Array.isArray(data)) state.data[table] = data.map(normalizeRemoteRecord);
    }
    saveData();
  }

  function toRemoteRecord(record, table) {
    const copy = { ...record };
    const mappings = {
      createdAt: "created_at", lastContact: "last_contact", nextAction: "next_action",
      leadId: "lead_id", validUntil: "valid_until", lastRun: "last_run", lastAt: "last_at", basePrice: "base_price",
      sourceId: "source_id", distanceKm: "distance_km", mapUrl: "map_url", googleUrl: "google_url",
      scoreBand: "score_band", scoreReasons: "score_reasons", lastEnrichedAt: "last_enriched_at", crmLeadId: "crm_lead_id",
      projectId: "project_id"
    };
    for (const [from, to] of Object.entries(mappings)) {
      if (Object.prototype.hasOwnProperty.call(copy, from)) { copy[to] = copy[from]; delete copy[from]; }
    }

    // Só envia colunas que realmente existem no Supabase. Resultados da
    // captação carregam campos auxiliares (band, reasons, rawTags) usados
    // pela interface, mas eles não devem virar colunas acidentais no banco.
    const allowed = {
      leads:['id','organization_id','company','contact','phone','email','service','source','stage','score','value','last_contact','next_action','notes','created_at'],
      prospects:['id','organization_id','source','source_id','name','category','address','phone','whatsapp','email','website','instagram','facebook','latitude','longitude','distance_km','map_url','google_url','score','score_band','score_reasons','crm_lead_id','last_enriched_at','created_at'],
      conversations:['id','organization_id','lead_id','name','company','phone','status','unread','last_at','summary','messages','created_at'],
      campaigns:['id','organization_id','name','status','audience','message','total','sent','replies','created_at'],
      projects:['id','organization_id','client','name','status','progress','due','value','description','created_at'],
      proposals:['id','organization_id','lead_id','client','service','value','status','valid_until','content','created_at'],
      tasks:['id','organization_id','title','project_id','project','assignee','due','priority','done','created_at'],
      automations:['id','organization_id','name','description','active','executions','success','last_run','webhook','created_at'],
      services:['id','organization_id','name','base_price','description','active','created_at']
    };
    if (!allowed[table]) return copy;
    return Object.fromEntries(Object.entries(copy).filter(([key])=>allowed[table].includes(key)));
  }

  function normalizeRemoteRecord(row) {
    const copy = { ...row };
    if (row.created_at && !row.createdAt) copy.createdAt = row.created_at;
    if (row.last_contact && !row.lastContact) copy.lastContact = row.last_contact;
    if (row.next_action && !row.nextAction) copy.nextAction = row.next_action;
    if (row.lead_id && !row.leadId) copy.leadId = row.lead_id;
    if (row.valid_until && !row.validUntil) copy.validUntil = row.valid_until;
    if (row.last_run && !row.lastRun) copy.lastRun = row.last_run;
    if (row.last_at && !row.lastAt) copy.lastAt = row.last_at;
    if (row.base_price && !row.basePrice) copy.basePrice = row.base_price;
    if (row.source_id && !row.sourceId) copy.sourceId = row.source_id;
    if (row.distance_km != null && copy.distanceKm == null) copy.distanceKm = row.distance_km;
    if (row.map_url && !row.mapUrl) copy.mapUrl = row.map_url;
    if (row.google_url && !row.googleUrl) copy.googleUrl = row.google_url;
    if (row.score_band && !row.scoreBand) copy.scoreBand = row.score_band;
    if (row.score_reasons && !row.scoreReasons) copy.scoreReasons = row.score_reasons;
    if (row.last_enriched_at && !row.lastEnrichedAt) copy.lastEnrichedAt = row.last_enriched_at;
    if (row.crm_lead_id && !row.crmLeadId) copy.crmLeadId = row.crm_lead_id;
    return copy;
  }

  const navSections = [
    { title:"Visão geral", items:[{id:"dashboard", label:"Dashboard", icon:"dashboard"}] },
    { title:"Comercial", items:[
      {id:"prospecting", label:"Captação", icon:"target"},
      {id:"leads", label:"CRM e leads", icon:"users"},
      {id:"messages", label:"Conversas", icon:"message", badge:() => state.data.conversations.reduce((n,c)=>n+(c.unread||0),0)},
      {id:"campaigns", label:"Campanhas", icon:"send"},
      {id:"proposals", label:"Propostas", icon:"file"}
    ]},
    { title:"Operação", items:[
      {id:"projects", label:"Projetos", icon:"folder"},
      {id:"automations", label:"Integrações", icon:"bolt"},
      {id:"assistant", label:"Assistente", icon:"spark"}
    ]},
    { title:"Sistema", items:[{id:"settings", label:"Configurações", icon:"settings"}] }
  ];

  const routeInfo = {
    dashboard:["Centro de comando", "Visão geral"],
    prospecting:["Prospecção comercial", "Captação de leads"],
    leads:["Pipeline comercial", "CRM e leads"],
    messages:["Atendimento", "Conversas"],
    campaigns:["Comunicação", "Campanhas"],
    proposals:["Comercial", "Propostas"],
    projects:["Entrega", "Projetos"],
    automations:["Infraestrutura", "Integrações"],
    assistant:["Inteligência aplicada", "Assistente"],
    settings:["Administração", "Configurações"]
  };

  function render() {
    if (!state.loggedIn) return renderLogin();
    app.innerHTML = renderShell();
    bindShellEvents();
    renderCurrentPage();
    if (state.modal) renderModal();
  }

  function renderLogin() {
    app.innerHTML = `
      <main class="login-page">
        <section class="login-showcase">
          <div class="login-brand">
            <span class="brand-mark" role="img" aria-label="Achilles Media"></span>
            <span class="brand-rule" aria-hidden="true"></span>
            <span class="brand-sub">Command</span>
          </div>
          <div class="login-copy">
            <span class="eyebrow">Tecnologia para execução</span>
            <h1>Sua operação em um <span>único comando.</span></h1>
            <p>Leads, conversas, propostas, projetos e automações conectados em uma central privada da Achilles Media.</p>
          </div>
          <div class="login-proof">
            <div class="proof-item"><strong>1 painel</strong><span>Para toda a gestão</span></div>
            <div class="proof-item"><strong>Captação</strong><span>Motor nativo incluído</span></div>
            <div class="proof-item"><strong>R$ 0</strong><span>No modo inicial</span></div>
          </div>
        </section>
        <section class="login-panel">
          <form class="login-card" id="login-form">
            <h2>Acesse sua central</h2>
            <p>Ambiente privado para administrar a Achilles Media.</p>
            <div class="form-group">
              <label class="label" for="email">E-mail</label>
              <input class="input" id="email" name="email" type="email" value="" required />
            </div>
            <div class="form-group">
              <label class="label" for="password">Senha</label>
              <input class="input" id="password" name="password" type="password" value="" required />
            </div>
            <button class="btn btn-primary btn-block" type="submit">${icon("lock")} Entrar no sistema</button>
            ${CFG.demoMode ? `<div class="demo-note"><strong>Modo de demonstração ativo.</strong> Os dados ficam salvos no navegador. O guia mostra como ativar Supabase Auth antes da publicação definitiva.</div>` : ""}
          </form>
        </section>
      </main>`;

    document.getElementById("login-form").addEventListener("submit", async event => {
      event.preventDefault();
      const email = event.target.email.value.trim();
      const password = event.target.password.value;
      if (supabaseClient) {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) return toast("Acesso não autorizado", error.message);
        await loadRemoteData();
      } else if (!email || !password) {
        return toast("Preencha os dados", "Informe e-mail e senha para continuar.");
      }
      state.loggedIn = true;
      sessionStorage.setItem(SESSION_KEY, "1");
      render();
    });
  }

  function renderShell() {
    const [kicker, title] = routeInfo[state.route] || routeInfo.dashboard;
    return `
      <div class="mobile-overlay ${state.mobileOpen ? "show" : ""}" id="mobile-overlay"></div>
      <div class="app-shell">
        <aside class="sidebar ${state.mobileOpen ? "open" : ""}" id="sidebar">
          <div class="brand"><span class="brand-mark" role="img" aria-label="Achilles Media"></span><span class="brand-rule" aria-hidden="true"></span><span class="brand-sub">Command</span></div>
          ${navSections.map(section => `<div class="nav-title">${section.title}</div><nav class="nav-list">${section.items.map(item => `<button class="nav-item ${state.route===item.id?"active":""}" data-route="${item.id}">${icon(item.icon)}<span>${item.label}</span>${item.badge && item.badge() ? `<span class="nav-badge">${item.badge()}</span>` : ""}</button>`).join("")}</nav>`).join("")}
          <div class="sidebar-bottom">
            <div class="status-card"><div class="status-row"><strong>Modo gratuito</strong><span class="status-dot"></span></div><p>Webapp ativo. Captação já incluída; Supabase, Claude e WhatsApp oficial podem ser ativados por etapas.</p></div>
          </div>
        </aside>
        <main class="main">
          <header class="topbar">
            <div class="topbar-left">
              <button class="icon-btn mobile-menu" id="mobile-menu" aria-label="Abrir menu">${icon("menu")}</button>
              <div><div class="page-kicker">${kicker}</div><h1 class="page-title">${title}</h1></div>
            </div>
            <div class="top-actions">
              <button class="btn btn-secondary btn-sm" data-action="quick-lead">${icon("plus")} Novo lead</button>
              <button class="icon-btn" data-action="notifications" aria-label="Notificações">${icon("bell")}</button>
              <button class="avatar-btn" data-action="profile"><span class="avatar">AX</span><span class="avatar-name">Arthur</span></button>
            </div>
          </header>
          <section class="content" id="page-content"></section>
        </main>
      </div>
      <div class="toast-stack" id="toast-stack"></div>`;
  }

  function bindShellEvents() {
    document.querySelectorAll("[data-route]").forEach(button => button.addEventListener("click", () => {
      state.route = button.dataset.route;
      state.mobileOpen = false;
      render();
    }));
    document.getElementById("mobile-menu")?.addEventListener("click", () => { state.mobileOpen = !state.mobileOpen; render(); });
    document.getElementById("mobile-overlay")?.addEventListener("click", () => { state.mobileOpen = false; render(); });
    document.querySelector('[data-action="quick-lead"]')?.addEventListener("click", () => openModal("lead"));
    document.querySelector('[data-action="notifications"]')?.addEventListener("click", () => toast("Tudo sob controle", "Você possui 3 pontos para revisar hoje."));
    document.querySelector('[data-action="profile"]')?.addEventListener("click", () => {
      state.route = "settings"; state.settingsTab = "access"; render();
    });
  }

  function renderCurrentPage() {
    const content = document.getElementById("page-content");
    const pages = { dashboard:dashboardPage, prospecting:prospectingPage, leads:leadsPage, messages:messagesPage, campaigns:campaignsPage, proposals:proposalsPage, projects:projectsPage, automations:automationsPage, assistant:assistantPage, settings:settingsPage };
    content.innerHTML = (pages[state.route] || dashboardPage)();
    bindPageEvents();
  }

  function dashboardPage() {
    const openLeads = state.data.leads.filter(l => !["won","lost"].includes(l.stage));
    const pipelineValue = openLeads.reduce((s,l)=>s+Number(l.value||0),0);
    const wonValue = state.data.leads.filter(l=>l.stage==="won").reduce((s,l)=>s+Number(l.value||0),0);
    const conversion = Math.round(state.data.leads.filter(l=>l.stage==="won").length / Math.max(state.data.leads.length,1) * 100);
    const pending = state.data.tasks.filter(t=>!t.done).length;
    return `
      <section class="hero">
        <div class="hero-grid">
          <div><span class="eyebrow">Operação em movimento</span><h2>Execute melhor. <span>Decida com contexto.</span></h2><p>O Achilles Command reúne captação, comercial, atendimento e projetos. As integrações rodam diretamente pelas funções seguras do próprio sistema.</p></div>
          <div class="hero-actions"><button class="btn btn-primary" data-action="open-campaign">${icon("send")} Preparar campanha</button><button class="btn btn-secondary" data-route="assistant">${icon("spark")} Consultar assistente</button></div>
        </div>
      </section>
      <div class="grid grid-4 mt-18">
        ${metric("users","Leads ativos",openLeads.length,"+18%","Novos e em andamento")}
        ${metric("money","Pipeline",money(pipelineValue),"+12%","Potencial em negociação")}
        ${metric("trend","Receita fechada",money(wonValue),"+26%","Oportunidades ganhas")}
        ${metric("clock","Pendências",pending,"-2","Tarefas em aberto",true)}
      </div>
      <div class="grid grid-3 mt-18">
        <article class="card card-pad" style="grid-column:span 2">
          <div class="card-head"><div><h3 class="card-title">Movimento comercial</h3><p class="card-subtitle">Evolução de oportunidades nos últimos sete períodos.</p></div><span class="tag gold">${conversion}% conversão</span></div>
          ${renderChart()}
        </article>
        <article class="card card-pad">
          <div class="card-head"><div><h3 class="card-title">Próximas ações</h3><p class="card-subtitle">O que merece atenção agora.</p></div><button class="btn btn-ghost btn-sm" data-route="projects">Ver tudo</button></div>
          <div class="task-list">${state.data.tasks.slice(0,4).map(taskItem).join("")}</div>
        </article>
      </div>
      <div class="grid grid-3 mt-18">
        <article class="card card-pad"><div class="card-head"><div><h3 class="card-title">Pipeline por etapa</h3><p class="card-subtitle">Distribuição atual dos leads.</p></div></div>${pipelineSummary()}</article>
        <article class="card card-pad"><div class="card-head"><div><h3 class="card-title">Projetos ativos</h3><p class="card-subtitle">Progresso das entregas prioritárias.</p></div></div>${state.data.projects.slice(0,3).map(p=>{const pr=projectProgress(p);return `<div style="margin-top:15px"><div class="flex justify-between"><strong style="font-size:11px">${escapeHtml(p.name)}</strong><span class="text-muted" style="font-size:10px">${pr.pct}%${pr.derived?` · ${pr.done}/${pr.total}`:""}</span></div><div class="progress" style="margin-top:8px"><span style="width:${pr.pct}%"></span></div></div>`}).join("")}</article>
        <article class="card card-pad"><div class="card-head"><div><h3 class="card-title">Atividade recente</h3><p class="card-subtitle">Ações registradas pelo sistema.</p></div></div><div class="activity-list">${state.data.activities.slice(0,4).map(a=>`<div class="activity-item"><span class="activity-mark"></span><div class="activity-content"><strong>${escapeHtml(a.title)}</strong><p>${escapeHtml(a.description)}</p></div><span class="activity-time">${escapeHtml(a.time)}</span></div>`).join("")}</div></article>
      </div>`;
  }

  function metric(iconName, label, value, change, description, down=false) {
    return `<article class="card metric-card"><div class="metric-top"><span class="metric-icon">${icon(iconName)}</span><span class="metric-change ${down?"down":""}">${change}</span></div><div class="metric-value">${value}</div><div class="metric-label">${label} · ${description}</div></article>`;
  }

  function renderChart() {
    return `<div class="chart-wrap"><svg class="chart-svg" viewBox="0 0 720 220" preserveAspectRatio="none"><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9a241" stop-opacity=".26"/><stop offset="1" stop-color="#c9a241" stop-opacity="0"/></linearGradient></defs>${[30,75,120,165,210].map(y=>`<line x1="10" y1="${y}" x2="710" y2="${y}" class="chart-grid-line"/>`).join("")}<path class="chart-area" d="M20 180 C80 170,100 130,150 145 S240 105,280 115 S370 68,420 85 S510 42,560 67 S650 25,700 38 L700 210 L20 210 Z"/><path class="chart-line" d="M20 180 C80 170,100 130,150 145 S240 105,280 115 S370 68,420 85 S510 42,560 67 S650 25,700 38"/>${["Semana 1","Semana 2","Semana 3","Semana 4","Semana 5","Semana 6","Hoje"].map((l,i)=>`<text x="${20+i*113}" y="218" class="chart-label">${l}</text>`).join("")}</svg></div>`;
  }

  function pipelineSummary() {
    const stages = [{id:"new",label:"Novos"},{id:"diagnosis",label:"Diagnóstico"},{id:"proposal",label:"Proposta"},{id:"negotiation",label:"Negociação"},{id:"won",label:"Fechados"}];
    const max = Math.max(...stages.map(s=>state.data.leads.filter(l=>l.stage===s.id).length),1);
    return stages.map(s=>{const count=state.data.leads.filter(l=>l.stage===s.id).length; return `<div style="margin-top:14px"><div class="flex justify-between"><span style="font-size:11px">${s.label}</span><strong style="font-size:11px">${count}</strong></div><div class="progress" style="margin-top:7px"><span style="width:${count/max*100}%"></span></div></div>`}).join("");
  }

  function memberName(id) {
    const m = (state.data.team || []).find(x => x.id === id);
    return m ? m.name : "";
  }

  function taskItem(t) {
    const who = memberName(t.assignee);
    const late = !t.done && t.due < todayISO();
    return `<div class="task-item"><button class="switch ${t.done?"on":""}" style="width:24px;height:24px;flex:0 0 auto" data-task-toggle="${t.id}" aria-label="Alternar tarefa"></button><div class="task-content"><strong style="${t.done?"text-decoration:line-through;color:var(--muted)":""}">${escapeHtml(t.title)}</strong><p>${escapeHtml(t.project||"Sem projeto")} · <span class="${late?"text-danger":""}">${shortDate(t.due)}${late?" · atrasada":""}</span></p></div>${who?`<span class="tag" title="Responsável">${escapeHtml(who)}</span>`:`<span class="tag warning" title="Sem responsável">A designar</span>`}<span class="tag ${t.priority==="high"?"danger":t.priority==="medium"?"warning":""}">${t.priority==="high"?"Alta":t.priority==="medium"?"Média":"Baixa"}</span></div>`;
  }


  function prospectingPage() {
    const p = state.prospecting;
    const results = p.results || [];
    const high = results.filter(x => Number(x.score||0) >= 75).length;
    const contactable = results.filter(x => x.phone || x.whatsapp || x.email).length;
    return `<div class="prospecting-layout">
      <section class="card prospect-search-panel">
        <div class="card-head"><div><h3 class="card-title">Caça-cliente Achilles</h3><p class="card-subtitle">Busque empresas locais, priorize oportunidades e prepare abordagens sem sair do Command.</p></div><span class="tag gold">Motor nativo</span></div>
        <form id="prospect-search-form" class="prospect-form">
          <div class="form-group"><label class="label">Segmento</label><input class="input" name="query" value="${escapeHtml(p.query)}" placeholder="Ex.: clínicas, contabilidades, academias" required /></div>
          <div class="form-group"><label class="label">Cidade</label><input class="input" name="city" value="${escapeHtml(p.city)}" placeholder="Ex.: Uberaba" required /></div>
          <div class="form-group small"><label class="label">UF</label><input class="input" name="state" value="${escapeHtml(p.state)}" maxlength="2" /></div>
          <div class="form-group small"><label class="label">Raio</label><select class="select" name="radiusKm">${[5,10,20,30,50].map(v=>`<option value="${v}" ${Number(p.radiusKm)===v?"selected":""}>${v} km</option>`).join("")}</select></div>
          <div class="form-group small"><label class="label">Limite</label><select class="select" name="limit">${[10,20,30,50].map(v=>`<option value="${v}" ${Number(p.limit)===v?"selected":""}>${v}</option>`).join("")}</select></div>
          <button class="btn btn-primary prospect-search-btn" type="submit" ${p.loading?'disabled':''}>${p.loading?icon('refresh'):icon('search')} ${p.loading?'Buscando...':'Buscar leads'}</button>
        </form>
        <div class="prospect-help">Sem Docker e sem API paga de mapas. O motor usa dados empresariais públicos e roda dentro das Functions do Achilles Command.</div>
      </section>
      ${p.loading ? `<div class="card prospect-loading"><span class="spinner"></span><strong>Buscando empresas e organizando oportunidades...</strong><span>A cobertura depende dos dados públicos disponíveis na região.</span></div>` : ''}
      ${results.length ? `<div class="grid grid-3 prospect-metrics">${metric('target','Encontrados',results.length,'Busca atual','Empresas localizadas')}${metric('trend','Alta oportunidade',high,'Score ≥ 75','Prioridade Achilles')}${metric('phone','Com contato',contactable,'Disponíveis','Telefone, WhatsApp ou e-mail')}</div>
      <div class="toolbar prospect-toolbar"><div class="toolbar-left"><strong>${escapeHtml(p.query)} em ${escapeHtml(p.city)}${p.state?`, ${escapeHtml(p.state)}`:''}</strong><span class="text-muted">Ordenado por oportunidade</span></div><div class="toolbar-right"><button class="btn btn-secondary btn-sm" data-action="export-prospects">${icon('download')} CSV</button><button class="btn btn-secondary btn-sm" data-action="toggle-prospect-view">${icon('map')} ${p.view==='list'?'Mostrar mapa':'Ocultar mapa'}</button></div></div>
      <div class="prospect-results ${p.view==='list'?'list-only':''}">
        <section class="prospect-list">${results.map(prospectCard).join('')}</section>
        ${p.view==='list'?'':`<aside class="card prospect-map-wrap"><div id="prospect-map" class="prospect-map"></div><div class="prospect-map-note">Mapa: OpenStreetMap</div></aside>`}
      </div>` : (!p.loading && p.query ? `<div class="empty-state card">${icon('target',34)}<h3>Nenhum resultado nessa busca</h3><p>Tente aumentar o raio ou usar um segmento mais amplo, como “clínicas” em vez de uma especialidade muito específica.</p></div>` : `<div class="empty-state card">${icon('target',34)}<h3>Comece por um segmento e uma cidade</h3><p>Exemplo: “clínicas” em “Uberaba”. Os resultados já chegam com contato disponível, score e atalhos de abordagem.</p></div>`)}
    </div>`;
  }

  function prospectCard(p) {
    const contact = p.whatsapp || p.phone || p.email || 'Contato não publicado';
    const scoreClass = p.score >= 75 ? 'gold' : p.score >= 55 ? 'warning' : '';
    const saved = p.crmLeadId || state.data.leads.some(l => String(l.company).toLowerCase() === String(p.name).toLowerCase());
    return `<article class="card prospect-card" data-prospect-id="${p.id}">
      <div class="prospect-card-top"><div><div class="prospect-name">${escapeHtml(p.name)}</div><div class="prospect-category">${escapeHtml(p.category || 'Empresa local')} · ${Number(p.distanceKm||0).toFixed(1)} km</div></div><div class="prospect-score"><strong>${p.score}</strong><span>Score</span></div></div>
      <div class="prospect-address">${escapeHtml(p.address || 'Endereço não informado')}</div>
      <div class="prospect-signals">
        <span class="tag ${p.phone||p.whatsapp?'info':''}">${icon('phone',12)} ${escapeHtml(contact)}</span>
        <span class="tag ${!p.website?'gold':''}">${p.website?'Site encontrado':'Sem site identificado'}</span>
        <span class="tag ${scoreClass}">${escapeHtml(p.band || p.scoreBand || 'Oportunidade')}</span>
      </div>
      <div class="prospect-reasons">${(p.reasons||p.scoreReasons||[]).slice(0,3).map(r=>`<span>${escapeHtml(r)}</span>`).join('')}</div>
      <div class="prospect-links">${p.website&&safeExternalUrl(p.website)?`<a href="${escapeHtml(safeExternalUrl(p.website))}" target="_blank" rel="noopener">Site</a>`:''}${p.instagram?`<a href="${escapeHtml(normalizeSocialUrl(p.instagram,'instagram'))}" target="_blank" rel="noopener">Instagram</a>`:''}${p.googleUrl&&safeExternalUrl(p.googleUrl)?`<a href="${escapeHtml(safeExternalUrl(p.googleUrl))}" target="_blank" rel="noopener">Google Maps</a>`:''}</div>
      <div class="prospect-actions">
        ${p.website?`<button class="btn btn-ghost btn-sm" data-action="enrich-prospect" data-prospect="${p.id}">${icon('refresh')} Enriquecer</button>`:''}
        <button class="btn btn-secondary btn-sm" data-action="prospect-approach" data-prospect="${p.id}">${icon('edit')} Abordagem</button>
        <button class="btn ${saved?'btn-secondary':'btn-primary'} btn-sm" data-action="prospect-crm" data-prospect="${p.id}" ${saved?'disabled':''}>${saved?icon('check'):icon('plus')} ${saved?'No CRM':'Adicionar ao CRM'}</button>
      </div>
    </article>`;
  }

  function safeExternalUrl(value) {
    try { const raw=String(value||'').trim(); const u=new URL(/^https?:\/\//i.test(raw)?raw:`https://${raw}`); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
  }

  function normalizeSocialUrl(value, network) {
    if (!value) return '';
    const v=String(value).trim();
    if (/^https?:\/\//i.test(v)) return safeExternalUrl(v);
    const handle=v.replace(/^@/,'').replace(/^\//,'');
    return network==='instagram' ? `https://instagram.com/${handle}` : '';
  }

  async function searchProspects(form) {
    const fd=new FormData(form);
    Object.assign(state.prospecting,{query:String(fd.get('query')||'').trim(),city:String(fd.get('city')||'').trim(),state:String(fd.get('state')||'').trim().toUpperCase(),radiusKm:Number(fd.get('radiusKm')||20),limit:Number(fd.get('limit')||30),loading:true});
    renderCurrentPage();
    try {
      const response=await fetch(CFG.prospectingUrl||'/.netlify/functions/prospect-search',{method:'POST',headers:await internalApiHeaders(),body:JSON.stringify(state.prospecting)});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||'Falha ao buscar empresas');
      state.prospecting.results=data.results||[]; state.prospecting.origin=data.origin||null;
      logActivity('Busca de prospecção',`${state.prospecting.query} em ${state.prospecting.city}: ${state.prospecting.results.length} oportunidades.`);
      saveData();
    } catch(error){ state.prospecting.results=[]; toast('Busca indisponível',error.message); }
    finally { state.prospecting.loading=false; renderCurrentPage(); }
  }

  function renderProspectMap() {
    const el=document.getElementById('prospect-map');
    if(!el || !window.L || !state.prospecting.results.length) return;
    const o=state.prospecting.origin || {lat:state.prospecting.results[0].latitude,lon:state.prospecting.results[0].longitude};
    const map=L.map(el,{zoomControl:true,attributionControl:true}).setView([o.lat,o.lon],12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
    const bounds=[];
    state.prospecting.results.forEach(p=>{
      if(!Number.isFinite(Number(p.latitude))||!Number.isFinite(Number(p.longitude))) return;
      bounds.push([p.latitude,p.longitude]);
      L.circleMarker([p.latitude,p.longitude],{radius:7,weight:2,fillOpacity:.8}).addTo(map).bindPopup(`<strong>${escapeHtml(p.name)}</strong><br>${escapeHtml(p.category||'')}<br>Score ${p.score}`);
    });
    if(bounds.length>1) map.fitBounds(bounds,{padding:[24,24],maxZoom:14});
    setTimeout(()=>map.invalidateSize(),80);
  }

  function scoreProspectClient(p) {
    let score=20; const reasons=[];
    if(p.phone||p.whatsapp){score+=24;reasons.push('telefone disponível')} else reasons.push('sem telefone público');
    if(p.email){score+=8;reasons.push('e-mail disponível')}
    if(p.whatsapp){score+=8;reasons.push('WhatsApp identificado')}
    if(!p.website){score+=24;reasons.push('sem site identificado')} else {score+=5;reasons.push('site identificado')}
    if(!p.instagram&&!p.facebook){score+=10;reasons.push('presença social limitada')}
    if(p.address) score+=4; if(p.name) score+=2; score=Math.min(100,score);
    return {score,band:score>=75?'Alta':score>=55?'Média':'Baixa',reasons};
  }

  async function enrichProspect(id) {
    const p=state.prospecting.results.find(x=>x.id===id); if(!p?.website) return;
    toast('Enriquecendo contato','Vou conferir o site público dessa empresa.');
    try{
      const response=await fetch(CFG.prospectEnrichUrl||'/.netlify/functions/prospect-enrich',{method:'POST',headers:await internalApiHeaders(),body:JSON.stringify({website:p.website})});
      const data=await response.json(); if(!response.ok) throw new Error(data.error||'Não foi possível enriquecer');
      p.email=p.email||data.emails?.[0]||''; p.instagram=p.instagram||data.instagram||''; p.facebook=p.facebook||data.facebook||'';
      if(!p.phone && data.phones?.[0]) p.phone=data.phones[0];
      if(!p.whatsapp && data.whatsapp){ const m=data.whatsapp.match(/(?:phone=|wa\.me\/)(\d+)/); if(m)p.whatsapp=m[1]; }
      Object.assign(p,scoreProspectClient(p),{lastEnrichedAt:new Date().toISOString()});
      upsertProspect(p); renderCurrentPage(); toast('Contato enriquecido','Dados públicos encontrados no site foram adicionados.');
    }catch(error){toast('Enriquecimento incompleto',error.message)}
  }

  function upsertProspect(p) {
    if(!Array.isArray(state.data.prospects)) state.data.prospects=[];
    const i=state.data.prospects.findIndex(x=>x.id===p.id);
    const record={...p,scoreBand:p.band||p.scoreBand,scoreReasons:p.reasons||p.scoreReasons,createdAt:p.createdAt||todayISO()};
    if(i>=0) state.data.prospects[i]=record; else state.data.prospects.unshift(record);
    saveData(); syncRecord('prospects',record); return record;
  }

  function addProspectToCrm(id) {
    const p=state.prospecting.results.find(x=>x.id===id) || state.data.prospects.find(x=>x.id===id); if(!p)return;
    const duplicate=state.data.leads.find(l=>String(l.company).toLowerCase()===String(p.name).toLowerCase() || (p.phone && String(l.phone||'').replace(/\D/g,'')===String(p.phone).replace(/\D/g,'')));
    if(duplicate){p.crmLeadId=duplicate.id;upsertProspect(p);toast('Já está no CRM',`${p.name} já possui um lead cadastrado.`);renderCurrentPage();return;}
    const lead={id:uid('lead'),company:p.name,contact:p.name,phone:p.whatsapp||p.phone||'',email:p.email||'',service:!p.website?'Site / posicionamento digital':'Diagnóstico digital',source:'Captação Achilles',stage:'new',score:Number(p.score||60),value:0,lastContact:todayISO(),nextAction:'Abordagem inicial',notes:`${p.category||'Empresa local'}${p.address?` · ${p.address}`:''}. Oportunidade: ${(p.reasons||p.scoreReasons||[]).join(', ')}.`,createdAt:todayISO()};
    state.data.leads.unshift(lead); p.crmLeadId=lead.id; upsertProspect(p); logActivity('Prospect adicionado ao CRM',`${p.name} entrou com score ${p.score}.`); saveData(); syncRecord('leads',lead); toast('Adicionado ao CRM',`${p.name} agora está no pipeline.`); renderCurrentPage();
  }

  async function generateProspectApproach(id) {
    const p=state.prospecting.results.find(x=>x.id===id) || state.data.prospects.find(x=>x.id===id); if(!p)return '';
    const base=`Olá! Vi a ${p.name} e achei que poderia fazer sentido conversar sobre como melhorar a presença digital da empresa. Trabalho na Achilles Media e posso te mostrar algumas oportunidades de forma bem objetiva. Posso te explicar por aqui?`;
    try{
      const response=await fetch(CFG.aiProxyUrl||'/.netlify/functions/ai-proxy',{method:'POST',headers:await internalApiHeaders(),body:JSON.stringify({task:'outreach',prompt:'Crie uma primeira abordagem curta para WhatsApp. Não invente fatos. Não use emoji. Não seja agressivo e não diga que analisou algo que não está no contexto.',context:{prospect:p,company:'Achilles Media'}})});
      const data=await response.json(); if(!response.ok) throw new Error(data.error||'IA indisponível'); return data.text||base;
    }catch{return base;}
  }

  function exportProspectsCsv() {
    const rows=state.prospecting.results; if(!rows.length)return;
    const cols=['name','category','score','band','phone','whatsapp','email','website','instagram','address','distanceKm','googleUrl','source'];
    const esc=v=>`"${String(v??'').replace(/"/g,'""')}"`;
    const csv='\ufeff'+[cols.join(';'),...rows.map(r=>cols.map(c=>esc(r[c])).join(';'))].join('\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`prospects-${state.prospecting.city.toLowerCase().replace(/\s+/g,'-')}-${todayISO()}.csv`;a.click();URL.revokeObjectURL(url);
  }

  function leadsPage() {
    const stages = [
      {id:"new",label:"Novos",color:"#7fa9d8"},{id:"diagnosis",label:"Diagnóstico",color:"#e08a3c"},{id:"proposal",label:"Proposta",color:"#c9a241"},{id:"negotiation",label:"Negociação",color:"#a98cd8"},{id:"won",label:"Fechados",color:"#5fc98b"},{id:"lost",label:"Arquivados",color:"#837b6c"}
    ];
    return `<div class="toolbar"><div class="toolbar-left"><div class="search-box">${icon("search")}<input class="input" id="lead-search" placeholder="Buscar empresa, contato ou serviço" /></div><button class="btn btn-secondary btn-sm">${icon("filter")} Filtros</button></div><div class="toolbar-right"><button class="btn btn-secondary btn-sm" data-action="export-data">${icon("download")} Exportar</button><button class="btn btn-primary btn-sm" data-action="new-lead">${icon("plus")} Novo lead</button></div></div>
      <div class="kanban" id="lead-kanban">${stages.map(stage=>{const leads=state.data.leads.filter(l=>l.stage===stage.id);return `<section class="kanban-column" data-stage="${stage.id}"><div class="kanban-head"><div class="kanban-title"><span class="stage-dot" style="background:${stage.color}"></span>${stage.label}</div><span class="kanban-count">${leads.length}</span></div>${leads.map(leadCard).join("")}</section>`}).join("")}</div>`;
  }

  function leadCard(lead) {
    return `<article class="lead-card" draggable="true" data-lead-id="${lead.id}"><div class="lead-top"><div><div class="lead-company">${escapeHtml(lead.company)}</div><div class="lead-contact">${escapeHtml(lead.contact)}</div></div><span class="score">${lead.score}</span></div><div class="lead-service">${escapeHtml(lead.service)}</div><div class="lead-meta"><span>${escapeHtml(lead.source)}</span><span class="lead-value">${money(lead.value)}</span></div></article>`;
  }

  function messagesPage() {
    const selected = state.data.conversations.find(c=>c.id===state.selectedConversation) || state.data.conversations[0];
    if (!selected) return `<div class="empty-state">${icon("message",34)}<h3>Nenhuma conversa</h3><p>As conversas aparecerão aqui quando um canal estiver conectado.</p></div>`;
    const lead = state.data.leads.find(l=>l.id===selected.leadId);
    return `<article class="card inbox-layout">
      <aside class="inbox-list"><div class="inbox-search"><div class="search-box" style="min-width:0">${icon("search")}<input class="input" placeholder="Buscar conversa" /></div></div>${state.data.conversations.map(c=>`<div class="conversation-item ${c.id===selected.id?"active":""}" data-conversation="${c.id}"><div class="conversation-top"><span class="conversation-name">${escapeHtml(c.name)}</span><span class="conversation-time">${escapeHtml(c.lastAt)}</span></div><div class="conversation-preview">${escapeHtml(c.summary)}</div><div class="conversation-meta"><span class="tag ${c.status==="bot"?"gold":c.status==="human"?"info":""}">${c.status==="bot"?"Automático":c.status==="human"?"Humano":"Pausado"}</span>${c.unread?`<span class="tag warning">${c.unread} nova${c.unread>1?"s":""}</span>`:""}</div></div>`).join("")}</aside>
      <section class="chat-panel"><header class="chat-head"><div class="chat-person"><div class="person-avatar">${selected.name.split(" ").map(x=>x[0]).slice(0,2).join("")}</div><div><strong>${escapeHtml(selected.name)}</strong><span>${escapeHtml(selected.company)}</span></div></div><div class="flex gap-8"><button class="btn btn-ghost btn-sm" data-action="simulate-incoming">${icon("message")} Simular entrada</button><button class="btn btn-secondary btn-sm" data-action="open-wa" data-phone="${selected.phone}">${icon("external")} WhatsApp</button></div></header>
        <div class="messages" id="messages-box">${selected.messages.map(m=>`<div class="message ${m.direction}">${escapeHtml(m.text)}<small>${m.direction==="bot"?"Assistente · ":""}${escapeHtml(m.time)}</small></div>`).join("")}</div>
        <form class="chat-compose" id="chat-form"><div class="quick-actions"><button type="button" class="quick-action" data-quick="Posso te fazer algumas perguntas para entender melhor?">Qualificar</button><button type="button" class="quick-action" data-quick="Vou organizar uma proposta e te envio para avaliação.">Preparar proposta</button><button type="button" class="quick-action" data-quick="Vou assumir o atendimento a partir daqui.">Assumir atendimento</button></div><div class="compose-row"><input class="input" name="message" autocomplete="off" placeholder="Escreva uma mensagem" /><button class="btn btn-primary" type="submit" aria-label="Enviar">${icon("send")}</button></div></form>
      </section>
      <aside class="contact-panel"><div class="contact-section"><div class="contact-label">Contato</div><div class="contact-value"><strong>${escapeHtml(selected.name)}</strong><br>${escapeHtml(selected.phone)}</div></div><div class="contact-section"><div class="contact-label">Interesse</div><div class="contact-value">${escapeHtml(lead?.service || "Não classificado")}</div></div><div class="contact-section"><div class="contact-label">Resumo</div><div class="contact-value text-muted">${escapeHtml(selected.summary)}</div></div><div class="contact-section"><div class="contact-label">Modo de atendimento</div><div class="contact-value"><button class="switch ${selected.status==="bot"?"on":""}" data-chatbot-toggle="${selected.id}"></button></div></div><div class="contact-section"><button class="btn btn-secondary btn-block btn-sm" data-action="prepare-followup">${icon("spark")} ${state.data.settings.assistantMode!=="rules"?"Sugerir com Claude":"Sugerir resposta"}</button></div></aside>
    </article>`;
  }

  function campaignsPage() {
    return `<div class="toolbar"><div><h2 class="card-title">Campanhas e fila de mensagens</h2><p class="card-subtitle">Prepare públicos e mensagens agora. O envio oficial pode ser conectado depois.</p></div><div class="toolbar-right"><button class="btn btn-secondary btn-sm" data-action="open-queue">${icon("send")} Abrir fila manual</button><button class="btn btn-primary btn-sm" data-action="new-campaign">${icon("plus")} Nova campanha</button></div></div>
      <div class="grid grid-3">${state.data.campaigns.map(campaignCard).join("")}</div>
      <article class="card card-pad mt-18"><div class="card-head"><div><h3 class="card-title">Envio assistido</h3><p class="card-subtitle">Abra cada contato no WhatsApp com a mensagem preenchida. O clique final permanece humano.</p></div><span class="tag gold">Sem custo de API</span></div><div class="table-wrap"><table class="table"><thead><tr><th>Contato</th><th>Empresa</th><th>Etapa</th><th>Mensagem sugerida</th><th>Ação</th></tr></thead><tbody>${state.data.leads.filter(l=>!["lost"].includes(l.stage)).slice(0,6).map(l=>`<tr><td><strong>${escapeHtml(l.contact)}</strong><br><span class="text-muted">${escapeHtml(l.phone)}</span></td><td>${escapeHtml(l.company)}</td><td><span class="tag">${stageLabel(l.stage)}</span></td><td>Olá, ${escapeHtml(l.contact.split(" ")[0])}. Posso te atualizar sobre o próximo passo do projeto da ${escapeHtml(l.company)}?</td><td><button class="btn btn-primary btn-sm" data-action="manual-message" data-lead="${l.id}">${icon("external")} Abrir</button></td></tr>`).join("")}</tbody></table></div></article>`;
  }

  function campaignCard(c) {
    const status = c.status==="completed"?"Concluída":c.status==="ready"?"Pronta":"Rascunho";
    return `<article class="card campaign-card"><div class="campaign-header"><div><div class="campaign-title">${escapeHtml(c.name)}</div><div class="card-subtitle">${escapeHtml(c.audience)}</div></div><span class="tag ${c.status==="completed"?"gold":c.status==="ready"?"info":""}">${status}</span></div><p class="campaign-copy">${escapeHtml(c.message)}</p><div class="campaign-stats"><div class="campaign-stat"><strong>${c.total}</strong><span>Contatos</span></div><div class="campaign-stat"><strong>${c.sent}</strong><span>Enviadas</span></div><div class="campaign-stat"><strong>${c.replies}</strong><span>Respostas</span></div></div><div class="flex gap-8" style="margin-top:14px"><button class="btn btn-secondary btn-sm" data-campaign="${c.id}" data-action="edit-campaign">${icon("edit")} Editar</button><button class="btn btn-primary btn-sm" data-campaign="${c.id}" data-action="run-campaign">${icon("play")} Preparar fila</button></div></article>`;
  }

  function proposalsPage() {
    return `<div class="toolbar"><div><h2 class="card-title">Propostas comerciais</h2><p class="card-subtitle">Valores seguem a tabela de serviços. A IA futura cuidará somente da redação.</p></div><button class="btn btn-primary btn-sm" data-action="new-proposal">${icon("plus")} Nova proposta</button></div><article class="card card-pad"><div class="table-wrap"><table class="table"><thead><tr><th>Cliente</th><th>Serviço</th><th>Valor</th><th>Validade</th><th>Status</th><th>Ações</th></tr></thead><tbody>${state.data.proposals.map(p=>`<tr><td><strong>${escapeHtml(p.client)}</strong><br><span class="text-muted">Criada em ${shortDate(p.createdAt)}</span></td><td>${escapeHtml(p.service)}</td><td><strong>${money(p.value)}</strong></td><td>${shortDate(p.validUntil)}</td><td><span class="tag ${p.status==="sent"?"info":p.status==="review"?"warning":""}">${p.status==="sent"?"Enviada":p.status==="review"?"Revisão":"Rascunho"}</span></td><td><div class="flex gap-8"><button class="btn btn-secondary btn-sm" data-action="preview-proposal" data-proposal="${p.id}">${icon("file")} Visualizar</button><button class="btn btn-primary btn-sm" data-action="send-proposal" data-proposal="${p.id}">${icon("send")} Preparar envio</button></div></td></tr>`).join("")}</tbody></table></div></article>`;
  }

  function projectsPage() {
    const columns = [{id:"planning",label:"Planejamento"},{id:"active",label:"Em produção"},{id:"review",label:"Revisão"},{id:"waiting",label:"Aguardando cliente"}];
    return `<div class="toolbar"><div><h2 class="card-title">Projetos e entregas</h2><p class="card-subtitle">Visão simples de prazo, progresso e valor por cliente.</p></div><div class="toolbar-right"><button class="btn btn-secondary btn-sm" data-action="new-task">${icon("plus")} Nova tarefa</button><button class="btn btn-primary btn-sm" data-action="new-project">${icon("plus")} Novo projeto</button></div></div><div class="grid grid-4">${columns.map(col=>`<section class="kanban-column" style="min-height:480px"><div class="kanban-head"><div class="kanban-title"><span class="stage-dot" style="background:var(--gold)"></span>${col.label}</div><span class="kanban-count">${state.data.projects.filter(p=>p.status===col.id).length}</span></div>${state.data.projects.filter(p=>p.status===col.id).map(projectCard).join("")}</section>`).join("")}</div>`;
  }

  /* Progresso derivado das tarefas do projeto.
     Antes era um inteiro digitado na criação que nunca mudava — a barra não
     media nada. Projetos ainda sem tarefas caem no valor manual. */
  function projectProgress(project) {
    const tasks = state.data.tasks.filter(t => t.projectId === project.id);
    if (!tasks.length) return { pct: Number(project.progress || 0), done: 0, total: 0, derived: false };
    const done = tasks.filter(t => t.done).length;
    return { pct: Math.round(done / tasks.length * 100), done, total: tasks.length, derived: true };
  }

  function projectCard(p) {
    const pr = projectProgress(p);
    const late = state.data.tasks.filter(t => t.projectId === p.id && !t.done && t.due < todayISO()).length;
    return `<article class="lead-card project-card" data-project-open="${p.id}"><div class="project-head"><div><div class="project-client">${escapeHtml(p.client)}</div><div class="project-name">${escapeHtml(p.name)}</div></div><span class="tag">${money(p.value)}</span></div><p class="project-desc">${escapeHtml(p.description)}</p><div class="progress"><span style="width:${pr.pct}%"></span></div><div class="project-meta"><span>${pr.pct}% ${pr.derived?`· ${pr.done}/${pr.total} tarefas`:"· sem tarefas"}</span><span>${shortDate(p.due)}</span></div>${late?`<div class="project-meta" style="margin-top:6px"><span class="text-danger">${late} tarefa${late>1?"s":""} em atraso</span></div>`:""}</article>`;
  }

  function automationsPage() {
    const aiOn=state.data.settings.assistantMode!=="rules";
    return `<section class="hero" style="min-height:190px"><div class="hero-grid" style="min-height:125px"><div><span class="eyebrow">Integrações nativas</span><h2 style="font-size:38px">Menos peças. <span>Mais controle.</span></h2><p>Captação, IA, banco e canais ficam ligados diretamente ao Achilles Command. Nenhum Docker ou orquestrador externo é necessário para a operação inicial.</p></div><div class="hero-actions"><button class="btn btn-primary" data-route="prospecting">${icon("target")} Abrir captação</button><button class="btn btn-secondary" data-action="open-integration-docs">${icon("external")} Guia de implantação</button></div></div></section>
      <div class="grid grid-2 mt-18">
        ${integrationCard('target','Captação nativa','Ativa','Busca local, score, contatos, mapa e CSV.','gold')}
        ${integrationCard('database','Supabase',CFG.demoMode?'Configurar':'Ativo','Banco, autenticação e sincronização.',CFG.demoMode?'warning':'gold')}
        ${integrationCard('spark','Claude API',aiOn?'Ativa':'Opcional','Assistente do Command e geração de abordagens.',aiOn?'gold':'')}
        ${integrationCard('phone','WhatsApp',state.data.settings.officialWhatsappConnected?'Cloud API':'Assistido','Hoje abre a mensagem pronta. Cloud API fica preparada para a próxima etapa.',state.data.settings.officialWhatsappConnected?'gold':'info')}
      </div>`;
  }

  function integrationCard(iconName,title,status,description,tagClass='') {
    return `<article class="card card-pad"><div class="flex gap-12 items-center"><span class="metric-icon">${icon(iconName)}</span><div style="flex:1"><div class="flex justify-between gap-8"><strong>${title}</strong><span class="tag ${tagClass}">${status}</span></div><p class="text-muted" style="font-size:11px;line-height:1.6;margin:7px 0 0">${description}</p></div></div></article>`;
  }

  function assistantPage() {
    const hasMessages = state.assistantMessages.length > 0;
    return `<article class="card assistant-shell"><section class="assistant-main"><div class="assistant-chat" id="assistant-chat">${hasMessages ? state.assistantMessages.map(m=>`<div class="message ${m.role==="user"?"out":"bot"}" style="margin:${m.role==="user"?"0 0 10px auto":"0 auto 10px 0"}">${escapeHtml(m.text)}<small>${m.role==="user"?"Arthur":"Achilles Assistant"}</small></div>`).join("") : `<div class="ai-intro"><div class="ai-mark">${icon("spark",29)}</div><h3>Contexto antes de resposta</h3><p>No modo gratuito, o assistente analisa os dados por regras. Ao ativar a Claude API, ele passa a responder com contexto do CRM, captação, propostas, projetos, tarefas e atendimentos.</p><div class="suggestion-grid"><button class="suggestion" data-assistant-prompt="Quais leads estão mais próximos de fechar?">Quais leads estão mais próximos de fechar?</button><button class="suggestion" data-assistant-prompt="O que precisa da minha atenção hoje?">O que precisa da minha atenção hoje?</button><button class="suggestion" data-assistant-prompt="Prepare uma visão comercial da semana.">Prepare uma visão comercial da semana.</button><button class="suggestion" data-assistant-prompt="Quais projetos podem atrasar?">Quais projetos podem atrasar?</button></div></div>`}</div><form class="assistant-compose" id="assistant-form"><div class="compose-row"><input class="input" name="prompt" placeholder="Pergunte sobre leads, propostas, tarefas ou projetos" autocomplete="off" /><button class="btn btn-primary" type="submit">${icon("send")}</button></div></form></section><aside class="assistant-context"><div class="page-kicker">Contexto disponível</div><div class="context-card"><strong>${state.data.leads.length} leads registrados</strong><p>Pipeline, score, origem, valor e próxima ação.</p></div><div class="context-card"><strong>${state.data.projects.length} projetos</strong><p>Prazos, progresso e status de entrega.</p></div><div class="context-card"><strong>${state.data.tasks.filter(t=>!t.done).length} tarefas pendentes</strong><p>Itens que precisam de acompanhamento.</p></div><div class="context-card"><strong>${state.data.prospects?.length||0} prospects salvos</strong><p>Empresas encontradas pelo captador e ainda não convertidas em lead.</p></div></aside></article>`;
  }

  function settingsPage() {
    const tabs = [{id:"general",label:"Geral"},{id:"connections",label:"Conexões"},{id:"chatbot",label:"Chatbot"},{id:"access",label:"Acesso e segurança"},{id:"data",label:"Dados"}];
    return `<article class="card settings-grid"><nav class="settings-nav">${tabs.map(t=>`<button class="${state.settingsTab===t.id?"active":""}" data-settings-tab="${t.id}">${t.label}</button>`).join("")}</nav><section class="settings-content">${settingsContent()}</section></article>`;
  }

  function settingsContent() {
    const s = state.data.settings;
    if (state.settingsTab === "connections") return `<div class="setting-section"><div class="card-head"><div><h3 class="card-title">Conexões</h3><p class="card-subtitle">A captação já é nativa. Aqui ficam apenas serviços externos opcionais.</p></div></div>${connection("SB","Supabase",!CFG.demoMode,"Banco, login e sincronização", "supabase")}${connection("IA","Claude API",s.assistantMode!=="rules","Assistente, abordagens e apoio ao atendimento", "ai")}${connection("WA","WhatsApp Cloud API",s.officialWhatsappConnected,"Opcional: envio e recebimento oficial no futuro", "whatsapp")}</div>`;
    if (state.settingsTab === "chatbot") return `<div class="setting-section"><div class="card-head"><div><h3 class="card-title">Chatbot</h3><p class="card-subtitle">Use regras sem custo ou conecte Claude por API. A chave permanece no servidor.</p></div></div><div class="form-grid"><div class="form-group"><label class="label">Nome do assistente</label><input class="input" id="bot-name" value="${escapeHtml(s.botName)}" /></div><div class="form-group"><label class="label">Modo atual</label><select class="select" id="assistant-mode"><option value="rules" ${s.assistantMode==="rules"?"selected":""}>Regras gratuitas</option><option value="hybrid" ${s.assistantMode==="hybrid"?"selected":""}>Híbrido com IA</option><option value="ai" ${s.assistantMode==="ai"?"selected":""}>IA completa</option></select></div><div class="form-group full"><label class="label">Horário de atendimento</label><input class="input" id="business-hours" value="${escapeHtml(s.businessHours)}" /></div><div class="form-group full"><label class="label">Frase para atendimento humano</label><input class="input" id="human-handoff" value="${escapeHtml(s.humanHandoff)}" /></div></div><div class="setting-row"><div class="setting-copy"><strong>Trava de atendimento humano</strong><p>Quando o contato pedir uma pessoa, o robô pausa e cria uma pendência.</p></div><button class="switch on"></button></div><button class="btn btn-primary" data-action="save-chatbot">Salvar configurações</button></div>`;
    if (state.settingsTab === "access") return `<div class="setting-section"><div class="card-head"><div><h3 class="card-title">Acesso e segurança</h3><p class="card-subtitle">No modo publicado, use Supabase Auth e políticas RLS.</p></div></div><div class="setting-row"><div class="setting-copy"><strong>Usuário atual</strong><p>Arthur Xavier · Administrador</p></div><span class="tag gold">Ativo</span></div><div class="setting-row"><div class="setting-copy"><strong>Sessão do navegador</strong><p>Encerre o acesso deste dispositivo.</p></div><button class="btn btn-danger btn-sm" data-action="logout">${icon("logout")} Sair</button></div><div class="setting-row"><div class="setting-copy"><strong>Modo de demonstração</strong><p>Dados armazenados localmente. Desative em config.js após configurar o Supabase.</p></div><span class="tag warning">${CFG.demoMode?"Ativo":"Desativado"}</span></div></div>`;
    if (state.settingsTab === "data") return `<div class="setting-section"><div class="card-head"><div><h3 class="card-title">Dados</h3><p class="card-subtitle">Ferramentas para teste e migração.</p></div></div><div class="setting-row"><div class="setting-copy"><strong>Exportar base</strong><p>Baixa todos os registros atuais em JSON.</p></div><button class="btn btn-secondary btn-sm" data-action="export-data">${icon("download")} Exportar</button></div><div class="setting-row"><div class="setting-copy"><strong>Restaurar demonstração</strong><p>Apaga alterações locais e retorna aos dados iniciais.</p></div><button class="btn btn-danger btn-sm" data-action="reset-demo">Restaurar</button></div></div>`;
    return `<div class="setting-section"><div class="card-head"><div><h3 class="card-title">Configurações gerais</h3><p class="card-subtitle">Identidade e canais principais da Achilles.</p></div></div><div class="form-grid"><div class="form-group full"><label class="label">Empresa</label><input class="input" id="company-name" value="${escapeHtml(s.company)}" /></div><div class="form-group"><label class="label">E-mail de notificações</label><input class="input" id="notification-email" value="${escapeHtml(s.notificationEmail)}" /></div><div class="form-group"><label class="label">Número do WhatsApp</label><input class="input" id="whatsapp-number" value="${escapeHtml(s.whatsappNumber)}" /></div></div><button class="btn btn-primary" style="margin-top:16px" data-action="save-general">Salvar alterações</button></div>`;
  }

  function connection(initials, name, connected, description, key) {
    return `<div class="connection-card"><div class="connection-logo">${initials}</div><div class="connection-copy"><strong>${name}</strong><span>${description}</span></div><button class="btn ${connected?"btn-secondary":"btn-primary"} btn-sm" data-action="connection-info" data-connection="${key}">${connected?"Configurar":"Conectar"}</button></div>`;
  }

  function stageLabel(stage) {
    return ({new:"Novo",diagnosis:"Diagnóstico",proposal:"Proposta",negotiation:"Negociação",won:"Fechado",lost:"Arquivado"})[stage] || stage;
  }

  function bindPageEvents() {
    document.querySelectorAll("[data-route]").forEach(b=>b.addEventListener("click",()=>{state.route=b.dataset.route;render();}));
    document.querySelector('[data-action="open-campaign"]')?.addEventListener("click",()=>openModal("campaign"));
    document.querySelector('[data-action="new-lead"]')?.addEventListener("click",()=>openModal("lead"));
    document.querySelector('[data-action="new-campaign"]')?.addEventListener("click",()=>openModal("campaign"));
    document.querySelector('[data-action="new-proposal"]')?.addEventListener("click",()=>openModal("proposal"));
    document.querySelector('[data-action="new-project"]')?.addEventListener("click",()=>openModal("project"));
    document.querySelector('[data-action="new-task"]')?.addEventListener("click",()=>openModal("task"));
    document.querySelectorAll("[data-project-open]").forEach(c=>c.addEventListener("click",()=>openModal("project-details",c.dataset.projectOpen)));
    document.querySelector('[data-action="open-queue"]')?.addEventListener("click",()=>toast("Fila pronta", "Use os botões Abrir para continuar no WhatsApp Web."));
    document.querySelector('[data-action="export-data"]')?.addEventListener("click", exportData);
    document.querySelectorAll("[data-task-toggle]").forEach(b=>b.addEventListener("click",()=>toggleTask(b.dataset.taskToggle)));
    bindProspecting();
    bindKanban();
    bindMessages();
    bindCampaigns();
    bindProposals();
    bindAutomations();
    bindAssistant();
    bindSettings();
  }

  function bindKanban() {
    let dragged = null;
    document.querySelectorAll(".lead-card[draggable]").forEach(card=>{
      card.addEventListener("dragstart",()=>{dragged=card.dataset.leadId;card.classList.add("dragging");});
      card.addEventListener("dragend",()=>{card.classList.remove("dragging");document.querySelectorAll(".kanban-column").forEach(c=>c.classList.remove("drag-over"));});
      card.addEventListener("dblclick",()=>openModal("lead-details", card.dataset.leadId));
    });
    document.querySelectorAll(".kanban-column[data-stage]").forEach(column=>{
      column.addEventListener("dragover",e=>{e.preventDefault();column.classList.add("drag-over");});
      column.addEventListener("dragleave",()=>column.classList.remove("drag-over"));
      column.addEventListener("drop",e=>{e.preventDefault();if(!dragged)return;const lead=state.data.leads.find(l=>l.id===dragged);if(lead){const from=stageLabel(lead.stage);lead.stage=column.dataset.stage;lead.lastContact=todayISO();logActivity("Etapa alterada",`${lead.company}: ${from} → ${stageLabel(lead.stage)}.`);saveData();syncRecord("leads",lead);toast("Etapa atualizada",`${lead.company} foi movida para ${stageLabel(lead.stage)}.`);renderCurrentPage();}});
    });
    document.getElementById("lead-search")?.addEventListener("input",e=>{const q=e.target.value.toLowerCase();document.querySelectorAll(".lead-card").forEach(card=>{card.style.display=card.textContent.toLowerCase().includes(q)?"":"none";});});
  }

  function bindMessages() {
    document.querySelectorAll("[data-conversation]").forEach(item=>item.addEventListener("click",()=>{state.selectedConversation=item.dataset.conversation;const c=state.data.conversations.find(x=>x.id===state.selectedConversation);if(c)c.unread=0;saveData();renderCurrentPage();}));
    document.querySelectorAll("[data-quick]").forEach(btn=>btn.addEventListener("click",()=>{const input=document.querySelector('#chat-form [name="message"]');input.value=btn.dataset.quick;input.focus();}));
    document.getElementById("chat-form")?.addEventListener("submit",e=>{e.preventDefault();const input=e.target.message;const text=input.value.trim();if(!text)return;const c=state.data.conversations.find(x=>x.id===state.selectedConversation);c.messages.push({id:uid("m"),direction:"out",text,time:new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})});c.summary=text;c.lastAt="agora";input.value="";saveData();renderCurrentPage();setTimeout(()=>document.getElementById("messages-box")?.scrollTo(0,99999),0);});
    document.querySelector('[data-action="simulate-incoming"]')?.addEventListener("click",()=>openModal("incoming"));
    document.querySelector('[data-action="open-wa"]')?.addEventListener("click",e=>openWhatsApp(e.currentTarget.dataset.phone,""));
    document.querySelector("[data-chatbot-toggle]")?.addEventListener("click",e=>{const c=state.data.conversations.find(x=>x.id===e.currentTarget.dataset.chatbotToggle);c.status=c.status==="bot"?"human":"bot";saveData();renderCurrentPage();});
    document.querySelector('[data-action="prepare-followup"]')?.addEventListener("click",suggestSupportReply);
  }

  async function suggestSupportReply() {
    const c=state.data.conversations.find(x=>x.id===state.selectedConversation);
    if(!c) return;
    const lead=state.data.leads.find(l=>l.id===c.leadId);
    const input=document.querySelector('#chat-form [name="message"]');
    const fallback=`Olá, ${String(c.name||'').split(' ')[0]||'tudo bem'}! Retomando nosso contato: posso te ajudar a avançar no próximo passo sobre ${lead?.service||'o que conversamos'}?`;
    if(state.data.settings.assistantMode!=="rules") {
      try {
        const response=await fetch(CFG.aiProxyUrl||'/.netlify/functions/ai-proxy',{
          method:'POST',headers:await internalApiHeaders(),
          body:JSON.stringify({
            task:'support',
            prompt:'Sugira apenas a próxima mensagem que eu deveria enviar ao cliente. Seja curta, natural, sem emojis e sem inventar informações.',
            context:{conversation:c,lead:lead||null}
          })
        });
        const data=await response.json();
        if(!response.ok) throw new Error(data.error||'IA indisponível');
        if(input){input.value=data.text||fallback;input.focus();}
        toast('Resposta sugerida','Revise o texto antes de enviar.');
        return;
      } catch(error) {
        toast('Claude indisponível','Usei uma sugestão local como alternativa.');
      }
    }
    if(input){input.value=fallback;input.focus();}
  }

  function bindCampaigns() {
    document.querySelectorAll('[data-action="manual-message"]').forEach(b=>b.addEventListener("click",()=>{const lead=state.data.leads.find(l=>l.id===b.dataset.lead);const text=`Olá, ${lead.contact.split(" ")[0]}. Posso te atualizar sobre o próximo passo do projeto da ${lead.company}?`;openWhatsApp(lead.phone,text,lead.id);}));
    document.querySelectorAll('[data-action="run-campaign"]').forEach(b=>b.addEventListener("click",()=>{const c=state.data.campaigns.find(x=>x.id===b.dataset.campaign);c.status="ready";saveData();toast("Campanha preparada",`${c.total} contatos foram mantidos na fila para revisão.`);renderCurrentPage();}));
    document.querySelectorAll('[data-action="edit-campaign"]').forEach(b=>b.addEventListener("click",()=>openModal("campaign",b.dataset.campaign)));
  }

  function bindProposals() {
    document.querySelectorAll('[data-action="preview-proposal"]').forEach(b=>b.addEventListener("click",()=>openModal("proposal-preview",b.dataset.proposal)));
    document.querySelectorAll('[data-action="send-proposal"]').forEach(b=>b.addEventListener("click",()=>{const p=state.data.proposals.find(x=>x.id===b.dataset.proposal);p.status="sent";saveData();toast("Envio preparado",`A proposta de ${p.client} foi marcada como enviada.`);renderCurrentPage();}));
  }

  function bindAutomations() {
    document.querySelector('[data-action="open-integration-docs"]')?.addEventListener("click",()=>toast("Guia incluído", "Abra docs/GUIA_IMPLEMENTACAO.md na pasta do projeto."));
  }

  function bindProspecting() {
    const form=document.getElementById('prospect-search-form');
    if(form) form.addEventListener('submit',e=>{e.preventDefault();searchProspects(form)});
    document.querySelectorAll('[data-action="enrich-prospect"]').forEach(b=>b.addEventListener('click',()=>enrichProspect(b.dataset.prospect)));
    document.querySelectorAll('[data-action="prospect-crm"]').forEach(b=>b.addEventListener('click',()=>addProspectToCrm(b.dataset.prospect)));
    document.querySelectorAll('[data-action="prospect-approach"]').forEach(b=>b.addEventListener('click',()=>openModal('prospect-approach',b.dataset.prospect)));
    document.querySelector('[data-action="export-prospects"]')?.addEventListener('click',exportProspectsCsv);
    document.querySelector('[data-action="toggle-prospect-view"]')?.addEventListener('click',()=>{state.prospecting.view=state.prospecting.view==='list'?'split':'list';renderCurrentPage()});
    if(state.route==='prospecting' && state.prospecting.results.length && state.prospecting.view!=='list') setTimeout(renderProspectMap,30);
  }

  function bindAssistant() {
    document.querySelectorAll("[data-assistant-prompt]").forEach(b=>b.addEventListener("click",()=>submitAssistant(b.dataset.assistantPrompt)));
    document.getElementById("assistant-form")?.addEventListener("submit",e=>{e.preventDefault();const p=e.target.prompt.value.trim();if(p)submitAssistant(p);});
  }

  function bindSettings() {
    document.querySelectorAll("[data-settings-tab]").forEach(b=>b.addEventListener("click",()=>{state.settingsTab=b.dataset.settingsTab;renderCurrentPage();}));
    document.querySelector('[data-action="logout"]')?.addEventListener("click",logout);
    document.querySelector('[data-action="reset-demo"]')?.addEventListener("click",()=>{localStorage.removeItem(STORAGE_KEY);state.data=structuredClone(seed);toast("Demonstração restaurada", "Os dados locais voltaram ao estado inicial.");render();});
    document.querySelector('[data-action="save-general"]')?.addEventListener("click",()=>{Object.assign(state.data.settings,{company:document.getElementById("company-name").value,notificationEmail:document.getElementById("notification-email").value,whatsappNumber:document.getElementById("whatsapp-number").value});saveData();toast("Configurações salvas", "Os dados gerais foram atualizados.");});
    document.querySelector('[data-action="save-chatbot"]')?.addEventListener("click",()=>{Object.assign(state.data.settings,{botName:document.getElementById("bot-name").value,assistantMode:document.getElementById("assistant-mode").value,businessHours:document.getElementById("business-hours").value,humanHandoff:document.getElementById("human-handoff").value});saveData();toast("Chatbot atualizado", "As configurações foram salvas.");});
    document.querySelectorAll('[data-action="connection-info"]').forEach(b=>b.addEventListener("click",()=>openModal("connection",b.dataset.connection)));
    // O botão de exportar já é vinculado em bindPageEvents. Vincular de novo
    // aqui fazia um clique baixar dois arquivos e emitir dois avisos.
  }

  async function submitAssistant(prompt) {
    state.assistantMessages.push({role:"user",text:prompt});
    renderCurrentPage();

    if (state.data.settings.assistantMode !== "rules") {
      try {
        const response = await fetch(CFG.aiProxyUrl || "/.netlify/functions/ai-proxy", {
          method: "POST",
          headers: await internalApiHeaders(),
          body: JSON.stringify({
            task: "assistant",
            prompt,
            context: {
              leads: state.data.leads, prospects: state.data.prospects,
              proposals: state.data.proposals, projects: state.data.projects,
              tasks: state.data.tasks, conversations: state.data.conversations
            }
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "IA indisponível");
        state.assistantMessages.push({role:"assistant",text:result.text});
        renderCurrentPage();
        return;
      } catch (error) {
        toast("IA externa indisponível", "O assistente usou a análise local como alternativa.");
      }
    }

    const lower=prompt.toLowerCase();
    let answer;
    if(lower.includes("fechar")||lower.includes("lead")){
      const top=[...state.data.leads].filter(l=>!["won","lost"].includes(l.stage)).sort((a,b)=>b.score-a.score).slice(0,3);
      answer=top.length ? `Os contatos com maior prioridade são ${top.map(l=>`${l.company}, score ${l.score}`).join("; ")}. Minha sugestão é revisar o próximo passo de ${top[0].company}.` : "Ainda não existem leads suficientes para priorizar.";
    } else if(lower.includes("atenção")||lower.includes("hoje")||lower.includes("pend")){
      const pending=state.data.tasks.filter(t=>!t.done).slice(0,3);
      answer=`Hoje existem ${state.data.tasks.filter(t=>!t.done).length} tarefas pendentes.${pending.length ? ` As primeiras são: ${pending.map(t=>t.title).join("; ")}.` : ""}`;
    } else if(lower.includes("projeto")||lower.includes("atras")){
      const risk=[...state.data.projects].map(p=>({p,pr:projectProgress(p)})).sort((a,b)=>a.pr.pct-b.pr.pct).slice(0,2);
      answer=risk.length ? `Os projetos que pedem acompanhamento são ${risk.map(({p,pr})=>`${p.name}, com ${pr.pct}%${pr.derived?` (${pr.done} de ${pr.total} tarefas)`:""}`).join("; ")}.` : "Ainda não existem projetos cadastrados.";
    } else {
      const pipeline=state.data.leads.filter(l=>!["won","lost"].includes(l.stage)).reduce((sum,l)=>sum+Number(l.value||0),0);
      answer=`A Achilles possui ${state.data.leads.length} leads registrados, ${state.data.projects.length} projetos e ${money(pipeline)} em pipeline aberto.`;
    }
    state.assistantMessages.push({role:"assistant",text:answer});
    renderCurrentPage();
  }

  function toggleTask(id) {
    const task=state.data.tasks.find(t=>t.id===id); if(!task)return; task.done=!task.done; saveData(); syncRecord("tasks",task); renderCurrentPage();
  }

  function openModal(type, id=null) { state.modal={type,id}; renderModal(); }
  function closeModal() { state.modal=null; document.querySelector(".modal-backdrop")?.remove(); }

  function renderModal() {
    document.querySelector(".modal-backdrop")?.remove();
    const wrapper=document.createElement("div");wrapper.className="modal-backdrop";wrapper.innerHTML=modalContent(state.modal.type,state.modal.id);document.body.appendChild(wrapper);
    wrapper.addEventListener("click",e=>{if(e.target===wrapper)closeModal();});
    wrapper.querySelectorAll('[data-action="close-modal"]').forEach(b=>b.addEventListener("click",closeModal));
    bindModalEvents(state.modal.type,state.modal.id);
  }

  function modalContent(type,id) {
    if(type==="lead") return modalFrame("Novo lead","Cadastre uma oportunidade para entrar no CRM.",`<form id="modal-form" class="form-grid"><div class="form-group"><label class="label">Empresa</label><input class="input" name="company" required /></div><div class="form-group"><label class="label">Contato</label><input class="input" name="contact" required /></div><div class="form-group"><label class="label">WhatsApp</label><input class="input" name="phone" required /></div><div class="form-group"><label class="label">Origem</label><select class="select" name="source"><option>Instagram</option><option>WhatsApp</option><option>Site</option><option>Indicação</option><option>Prospecção</option></select></div><div class="form-group"><label class="label">Serviço</label><select class="select" name="service">${state.data.services.map(s=>`<option>${escapeHtml(s.name)}</option>`).join("")}</select></div><div class="form-group"><label class="label">Valor estimado</label><input class="input" name="value" type="number" value="1500" /></div><div class="form-group full"><label class="label">Observações</label><textarea class="textarea" name="notes"></textarea></div></form>`, `<button class="btn btn-secondary" data-action="close-modal">Cancelar</button><button class="btn btn-primary" data-action="save-lead">Cadastrar lead</button>`);
    if(type==="campaign") { const c=state.data.campaigns.find(x=>x.id===id); return modalFrame(c?"Editar campanha":"Nova campanha","Monte o público e a mensagem antes de escolher o canal.",`<form id="modal-form" class="form-grid"><div class="form-group full"><label class="label">Nome</label><input class="input" name="name" value="${escapeHtml(c?.name||"")}" required /></div><div class="form-group full"><label class="label">Público</label><input class="input" name="audience" value="${escapeHtml(c?.audience||"Leads ativos")}" /></div><div class="form-group full"><label class="label">Mensagem</label><textarea class="textarea" name="message" required>${escapeHtml(c?.message||"Olá, {{nome}}. Posso te apresentar uma oportunidade para a {{empresa}}?")}</textarea><div class="help">Variáveis disponíveis: {{nome}} e {{empresa}}.</div></div></form>`,`<button class="btn btn-secondary" data-action="close-modal">Cancelar</button><button class="btn btn-primary" data-action="save-campaign">Salvar campanha</button>`); }
    if(type==="proposal") return modalFrame("Nova proposta","Use um lead e um serviço cadastrado para manter preço e escopo controlados.",`<form id="modal-form" class="form-grid"><div class="form-group full"><label class="label">Lead</label><select class="select" name="leadId">${state.data.leads.filter(l=>!["won","lost"].includes(l.stage)).map(l=>`<option value="${l.id}">${escapeHtml(l.company)}</option>`).join("")}</select></div><div class="form-group"><label class="label">Serviço</label><select class="select" name="service">${state.data.services.map(s=>`<option value="${s.name}" data-price="${s.basePrice}">${escapeHtml(s.name)}</option>`).join("")}</select></div><div class="form-group"><label class="label">Valor</label><input class="input" name="value" type="number" value="1500" /></div><div class="form-group"><label class="label">Validade</label><input class="input" name="validUntil" type="date" value="2026-08-10" /></div></form>`,`<button class="btn btn-secondary" data-action="close-modal">Cancelar</button><button class="btn btn-primary" data-action="save-proposal">Criar proposta</button>`);
    if(type==="project") return modalFrame("Novo projeto","Transforme um fechamento em uma estrutura de entrega.",`<form id="modal-form" class="form-grid"><div class="form-group"><label class="label">Cliente</label><input class="input" name="client" required /></div><div class="form-group"><label class="label">Projeto</label><input class="input" name="name" required /></div><div class="form-group"><label class="label">Prazo</label><input class="input" name="due" type="date" value="2026-08-30" /></div><div class="form-group"><label class="label">Valor</label><input class="input" name="value" type="number" value="0" /></div><div class="form-group full"><label class="label">Descrição</label><textarea class="textarea" name="description"></textarea></div></form>`,`<button class="btn btn-secondary" data-action="close-modal">Cancelar</button><button class="btn btn-primary" data-action="save-project">Criar projeto</button>`);
    if(type==="project-details") { const p=state.data.projects.find(x=>x.id===id); const pr=projectProgress(p); const tasks=state.data.tasks.filter(t=>t.projectId===p.id); return modalFrame(p.name,`${p.client} · entrega ${shortDate(p.due)}`,`<div class="grid grid-2"><div class="card card-pad"><div class="contact-label">Progresso</div><div class="contact-value">${pr.pct}% ${pr.derived?`(${pr.done} de ${pr.total} tarefas)`:"(sem tarefas vinculadas)"}</div></div><div class="card card-pad"><div class="contact-label">Valor</div><div class="contact-value">${money(p.value)}</div></div></div><div class="progress" style="margin-top:14px"><span style="width:${pr.pct}%"></span></div><div class="contact-section"><div class="contact-label">Tarefas do projeto</div>${tasks.length?`<div class="task-list" style="margin-top:10px">${tasks.map(taskItem).join("")}</div>`:`<p class="text-muted" style="font-size:11px;margin-top:8px">Nenhuma tarefa vinculada. O progresso deste projeto ainda é manual.</p>`}</div>`,`<button class="btn btn-secondary" data-action="close-modal">Fechar</button><button class="btn btn-primary" data-action="new-task">${icon("plus")} Nova tarefa</button>`); }
    if(type==="task") { const team=state.data.team||[]; return modalFrame("Nova tarefa","Toda tarefa pertence a um projeto e tem um responsável.",`<form id="modal-form" class="form-grid"><div class="form-group full"><label class="label">Título</label><input class="input" name="title" required /></div><div class="form-group"><label class="label">Projeto</label><select class="select" name="projectId">${state.data.projects.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("")}</select></div><div class="form-group"><label class="label">Responsável</label><select class="select" name="assignee"><option value="">A designar</option>${team.map(m=>`<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("")}</select></div><div class="form-group"><label class="label">Prazo</label><input class="input" name="due" type="date" value="${todayISO()}" /></div><div class="form-group"><label class="label">Prioridade</label><select class="select" name="priority"><option value="low">Baixa</option><option value="medium" selected>Média</option><option value="high">Alta</option></select></div></form>`,`<button class="btn btn-secondary" data-action="close-modal">Cancelar</button><button class="btn btn-primary" data-action="save-task">Criar tarefa</button>`); }
    if(type==="incoming") return modalFrame("Simular mensagem recebida","Teste o chatbot por regras sem conectar o WhatsApp.",`<form id="modal-form"><label class="label">Mensagem do cliente</label><textarea class="textarea" name="message" required>Quanto custa um site para minha empresa?</textarea></form>`,`<button class="btn btn-secondary" data-action="close-modal">Cancelar</button><button class="btn btn-primary" data-action="simulate-message">Processar mensagem</button>`);
    if(type==="prospect-approach") { const p=state.prospecting.results.find(x=>x.id===id)||state.data.prospects.find(x=>x.id===id); const initial=`Olá! Vi a ${p.name} e achei que poderia fazer sentido conversar sobre a presença digital da empresa. Trabalho na Achilles Media. Posso te mostrar uma oportunidade de forma bem objetiva?`; return modalFrame("Preparar abordagem",`${p.name} · score ${p.score}`,`<div class="form-group"><label class="label">Mensagem</label><textarea class="textarea approach-editor" id="prospect-approach-text">${escapeHtml(initial)}</textarea></div><div class="prospect-approach-context"><strong>Contexto usado</strong><p>${escapeHtml((p.reasons||p.scoreReasons||[]).join(' · '))}</p></div>`,`<button class="btn btn-secondary" data-action="generate-prospect-approach" data-prospect="${p.id}">${icon('spark')} Gerar com Claude</button><button class="btn btn-primary" data-action="open-prospect-whatsapp" data-prospect="${p.id}">${icon('external')} Abrir WhatsApp</button>`); }
    if(type==="proposal-preview") { const p=state.data.proposals.find(x=>x.id===id); return modalFrame("Proposta comercial",`${p.client} · validade até ${shortDate(p.validUntil)}`,`<div style="padding:8px 0"><span class="eyebrow">Achilles Media</span><h2 style="font-size:28px;margin:14px 0 8px">${escapeHtml(p.service)}</h2><p class="text-muted" style="line-height:1.7">Projeto desenvolvido para posicionar a ${escapeHtml(p.client)} com uma entrega clara, responsiva e orientada a resultado.</p><div class="card card-pad" style="margin-top:18px"><div class="flex justify-between"><span>Investimento do projeto</span><strong class="text-gold" style="font-size:22px">${money(p.value)}</strong></div></div><p class="text-muted" style="font-size:10px;line-height:1.6;margin-top:18px">O texto definitivo poderá ser gerado por IA, mas valores e serviços sempre virão do banco de dados.</p></div>`,`<button class="btn btn-secondary" data-action="close-modal">Fechar</button><button class="btn btn-primary" data-action="download-proposal" data-proposal="${p.id}">${icon("download")} Salvar HTML</button>`); }
    if(type==="lead-details") { const l=state.data.leads.find(x=>x.id===id); return modalFrame(l.company,`${l.contact} · ${l.phone}`,`<div class="grid grid-2"><div class="card card-pad"><div class="contact-label">Serviço</div><div class="contact-value">${escapeHtml(l.service)}</div></div><div class="card card-pad"><div class="contact-label">Valor</div><div class="contact-value">${money(l.value)}</div></div><div class="card card-pad"><div class="contact-label">Score</div><div class="contact-value">${l.score}</div></div><div class="card card-pad"><div class="contact-label">Próxima ação</div><div class="contact-value">${escapeHtml(l.nextAction)}</div></div></div><div class="contact-section"><div class="contact-label">Contexto</div><div class="contact-value text-muted">${escapeHtml(l.notes)}</div></div>`,`<button class="btn btn-secondary" data-action="close-modal">Fechar</button><button class="btn btn-primary" data-action="manual-message" data-lead="${l.id}">${icon("external")} Abrir WhatsApp</button>`); }
    if(type==="connection") { const info={supabase:["Supabase","Informe URL e chave pública no config.js, execute o schema SQL e desative demoMode."],whatsapp:["WhatsApp Cloud API","Opcional. O envio assistido já funciona sem API. Quando ativar a Cloud API, configure as variáveis Meta no Netlify."],ai:["Claude API","Defina AI_PROVIDER=anthropic, AI_MODEL=claude-haiku-4-5 e ANTHROPIC_API_KEY no Netlify. Nenhuma chave fica no navegador."]}[id]; return modalFrame(info[0],"Conexão preparada para ativação gradual.",`<div class="card card-pad"><div class="flex gap-12"><span class="metric-icon">${icon("link")}</span><div><strong>${info[0]}</strong><p class="text-muted" style="font-size:11px;line-height:1.65">${info[1]}</p></div></div></div><p class="text-muted" style="font-size:10px;line-height:1.6;margin-top:14px">Consulte docs/GUIA_IMPLEMENTACAO.md para o passo a passo completo.</p>`,`<button class="btn btn-primary" data-action="close-modal">Entendi</button>`); }
    return modalFrame("Achilles Command","",`<p>Conteúdo indisponível.</p>`,`<button class="btn btn-primary" data-action="close-modal">Fechar</button>`);
  }

  function modalFrame(title,subtitle,body,actions) { return `<div class="modal"><div class="modal-head"><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(subtitle)}</p></div><button class="close-btn" data-action="close-modal">${icon("close")}</button></div><div class="modal-body">${body}</div><div class="modal-actions">${actions}</div></div>`; }

  function bindModalEvents(type,id) {
    document.querySelector('[data-action="save-lead"]')?.addEventListener("click",()=>{const f=new FormData(document.getElementById("modal-form"));const lead={id:uid("lead"),company:f.get("company"),contact:f.get("contact"),phone:f.get("phone"),email:"",service:f.get("service"),source:f.get("source"),stage:"new",value:Number(f.get("value")),lastContact:todayISO(),nextAction:"Realizar diagnóstico",notes:f.get("notes")};lead.score=window.AchillesCore?window.AchillesCore.scoreLead(lead):60;state.data.leads.unshift(lead);logActivity("Lead cadastrado",`${lead.company} entrou no pipeline com score ${lead.score}.`);saveData();syncRecord("leads",lead);closeModal();toast("Lead cadastrado",`${lead.company} entrou no pipeline.`);if(state.route==="leads")renderCurrentPage();});
    document.querySelector('[data-action="save-campaign"]')?.addEventListener("click",()=>{const f=new FormData(document.getElementById("modal-form"));let c=state.data.campaigns.find(x=>x.id===id);if(c){c.name=f.get("name");c.audience=f.get("audience");c.message=f.get("message");}else{c={id:uid("camp"),name:f.get("name"),audience:f.get("audience"),message:f.get("message"),status:"draft",total:state.data.leads.filter(l=>l.stage!=="lost").length,sent:0,replies:0,createdAt:todayISO()};state.data.campaigns.unshift(c);}saveData();syncRecord("campaigns",c);closeModal();toast("Campanha salva",`${c.name} está pronta para revisão.`);renderCurrentPage();});
    document.querySelector('[data-action="save-proposal"]')?.addEventListener("click",()=>{const f=new FormData(document.getElementById("modal-form"));const lead=state.data.leads.find(l=>l.id===f.get("leadId"));const p={id:uid("prop"),leadId:lead.id,client:lead.company,service:f.get("service"),value:Number(f.get("value")),status:"draft",validUntil:f.get("validUntil"),createdAt:todayISO()};state.data.proposals.unshift(p);lead.stage="proposal";logActivity("Proposta criada",`${p.client} · ${p.service} · ${money(p.value)}.`);saveData();syncRecord("proposals",p);closeModal();toast("Proposta criada",`${p.client} foi movida para a etapa de proposta.`);renderCurrentPage();});
    document.querySelector('[data-action="save-project"]')?.addEventListener("click",()=>{const f=new FormData(document.getElementById("modal-form"));const p={id:uid("proj"),client:f.get("client"),name:f.get("name"),status:"planning",progress:5,due:f.get("due"),value:Number(f.get("value")),description:f.get("description")};state.data.projects.unshift(p);saveData();syncRecord("projects",p);closeModal();toast("Projeto criado",`${p.name} entrou em planejamento.`);renderCurrentPage();});
    document.querySelector('[data-action="simulate-message"]')?.addEventListener("click",()=>{const f=new FormData(document.getElementById("modal-form"));const c=state.data.conversations.find(x=>x.id===state.selectedConversation);const text=f.get("message");c.messages.push({id:uid("m"),direction:"in",text,time:"agora"});c.summary=text;c.lastAt="agora";if(c.status==="bot")c.messages.push({id:uid("m"),direction:"bot",text:ruleReply(text),time:"agora"});saveData();closeModal();renderCurrentPage();});
    document.querySelector('[data-action="new-task"]')?.addEventListener("click",()=>openModal("task"));
    document.querySelectorAll("[data-task-toggle]").forEach(b=>b.addEventListener("click",()=>toggleTask(b.dataset.taskToggle)));
    document.querySelector('[data-action="save-task"]')?.addEventListener("click",()=>{const f=new FormData(document.getElementById("modal-form"));const proj=state.data.projects.find(p=>p.id===f.get("projectId"));const t={id:uid("task"),title:f.get("title"),projectId:proj?proj.id:"",project:proj?proj.name:"Sem projeto",assignee:f.get("assignee")||"",due:f.get("due"),priority:f.get("priority"),done:false};state.data.tasks.unshift(t);logActivity("Tarefa criada",`${t.title}${t.assignee?` · ${memberName(t.assignee)}`:" · sem responsável"}.`);saveData();syncRecord("tasks",t);closeModal();toast("Tarefa criada",t.assignee?`Designada para ${memberName(t.assignee)}.`:"Ainda sem responsável.");renderCurrentPage();});
    document.querySelector('[data-action="download-proposal"]')?.addEventListener("click",()=>downloadProposal(id));
    document.querySelector('[data-action="generate-prospect-approach"]')?.addEventListener("click",async e=>{const btn=e.currentTarget;btn.disabled=true;btn.textContent='Gerando...';const text=await generateProspectApproach(btn.dataset.prospect);const area=document.getElementById('prospect-approach-text');if(area)area.value=text;btn.disabled=false;btn.innerHTML=`${icon('spark')} Gerar novamente`;});
    document.querySelector('[data-action="open-prospect-whatsapp"]')?.addEventListener("click",e=>{const p=state.prospecting.results.find(x=>x.id===e.currentTarget.dataset.prospect)||state.data.prospects.find(x=>x.id===e.currentTarget.dataset.prospect);const text=document.getElementById('prospect-approach-text')?.value||'';if(!p?.phone&&!p?.whatsapp){toast('Sem WhatsApp identificado','Adicione o prospect ao CRM para complementar o contato manualmente.');return;}openWhatsApp(p.whatsapp||p.phone,text,p.crmLeadId||null);});
    document.querySelector('[data-action="manual-message"]')?.addEventListener("click",e=>{const l=state.data.leads.find(x=>x.id===e.currentTarget.dataset.lead);openWhatsApp(l.phone,`Olá, ${l.contact.split(" ")[0]}. Posso te atualizar sobre o próximo passo da ${l.company}?`,l.id);});
  }

  function ruleReply(text) {
    const t=text.toLowerCase();
    if(t.includes("humano")||t.includes("pessoa")||t.includes("arthur")) return "Certo. Vou pausar o atendimento automático e avisar o Arthur com o contexto desta conversa.";
    if(t.includes("preço")||t.includes("valor")||t.includes("custa")) return "O investimento depende do tipo de entrega e das integrações necessárias. Qual solução você procura: site, automação, chatbot ou gestão de tráfego?";
    if(t.includes("site")||t.includes("landing")) return "A Achilles desenvolve sites e landing pages com foco em posicionamento e conversão. Qual é o principal objetivo da página?";
    if(t.includes("chatbot")||t.includes("robô")||t.includes("atendimento")) return "Podemos estruturar um atendimento que responda dúvidas, qualifique contatos e chame uma pessoa no momento certo. Hoje vocês atendem por qual canal?";
    return "Entendi. Para direcionar corretamente, me conte qual processo ou resultado você quer melhorar na empresa.";
  }

  function openWhatsApp(phone,text,leadId=null) {
    let clean=String(phone||"").replace(/\D/g,"");
    if(clean.length===10 || clean.length===11) clean=`55${clean}`;
    if(!clean){toast('Contato sem telefone','Complete o número antes de abrir o WhatsApp.');return;}
    const url=`https://wa.me/${clean}${text?`?text=${encodeURIComponent(text)}`:""}`;
    window.open(url,"_blank","noopener,noreferrer");
    // Registra o contato: antes o envio manual não deixava rastro nenhum.
    if(leadId && window.AchillesCore){
      const updated=window.AchillesCore.logWhatsAppContact(leadId,text);
      if(updated){ state.data=loadData(); renderCurrentPage(); }
    }
  }

  function exportData() {
    const blob=new Blob([JSON.stringify(state.data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`achilles-command-backup-${todayISO()}.json`;a.click();URL.revokeObjectURL(url);toast("Backup gerado", "O arquivo JSON foi baixado.");
  }

  function downloadProposal(id) {
    const p=state.data.proposals.find(x=>x.id===id);const html=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Proposta ${p.client}</title><style>body{font-family:Inter,"Helvetica Neue",Arial,sans-serif;max-width:760px;margin:60px auto;padding:0 28px;color:#1a1713;line-height:1.65;-webkit-font-smoothing:antialiased}.brand{color:#8a6a1f;font-weight:700;font-size:11px;letter-spacing:.18em;font-family:ui-monospace,Menlo,Consolas,monospace}.brand::after{content:"";display:block;width:44px;height:2px;margin-top:14px;background:linear-gradient(90deg,#c9a241,#e3c877)}h1{margin:26px 0 0;font-size:42px;line-height:1.05;letter-spacing:-.035em;font-weight:700}p{color:#4a453d}.value{margin-top:34px;padding:24px 26px;background:#faf3e0;border-left:3px solid #c9a241;border-radius:4px 16px 16px 4px;font-size:24px;font-weight:700;letter-spacing:-.02em;color:#1a1713}.meta{margin-top:22px;color:#7a7367;font-size:12px;letter-spacing:.04em}</style><body><div class="brand">ACHILLES MEDIA</div><h1>${escapeHtml(p.service)}</h1><p>Proposta preparada para ${escapeHtml(p.client)}.</p><p>Construiremos uma entrega orientada a posicionamento, eficiência e resultado.</p><div class="value">Investimento: ${money(p.value)}</div><p class="meta">Validade da proposta: ${shortDate(p.validUntil)}</p></body></html>`;const blob=new Blob([html],{type:"text/html"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`proposta-${p.client.toLowerCase().replace(/\s+/g,"-")}.html`;a.click();URL.revokeObjectURL(url);
  }

  async function logout() {
    if(supabaseClient) await supabaseClient.auth.signOut();
    state.loggedIn=false;sessionStorage.removeItem(SESSION_KEY);render();
  }

  function toast(title,message) {
    let stack=document.getElementById("toast-stack");
    if(!stack){stack=document.createElement("div");stack.id="toast-stack";stack.className="toast-stack";document.body.appendChild(stack);}
    const el=document.createElement("div");el.className="toast";el.innerHTML=`<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span>`;stack.appendChild(el);setTimeout(()=>el.remove(),4200);
  }

  render();
})();
