/* Achilles Prospecta — content script do WhatsApp Web.

   Dois modos, escolhidos por você:

   REVISAR (padrão)  abre a conversa, preenche a mensagem e espera. Quem
                     aperta o Enter é você; a extensão só percebe o envio.
   AUTOMÁTICO        abre, preenche, mostra uma janela de alguns segundos para
                     você cancelar e, se você não cancelar, envia sozinha e
                     segue para o próximo. Ao terminar, devolve o foco ao
                     Achilles Command.

   O modo automático liga em Configurações (ícone da extensão) ou no botão
   "Disparo automático" da barra da Captação. Sem isso, nada sai sozinho.

   Se o WhatsApp mudar o layout, os seletores estão todos em SEL. */
(function () {
  const { esc, sleep, resolveMessage, withinHours, store } = window.AP;

  const SEL = {
    msgInput: 'div[contenteditable="true"][data-tab="10"], footer div[contenteditable="true"], div[contenteditable="true"][role="textbox"]',
    sendBtn: 'footer button[aria-label="Enviar"], footer button[aria-label="Send"], footer button[data-tab="11"], span[data-icon="send"], span[data-icon="wds-ic-send-filled"]',
    outgoing: '#main div.message-out',
    thread: '#main',
    dialog: 'div[role="dialog"]'
  };

  const SEND_TIMEOUT = 20000;   // ms esperando a bolha aparecer depois do envio
  const MAX_FAILS = 2;          // falhas seguidas antes de pausar a fila

  // Só continua a fila na aba onde você clicou em Iniciar. Abrir o WhatsApp
  // em outro lugar nunca retoma nada sozinho.
  const ACTIVE = 'ap_active';
  const setActive = v => { try { v ? sessionStorage.setItem(ACTIVE, '1') : sessionStorage.removeItem(ACTIVE); } catch (e) {} };
  const isActive = () => { try { return sessionStorage.getItem(ACTIVE) === '1'; } catch (e) { return false; } };

  const qs = (s, r = document) => r.querySelector(s);
  const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => null);
  const getQueue = async () => (await send({ type: 'ap:queue-get' }))?.queue || null;
  const putQueue = (q) => send({ type: 'ap:queue-put', queue: q });

  let waiter = null;      // cancela a espera/contagem do lead atual
  let countdown = null;
  let fails = 0;          // falhas seguidas (número inválido, envio não confirmado)

  /* --- leitura da tela --------------------------------------------------- */
  const urlPhone = () => (location.href.match(/[?&]phone=(\d+)/) || [])[1] || '';
  const outgoingCount = () => document.querySelectorAll(SEL.outgoing).length;
  const composeText = () => { const b = qs(SEL.msgInput); return b ? (b.innerText || '').trim() : ''; };
  /* Comparação do que está na caixa com o que preparamos. O editor do WhatsApp
     devolve quebras e espaços um pouco diferentes do texto original, então a
     conferência é pelo conteúdo, não pela formatação. */
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;   // o editor devolve <img>, nao o caractere
  const norm = (t) => String(t || '')
    .replace(EMOJI, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function invalidNumber() {
    const d = qs(SEL.dialog); if (!d) return false;
    const t = (d.textContent || '').toLowerCase();
    return t.includes('inválid') || t.includes('invalid') || t.includes('shared via url');
  }

  /* Reserva, para quando o WhatsApp não escrever pela URL. insertText com "\n"
     é engolido pelo editor — a mensagem chegava com o ponto final colado na
     frase seguinte — então cada linha entra separada, com insertLineBreak
     entre elas, que é o mesmo evento do Shift+Enter. */
  function fillCompose(text) {
    const box = qs(SEL.msgInput);
    if (!box) return false;
    box.focus();
    try {
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      String(text).split('\n').forEach((line, i) => {
        if (i) document.execCommand('insertLineBreak', false, null);
        if (line) document.execCommand('insertText', false, line);
      });
    } catch (e) { /* cai no plano B logo abaixo */ }
    if (!composeText()) {
      box.textContent = text;
      box.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
    box.focus();
    return !!composeText();
  }

  /* --- envio (modo automático) -------------------------------------------
     Clicar no botão é o caminho confiável; o Enter sintético fica de reserva
     para quando o WhatsApp trocar o botão de lugar. */
  function pressSend() {
    const found = qs(SEL.sendBtn);
    const btn = found && (found.closest('button') || found);
    if (btn) { btn.click(); return true; }

    const box = qs(SEL.msgInput);
    if (!box) return false;
    box.focus();
    for (const type of ['keydown', 'keypress', 'keyup']) {
      box.dispatchEvent(new KeyboardEvent(type, {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, cancelable: true, composed: true
      }));
    }
    return true;
  }

  /* --- espera do envio ---------------------------------------------------
     Observação pura: a caixa esvazia e uma bolha de saída nova aparece. Vale
     para os dois modos — no automático confirma o que a extensão disparou, no
     modo revisar confirma o que você mandou. */
  function waitForSend(baseline, timeoutMs) {
    return new Promise(resolve => {
      let done = false;
      const finish = (v) => {
        if (done) return; done = true;
        obs.disconnect(); clearInterval(poll); if (timer) clearTimeout(timer); waiter = null;
        resolve(v);
      };
      const check = () => {
        if (outgoingCount() > baseline && composeText() === '') finish('sent');
      };
      const obs = new MutationObserver(check);
      const thread = qs(SEL.thread);
      if (thread) obs.observe(thread, { childList: true, subtree: true });
      const poll = setInterval(check, 500);
      const timer = timeoutMs ? setTimeout(() => finish('timeout'), timeoutMs) : null;
      waiter = { skip: () => finish('skip'), abort: () => finish('abort') };
    });
  }

  /* --- janela de cancelamento --------------------------------------------
     Antes de cada envio automático a mensagem fica alguns segundos na tela.
     "Pular" salta o lead, "Pausar" para a fila — inclusive quando a pausa vem
     da barra do Command, que é lida a cada segundo. */
  function holdBeforeSend(seconds, item) {
    return new Promise(resolve => {
      let left = Math.max(0, Number(seconds) || 0), done = false;
      let t = null;
      const finish = (v) => { if (done) return; done = true; if (t) clearInterval(t); waiter = null; resolve(v); };
      const tick = () => status(`Enviando para ${esc(item.name || item.wa)} em ${left}s… Pular ou Pausar cancela.`);
      waiter = { skip: () => finish('skip'), abort: () => finish('abort') };
      if (!left) return finish('go');
      tick();
      t = setInterval(async () => {
        const cur = await getQueue();
        if (!cur || !cur.running) return finish('abort');
        left--;
        if (left <= 0) return finish('go');
        tick();
      }, 1000);
    });
  }

  /* --- laço da fila ------------------------------------------------------ */
  async function step() {
    const queue = await getQueue();
    if (!queue || !queue.running) { renderQueue(); return; }
    if (queue.i >= queue.items.length) return finish(queue);

    const settings = await store.settings();
    const auto = queue.autoSend != null ? !!queue.autoSend : !!settings.autoSend;
    const stats = await store.stats();

    if (stats.sent >= settings.dailyCap) return halt(queue, `Teto diário atingido (${settings.dailyCap}). A fila continua salva para amanhã.`);
    if (!withinHours(settings)) return halt(queue, `Fora da janela de ${settings.hoursStart}h às ${settings.hoursEnd}h. Retome quando quiser.`);

    const item = queue.items[queue.i];

    if (!String(item.message || '').trim()) {
      item.skipped = true; queue.i++; await putQueue(queue);
      status(`${esc(item.name)} está sem mensagem — pulando.`);
      return advance(queue, settings, 0);
    }

    /* 1. abrir a conversa já com a mensagem. Quem escreve na caixa é o próprio
       WhatsApp, pelo ?text= — ele preserva as quebras de linha e os emoji, que
       o preenchimento pelo editor perdia. O texto resolvido fica guardado no
       item: a saudação é a do momento de abrir, e a conferência de antes do
       envio compara com exatamente o que foi pedido.
       (a navegação recarrega a página; boot() retoma) */
    if (urlPhone() !== item.wa) {
      item.resolved = resolveMessage(item.message, item);
      await putQueue(queue);
      status(`Abrindo ${esc(item.name || item.wa)}…`);
      setActive(true);
      location.href = `https://web.whatsapp.com/send?phone=${item.wa}&text=${encodeURIComponent(item.resolved)}`;
      return;
    }

    // 2. esperar a conversa carregar
    let tries = 0;
    while (!qs(SEL.msgInput) && tries < 40) {
      if (invalidNumber()) {
        item.failed = true; queue.i++; await putQueue(queue);
        status(`Número inválido: ${esc(item.name || item.wa)} — pulando.`);
        if (++fails >= MAX_FAILS && auto) return halt(queue, `${fails} números seguidos não abriram. Fila pausada para você conferir.`);
        await sleep(1200);
        return advance(queue, settings, 0);
      }
      await sleep(600); tries++;
    }
    if (!qs(SEL.msgInput)) { status('Não achei a caixa de mensagem. O WhatsApp Web está conectado?'); return; }

    // 3. esperar o WhatsApp escrever; só preencher à mão se ele não escrever
    const text = item.resolved || resolveMessage(item.message, item);
    let waited = 0;
    while (!composeText() && waited < 12) { await sleep(400); waited++; }
    if (!composeText()) fillCompose(text);
    if (!composeText()) {
      return halt(queue, 'Não consegui escrever na caixa de mensagem. Deixe a aba do WhatsApp visível e retome a fila.');
    }
    const baseline = outgoingCount();

    // 4. enviar (automático) ou devolver o controle para você (revisar)
    let outcome;
    if (auto) {
      await renderQueue('auto', item);
      const decision = await holdBeforeSend(settings.autoSendDelay, item);
      if (decision === 'abort') return;
      if (decision === 'skip') {
        outcome = 'skip';
      } else if (norm(composeText()) !== norm(text)) {
        /* A caixa não tem o que preparamos: alguém digitou junto, ou o
           preenchimento se perdeu. Não se envia no escuro — mas derrubar a fila
           inteira por causa de uma conversa é pesado demais, então pula este
           lead. Só uma sequência de divergências indica problema de verdade. */
        item.failed = true; queue.i++; await putQueue(queue);
        status(`A mensagem de ${esc(item.name || item.wa)} não conferiu — pulei sem enviar.`);
        if (++fails >= MAX_FAILS) return halt(queue, `${fails} mensagens seguidas não conferiram. Fila pausada para você conferir.`);
        return advance(queue, settings, 0);
      } else {
        status(`Enviando para ${esc(item.name || item.wa)}…`);
        pressSend();
        outcome = await waitForSend(baseline, SEND_TIMEOUT);
      }
    } else {
      await renderQueue('waiting', item);
      outcome = await waitForSend(baseline);
    }
    if (outcome === 'abort') return;

    if (outcome === 'sent') {
      fails = 0;
      item.sent = true;
      await send({ type: 'ap:contacted', prospectId: item.prospectId, name: item.name, message: text });
      if (!item.inCrm) await send({ type: 'ap:add-crm', prospectId: item.prospectId, name: item.name });
      await store.bumpSent();
    } else if (outcome === 'timeout') {
      item.failed = true;
      queue.i++; await putQueue(queue);
      status(`Não confirmei o envio para ${esc(item.name || item.wa)}. Marquei como falha.`);
      if (++fails >= MAX_FAILS) return halt(queue, `${fails} envios seguidos sem confirmação. Fila pausada — confira o WhatsApp Web.`);
      return advance(queue, settings, 0);
    } else {
      item.skipped = true;
    }
    queue.i++;
    await putQueue(queue);
    return advance(queue, settings, outcome === 'sent' ? settings.pauseBetween : 0);
  }

  /* Para a fila guardando o progresso e explica o motivo. */
  async function halt(queue, message) {
    clearInterval(countdown);
    queue.running = false; queue.autostart = false;
    await putQueue(queue);
    setActive(false);
    await renderQueue(null, null, message);
    toggle(true);
    await send({ type: 'ap:notify', title: 'Fila pausada', message });
    backToCommand();
  }

  async function advance(queue, settings, waitSeconds) {
    if (queue.i >= queue.items.length) return finish(queue);
    if (!waitSeconds) return step();

    let left = waitSeconds;
    const tick = () => status(`${queue.i}/${queue.items.length} concluídos. Próximo em ${left}s…`);
    tick();
    clearInterval(countdown);
    countdown = setInterval(async () => {
      left--;
      const cur = await getQueue();
      if (!cur || !cur.running) { clearInterval(countdown); return; }
      if (left > 0) return tick();
      clearInterval(countdown);
      step();
    }, 1000);
  }

  async function finish(queue) {
    const sent = queue.items.filter(x => x.sent).length;
    const skipped = queue.items.filter(x => x.skipped || x.failed).length;
    setActive(false);
    await send({ type: 'ap:queue-clear' });
    await send({ type: 'ap:notify', title: 'Fila concluída', message: `${sent} enviada(s), ${skipped} pulada(s).` });
    status(`Fila concluída — ${sent} enviada(s), ${skipped} pulada(s).`);
    renderQueue();
    backToCommand();
  }

  /* Volta para a aba do Command, com os leads já marcados como abordados. */
  async function backToCommand() {
    const cfg = await store.settings();
    if (cfg.returnToCommand === false) { send({ type: 'ap:flush' }); return; }
    send({ type: 'ap:focus-command' });
  }

  /* --- controles --------------------------------------------------------- */
  async function start(auto) {
    const queue = await getQueue(); if (!queue) return;
    fails = 0;
    queue.running = true;
    queue.autostart = false;
    if (auto != null) queue.autoSend = !!auto;
    await putQueue(queue);
    setActive(true);
    step();
  }
  async function pause() {
    clearInterval(countdown);
    if (waiter) waiter.abort();
    const queue = await getQueue();
    if (queue) { queue.running = false; queue.autostart = false; await putQueue(queue); }
    setActive(false);
    status('Fila pausada. O progresso está salvo.');
    renderQueue();
  }
  async function stop() {
    clearInterval(countdown);
    if (waiter) waiter.abort();
    setActive(false);
    await send({ type: 'ap:queue-clear' });
    status('Fila cancelada.');
    renderQueue();
  }
  function skip() { if (waiter) waiter.skip(); }

  /* --- interface --------------------------------------------------------- */
  let drawer, handle;
  function buildUI() {
    if (drawer) return;
    handle = document.createElement('button');
    handle.id = 'ap-handle';
    handle.type = 'button';
    handle.innerHTML = '<span>Prospecta</span>';
    document.body.appendChild(handle);

    drawer = document.createElement('div');
    drawer.id = 'ap-drawer';
    drawer.innerHTML = `
      <div class="ap-head">
        <span class="ap-logo">A</span><b>Achilles Prospecta</b>
        <button class="ap-x" id="ap-close" type="button" aria-label="Fechar">×</button>
      </div>
      <div class="ap-body">
        <div class="ap-card"><div class="ap-title">Fila de abordagem</div><div id="ap-queue"></div></div>
        <div class="ap-card ap-note" id="ap-mode-note"></div>
        <div class="ap-card"><div class="ap-title">Hoje</div><div id="ap-stats" class="ap-muted"></div></div>
      </div>`;
    document.body.appendChild(drawer);

    handle.addEventListener('click', () => toggle());
    drawer.querySelector('#ap-close').addEventListener('click', () => toggle(false));
  }

  function toggle(force) {
    const open = force == null ? !document.body.classList.contains('ap-open') : force;
    document.body.classList.toggle('ap-open', open);
  }

  function status(msg) {
    const el = drawer && drawer.querySelector('#ap-status');
    if (el) el.textContent = msg; else renderQueue(null, null, msg);
    toggle(true);
  }

  async function renderStats() {
    const box = drawer && drawer.querySelector('#ap-stats'); if (!box) return;
    const s = await store.stats(); const cfg = await store.settings();
    box.textContent = `${s.sent} de ${cfg.dailyCap} abordagens · janela ${cfg.hoursStart}h–${cfg.hoursEnd}h · pausa de ${cfg.pauseBetween}s`;
  }

  async function renderNote(auto) {
    const box = drawer && drawer.querySelector('#ap-mode-note'); if (!box) return;
    const cfg = await store.settings();
    box.innerHTML = auto
      ? `Modo <b>automático</b>: a extensão envia por você depois de ${cfg.autoSendDelay}s na tela. <b>Pular</b> ou <b>Pausar</b> nessa janela segura a mensagem.`
      : `Modo <b>revisar</b>: a mensagem é preenchida e <b>o envio é seu</b>. A extensão percebe quando ela sai e segue para o próximo.`;
  }

  async function renderQueue(mode, item, statusMsg) {
    const box = drawer && drawer.querySelector('#ap-queue'); if (!box) return;
    renderStats();
    const queue = await getQueue();
    const cfg = await store.settings();
    const auto = queue && queue.autoSend != null ? !!queue.autoSend : !!cfg.autoSend;
    renderNote(auto);

    if (!queue || !queue.items.length) {
      box.innerHTML = `<div class="ap-muted">Nenhuma fila carregada.<br>Abra a <b>Captação</b> no Achilles Command, aplique os filtros e escolha <b>Revisar uma a uma</b> ou <b>Disparo automático</b>.</div>`;
      return;
    }

    const total = queue.items.length;
    const done = queue.items.filter(x => x.sent).length;

    if ((mode === 'waiting' || mode === 'auto') && item) {
      box.innerHTML = `
        <div class="ap-lead">
          <b>${esc(item.name || item.wa)}</b>
          <span class="ap-pill">${done + 1} de ${total}</span>
          ${item.category ? `<div class="ap-muted small">${esc(item.category)}${item.score != null ? ` · score ${item.score}` : ''}</div>` : ''}
        </div>
        <div class="ap-await ${mode === 'auto' ? 'auto' : ''}">${mode === 'auto'
          ? 'Mensagem preenchida. <b>Sai sozinha em instantes.</b>'
          : 'Mensagem preenchida. <b>Confira e aperte Enter.</b>'}</div>
        <div id="ap-status" class="ap-status">${mode === 'auto' ? 'Preparando o envio…' : 'Aguardando seu envio…'}</div>
        <div class="ap-actions">
          <button class="ap-btn" id="ap-skip" type="button">Pular este</button>
          <button class="ap-btn warn" id="ap-pause" type="button">Pausar</button>
          <button class="ap-btn danger" id="ap-stop" type="button">Parar</button>
        </div>`;
      box.querySelector('#ap-skip').addEventListener('click', skip);
      box.querySelector('#ap-pause').addEventListener('click', pause);
      box.querySelector('#ap-stop').addEventListener('click', stop);
      return;
    }

    if (queue.running) {
      box.innerHTML = `
        <div id="ap-status" class="ap-status">${esc(statusMsg || `${done} de ${total} concluídos…`)}</div>
        <div class="ap-actions">
          <button class="ap-btn warn" id="ap-pause" type="button">Pausar</button>
          <button class="ap-btn danger" id="ap-stop" type="button">Parar</button>
        </div>`;
      box.querySelector('#ap-pause').addEventListener('click', pause);
      box.querySelector('#ap-stop').addEventListener('click', stop);
      return;
    }

    box.innerHTML = `
      <div class="ap-ready"><b>${total - done}</b> lead(s) aguardando</div>
      <div id="ap-status" class="ap-status">${esc(statusMsg || 'Nada é preenchido nem enviado até você iniciar.')}</div>
      <div class="ap-actions">
        <button class="ap-btn primary" id="ap-start" type="button">▶ Revisar uma a uma</button>
        <button class="ap-btn auto" id="ap-start-auto" type="button">⚡ Automático</button>
        <button class="ap-btn ghost" id="ap-cancel" type="button">Descartar</button>
      </div>`;
    box.querySelector('#ap-start').addEventListener('click', () => start(false));
    box.querySelector('#ap-start-auto').addEventListener('click', () => start(true));
    box.querySelector('#ap-cancel').addEventListener('click', stop);
  }

  /* O Command pediu o disparo e esta aba já estava aberta (não recarregou, logo
     o boot não roda de novo). start() limpa o autostart, então o caminho do
     boot e este nunca disparam a mesma fila duas vezes. */
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== 'ap:start') return;
    (async () => {
      const q = await getQueue();
      if (q && q.autostart && q.items.length) { toggle(true); await start(msg.auto); }
      sendResponse({ ok: true });
    })();
    return true;
  });

  /* --- boot -------------------------------------------------------------- */
  async function boot() {
    if (!document.body) return setTimeout(boot, 400);
    buildUI();
    const queue = await getQueue();
    if (queue && queue.running && isActive()) {
      step();                     // retoma a fila que estava correndo NESTA aba
    } else if (queue && queue.running) {
      queue.running = false;      // outra aba/sessão: pausa, nunca retoma sozinho
      await putQueue(queue);
      renderQueue();
    } else if (queue && queue.autostart && queue.items.length) {
      // Você pediu o disparo lá no Command e esta aba abriu por causa disso.
      toggle(true);
      start(queue.autoSend);
    } else {
      renderQueue();
      if (queue && queue.items.length) toggle(true);
    }
  }
  boot();
})();
