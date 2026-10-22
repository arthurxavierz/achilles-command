/* Achilles Prospecta: estúdio de roteiros.

   A tela grande da extensão. Biblioteca de roteiros com editor e prévia nos
   leads da última lista aberta no Command, placar do teste A/B e os ajustes
   de quem assina. Abre pelo popup, pelo "Montar disparo" e pela gaveta. */
(function () {
  const AP = window.AP;
  const { esc } = AP;
  const $ = (s) => document.querySelector(s);

  const st = { lista: [], atual: null, editor: null, sujo: false, dias: 30, filtro: '' };

  function toast(msg, err) {
    const t = $('#toast');
    t.textContent = msg; t.classList.toggle('err', !!err); t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3800);
  }

  async function amostra() {
    const s = await AP.store.get('bridgeSample', null);
    return { prospects: (s && s.prospects) || [], sender: await AP.remetente((s && s.sender) || {}), at: s && s.at };
  }

  /* --- abas ---------------------------------------------------------------- */
  function aba(nome) {
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === nome));
    document.querySelectorAll('[data-pane]').forEach(p => p.classList.toggle('on', p.dataset.pane === nome));
    try { history.replaceState(null, '', `#${nome}`); } catch (e) { /* sem histórico */ }
    if (nome === 'resultados') pintarResultados();
    if (nome === 'ajustes') pintarAjustes();
  }
  document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
    if (st.sujo && !confirm('Há alterações não salvas neste roteiro. Sair mesmo assim?')) return;
    st.sujo = false;
    aba(b.dataset.tab);
  }));

  /* --- biblioteca ------------------------------------------------------------ */
  async function placarPorRoteiro() {
    const { rows } = AP.estatisticas(await AP.log.all(), st.lista);
    return new Map(rows.map(r => [r.id, r]));
  }

  async function pintarLista() {
    st.lista = await AP.roteiros.list();
    const placar = await placarPorRoteiro();
    $('#list').innerHTML = st.lista.map(r => {
      const p = placar.get(r.id);
      const linha = p ? `${p.sent} envio${p.sent === 1 ? '' : 's'} · ${Math.round(p.rate * 100)}% resposta` : 'sem envios ainda';
      return `<button type="button" class="st-item ${st.atual && st.atual.id === r.id ? 'on' : ''}" data-open="${esc(r.id)}">
        <span class="apx-dot" style="background:${esc(r.color)}"></span>
        <span class="st-item-body"><b>${esc(r.name)}</b><small>${esc(linha)}${(r.attachments || []).length ? ` · 📎 ${r.attachments.length}` : ''}</small></span>
      </button>`;
    }).join('') || '<p class="apx-hint">Nenhum roteiro ainda.</p>';
  }

  $('#list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-open]'); if (!b) return;
    if (st.sujo && !confirm('Há alterações não salvas neste roteiro. Trocar mesmo assim?')) return;
    abrir(st.lista.find(r => r.id === b.dataset.open));
  });

  $('#new').addEventListener('click', () => {
    if (st.sujo && !confirm('Há alterações não salvas neste roteiro. Começar outro mesmo assim?')) return;
    abrir({ id: null, name: '', text: '{{saudacao}}, {{primeiro_nome}}! Tudo bem?\n\nSou o {{consultor}}, da {{agencia}}. ', attachments: [], attachMode: 'after' });
  });

  async function abrir(r) {
    st.atual = r ? JSON.parse(JSON.stringify(r)) : null;
    st.sujo = false;
    await pintarLista();
    const main = $('#main');
    if (!st.atual) {
      main.innerHTML = `<div class="st-empty"><h2>Escolha um roteiro</h2><p class="apx-hint">Ou crie um novo. Ele aparece no "Montar disparo" do Command na próxima vez que você montar uma fila.</p></div>`;
      return;
    }
    const a = await amostra();
    const cor = st.atual.color || '';
    main.innerHTML = `
      <div class="st-editor-head">
        <div class="st-colors" role="radiogroup" aria-label="Cor do roteiro">${AP.CORES.map(c => `<button type="button" class="st-color ${c === cor ? 'on' : ''}" data-color="${c}" style="background:${c}" aria-label="Cor ${c}"></button>`).join('')}</div>
        <span class="apx-spacer"></span>
        <span class="apx-hint st-sample">${a.prospects.length ? `Prévia com ${a.prospects.length} leads da última lista aberta no Command` : 'Prévia com lead de exemplo. Abra a Captação no Command para usar leads de verdade.'}</span>
      </div>
      <div id="slot"></div>
      <div class="st-editor-foot">
        ${st.atual.id ? '<button type="button" class="apx-btn ghost danger sm" id="del">Excluir</button><button type="button" class="apx-btn ghost sm" id="dup">Duplicar</button>' : ''}
        <span class="apx-spacer"></span>
        <span class="apx-hint" id="dirty"></span>
        <button type="button" class="apx-btn primary" id="save">Salvar roteiro</button>
      </div>`;
    st.editor = AP.ui.editor({
      roteiro: st.atual, amostra: a.prospects, remetente: a.sender,
      onChange: () => { st.sujo = true; $('#dirty').textContent = 'alterações não salvas'; },
      onError: (m) => toast(m, true)
    });
    $('#slot').appendChild(st.editor.el);
    st.editor.focus();

    main.querySelectorAll('[data-color]').forEach(b => b.addEventListener('click', () => {
      st.atual.color = b.dataset.color;
      main.querySelectorAll('[data-color]').forEach(x => x.classList.toggle('on', x === b));
      st.sujo = true; $('#dirty').textContent = 'alterações não salvas';
    }));
    $('#save').addEventListener('click', salvar);
    if ($('#dup')) $('#dup').addEventListener('click', async () => {
      if (st.sujo) await salvar();
      const novo = await AP.roteiros.duplicate(st.atual.id);
      toast('Cópia criada. Mude uma coisa só, e o placar diz se valeu.');
      abrir(novo);
    });
    if ($('#del')) $('#del').addEventListener('click', async () => {
      if (!confirm(`Excluir "${st.atual.name}"? Os envios dele continuam no placar.`)) return;
      await AP.roteiros.remove(st.atual.id);
      st.sujo = false;
      toast('Roteiro excluído.');
      const lista = await AP.roteiros.list();
      abrir(lista[0] || null);
    });
  }

  async function salvar() {
    const d = st.editor.get();
    if (!d.text.trim()) return toast('O roteiro está sem texto.', true);
    const unk = AP.desconhecidas(d.text);
    if (unk.length && !confirm(`Estas variáveis não existem e vão sair como estão: ${unk.map(u => `{{${u}}}`).join(', ')}. Salvar mesmo assim?`)) return;
    const salvo = await AP.roteiros.save(Object.assign({}, d, { color: st.atual.color }));
    st.atual = salvo; st.sujo = false;
    $('#dirty').textContent = '';
    await pintarLista();
    if (!d.id) abrir(salvo);
    toast(`"${salvo.name}" salvo.`);
  }

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && st.editor && document.querySelector('[data-pane="roteiros"].on')) {
      e.preventDefault(); salvar();
    }
  });
  window.addEventListener('beforeunload', (e) => { if (st.sujo) { e.preventDefault(); e.returnValue = ''; } });

  /* --- importar / exportar --------------------------------------------------- */
  function baixar(nome, conteudo, tipo) {
    const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
    const a = document.createElement('a');
    a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  $('#export').addEventListener('click', async () => {
    const pacote = await AP.roteiros.exportar();
    baixar(`roteiros-prospecta-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(pacote, null, 2), 'application/json');
    toast(`${pacote.roteiros.length} roteiro(s) exportado(s), com os anexos.`);
  });

  $('#import').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const n = await AP.roteiros.importar(JSON.parse(await f.text()));
      toast(`${n} roteiro(s) importado(s).`);
      await pintarLista();
      if (document.querySelector('[data-pane="resultados"].on')) pintarResultados();
    } catch (err) { toast(err.message || 'Arquivo inválido.', true); }
  });

  /* --- resultados ------------------------------------------------------------ */
  $('#period').addEventListener('click', (e) => {
    const b = e.target.closest('[data-days]'); if (!b) return;
    st.dias = Number(b.dataset.days);
    $('#period').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    pintarResultados();
  });

  const pct = (x) => `${(x * 100).toFixed(x > 0 && x < 0.1 ? 1 : 0).replace('.', ',')}%`;

  async function pintarResultados() {
    st.lista = await AP.roteiros.list();
    const todos = await AP.log.all();
    const desde = st.dias ? Date.now() - st.dias * 864e5 : 0;
    const { rows, veredito, total, respostas } = AP.estatisticas(todos, st.lista, desde);
    const auto = rows.reduce((n, r) => n + (r.automaticas || 0), 0);

    $('#kpis').innerHTML = [
      ['Envios', total.toLocaleString('pt-BR'), st.dias ? `últimos ${st.dias} dias` : 'desde o início'],
      ['Responderam', respostas.toLocaleString('pt-BR'), 'pessoas, sem as automáticas'],
      ['Taxa geral', total ? pct(respostas / total) : '0%', 'respostas sobre envios'],
      ['Automáticas prováveis', auto.toLocaleString('pt-BR'), 'chegaram em menos de 90s']
    ].map(([k, v, s]) => `<div class="st-kpi"><span class="apx-label">${k}</span><strong>${v}</strong><small>${s}</small></div>`).join('');

    $('#verdict').innerHTML = veredito && veredito.texto
      ? `<div class="apx-callout ${veredito.confianca >= 0.95 && veredito.minimo >= 20 ? '' : 'warn'}"><b>Leitura do teste.</b> ${esc(veredito.texto)}</div>`
      : (rows.length === 1 ? '<div class="apx-callout">Só um roteiro com envios no período. Marque dois ou mais no "Montar disparo" para comparar.</div>' : '');

    const max = Math.max(0.0001, ...rows.map(r => r.rate));
    $('#bars').innerHTML = rows.length ? rows.map(r => `
      <div class="st-bar-row" tabindex="0" data-tip="${esc(`${r.name}: ${r.replied} de ${r.sent} responderam${r.automaticas ? `, mais ${r.automaticas} automática(s)` : ''}`)}">
        <div class="st-bar-name"><span class="apx-dot" style="background:${esc(r.color)}"></span><span>${esc(r.name)}</span>${r.removed ? '<em>excluído</em>' : ''}</div>
        <div class="st-bar-track"><i style="width:${Math.max(r.rate / max * 100, r.rate ? 1.5 : 0)}%;background:${esc(r.color)}"></i></div>
        <div class="st-bar-val"><b>${pct(r.rate)}</b><small>${r.replied}/${r.sent}</small></div>
      </div>`).join('') : `<div class="st-empty small"><p class="apx-hint">Nenhum envio registrado no período. O placar começa a contar a partir da versão 1.6 da extensão, a cada mensagem que sai pela fila.</p></div>`;

    const filtro = $('#logFilter');
    const opcoes = [['', 'Todos os roteiros'], ...rows.map(r => [r.id, r.name])];
    if (!opcoes.some(([v]) => v === st.filtro)) st.filtro = '';
    filtro.innerHTML = opcoes.map(([v, l]) => `<option value="${esc(v)}" ${v === st.filtro ? 'selected' : ''}>${esc(l)}</option>`).join('');

    const nomes = new Map(st.lista.map(r => [r.id, r]));
    const recentes = todos.filter(e => (!desde || e.at >= desde) && (!st.filtro || (e.scriptId || AP.COMMAND_ID) === st.filtro)).slice(-150).reverse();
    $('#log').innerHTML = recentes.length ? recentes.map(e => {
      const r = nomes.get(e.scriptId);
      const nome = r ? r.name : (e.scriptName || AP.COMMAND_NAME);
      const cor = r ? r.color : '#b9b2a3';
      const estado = e.replied ? (e.quick ? ['auto', 'automática?'] : ['ok', 'respondeu']) : ['no', 'sem resposta'];
      const quando = new Date(e.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      return `<div class="st-log-row">
        <span class="st-log-when">${quando}</span>
        <span class="st-log-who"><b>${esc(e.name || e.wa)}</b><small>+${esc(e.wa)}${e.manual ? ' · ajustado à mão' : ''}${e.attachments ? ` · 📎 ${e.attachments}${e.attachmentsOk === false ? ' (falhou)' : ''}` : ''}</small></span>
        <span class="st-log-script"><span class="apx-dot" style="background:${esc(cor)}"></span>${esc(nome)}</span>
        <button type="button" class="st-state ${estado[0]}" data-toggle="${esc(e.id)}" title="Clique para corrigir">${estado[1]}</button>
      </div>`;
    }).join('') : '<p class="apx-hint">Nada por aqui ainda.</p>';
  }

  $('#logFilter').addEventListener('change', (e) => { st.filtro = e.target.value; pintarResultados(); });
  $('#log').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-toggle]'); if (!b) return;
    await AP.log.toggle(b.dataset.toggle);
    pintarResultados();
  });
  $('#clearLog').addEventListener('click', async () => {
    const alvo = st.filtro;
    const nome = alvo ? ($('#logFilter').selectedOptions[0] || {}).textContent : 'todos os roteiros';
    if (!confirm(`Zerar o placar de ${nome}? Os envios saem do registro (os leads continuam marcados no Command).`)) return;
    await AP.log.limpar(alvo || null);
    pintarResultados();
    toast('Placar zerado.');
  });
  $('#csv').addEventListener('click', async () => {
    const nomes = new Map(st.lista.map(r => [r.id, r.name]));
    const linhas = [['data', 'empresa', 'whatsapp', 'roteiro', 'respondeu', 'automatica', 'respondido_em', 'ajustado_a_mao', 'anexos']];
    for (const e of await AP.log.all()) {
      linhas.push([new Date(e.at).toISOString(), e.name || '', e.wa, nomes.get(e.scriptId) || e.scriptName || AP.COMMAND_NAME,
        e.replied && !e.quick ? 'sim' : 'nao', e.replied && e.quick ? 'sim' : 'nao', e.repliedAt ? new Date(e.repliedAt).toISOString() : '',
        e.manual ? 'sim' : 'nao', e.attachments || 0]);
    }
    const csv = linhas.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    baixar(`placar-roteiros-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + csv, 'text/csv');
  });

  /* Dica no passar do mouse ou no foco, para a barra que é fina demais para
     levar o número inteiro dentro. */
  const tip = document.createElement('div');
  tip.className = 'st-tip';
  document.body.appendChild(tip);
  const mostrar = (el, x, y) => { tip.textContent = el.dataset.tip; tip.style.left = `${x + 14}px`; tip.style.top = `${y + 14}px`; tip.classList.add('show'); };
  $('#bars').addEventListener('mousemove', (e) => { const r = e.target.closest('[data-tip]'); if (r) mostrar(r, e.clientX, e.clientY); else tip.classList.remove('show'); });
  $('#bars').addEventListener('mouseleave', () => tip.classList.remove('show'));
  $('#bars').addEventListener('focusin', (e) => { const r = e.target.closest('[data-tip]'); if (r) { const b = r.getBoundingClientRect(); mostrar(r, b.left + 40, b.bottom - 6); } });
  $('#bars').addEventListener('focusout', () => tip.classList.remove('show'));

  /* --- ajustes ----------------------------------------------------------------- */
  async function pintarAjustes() {
    const s = await AP.store.get('sender', {});
    const a = await AP.store.get('bridgeSample', null);
    const doCommand = (a && a.sender) || {};
    $('#sConsultor').value = s.consultor || '';
    $('#sAgencia').value = s.agencia || '';
    $('#sConsultor').placeholder = doCommand.consultor ? `Do Command: ${doCommand.consultor}` : 'Do Command';
    $('#sAgencia').placeholder = doCommand.agencia ? `Do Command: ${doCommand.agencia}` : 'Do Command';
    $('#vars').innerHTML = AP.VARIAVEIS.map(v => `<div><code>{{${v.key}}}</code><span>${esc(v.desc)} <em>Ex.: ${esc(v.exemplo)}</em></span></div>`).join('');
    try {
      const bytes = await chrome.storage.local.getBytesInUse(null);
      const todos = await chrome.storage.local.get(null);
      const arquivos = Object.keys(todos).filter(k => k.startsWith('file:')).length;
      $('#storage').textContent = `${AP.files.size(bytes)} em uso, ${arquivos} anexo(s) guardado(s). A extensão tem armazenamento ilimitado; anexos de roteiros excluídos são apagados junto.`;
    } catch (e) { $('#storage').textContent = 'Não consegui medir agora.'; }
  }

  $('#saveSender').addEventListener('click', async () => {
    await AP.store.set('sender', { consultor: $('#sConsultor').value.trim(), agencia: $('#sAgencia').value.trim() });
    toast('Assinatura salva. Vale para as próximas filas.');
  });

  /* --- início ---------------------------------------------------------------- */
  (async () => {
    st.lista = await AP.roteiros.list();
    await abrir(st.lista[0] || null);
    const alvo = (location.hash || '').slice(1);
    if (['resultados', 'ajustes'].includes(alvo)) aba(alvo);
  })();

  // Roteiro salvo no Command ou na gaveta aparece aqui sem recarregar.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.roteiros && !st.sujo) pintarLista();
    if (changes.sendLog && document.querySelector('[data-pane="resultados"].on')) pintarResultados();
  });
})();
