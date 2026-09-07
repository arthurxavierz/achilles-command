/* Achilles Prospecta — content script do Achilles Command.
   Lê a fila publicada pela aba Captação, dispara o trabalho no WhatsApp e
   devolve ao sistema o que aconteceu. Se a ponte não existir na página, o
   script não faz nada. */
(function () {
  const { esc, whatsappDigits } = window.AP;
  const BRIDGE_ID = 'achilles-bridge';

  /* A ponte é relida a cada passada, mas só vale reprocessar quando o texto
     muda de verdade — são dezenas de leads em JSON, e a página re-renderiza a
     cada clique de filtro. */
  let bridgeRaw = '', bridgeData = null;
  function readBridge() {
    const el = document.getElementById(BRIDGE_ID);
    if (!el) { bridgeRaw = ''; bridgeData = null; return null; }
    const raw = el.textContent || '';
    if (raw === bridgeRaw) return bridgeData;
    bridgeRaw = raw;
    try { bridgeData = JSON.parse(raw || '{}'); } catch (e) { bridgeData = null; }
    return bridgeData;
  }

  /* Escrever textContent troca o nó de texto, e trocar nó de texto é uma
     mutação de childList — a mesma que o observer lá embaixo escuta. Escrever
     só quando o valor muda é o que impede a barra de realimentar o próprio
     observer. */
  const setText = (el, value) => { if (el && el.textContent !== value) el.textContent = value; };

  /* --- barra flutuante ---------------------------------------------------- */
  let bar, ready = 0, watching = null, lastQueue = null;

  function buildBar() {
    if (bar) return;
    bar = document.createElement('div');
    bar.id = 'ap-bar';
    bar.innerHTML = `
      <div class="ap-bar-info"><strong id="ap-bar-count">0</strong><span id="ap-bar-label">prontos para abordagem</span></div>
      <div class="ap-bar-actions">
        <button id="ap-bar-send" class="ghost" type="button">Revisar uma a uma</button>
        <button id="ap-bar-auto" type="button">⚡ Disparo automático</button>
        <button id="ap-bar-pause" class="ghost" type="button" hidden>Pausar fila</button>
      </div>`;
    document.body.appendChild(bar);
    bar.querySelector('#ap-bar-send').addEventListener('click', () => enqueue(false));
    bar.querySelector('#ap-bar-auto').addEventListener('click', () => enqueue(true));
    bar.querySelector('#ap-bar-pause').addEventListener('click', pauseQueue);
  }

  /* Conta o que a Captação está mostrando agora e pinta a barra. */
  function render() {
    const data = readBridge();
    if (!data || !Array.isArray(data.prospects)) { if (bar) bar.classList.remove('show'); return; }
    ready = data.prospects.filter(p => whatsappDigits(p) && !p.contactedAt).length;
    buildBar();
    paint();
  }

  function paint(queue) {
    if (!bar) return;
    // O Command re-renderiza a página inteira o tempo todo; sem guardar o
    // último estado, a barra piscaria de volta para "prontos" entre um tick e
    // outro da fila.
    if (queue === undefined) queue = lastQueue; else lastQueue = queue;
    const running = !!(queue && queue.running && queue.items && queue.items.length);
    const count = bar.querySelector('#ap-bar-count');
    const label = bar.querySelector('#ap-bar-label');

    if (running) {
      const done = queue.items.filter(x => x.sent).length;
      setText(count, `${done}/${queue.items.length}`);
      setText(label, queue.autoSend ? 'enviados · disparo em andamento' : 'enviados · fila em andamento');
    } else {
      setText(count, String(ready));
      setText(label, 'prontos para abordagem');
    }

    bar.querySelector('#ap-bar-send').hidden = running;
    bar.querySelector('#ap-bar-auto').hidden = running;
    bar.querySelector('#ap-bar-pause').hidden = !running;
    bar.querySelector('#ap-bar-send').disabled = ready === 0;
    bar.querySelector('#ap-bar-auto').disabled = ready === 0;
    bar.classList.toggle('show', running || ready > 0);
    bar.classList.toggle('running', running);
  }

  /* --- montar e disparar a fila ------------------------------------------ */
  async function enqueue(auto) {
    const data = readBridge();
    if (!data) return;
    const items = data.prospects
      .map(p => ({ ...p, wa: whatsappDigits(p) }))
      .filter(p => p.wa && !p.contactedAt)
      .map(p => ({
        prospectId: p.id,
        name: p.name || '',
        wa: p.wa,
        message: p.message || '',
        category: p.category || '',
        score: p.score ?? null,
        address: p.address || '',
        inCrm: !!p.crmLeadId,
        sent: false, failed: false, skipped: false
      }));

    if (!items.length) return;
    // O disparo automático já começa na aba do WhatsApp; o modo revisar espera
    // você clicar em Iniciar por lá.
    const res = await chrome.runtime.sendMessage({
      type: 'ap:queue-set', items, autoSend: !!auto, autostart: !!auto, source: location.href
    });
    if (res && res.ok) {
      flash(auto
        ? `${items.length} lead(s) na fila. O WhatsApp Web abriu e o disparo começou — cada mensagem fica alguns segundos na tela antes de sair, e você volta para cá no fim.`
        : `${items.length} lead(s) na fila. O WhatsApp Web foi aberto — clique em Iniciar por lá.`);
      watchQueue();
    }
  }

  async function pauseQueue() {
    await chrome.runtime.sendMessage({ type: 'ap:queue-pause' }).catch(() => null);
    flash('Fila pausada. O progresso está salvo — retome pela gaveta do WhatsApp Web.');
    tickQueue();
  }

  /* Enquanto a fila roda no WhatsApp, a barra aqui mostra o andamento. */
  function watchQueue() {
    if (watching) return;
    watching = setInterval(tickQueue, 1500);
    tickQueue();
  }

  async function tickQueue() {
    const res = await chrome.runtime.sendMessage({ type: 'ap:queue-get' }).catch(() => null);
    const queue = res && res.queue;
    paint(queue);
    if (!queue || !queue.running) { clearInterval(watching); watching = null; }
  }

  function flash(text) {
    let t = document.getElementById('ap-flash');
    if (!t) { t = document.createElement('div'); t.id = 'ap-flash'; document.body.appendChild(t); }
    setText(t, text);
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 8000);
  }

  /* --- volta do WhatsApp -------------------------------------------------
     A extensão avisa o que aconteceu; quem altera o dado é o próprio Command,
     através de eventos que o app.js escuta. A extensão não toca no estado. */
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== 'ap:deliver') return;
    if (!document.getElementById(BRIDGE_ID)) { sendResponse({ ok: false }); return true; }
    for (const a of msg.actions || []) {
      const name = a.kind === 'crm' ? 'achilles:add-crm' : 'achilles:mark-contacted';
      document.dispatchEvent(new CustomEvent(name, {
        detail: { prospectId: a.prospectId, message: a.message || '', at: a.at }
      }));
    }
    if ((msg.actions || []).length) flash(`${msg.actions.length} atualização(ões) da fila aplicadas.`);
    sendResponse({ ok: true });
    return true;
  });

  /* --- observar o Command ------------------------------------------------
     O Command re-renderiza a página inteira a cada ação, então observar é mais
     confiável do que tentar acertar o momento certo. Duas proteções são
     obrigatórias aqui, e a falta delas travava a aba:

     1. ignorar o que a própria barra mexe — senão pintar agenda outra pintura;
     2. agrupar por frame — uma re-renderização da página emite centenas de
        mutações, e todas pedem exatamente o mesmo trabalho.

     Callback de MutationObserver roda em microtask: um laço aqui não devolve o
     controle ao navegador, e a aba congela em vez de ficar apenas lenta. */
  const OURS = '#ap-bar, #ap-flash';
  function ownNode(n) {
    const el = n && (n.nodeType === 1 ? n : n.parentElement);
    return !!(el && el.closest && el.closest(OURS));
  }

  let scheduled = false;
  function scheduleRender() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; render(); });
  }

  function watchCommand() {
    new MutationObserver(records => {
      for (const r of records) if (!ownNode(r.target)) return scheduleRender();
    }).observe(document.body, { childList: true, subtree: true });
  }

  /* --- boot -------------------------------------------------------------- */
  function boot() {
    if (!document.body) return setTimeout(boot, 300);
    render();
    watchCommand();
    chrome.runtime.sendMessage({ type: 'ap:flush' }).catch(() => {});
    // Se uma fila ficou correndo em outra aba, a barra já entra acompanhando.
    tickQueue().then(() => chrome.runtime.sendMessage({ type: 'ap:queue-get' })
      .then(r => { if (r && r.queue && r.queue.running) watchQueue(); })
      .catch(() => {}));
  }
  boot();
})();
