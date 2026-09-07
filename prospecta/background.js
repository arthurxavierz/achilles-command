/* Achilles Prospecta — service worker.
   Guarda a fila, abre o WhatsApp Web e leva de volta ao Command o que
   aconteceu (contatado / adicionar ao CRM). Quem envia é o content script do
   WhatsApp; aqui não há nenhuma decisão sobre mensagem. */

const get = async (k, d) => { const r = await chrome.storage.local.get(k); return r[k] === undefined ? d : r[k]; };
const set = (k, v) => chrome.storage.local.set({ [k]: v });

/* Padrões das abas do Command. Mesma lista do "matches" do manifest — se um
   dia entrar outro domínio, ele precisa aparecer nos dois lugares. */
const COMMAND_URLS = [
  'https://app.achillesmedia.com.br/*',
  'https://*.achillesmedia.com.br/*',
  'https://*.netlify.app/*',
  'http://localhost/*',
  'http://127.0.0.1/*'
];

/* Ações que precisam voltar para o Command. Ficam pendentes até uma aba do
   Command aparecer — a fila roda no WhatsApp, e o sistema pode estar fechado. */
async function pushPending(action) {
  const pending = await get('pending', []);
  pending.push({ ...action, at: Date.now() });
  await set('pending', pending.slice(-500));
  deliverPending();
}

/* Os padrões acima são largos de propósito (netlify.app cobre os testes), e
   por isso casam também com outros projetos que você tenha abertos — era assim
   que a volta da fila caía numa aba aleatória. A aba que montou a fila vem
   primeiro; a mesma origem vem depois; o resto é último recurso. */
async function commandTabs() {
  const tabs = (await chrome.tabs.query({ url: COMMAND_URLS })).filter(t => t.id != null);
  const preferredId = await get('commandTabId', null);
  const origin = await get('commandOrigin', '');
  const rank = (t) => (t.id === preferredId ? 2 : 0) + (origin && String(t.url || '').startsWith(origin) ? 1 : 0);
  return tabs.sort((a, b) => rank(b) - rank(a));
}

async function deliverPending() {
  const pending = await get('pending', []);
  if (!pending.length) return;
  for (const tab of await commandTabs()) {
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'ap:deliver', actions: pending });
      if (res && res.ok) { await set('pending', []); return; }
    } catch (e) { /* aba sem content script; tenta a próxima */ }
  }
}

async function openWhatsApp(focus = true) {
  const [tab] = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  if (tab) {
    if (focus) { await chrome.tabs.update(tab.id, { active: true }); await chrome.windows.update(tab.windowId, { focused: true }); }
    return tab.id;
  }
  const created = await chrome.tabs.create({ url: 'https://web.whatsapp.com/', active: focus });
  return created.id;
}

/* Volta o foco para o Command. É o "voltando ao app" do fim da fila: o
   WhatsApp continua aberto atrás, mas quem fica na frente é o sistema. */
async function focusCommand() {
  const [tab] = await commandTabs();
  if (!tab) return false;
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  return true;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg && msg.type) {
      case 'ap:queue-set': {
        // Guarda de qual aba a fila saiu, para saber para onde voltar no fim.
        if (sender && sender.tab && sender.tab.id != null) await set('commandTabId', sender.tab.id);
        try { await set('commandOrigin', new URL(msg.source || '').origin); } catch (e) { /* sem origem utilizável */ }
        // Fila nova chega da Captação. Só começa sozinha quando você pediu o
        // disparo automático lá no Command (autostart), nunca por conta própria.
        await set('queue', {
          items: msg.items, i: 0,
          running: false,
          autostart: !!msg.autostart,
          autoSend: !!msg.autoSend,
          createdAt: Date.now(), source: msg.source || ''
        });
        const tabId = await openWhatsApp(true);
        // Aba nova: o boot() do content script vê o autostart e começa. Aba que
        // já estava aberta não recarrega, então precisa do aviso abaixo — uma das
        // duas pega, e quem começa limpa o autostart para a outra não repetir.
        if (msg.autostart) {
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, { type: 'ap:start', auto: !!msg.autoSend }).catch(() => {});
          }, 800);
        }
        sendResponse({ ok: true, count: msg.items.length, tabId });
        break;
      }
      case 'ap:queue-get':
        sendResponse({ ok: true, queue: await get('queue', null) });
        break;
      case 'ap:queue-put':
        await set('queue', msg.queue);
        sendResponse({ ok: true });
        break;
      case 'ap:queue-pause': {
        // Pausa pedida de fora do WhatsApp (a barra do Command). O laço lê
        // running a cada segundo e para sozinho.
        const q = await get('queue', null);
        if (q) { q.running = false; q.autostart = false; await set('queue', q); }
        sendResponse({ ok: true });
        break;
      }
      case 'ap:queue-clear':
        await set('queue', null);
        sendResponse({ ok: true });
        break;
      case 'ap:contacted':
        await pushPending({ kind: 'contacted', prospectId: msg.prospectId, name: msg.name, message: msg.message });
        sendResponse({ ok: true });
        break;
      case 'ap:add-crm':
        await pushPending({ kind: 'crm', prospectId: msg.prospectId, name: msg.name });
        sendResponse({ ok: true });
        break;
      case 'ap:flush':
        await deliverPending();
        sendResponse({ ok: true });
        break;
      case 'ap:focus-command':
        await deliverPending();
        sendResponse({ ok: await focusCommand() });
        break;
      case 'ap:notify':
        chrome.notifications.create({
          type: 'basic', iconUrl: 'icons/icon128.png',
          title: msg.title || 'Achilles Prospecta', message: msg.message || ''
        });
        sendResponse({ ok: true });
        break;
      case 'ap:open-whatsapp':
        sendResponse({ ok: true, tabId: await openWhatsApp(true) });
        break;
      default:
        sendResponse({ ok: false, error: 'tipo desconhecido' });
    }
  })();
  return true; // resposta assíncrona
});

// Quando uma aba do Command termina de carregar, tenta entregar o que ficou pendente.
chrome.tabs.onUpdated.addListener((id, info) => { if (info.status === 'complete') deliverPending(); });
