/* Achilles Prospecta — content script do Achilles Command.
   Lê a fila publicada pela aba Captação, dispara o trabalho no WhatsApp e
   devolve ao sistema o que aconteceu. Se a ponte não existir na página, o
   script não faz nada. */
(function () {
  const AP = window.AP;
  const { esc, whatsappDigits } = AP;

  /* Deixa um rastro no HTML para o próprio Command saber que a extensão está
     instalada. Sem isso, quem não a tem vê a aba de Captação sem barra
     nenhuma e sem explicação, e não tem como saber se falta instalar, falta
     recarregar ou se a lista e que está vazia. */
  try {
    const versao = chrome.runtime.getManifest().version;
    document.documentElement.setAttribute('data-achilles-prospecta', versao);
  } catch (e) { /* sem runtime a barra ainda funciona; só o aviso some */ }
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
    // Os dois botões abrem o "Montar disparo": é lá que se escolhe o roteiro,
    // se confere a mensagem de cada lead e se anexa arquivo.
    bar.querySelector('#ap-bar-send').addEventListener('click', () => openComposer(false));
    bar.querySelector('#ap-bar-auto').addEventListener('click', () => openComposer(true));
    bar.querySelector('#ap-bar-pause').addEventListener('click', pauseQueue);
  }

  /* Conta o que a Captação está mostrando agora e pinta a barra. */
  function render() {
    const data = readBridge();
    if (!data || !Array.isArray(data.prospects)) { if (bar) bar.classList.remove('show'); return; }
    ready = data.prospects.filter(p => whatsappDigits(p) && !p.contactedAt).length;
    buildBar();
    paint();
    guardarAmostra(data);
  }

  /* O estúdio abre numa aba da extensão e não enxerga o Command. Guardar uma
     amostra da lista atual deixa a prévia de lá trabalhar com leads de
     verdade, e não só com o exemplo. Só grava quando a lista muda. */
  let amostraSalva = '';
  function guardarAmostra(data) {
    const prospects = leadsProntos(data).slice(0, 25).map(itemDoLead);
    const chave = prospects.map(p => p.prospectId).join(',');
    if (!prospects.length || chave === amostraSalva) return;
    amostraSalva = chave;
    AP.store.set('bridgeSample', { at: Date.now(), sender: data.sender || null, prospects }).catch(() => {});
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

  /* --- montar e disparar a fila ------------------------------------------
     Cada lead pronto vira um item da fila. O que muda desde a 1.6 é de onde
     vem o texto: da abordagem que o Command montou (como sempre foi) ou de um
     roteiro da biblioteca. Com mais de um roteiro marcado, os leads são
     alternados entre eles e o estúdio compara as respostas. */
  function leadsProntos(data) {
    return (data && Array.isArray(data.prospects) ? data.prospects : [])
      .map(p => ({ ...p, wa: whatsappDigits(p) }))
      .filter(p => p.wa && !p.contactedAt);
  }

  /* Item da fila e "lead de prévia" são o mesmo objeto: a prévia do modal
     usa exatamente os campos que o WhatsApp vai usar. */
  function itemDoLead(p) {
    return {
      prospectId: p.id,
      name: p.name || '',
      wa: p.wa,
      message: p.message || '',
      commandMessage: p.message || '',
      category: p.category || '',
      score: p.score ?? null,
      address: p.address || '',
      /* Sem estes tres, um lead de fora entrava na fila e recebia a
         saudacao em portugues: a montagem do item usa lista fixa de
         campos, entao o que nao esta aqui e descartado. */
      country: p.country || '',
      language: p.language || '',
      longitude: p.longitude == null ? null : p.longitude,
      // Variáveis dos roteiros. Ponte antiga (Command em cache) não manda;
      // a frase se ajusta sozinha quando falta.
      contactFirstName: p.contactFirstName || '',
      city: p.city || '',
      state: p.state || '',
      rating: p.rating || 0,
      userRatingCount: p.userRatingCount || 0,
      inCrm: !!p.crmLeadId,
      sent: false, failed: false, skipped: false
    };
  }

  function variantDe(r) {
    if (!r || r.id === AP.COMMAND_ID) return { id: AP.COMMAND_ID, name: AP.COMMAND_NAME, color: '#b9b2a3', text: null, attachments: [], attachMode: 'after' };
    return { id: r.id, name: r.name, color: r.color, text: r.text, attachments: r.attachments || [], attachMode: r.attachMode || 'after' };
  }

  async function enqueue(auto, plano = null) {
    const data = readBridge();
    if (!data) return;
    const leads = leadsProntos(data);
    if (!leads.length) return;

    const variantes = (plano && plano.variantes && plano.variantes.length) ? plano.variantes : [variantDe(null)];
    const ordem = AP.distribuir(leads.length, variantes.map(v => v.id));
    const overrides = (plano && plano.overrides) || {};
    const items = leads.map((p, i) => {
      const it = itemDoLead(p);
      const v = variantes.find(x => x.id === ordem[i]) || variantes[0];
      it.variantId = v.id;
      it.scriptName = v.name;
      if (v.text != null) it.message = v.text;
      if (overrides[p.id]) it.override = overrides[p.id];
      return it;
    });
    const variants = Object.fromEntries(variantes.map(v => [v.id, v]));
    const sender = await AP.remetente(data.sender || {});

    // O disparo automático já começa na aba do WhatsApp; o modo revisar espera
    // você clicar em Iniciar por lá.
    const res = await chrome.runtime.sendMessage({
      type: 'ap:queue-set', items, variants, sender, autoSend: !!auto, autostart: !!auto, source: location.href
    });
    if (res && res.ok) {
      const ab = variantes.length > 1 ? ` Teste A/B entre ${variantes.length} roteiros.` : '';
      flash(auto
        ? `${items.length} lead(s) na fila.${ab} O WhatsApp Web abriu e o disparo começou: cada mensagem fica alguns segundos na tela antes de sair, e você volta para cá no fim.`
        : `${items.length} lead(s) na fila.${ab} O WhatsApp Web foi aberto, clique em Iniciar por lá.`);
      watchQueue();
    }
  }

  /* --- montar disparo (modal) ---------------------------------------------
     Abre no lugar do envio direto. Escolha de roteiro(s), prévia da mensagem
     de cada lead já resolvida, ajuste só de um lead, edição do roteiro com
     anexo, tudo antes de a fila existir. Vive num Shadow DOM: o CSS do
     Command não entra e o nosso não sai. */
  let cmp = null;   // estado do modal aberto

  async function openComposer(auto) {
    const data = readBridge();
    const leads = leadsProntos(data);
    if (!leads.length) return;
    const lista = await AP.roteiros.list();
    const ultima = await AP.store.get('lastSelection', [AP.COMMAND_ID]);
    const validos = new Set([AP.COMMAND_ID, ...lista.map(r => r.id)]);
    let selected = (Array.isArray(ultima) ? ultima : []).filter(id => validos.has(id));
    if (!selected.length) selected = [AP.COMMAND_ID];

    cmp = {
      auto: !!auto, leads, lista, selected, overrides: {}, idx: 0,
      editing: null, overriding: false,
      sender: await AP.remetente((data && data.sender) || {}),
      root: AP.ui.shadowHost('ap-composer-host')
    };
    paintComposer();
  }

  function closeComposer() {
    const host = document.getElementById('ap-composer-host');
    if (host) host.remove();
    cmp = null;
  }

  const variantesSelecionadas = () => cmp.selected
    .map(id => id === AP.COMMAND_ID ? variantDe(null) : variantDe(cmp.lista.find(r => r.id === id)))
    .filter(v => v && (v.id === AP.COMMAND_ID || cmp.lista.some(r => r.id === v.id)));

  function textoDoLead(i) {
    const lead = cmp.leads[i];
    const vs = variantesSelecionadas();
    const ordem = AP.distribuir(cmp.leads.length, vs.map(v => v.id));
    const v = vs.find(x => x.id === ordem[i]) || vs[0] || variantDe(null);
    const item = itemDoLead(lead);
    const tpl = cmp.overrides[lead.id] || (v.text != null ? v.text : item.message);
    return { lead, item, v, tpl, texto: AP.render(tpl, item, cmp.sender) };
  }

  function toast(msg, err) {
    if (!cmp) return flash(msg);
    let t = cmp.root.querySelector('.apx-toast');
    if (!t) { t = document.createElement('div'); t.className = 'apx-toast'; cmp.root.querySelector('.apx-root').appendChild(t); }
    t.textContent = msg; t.classList.toggle('err', !!err); t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 4200);
  }

  function cardRoteiro(r, on, qtd) {
    const isCmd = r.id === AP.COMMAND_ID;
    const comb = isCmd ? 1 : AP.contarVariacoes(r.text);
    const anexos = isCmd ? 0 : (r.attachments || []).length;
    const resumo = isCmd
      ? 'Cada lead recebe a mensagem que o Command montou para ele: ângulo de site, automação ou leque, conforme os dados do lead. É o comportamento de sempre.'
      : String(r.text || '').replace(/\s+/g, ' ').slice(0, 180);
    return `<div class="apx-rcard ${on ? 'on' : ''}" data-pick="${esc(r.id)}" role="checkbox" aria-checked="${on}" tabindex="0">
      <span class="apx-check">✓</span>
      <div class="apx-rcard-body">
        <div class="apx-rcard-name"><span class="apx-dot" style="background:${esc(isCmd ? '#b9b2a3' : r.color)}"></span>${esc(isCmd ? AP.COMMAND_NAME : r.name)}</div>
        <div class="apx-rcard-text">${esc(resumo)}</div>
        <div class="apx-rcard-meta">
          ${on && qtd ? `<span class="apx-tag gold">${qtd} lead${qtd === 1 ? '' : 's'}</span>` : ''}
          ${isCmd ? '<span class="apx-tag">por lead</span>' : ''}
          ${comb > 1 ? `<span class="apx-tag">${comb.toLocaleString('pt-BR')} variações</span>` : ''}
          ${anexos ? `<span class="apx-tag green">📎 ${anexos}</span>` : ''}
        </div>
      </div>
      <div class="apx-rcard-actions">${isCmd ? '' : `<button type="button" class="apx-btn ghost sm" data-edit="${esc(r.id)}">Editar</button>`}</div>
    </div>`;
  }

  function paintComposer() {
    if (!cmp) return;
    const root = cmp.root;
    let wrap = root.querySelector('.apx-root');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'apx-root';
      root.appendChild(wrap);
      wrap.addEventListener('click', onComposerClick);
      wrap.addEventListener('keydown', onComposerKey);
    }
    if (cmp.editing) return paintEditor(wrap);

    const vs = variantesSelecionadas();
    const ordem = AP.distribuir(cmp.leads.length, vs.map(v => v.id));
    const qtd = (id) => ordem.filter(x => x === id).length;
    const total = cmp.leads.length;
    cmp.idx = Math.max(0, Math.min(cmp.idx, total - 1));
    const { lead, v, texto, tpl, item } = textoDoLead(cmp.idx);
    const anexos = v.attachments || [];
    const label = (k) => ((AP.VARIAVEIS.find(x => x.key === k) || {}).label || k).toLowerCase();
    const miss = AP.faltando(tpl, item, cmp.sender).filter(k => k !== 'abordagem_padrao');
    const nOver = Object.keys(cmp.overrides).length;
    const todos = [{ id: AP.COMMAND_ID }, ...cmp.lista];

    wrap.innerHTML = `
      <div class="apx-overlay" data-close-bg>
        <div class="apx-modal" role="dialog" aria-modal="true" aria-label="Montar disparo">
          <div class="apx-modal-head">
            <span class="apx-logo">A</span>
            <div class="apx-modal-title"><h2>Montar disparo</h2><p>${total} lead${total === 1 ? '' : 's'} pronto${total === 1 ? '' : 's'} para abordagem. Escolha a mensagem, confira lead a lead e mande para o WhatsApp.</p></div>
            <div class="apx-seg" role="tablist" aria-label="Modo">
              <button type="button" class="${cmp.auto ? '' : 'on'}" data-mode="review">Revisar uma a uma</button>
              <button type="button" class="${cmp.auto ? 'on auto' : ''}" data-mode="auto">⚡ Disparo automático</button>
            </div>
            <button type="button" class="apx-x" data-close aria-label="Fechar">×</button>
          </div>
          <div class="apx-modal-body">
            <div class="apx-compose">
              <div class="apx-col">
                <div class="apx-section-head">
                  <span class="apx-label">Mensagem · marque um ou mais roteiros</span>
                  <div class="apx-row">
                    <button type="button" class="apx-btn sm" data-new>+ Novo roteiro</button>
                    <button type="button" class="apx-btn ghost sm" data-studio title="Biblioteca completa e resultados dos testes">Estúdio ↗</button>
                  </div>
                </div>
                <div class="apx-rlist">${todos.map(r => cardRoteiro(r, cmp.selected.includes(r.id), qtd(r.id))).join('')}</div>
                ${vs.length > 1 ? `
                  <div class="apx-dist">${vs.map(x => `<i style="width:${(qtd(x.id) / total) * 100}%;background:${esc(x.color)}"></i>`).join('')}</div>
                  <div class="apx-dist-legend">${vs.map(x => `<span><i class="apx-dot" style="background:${esc(x.color)}"></i>${esc(x.name)}: ${qtd(x.id)}</span>`).join('')}</div>
                  <div class="apx-callout"><b>Teste A/B ligado.</b> Os leads são alternados entre os roteiros na ordem de oportunidade, então cada um recebe leads de score parecido. Quem responde é detectado no WhatsApp Web e o placar fica no <b>estúdio</b>.</div>` : ''}
              </div>
              <div class="apx-col">
                <div class="apx-section-head">
                  <span class="apx-label">Como chega · lead ${cmp.idx + 1} de ${total}</span>
                  <div class="apx-row">
                    <button type="button" class="apx-icon" data-step="-1" aria-label="Lead anterior">‹</button>
                    <button type="button" class="apx-icon" data-step="1" aria-label="Próximo lead">›</button>
                  </div>
                </div>
                <div>
                  <div style="font-weight:650;font-size:13.5px">${esc(lead.name || lead.wa)}</div>
                  <div class="apx-hint">${esc([lead.category, lead.city, `+${lead.wa}`].filter(Boolean).join(' · '))}</div>
                </div>
                ${cmp.overriding ? `
                  <div class="apx-override">
                    <textarea class="apx-textarea" data-override-text>${esc(cmp.overrides[lead.id] || texto)}</textarea>
                    <div class="apx-row"><span class="apx-hint apx-grow">Vale só para ${esc(lead.name || 'este lead')}. Variáveis continuam funcionando.</span>
                      <button type="button" class="apx-btn ghost sm" data-override-cancel>Cancelar</button>
                      <button type="button" class="apx-btn primary sm" data-override-save>Usar este texto</button></div>
                  </div>` : `
                  <div class="apx-phone"><div class="apx-chat">${AP.ui.bolha(texto, { anexos, modo: v.attachMode, tag: cmp.overrides[lead.id] ? `${v.name} · ajustado à mão` : v.name, cor: v.color })}</div></div>
                  ${miss.length ? `<div class="apx-prev-miss">Este lead está sem ${esc(miss.map(label).join(', '))}; a frase foi ajustada sem esse dado.</div>` : ''}
                  <div class="apx-row">
                    <button type="button" class="apx-btn sm" data-override>✎ Ajustar só para este lead</button>
                    ${cmp.overrides[lead.id] ? '<button type="button" class="apx-btn ghost sm" data-override-clear>Voltar ao roteiro</button>' : ''}
                  </div>`}
              </div>
            </div>
          </div>
          <div class="apx-modal-foot">
            <span class="apx-foot-note">${total} lead${total === 1 ? '' : 's'} · ${vs.length} roteiro${vs.length === 1 ? '' : 's'}${nOver ? ` · ${nOver} ajuste${nOver === 1 ? '' : 's'} manua${nOver === 1 ? 'l' : 'is'}` : ''}${cmp.auto ? ' · cada mensagem fica alguns segundos na tela antes de sair' : ' · o Enter de cada envio é seu'}</span>
            <span class="apx-spacer"></span>
            <button type="button" class="apx-btn ghost" data-close>Cancelar</button>
            <button type="button" class="apx-btn primary" data-go>${cmp.auto ? `⚡ Iniciar disparo (${total})` : `Abrir fila no WhatsApp (${total})`}</button>
          </div>
        </div>
      </div>`;
    const ta = wrap.querySelector('[data-override-text]');
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }

  function paintEditor(wrap) {
    const r = cmp.editing;
    const amostra = cmp.leads.slice(0, 30).map(itemDoLead);
    wrap.innerHTML = `
      <div class="apx-overlay">
        <div class="apx-modal" role="dialog" aria-modal="true" aria-label="Editar roteiro">
          <div class="apx-modal-head">
            <span class="apx-logo">A</span>
            <div class="apx-modal-title"><h2>${r.id ? 'Editar roteiro' : 'Novo roteiro'}</h2><p>A prévia ao lado usa os leads desta fila. O roteiro fica salvo na biblioteca da extensão.</p></div>
            <button type="button" class="apx-x" data-edit-cancel aria-label="Voltar">×</button>
          </div>
          <div class="apx-modal-body" data-editor-slot></div>
          <div class="apx-modal-foot">
            ${r.id ? '<button type="button" class="apx-btn ghost danger" data-edit-delete>Excluir</button>' : ''}
            <span class="apx-spacer"></span>
            <button type="button" class="apx-btn ghost" data-edit-cancel>Voltar</button>
            <button type="button" class="apx-btn primary" data-edit-save>Salvar e usar</button>
          </div>
        </div>
      </div>`;
    cmp.editor = AP.ui.editor({
      roteiro: r, amostra, remetente: cmp.sender,
      onError: (m) => toast(m, true)
    });
    wrap.querySelector('[data-editor-slot]').appendChild(cmp.editor.el);
    setTimeout(() => cmp && cmp.editor && cmp.editor.focus(), 30);
  }

  async function onComposerClick(ev) {
    if (!cmp) return;
    const t = ev.target;
    const btn = t.closest('button, [data-pick], [data-close-bg]');
    if (!btn) return;

    if (btn.hasAttribute('data-close-bg')) { if (t === btn) closeComposer(); return; }
    if (btn.hasAttribute('data-close')) return closeComposer();
    if (btn.dataset.mode) { cmp.auto = btn.dataset.mode === 'auto'; return paintComposer(); }
    if (btn.dataset.step) { cmp.overriding = false; cmp.idx = (cmp.idx + Number(btn.dataset.step) + cmp.leads.length) % cmp.leads.length; return paintComposer(); }
    if (btn.hasAttribute('data-studio')) { chrome.runtime.sendMessage({ type: 'ap:open-studio' }).catch(() => {}); return; }

    if (btn.dataset.edit) {
      cmp.editing = JSON.parse(JSON.stringify(cmp.lista.find(r => r.id === btn.dataset.edit) || {}));
      return paintComposer();
    }
    if (btn.hasAttribute('data-new')) {
      cmp.editing = { id: null, name: '', text: '{{saudacao}}, {{primeiro_nome}}! Tudo bem?\n\n', attachments: [], attachMode: 'after' };
      return paintComposer();
    }
    if (btn.dataset.pick) {
      const id = btn.dataset.pick;
      const i = cmp.selected.indexOf(id);
      if (i >= 0) { if (cmp.selected.length > 1) cmp.selected.splice(i, 1); else return toast('Pelo menos uma mensagem precisa ficar marcada.'); }
      else cmp.selected.push(id);
      cmp.overriding = false;
      AP.store.set('lastSelection', cmp.selected);
      return paintComposer();
    }

    if (btn.hasAttribute('data-override')) { cmp.overriding = true; return paintComposer(); }
    if (btn.hasAttribute('data-override-cancel')) { cmp.overriding = false; return paintComposer(); }
    if (btn.hasAttribute('data-override-clear')) { delete cmp.overrides[cmp.leads[cmp.idx].id]; return paintComposer(); }
    if (btn.hasAttribute('data-override-save')) {
      const val = cmp.root.querySelector('[data-override-text]').value.trim();
      const lead = cmp.leads[cmp.idx];
      if (val) cmp.overrides[lead.id] = val; else delete cmp.overrides[lead.id];
      cmp.overriding = false;
      return paintComposer();
    }

    if (btn.hasAttribute('data-edit-cancel')) { cmp.editing = null; cmp.editor = null; return paintComposer(); }
    if (btn.hasAttribute('data-edit-delete')) {
      const r = cmp.editing;
      if (!confirm(`Excluir o roteiro "${r.name}"? Os resultados dele continuam no estúdio.`)) return;
      await AP.roteiros.remove(r.id);
      cmp.lista = await AP.roteiros.list();
      cmp.selected = cmp.selected.filter(id => id !== r.id);
      if (!cmp.selected.length) cmp.selected = [AP.COMMAND_ID];
      AP.store.set('lastSelection', cmp.selected);
      cmp.editing = null; cmp.editor = null;
      toast('Roteiro excluído.');
      return paintComposer();
    }
    if (btn.hasAttribute('data-edit-save')) {
      const d = cmp.editor.get();
      if (!d.text.trim()) return toast('O roteiro está sem texto.', true);
      const salvo = await AP.roteiros.save(d);
      cmp.lista = await AP.roteiros.list();
      if (!cmp.selected.includes(salvo.id)) {
        // Roteiro novo entra sozinho; o padrão do Command sai, a não ser que
        // a pessoa já estivesse comparando os dois.
        if (!d.id && cmp.selected.length === 1 && cmp.selected[0] === AP.COMMAND_ID) cmp.selected = [];
        cmp.selected.push(salvo.id);
      }
      AP.store.set('lastSelection', cmp.selected);
      cmp.editing = null; cmp.editor = null;
      toast(`"${salvo.name}" salvo na biblioteca.`);
      return paintComposer();
    }

    if (btn.hasAttribute('data-go')) {
      const plano = { variantes: variantesSelecionadas(), overrides: { ...cmp.overrides } };
      const auto = cmp.auto;
      closeComposer();
      await enqueue(auto, plano);
    }
  }

  function onComposerKey(ev) {
    // Nada digitado aqui pode virar atalho do Command.
    ev.stopPropagation();
    if (!cmp) return;
    if (ev.key === 'Escape') {
      if (cmp.editing) { cmp.editing = null; cmp.editor = null; paintComposer(); }
      else if (cmp.overriding) { cmp.overriding = false; paintComposer(); }
      else closeComposer();
      return;
    }
    const tag = (ev.target && ev.target.tagName) || '';
    if ((ev.key === ' ' || ev.key === 'Enter') && ev.target.matches && ev.target.matches('[data-pick]')) {
      ev.preventDefault(); ev.target.click(); return;
    }
    if (!cmp.editing && !cmp.overriding && (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && !/TEXTAREA|INPUT|SELECT/.test(tag)) {
      cmp.idx = (cmp.idx + (ev.key === 'ArrowRight' ? 1 : -1) + cmp.leads.length) % cmp.leads.length;
      paintComposer();
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
      const name = a.kind === 'crm' ? 'achilles:add-crm' : a.kind === 'replied' ? 'achilles:replied' : 'achilles:mark-contacted';
      document.dispatchEvent(new CustomEvent(name, {
        detail: { prospectId: a.prospectId, message: a.message || '', script: a.script || '', at: a.at }
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
  const OURS = '#ap-bar, #ap-flash, #ap-composer-host';
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
