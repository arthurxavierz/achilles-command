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
  const AP = window.AP;
  const { esc, sleep, withinHours, store } = AP;

  const SEL = {
    msgInput: 'div[contenteditable="true"][data-tab="10"], footer div[contenteditable="true"], div[contenteditable="true"][role="textbox"]',
    sendBtn: 'footer button[aria-label="Enviar"], footer button[aria-label="Send"], footer button[data-tab="11"], span[data-icon="send"], span[data-icon="wds-ic-send-filled"]',
    outgoing: '#main div.message-out',
    incoming: '#main div.message-in',
    thread: '#main',
    header: '#main header',
    dialog: 'div[role="dialog"]',
    /* anexos: o envio tenta colar o arquivo, depois soltar o arquivo na
       conversa e, por último, o botão de anexar com o input escondido. */
    attachBtn: 'footer button[title="Anexar"], footer button[aria-label="Anexar"], footer div[title="Anexar"], footer button[title="Attach"], footer button[aria-label="Attach"], footer div[title="Attach"], footer span[data-icon="plus-rounded"], footer span[data-icon="plus"], footer span[data-icon="clip"], footer span[data-icon="attach-menu-plus"]',
    mediaSend: 'div[role="button"][aria-label="Enviar"], div[role="button"][aria-label="Send"], button[aria-label="Enviar"], button[aria-label="Send"], span[data-icon="send"], span[data-icon="wds-ic-send-filled"]',
    /* lista de conversas, para perceber quem respondeu */
    chatRow: '#pane-side [role="listitem"], #pane-side [role="row"]',
    chatTitle: 'span[title]',
    unread: 'span[aria-label*="não lida"], span[aria-label*="não lidas"], span[aria-label*="unread"], span[aria-label*="Unread"]'
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
  let attachFails = 0;    // anexos seguidos que não saíram

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
  function fillCompose(text) { return fillBox(qs(SEL.msgInput), text, composeText); }

  function fillBox(box, text, read = () => (box ? (box.innerText || '').trim() : '')) {
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
    if (!read()) {
      box.textContent = text;
      box.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
    box.focus();
    return !!read();
  }

  /* --- anexos ---------------------------------------------------------------
     O WhatsApp Web não tem "?anexo=" na URL, então o arquivo entra pela
     interface. Três caminhos, do mais limpo ao mais frágil:

     1. colar o arquivo na caixa de mensagem (o mesmo que Ctrl+V de um PDF);
     2. soltar o arquivo sobre a conversa (o mesmo que arrastar);
     3. abrir o menu de anexar e entregar o arquivo ao input escondido.

     Os três terminam na tela de prévia de mídia do WhatsApp, com legenda e
     botão de enviar próprios. É essa tela que confirma que o anexo entrou. */
  const visivel = (el) => !!(el && el.isConnected && el.getClientRects().length);
  const fora = (el) => !el.closest('footer') && !el.closest('#side') && !el.closest('#pane-side') && !el.closest('#ap-drawer') && !el.closest('#ap-dock-host');

  function previewSend() {
    const cands = [...document.querySelectorAll(SEL.mediaSend)].map(el => el.closest('button, [role="button"]') || el);
    return cands.find(b => visivel(b) && fora(b)) || null;
  }
  function previewCaption() {
    return [...document.querySelectorAll('div[contenteditable="true"]')].find(el => visivel(el) && fora(el)) || null;
  }
  async function waitFor(fn, ms) {
    const fim = Date.now() + ms;
    while (Date.now() < fim) { const v = fn(); if (v) return v; await sleep(200); }
    return fn();
  }

  async function stageFile(file) {
    const dt = () => { const d = new DataTransfer(); d.items.add(file); return d; };
    const box = qs(SEL.msgInput);
    if (box) {
      box.focus();
      box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt(), bubbles: true, cancelable: true, composed: true }));
      if (await waitFor(previewSend, 4000)) return true;
    }
    const alvo = qs(SEL.thread);
    if (alvo) {
      const d = dt();
      for (const type of ['dragenter', 'dragover', 'drop']) {
        alvo.dispatchEvent(new DragEvent(type, { dataTransfer: d, bubbles: true, cancelable: true, composed: true }));
        await sleep(80);
      }
      if (await waitFor(previewSend, 4000)) return true;
    }
    const clip = qs(SEL.attachBtn);
    if (clip) {
      (clip.closest('button, [role="button"]') || clip).click();
      await sleep(700);
      const midia = /^(image|video)\//.test(file.type);
      const inputs = [...document.querySelectorAll('input[type="file"]')];
      const input = inputs.find(i => midia ? /image|video/.test(i.accept || '') : (!i.accept || i.accept === '*' || i.accept === '*/*'))
        || inputs.find(i => !/image/.test(i.accept || '')) || inputs[0];
      if (input) {
        input.files = dt().files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        if (await waitFor(previewSend, 6000)) return true;
      }
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }
    return false;
  }

  /* Envia os anexos depois do texto. No automático a extensão clica em
     enviar na prévia; no modo revisar a prévia fica aberta esperando você. */
  async function enviarAnexos(metas, auto, item) {
    for (const meta of metas) {
      const file = await AP.files.toFile(meta);
      if (!file) return { ok: false, msg: `O anexo ${meta.name} não está mais na extensão. Confira o roteiro.` };
      status(`Anexando ${esc(meta.name)}…`);
      await sleep(600);
      const base = outgoingCount();
      if (!(await stageFile(file))) return { ok: false, msg: `Não consegui abrir o anexo ${meta.name} na conversa de ${item.name || item.wa}.` };
      if (auto) {
        await sleep(500);
        const b = previewSend();
        if (!b) return { ok: false, msg: `A prévia do anexo ${meta.name} fechou antes do envio.` };
        b.click();
        const r = await waitForSend(base, SEND_TIMEOUT);
        if (r === 'abort') return { abort: true };
        if (r !== 'sent') return { ok: false, msg: `Não confirmei o envio do anexo ${meta.name}.` };
      } else {
        await renderQueue('attach', item, null, meta);
        const r = await waitForSend(base);
        if (r === 'abort') return { abort: true };
        if (r === 'skip') continue;
      }
    }
    return { ok: true };
  }

  /* Texto como legenda do primeiro anexo: uma mensagem só, com o arquivo. */
  async function enviarComLegenda(item, text, meta, auto, settings) {
    const file = await AP.files.toFile(meta);
    if (!file) return { outcome: 'fail', msg: `O anexo ${meta.name} não está mais na extensão.` };
    if (auto) {
      await renderQueue('auto', item);
      const d = await holdBeforeSend(settings.autoSendDelay, item);
      if (d !== 'go') return { outcome: d };
    }
    const base = outgoingCount();
    status(`Anexando ${esc(meta.name)}…`);
    if (!(await stageFile(file))) return { outcome: 'fail', msg: `Não consegui abrir o anexo ${meta.name} na conversa.` };
    const cap = await waitFor(previewCaption, 4000);
    if (cap) fillBox(cap, text);
    if (!auto) {
      await renderQueue('waiting', item);
      return { outcome: await waitForSend(base) };
    }
    await sleep(500);
    if (!cap || norm(cap.innerText) !== norm(text)) return { outcome: 'mismatch' };
    const b = previewSend();
    if (!b) return { outcome: 'fail', msg: 'A prévia do anexo fechou antes do envio.' };
    status(`Enviando para ${esc(item.name || item.wa)}…`);
    b.click();
    return { outcome: await waitForSend(base, SEND_TIMEOUT) };
  }

  /* O que este lead recebe: roteiro da fila (que pode ter sido editado com a
     fila andando), ajuste manual feito no Command ou, em fila antiga, a
     mensagem que veio pronta no item. */
  async function planoDo(item, queue) {
    const variants = await store.get('queueVariants', {});
    let v = variants[item.variantId || AP.COMMAND_ID] || null;
    let guarda = 0;
    while (v && v.replacedBy && variants[v.replacedBy] && guarda++ < 5) v = variants[v.replacedBy];
    const tpl = item.override || (v && v.text != null ? v.text : (item.message || ''));
    const sender = queue.sender || await AP.remetente({});
    const files = (v && v.attachments) || [];
    return {
      v, tpl, files,
      text: AP.render(tpl, item, sender),
      legenda: !!(v && v.attachMode === 'caption' && files.length),
      scriptId: v ? v.id : AP.COMMAND_ID,
      scriptName: v ? v.name : (item.scriptName || AP.COMMAND_NAME)
    };
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

    /* --- teto de tempo por lead -----------------------------------------
       O relógio fica no item, e não numa variável, porque abrir a conversa
       recarrega a página: qualquer temporizador em memória morre no caminho.
       Assim o prazo sobrevive à navegação e continua contando. */
    const tetoMs = Math.max(15, Number(settings.leadTimeout || 45)) * 1000;
    if (!item.startedAt) { item.startedAt = Date.now(); await putQueue(queue); }
    if (Date.now() - item.startedAt > tetoMs) {
      item.failed = true; item.timedOut = true; queue.i++; await putQueue(queue);
      status(`${esc(item.name || item.wa)} não abriu a tempo, seguindo para o próximo.`);
      if (++fails >= MAX_FAILS && auto) return halt(queue, `${fails} leads seguidos não abriram. Fila pausada para você conferir se o WhatsApp Web está respondendo.`);
      return advance(queue, settings, 0);
    }

    const plano = await planoDo(item, queue);
    if (!plano.text.trim() && !plano.files.length) {
      item.skipped = true; queue.i++; await putQueue(queue);
      status(`${esc(item.name)} está sem mensagem, pulando.`);
      return advance(queue, settings, 0);
    }

    /* 1. abrir a conversa já com a mensagem. Quem escreve na caixa é o próprio
       WhatsApp, pelo ?text=, que preserva as quebras de linha e os emoji, que
       o preenchimento pelo editor perdia. O texto resolvido fica guardado no
       item: a saudação é a do momento de abrir, e a conferência de antes do
       envio compara com exatamente o que foi pedido. Com o texto na legenda
       do anexo a conversa abre vazia, porque a legenda é escrita na prévia.
       (a navegação recarrega a página; boot() retoma) */
    if (urlPhone() !== item.wa) {
      item.resolved = plano.text;
      await putQueue(queue);
      status(`Abrindo ${esc(item.name || item.wa)}…`);
      setActive(true);
      const comTexto = plano.legenda || !plano.text ? '' : `&text=${encodeURIComponent(item.resolved)}`;
      location.href = `https://web.whatsapp.com/send?phone=${item.wa}${comTexto}`;
      return;
    }

    // 2. esperar a conversa carregar
    let tries = 0;
    while (!qs(SEL.msgInput) && tries < 40) {
      if (invalidNumber()) {
        item.failed = true; queue.i++; await putQueue(queue);
        status(`Número inválido: ${esc(item.name || item.wa)}, pulando.`);
        if (++fails >= MAX_FAILS && auto) return halt(queue, `${fails} números seguidos não abriram. Fila pausada para você conferir.`);
        await sleep(1200);
        return advance(queue, settings, 0);
      }
      await sleep(600); tries++;
    }
    if (!qs(SEL.msgInput)) {
      /* Aqui a fila morria: ela dava `return` e ficava parada para sempre.
         Acontece com número que não existe sem o WhatsApp mostrar o aviso
         que sabemos reconhecer, e com conversa que simplesmente não carrega.
         Agora o lead vira falha e a fila anda; se for a aba que está ruim,
         o contador de falhas seguidas pausa tudo logo em seguida. */
      item.failed = true; queue.i++; await putQueue(queue);
      status(`A conversa de ${esc(item.name || item.wa)} não abriu, seguindo para o próximo.`);
      if (++fails >= MAX_FAILS && auto) return halt(queue, `${fails} conversas seguidas não abriram. Fila pausada: confira se o WhatsApp Web está conectado.`);
      return advance(queue, settings, 0);
    }

    const text = item.resolved || plano.text;
    let outcome;

    if (plano.legenda) {
      // 3b. texto como legenda do primeiro anexo
      const r = await enviarComLegenda(item, text, plano.files[0], auto, settings);
      outcome = r.outcome;
      if (outcome === 'fail' || outcome === 'mismatch') {
        item.failed = true; queue.i++; await putQueue(queue);
        status(outcome === 'mismatch'
          ? `A legenda de ${esc(item.name || item.wa)} não conferiu, pulei sem enviar.`
          : `${esc(r.msg || 'Não consegui anexar.')} Seguindo para o próximo.`);
        if (++fails >= MAX_FAILS) return halt(queue, `${fails} anexos seguidos não saíram. Fila pausada: deixe a aba do WhatsApp visível e confira o roteiro.`);
        return advance(queue, settings, 0);
      }
    } else {
      // 3. esperar o WhatsApp escrever; só preencher à mão se ele não escrever
      let waited = 0;
      while (!composeText() && waited < 12) { await sleep(400); waited++; }
      if (!composeText()) fillCompose(text);
      if (!composeText()) {
        /* Antes isto pausava a fila inteira no primeiro tropeço. Um lead que
           não aceita texto é problema dele; a aba inteira quebrada é problema
           de todos, e aí as falhas seguidas pausam sozinhas. */
        item.failed = true; queue.i++; await putQueue(queue);
        status(`Não consegui escrever a mensagem de ${esc(item.name || item.wa)}, seguindo para o próximo.`);
        if (++fails >= MAX_FAILS) return halt(queue, 'Não consegui escrever na caixa de mensagem. Deixe a aba do WhatsApp visível e retome a fila.');
        return advance(queue, settings, 0);
      }
      const baseline = outgoingCount();

      // 4. enviar (automático) ou devolver o controle para você (revisar)
      if (auto) {
        await renderQueue('auto', item);
        const decision = await holdBeforeSend(settings.autoSendDelay, item);
        if (decision === 'abort') return;
        if (decision === 'skip') {
          outcome = 'skip';
        } else if (norm(composeText()) !== norm(text)) {
          /* A caixa não tem o que preparamos: alguém digitou junto, ou o
             preenchimento se perdeu. Não se envia no escuro, mas derrubar a fila
             inteira por causa de uma conversa é pesado demais, então pula este
             lead. Só uma sequência de divergências indica problema de verdade. */
          item.failed = true; queue.i++; await putQueue(queue);
          status(`A mensagem de ${esc(item.name || item.wa)} não conferiu, pulei sem enviar.`);
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
    }
    if (outcome === 'abort') return;

    if (outcome === 'sent') {
      fails = 0;
      item.sent = true;
      // O texto já saiu: daqui em diante o lead conta como abordado mesmo
      // que um anexo falhe, senão ele voltaria para a fila e levaria a
      // mesma mensagem duas vezes.
      await send({ type: 'ap:contacted', prospectId: item.prospectId, name: item.name, message: text });
      if (!item.inCrm) await send({ type: 'ap:add-crm', prospectId: item.prospectId, name: item.name });
      await store.bumpSent();
      const resto = plano.legenda ? plano.files.slice(1) : plano.files;
      let anexosOk = true;
      if (resto.length) {
        const r = await enviarAnexos(resto, auto, item);
        if (r.abort) { queue.i++; await putQueue(queue); await registrar(item, plano, false); return; }
        if (!r.ok) {
          anexosOk = false;
          item.attachFailed = true;
          status(`${esc(r.msg)} O texto saiu; o anexo ficou para trás.`);
          if (++attachFails >= MAX_FAILS) {
            queue.i++; await putQueue(queue); await registrar(item, plano, false);
            return halt(queue, `${attachFails} anexos seguidos não saíram. Fila pausada: deixe a aba do WhatsApp visível e confira o arquivo no roteiro.`);
          }
        } else attachFails = 0;
      }
      await registrar(item, plano, anexosOk);
    } else if (outcome === 'timeout') {
      item.failed = true;
      queue.i++; await putQueue(queue);
      status(`Não confirmei o envio para ${esc(item.name || item.wa)}. Marquei como falha.`);
      if (++fails >= MAX_FAILS) return halt(queue, `${fails} envios seguidos sem confirmação. Fila pausada, confira o WhatsApp Web.`);
      return advance(queue, settings, 0);
    } else {
      item.skipped = true;
    }
    queue.i++;
    await putQueue(queue);
    return advance(queue, settings, outcome === 'sent' ? settings.pauseBetween : 0);
  }

  /* Cada envio entra no registro com o roteiro que levou. É dele que sai o
     placar do teste A/B no estúdio. */
  async function registrar(item, plano, anexosOk) {
    try {
      await AP.log.add({
        wa: item.wa, name: item.name, prospectId: item.prospectId,
        scriptId: plano.scriptId, scriptName: plano.scriptName,
        manual: !!item.override, attachments: plano.files.length, attachmentsOk: anexosOk
      });
    } catch (e) { /* registro é acessório; o envio já aconteceu */ }
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
        <div class="ap-card" id="ap-variants-card" hidden><div class="ap-title">Mensagens da fila</div><div id="ap-variants"></div></div>
        <div class="ap-card ap-note" id="ap-mode-note"></div>
        <div class="ap-card"><div class="ap-title">Hoje</div><div id="ap-stats" class="ap-muted"></div></div>
        <button class="ap-btn ghost ap-studio-link" id="ap-studio" type="button">Estúdio de roteiros e resultados ↗</button>
      </div>`;
    document.body.appendChild(drawer);

    handle.addEventListener('click', () => toggle());
    drawer.querySelector('#ap-close').addEventListener('click', () => toggle(false));
    drawer.querySelector('#ap-studio').addEventListener('click', () => send({ type: 'ap:open-studio' }));
    drawer.querySelector('#ap-variants').addEventListener('click', onVariantsClick);
    drawer.querySelector('#ap-variants').addEventListener('change', onVariantsChange);
  }

  function toggle(force) {
    const open = force == null ? !document.body.classList.contains('ap-open') : force;
    document.body.classList.toggle('ap-open', open);
    if (!open) closeDock();
  }

  function status(msg) {
    const el = drawer && drawer.querySelector('#ap-status');
    if (el) el.textContent = msg; else renderQueue(null, null, msg);
    toggle(true);
  }

  async function renderStats() {
    const box = drawer && drawer.querySelector('#ap-stats'); if (!box) return;
    const s = await store.stats(); const cfg = await store.settings();
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const log = await AP.log.all().catch(() => []);
    const resp = log.filter(e => e.replied && !e.quick && e.repliedAt >= hoje.getTime()).length;
    box.textContent = `${s.sent} de ${cfg.dailyCap} abordagens · ${resp} resposta${resp === 1 ? '' : 's'} hoje · janela ${cfg.hoursStart}h às ${cfg.hoursEnd}h · pausa de ${cfg.pauseBetween}s`;
  }

  async function renderNote(auto) {
    const box = drawer && drawer.querySelector('#ap-mode-note'); if (!box) return;
    const cfg = await store.settings();
    box.innerHTML = auto
      ? `Modo <b>automático</b>: a extensão envia por você depois de ${cfg.autoSendDelay}s na tela. <b>Pular</b> ou <b>Pausar</b> nessa janela segura a mensagem.`
      : `Modo <b>revisar</b>: a mensagem é preenchida e <b>o envio é seu</b>. A extensão percebe quando ela sai e segue para o próximo.`;
  }

  /* Etiqueta do roteiro e a mensagem que está indo, para quem acompanha a
     fila saber o que sai sem precisar ler a caixa do WhatsApp. */
  async function leadMessage(item) {
    const variants = await store.get('queueVariants', {});
    let v = variants[item.variantId || AP.COMMAND_ID];
    let g = 0;
    while (v && v.replacedBy && variants[v.replacedBy] && g++ < 5) v = variants[v.replacedBy];
    const nome = item.override ? `${v ? v.name : AP.COMMAND_NAME} · ajustado` : (v ? v.name : AP.COMMAND_NAME);
    const cor = v ? v.color : '#b9b2a3';
    const anexos = (v && v.attachments) || [];
    const texto = item.resolved || '';
    return `<div class="ap-msg">
      <div class="ap-msg-tag"><i style="background:${esc(cor)}"></i>${esc(nome)}${anexos.length ? ` · 📎 ${anexos.length}` : ''}</div>
      ${texto ? `<div class="ap-msg-text">${esc(texto)}</div>` : ''}
    </div>`;
  }

  async function renderQueue(mode, item, statusMsg, meta) {
    const box = drawer && drawer.querySelector('#ap-queue'); if (!box) return;
    renderStats();
    renderVariants();
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

    if ((mode === 'waiting' || mode === 'auto' || mode === 'attach') && item) {
      const aviso = mode === 'attach'
        ? `Anexo <b>${esc(meta ? meta.name : '')}</b> pronto na prévia. <b>Confira e clique em enviar.</b>`
        : mode === 'auto'
          ? 'Mensagem preenchida. <b>Sai sozinha em instantes.</b>'
          : 'Mensagem preenchida. <b>Confira e aperte Enter.</b>';
      box.innerHTML = `
        <div class="ap-lead">
          <b>${esc(item.name || item.wa)}</b>
          <span class="ap-pill">${Math.min(done + 1, total)} de ${total}</span>
          ${item.category ? `<div class="ap-muted small">${esc(item.category)}${item.score != null ? ` · score ${item.score}` : ''}</div>` : ''}
        </div>
        ${await leadMessage(item)}
        <div class="ap-await ${mode === 'auto' ? 'auto' : ''}">${aviso}</div>
        <div id="ap-status" class="ap-status">${mode === 'auto' ? 'Preparando o envio…' : mode === 'attach' ? 'Aguardando o envio do anexo…' : 'Aguardando seu envio…'}</div>
        <div class="ap-actions">
          <button class="ap-btn" id="ap-skip" type="button">${mode === 'attach' ? 'Pular anexo' : 'Pular este'}</button>
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

  /* --- mensagens da fila --------------------------------------------------
     Os roteiros que esta fila está usando, com quantos leads faltam em cada
     um. Editar aqui vale para os leads que ainda não abriram; quem já
     recebeu, recebeu. Trocar passa os leads restantes para outro roteiro. */
  async function renderVariants() {
    const card = drawer && drawer.querySelector('#ap-variants-card');
    const box = drawer && drawer.querySelector('#ap-variants');
    if (!box) return;
    const queue = await getQueue();
    const variants = await store.get('queueVariants', {});
    if (!queue || !queue.items || !queue.items.length) { card.hidden = true; return; }
    const efetivo = (id) => { let v = variants[id]; let g = 0; while (v && v.replacedBy && variants[v.replacedBy] && g++ < 5) v = variants[v.replacedBy]; return v; };
    const grupos = new Map();
    queue.items.forEach((it, i) => {
      const v = efetivo(it.variantId || AP.COMMAND_ID) || { id: AP.COMMAND_ID, name: AP.COMMAND_NAME, color: '#b9b2a3', text: null };
      if (!grupos.has(v.id)) grupos.set(v.id, { v, falta: 0, foi: 0 });
      const gr = grupos.get(v.id);
      if (it.sent) gr.foi++; else if (i >= queue.i && !it.failed && !it.skipped) gr.falta++;
    });
    const biblioteca = await AP.roteiros.list();
    card.hidden = false;
    box.innerHTML = [...grupos.values()].map(({ v, falta, foi }) => `
      <div class="ap-variant">
        <div class="ap-variant-head"><i style="background:${esc(v.color || '#b9b2a3')}"></i><b>${esc(v.name)}</b>${(v.attachments || []).length ? `<span class="ap-muted small">📎 ${v.attachments.length}</span>` : ''}</div>
        <div class="ap-muted small">${falta} na fila · ${foi} enviado${foi === 1 ? '' : 's'}</div>
        ${falta ? `<div class="ap-variant-actions">
          ${v.text != null ? `<button class="ap-btn sm" type="button" data-vedit="${esc(v.id)}">✎ Editar texto</button>` : ''}
          <select class="ap-select" data-vswap="${esc(v.id)}" aria-label="Trocar roteiro">
            <option value="">Trocar por…</option>
            ${v.id !== AP.COMMAND_ID ? `<option value="${AP.COMMAND_ID}">${esc(AP.COMMAND_NAME)}</option>` : ''}
            ${biblioteca.filter(r => r.id !== v.id).map(r => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}
          </select>
        </div>` : ''}
      </div>`).join('');
  }

  function onVariantsClick(ev) {
    const b = ev.target.closest('[data-vedit]');
    if (b) openDock(b.dataset.vedit);
  }

  async function onVariantsChange(ev) {
    const sel = ev.target.closest('[data-vswap]');
    if (!sel || !sel.value) return;
    const de = sel.dataset.vswap, para = sel.value;
    const variants = await store.get('queueVariants', {});
    if (!variants[para]) {
      if (para === AP.COMMAND_ID) variants[para] = { id: AP.COMMAND_ID, name: AP.COMMAND_NAME, color: '#b9b2a3', text: null, attachments: [], attachMode: 'after' };
      else {
        const r = await AP.roteiros.get(para); if (!r) return;
        variants[para] = { id: r.id, name: r.name, color: r.color, text: r.text, attachments: r.attachments || [], attachMode: r.attachMode || 'after' };
      }
    }
    if (!variants[de]) variants[de] = { id: de, name: de === AP.COMMAND_ID ? AP.COMMAND_NAME : de, text: null };
    variants[de].replacedBy = para;
    delete variants[para].replacedBy;   // trocar de volta não pode virar um ciclo
    await store.set('queueVariants', variants);
    status(`Os próximos leads de "${variants[de].name}" vão com "${variants[para].name}".`);
    renderVariants();
  }

  /* --- editor encaixado ao lado da gaveta --------------------------------- */
  let dock = null;
  function closeDock() {
    const host = document.getElementById('ap-dock-host');
    if (host) host.remove();
    dock = null;
  }

  async function openDock(vid) {
    closeDock();
    const variants = await store.get('queueVariants', {});
    const v = variants[vid]; if (!v) return;
    const queue = await getQueue();
    const naBiblioteca = !!(await AP.roteiros.get(vid));
    const root = AP.ui.shadowHost('ap-dock-host');
    const wrap = document.createElement('div');
    wrap.className = 'apx-root';
    root.appendChild(wrap);
    wrap.innerHTML = `
      <div class="apx-dock" role="dialog" aria-label="Editar mensagem da fila">
        <div class="apx-modal-head">
          <span class="apx-logo">A</span>
          <div class="apx-modal-title"><h2>${esc(v.name)}</h2><p>Vale para os leads desta fila que ainda não abriram.</p></div>
          <button type="button" class="apx-x" data-dclose aria-label="Fechar">×</button>
        </div>
        <div class="apx-modal-body" data-slot></div>
        <div class="apx-modal-foot">
          ${naBiblioteca ? '<label class="apx-hint apx-row" style="gap:7px;cursor:pointer"><input type="checkbox" data-dlib checked /> Atualizar também na biblioteca</label>' : ''}
          <span class="apx-spacer"></span>
          <button type="button" class="apx-btn ghost" data-dclose>Cancelar</button>
          <button type="button" class="apx-btn primary" data-dsave>Aplicar à fila</button>
        </div>
      </div>`;
    const pendentes = (queue && queue.items || []).filter((it, i) => i >= queue.i && !it.sent);
    const ed = AP.ui.editor({
      roteiro: v, amostra: pendentes.slice(0, 20), remetente: (queue && queue.sender) || await AP.remetente({}),
      compacto: true, onError: (m) => status(m)
    });
    wrap.querySelector('[data-slot]').appendChild(ed.el);
    dock = { vid, ed };
    wrap.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') closeDock(); });
    wrap.addEventListener('click', async (e) => {
      if (e.target.closest('[data-dclose]')) return closeDock();
      if (!e.target.closest('[data-dsave]')) return;
      const d = ed.get();
      if (!d.text.trim()) return;
      const atual = await store.get('queueVariants', {});
      atual[vid] = Object.assign({}, atual[vid], { text: d.text, attachments: d.attachments, attachMode: d.attachMode });
      await store.set('queueVariants', atual);
      const lib = wrap.querySelector('[data-dlib]');
      if (lib && lib.checked) {
        const r = await AP.roteiros.get(vid);
        if (r) await AP.roteiros.save(Object.assign({}, r, { text: d.text, attachments: d.attachments, attachMode: d.attachMode }));
      }
      closeDock();
      status(`"${v.name}" atualizado. Os próximos leads já saem com o texto novo.`);
      renderVariants();
    });
    setTimeout(() => ed.focus(), 30);
  }

  /* --- quem respondeu ------------------------------------------------------
     Quem recebeu a abordagem e respondeu aparece na lista de conversas com
     mensagem não lida, ou com mensagem recebida na conversa aberta. Os dois
     sinais são lidos aqui, sem abrir nada e sem marcar nada como lido.

     Lead da fila quase nunca é contato salvo, então a lista mostra o número,
     e é pelos últimos 8 dígitos dele que a resposta é ligada ao envio. Resposta
     que chega em menos de 90 segundos é marcada como provável mensagem
     automática de WhatsApp Business e não conta no placar até alguém escrever
     de novo; o estúdio deixa corrigir à mão. */
  const PHONE_RE = /\+?\d[\d\s().-]{8,}\d/;

  function unreadCount(row) {
    const el = row.querySelector(SEL.unread);
    if (!el) return 0;
    const n = parseInt(String(el.textContent || el.getAttribute('aria-label') || '').replace(/\D/g, ''), 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  async function scanReplies() {
    let pend;
    try { pend = await AP.log.pendentesOuRapidas(); } catch (e) { return; }
    if (!pend.length) return;
    const chaves = new Set(pend.map(e => AP.tail8(e.wa)));
    const sinais = new Map();

    for (const row of document.querySelectorAll(SEL.chatRow)) {
      const t = row.querySelector(SEL.chatTitle);
      const title = t ? (t.getAttribute('title') || t.textContent || '') : '';
      const m = title.match(PHONE_RE);
      if (!m) continue;
      const k = AP.tail8(m[0]);
      if (!chaves.has(k)) continue;
      sinais.set(k, { unread: unreadCount(row) });
    }

    const head = qs(SEL.header);
    const m = head && (head.innerText || '').match(PHONE_RE);
    const k = m ? AP.tail8(m[0]) : (chaves.has(AP.tail8(urlPhone())) ? AP.tail8(urlPhone()) : '');
    if (k && chaves.has(k)) {
      const s = sinais.get(k) || {};
      s.incoming = document.querySelectorAll(SEL.incoming).length;
      sinais.set(k, s);
    }

    for (const [chave, sinal] of sinais) {
      const r = await AP.log.observar(chave, sinal).catch(() => null);
      if (!r) continue;
      const e = r.entry;
      if (!e.quick) {
        send({ type: 'ap:replied', prospectId: e.prospectId, name: e.name, script: e.scriptName });
        send({ type: 'ap:notify', title: `${e.name || 'Um lead'} respondeu`, message: `Abordado com "${e.scriptName || AP.COMMAND_NAME}". O placar do roteiro foi atualizado no estúdio.` });
      }
      renderStats();
    }
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
    // Respostas: uma olhada logo que a aba sobe e depois a cada 12 segundos.
    setTimeout(scanReplies, 4000);
    setInterval(scanReplies, 12000);
  }

  // Roteiro editado em outro lugar (estúdio, Command) aparece na gaveta.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.queueVariants || changes.roteiros)) renderVariants();
  });

  boot();
})();
