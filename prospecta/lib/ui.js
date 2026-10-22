/* Achilles Prospecta: peças de interface compartilhadas.

   O mesmo editor de roteiro aparece em três lugares: no modal "Montar
   disparo" do Command, na gaveta do WhatsApp Web e no estúdio. Dentro das
   páginas dos outros (Command e WhatsApp) tudo vive num Shadow DOM, porque o
   CSS global de cada uma reescreveria botão, textarea e fonte. */
(function () {
  const AP = window.AP;
  if (!AP) return;
  const { esc } = AP;

  const h = (tag, attrs = {}, html = '') => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : v);
    }
    if (html) el.innerHTML = html;
    return el;
  };

  /* Raiz isolada dentro de uma página que não é nossa. O CSS entra por link
     para o arquivo da extensão (web_accessible_resources no manifest). */
  function shadowHost(id) {
    let host = document.getElementById(id);
    if (host) return host.shadowRoot;
    host = h('div', { id });
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    const link = h('link', { rel: 'stylesheet', href: chrome.runtime.getURL('lib/ui.css') });
    root.appendChild(link);
    return root;
  }

  /* Formatação do WhatsApp na prévia: *negrito*, _itálico_, ~riscado~ e
     ```mono```. Escapa antes de formatar, então nada do lead vira HTML. */
  function waFormat(text) {
    return esc(text)
      .replace(/```([\s\S]+?)```/g, '<code>$1</code>')
      .replace(/(^|[\s(])\*(?!\s)([^*\n]+?)\*(?=[\s).,!?:;]|$)/g, '$1<b>$2</b>')
      .replace(/(^|[\s(])_(?!\s)([^_\n]+?)_(?=[\s).,!?:;]|$)/g, '$1<i>$2</i>')
      .replace(/(^|[\s(])~(?!\s)([^~\n]+?)~(?=[\s).,!?:;]|$)/g, '$1<s>$2</s>')
      .replace(/\n/g, '<br>');
  }

  const ICON_KIND = { imagem: '🖼', vídeo: '🎬', áudio: '🎧', PDF: '📄', arquivo: '📎' };

  function anexoChip(a, removivel) {
    const kind = AP.files.kind(a);
    return `<span class="apx-file" data-file="${esc(a.id)}"><span class="apx-file-ic">${ICON_KIND[kind] || '📎'}</span><span class="apx-file-name" title="${esc(a.name)}">${esc(a.name)}</span><em>${esc(AP.files.size(a.size))}</em>${removivel ? `<button type="button" class="apx-file-x" data-remove-file="${esc(a.id)}" aria-label="Remover anexo">×</button>` : ''}</span>`;
  }

  /* --- balão de prévia -------------------------------------------------- */
  function bolha(texto, { anexos = [], modo = 'after', tag = '', cor = '' } = {}) {
    const hora = new Date().toTimeString().slice(0, 5);
    const legenda = modo === 'caption' && anexos.length;
    const midia = (a) => `<div class="apx-media">${ICON_KIND[AP.files.kind(a)] || '📎'} <span>${esc(a.name)}</span><em>${esc(AP.files.size(a.size))}</em></div>`;
    const tagHtml = tag ? `<div class="apx-bubble-tag"><i style="background:${esc(cor || '#e3c877')}"></i>${esc(tag)}</div>` : '';
    if (legenda) {
      return `${tagHtml}<div class="apx-bubble">${midia(anexos[0])}<div class="apx-bubble-text">${waFormat(texto)}</div><span class="apx-time">${hora} ✓✓</span></div>
        ${anexos.slice(1).map(a => `<div class="apx-bubble">${midia(a)}<span class="apx-time">${hora} ✓✓</span></div>`).join('')}`;
    }
    return `${tagHtml}<div class="apx-bubble"><div class="apx-bubble-text">${waFormat(texto) || '<span class="apx-dim">(mensagem vazia)</span>'}</div><span class="apx-time">${hora} ✓✓</span></div>
      ${anexos.map(a => `<div class="apx-bubble">${midia(a)}<span class="apx-time">${hora} ✓✓</span></div>`).join('')}`;
  }

  /* --- editor de roteiro -------------------------------------------------
     Devolve { el, get, set, focus }. Quem hospeda decide onde salvar: o
     editor só monta o rascunho e avisa por onChange. */
  function editor(opts = {}) {
    let draft = Object.assign({ id: null, name: '', text: '', attachments: [], attachMode: 'after' }, JSON.parse(JSON.stringify(opts.roteiro || {})));
    let amostra = (opts.amostra || []).filter(Boolean);
    let leadIdx = 0, seed = 0;
    const ctx = () => Object.assign({}, opts.remetente || {}, { seed });

    const el = h('div', { class: `apx-editor ${opts.compacto ? 'compact' : ''}` });
    el.innerHTML = `
      <div class="apx-ed-main">
        ${opts.semNome ? '' : `<input class="apx-input apx-ed-name" placeholder="Nome do roteiro, ex.: Curto com protótipo" maxlength="60" />`}
        <div class="apx-vars" role="toolbar" aria-label="Inserir variável">
          ${AP.VARIAVEIS.map(v => `<button type="button" class="apx-var" data-var="${v.key}" title="${esc(v.desc)} Ex.: ${esc(v.exemplo)}">${esc(v.label)}</button>`).join('')}
          <button type="button" class="apx-var spin" data-spin title="Variação: cada lead recebe uma das opções, sorteada. Selecione um trecho para transformar em variação.">{ a | b }</button>
        </div>
        <textarea class="apx-textarea apx-ed-text" spellcheck="true" placeholder="Escreva a abordagem. Use as variáveis acima e {opção 1|opção 2} para variar o texto entre leads."></textarea>
        <div class="apx-ed-meta"><span class="apx-count"></span><span class="apx-warn"></span></div>
        <div class="apx-ed-files">
          <div class="apx-files-list"></div>
          <div class="apx-files-row">
            <label class="apx-btn ghost sm apx-add-file">📎 Anexar arquivo<input type="file" multiple hidden /></label>
            <select class="apx-select sm apx-attach-mode" title="Como o anexo sai">
              <option value="after">Anexo depois do texto</option>
              <option value="caption">Texto como legenda do anexo</option>
            </select>
          </div>
          <div class="apx-hint">Até ${AP.MAX_FILES} arquivos de 15 MB: PDF, imagem, vídeo. Arraste para cá ou use o botão.</div>
        </div>
      </div>
      ${opts.semPrevia ? '' : `
      <div class="apx-ed-preview">
        <div class="apx-prev-head">
          <span class="apx-label">Prévia</span>
          <div class="apx-prev-nav">
            <button type="button" class="apx-icon" data-prev="-1" aria-label="Lead anterior">‹</button>
            <span class="apx-prev-who"></span>
            <button type="button" class="apx-icon" data-prev="1" aria-label="Próximo lead">›</button>
            <button type="button" class="apx-icon" data-reroll title="Sortear outras variações">⟳</button>
          </div>
        </div>
        <div class="apx-phone"><div class="apx-chat"></div></div>
        <div class="apx-prev-miss"></div>
      </div>`}`;

    const $ = (s) => el.querySelector(s);
    const name = $('.apx-ed-name');
    const ta = $('.apx-ed-text');
    const fileIn = $('.apx-add-file input');
    const mode = $('.apx-attach-mode');

    function autoGrow() { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight + 4, opts.compacto ? 300 : 460)}px`; }

    function paintFiles() {
      $('.apx-files-list').innerHTML = draft.attachments.map(a => anexoChip(a, true)).join('');
      mode.value = draft.attachMode;
      mode.hidden = !draft.attachments.length;
      $('.apx-add-file').classList.toggle('disabled', draft.attachments.length >= AP.MAX_FILES);
    }

    function paintMeta() {
      const t = draft.text;
      const comb = AP.contarVariacoes(t);
      const unk = AP.desconhecidas(t);
      $('.apx-count').textContent = `${t.length} caracteres${comb > 1 ? ` · ${comb.toLocaleString('pt-BR')} combinações de texto` : ''}`;
      $('.apx-warn').textContent = unk.length ? `Variável desconhecida: ${unk.map(u => `{{${u}}}`).join(', ')}` : '';
    }

    function paintPreview() {
      if (opts.semPrevia) return;
      const item = amostra.length ? amostra[((leadIdx % amostra.length) + amostra.length) % amostra.length] : EXEMPLO;
      const texto = AP.render(draft.text, item, ctx());
      $('.apx-chat').innerHTML = bolha(texto, { anexos: draft.attachments, modo: draft.attachMode });
      $('.apx-prev-who').textContent = amostra.length ? `${item.name || 'Lead'} · ${(leadIdx % amostra.length + amostra.length) % amostra.length + 1}/${amostra.length}` : 'Lead de exemplo';
      const miss = AP.faltando(draft.text, item, ctx()).filter(k => k !== 'abordagem_padrao' || !amostra.length);
      const label = (k) => (AP.VARIAVEIS.find(v => v.key === k) || {}).label || k;
      $('.apx-prev-miss').textContent = miss.length ? `Este lead não tem: ${miss.map(label).join(', ')}. A frase se ajusta sozinha; para escolher o texto, use {{variável|texto se vazio}}.` : '';
    }

    const changed = () => { paintMeta(); paintPreview(); opts.onChange && opts.onChange(get()); };

    function insert(text, selectInner) {
      ta.focus();
      const s = ta.selectionStart, e = ta.selectionEnd;
      ta.setRangeText(text, s, e, 'end');
      if (selectInner) { ta.selectionStart = s + selectInner[0]; ta.selectionEnd = s + selectInner[1]; }
      draft.text = ta.value; autoGrow(); changed();
    }

    el.addEventListener('click', (ev) => {
      const t = ev.target.closest('button, [data-var]');
      if (!t || !el.contains(t)) return;
      if (t.dataset.var) return insert(`{{${t.dataset.var}}}`);
      if (t.hasAttribute('data-spin')) {
        const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
        const txt = sel ? `{${sel}|outra forma}` : '{opção 1|opção 2}';
        const ini = sel ? sel.length + 2 : 1;
        return insert(txt, sel ? [ini, ini + 'outra forma'.length] : [1, 1 + 'opção 1'.length]);
      }
      if (t.dataset.removeFile) {
        draft.attachments = draft.attachments.filter(a => a.id !== t.dataset.removeFile);
        paintFiles(); changed();
        return;
      }
      if (t.dataset.prev) { leadIdx += Number(t.dataset.prev); paintPreview(); return; }
      if (t.hasAttribute('data-reroll')) { seed++; paintPreview(); }
    });

    async function addFiles(list) {
      const err = [];
      for (const f of [...list]) {
        if (draft.attachments.length >= AP.MAX_FILES) { err.push(`Máximo de ${AP.MAX_FILES} anexos por roteiro.`); break; }
        try { draft.attachments.push(await AP.files.put(f)); } catch (e) { err.push(e.message); }
      }
      paintFiles(); changed();
      if (err.length && opts.onError) opts.onError(err.join(' '));
    }

    if (name) name.addEventListener('input', () => { draft.name = name.value; opts.onChange && opts.onChange(get()); });
    ta.addEventListener('input', () => { draft.text = ta.value; autoGrow(); changed(); });
    ta.addEventListener('keydown', ev => ev.stopPropagation());   // atalhos da página hospedeira não podem roubar teclas
    if (name) name.addEventListener('keydown', ev => ev.stopPropagation());
    fileIn.addEventListener('change', () => { addFiles(fileIn.files); fileIn.value = ''; });
    mode.addEventListener('change', () => { draft.attachMode = mode.value; changed(); });
    el.addEventListener('dragover', ev => { if (ev.dataTransfer && [...ev.dataTransfer.types].includes('Files')) { ev.preventDefault(); el.classList.add('drop'); } });
    el.addEventListener('dragleave', ev => { if (!el.contains(ev.relatedTarget)) el.classList.remove('drop'); });
    el.addEventListener('drop', ev => { ev.preventDefault(); el.classList.remove('drop'); if (ev.dataTransfer && ev.dataTransfer.files.length) addFiles(ev.dataTransfer.files); });

    function set(r) {
      draft = Object.assign({ id: null, name: '', text: '', attachments: [], attachMode: 'after' }, JSON.parse(JSON.stringify(r || {})));
      if (name) name.value = draft.name || '';
      ta.value = draft.text || '';
      paintFiles(); paintMeta(); paintPreview();
      requestAnimationFrame(autoGrow);
    }
    function get() { return JSON.parse(JSON.stringify(draft)); }
    function setAmostra(list, ctxNovo) { amostra = (list || []).filter(Boolean); if (ctxNovo) opts.remetente = ctxNovo; paintPreview(); }

    set(draft);
    return { el, get, set, setAmostra, focus: () => ta.focus(), textarea: ta };
  }

  /* Lead de exemplo para quando ainda não existe nenhuma lista. */
  const EXEMPLO = {
    name: 'Clínica Vida', contactFirstName: 'Mariana', city: 'Uberaba', state: 'MG',
    category: 'Clínica odontológica', rating: 4.8, userRatingCount: 312, country: 'BR', wa: '5534999990000',
    commandMessage: '{{saudacao}}, Mariana! Tudo bem? (aqui entraria a abordagem que o Command monta para o lead)'
  };

  AP.ui = { h, shadowHost, waFormat, bolha, anexoChip, editor, EXEMPLO };
})();
