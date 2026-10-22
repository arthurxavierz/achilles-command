/* Achilles Prospecta — popup: estado da fila e ritmo de trabalho. */
(function () {
  const { store, DEFAULT_SETTINGS } = window.AP;
  const $ = id => document.getElementById(id);
  const FIELDS = ['pauseBetween', 'dailyCap', 'hoursStart', 'hoursEnd', 'autoSendDelay', 'leadTimeout'];
  const FLAGS = ['respectHours', 'autoSend', 'returnToCommand'];

  async function renderQueue() {
    const res = await chrome.runtime.sendMessage({ type: 'ap:queue-get' }).catch(() => null);
    const q = res && res.queue;
    if (!q || !q.items || !q.items.length) {
      $('queue').textContent = 'Nenhuma fila carregada. Envie uma pela aba Captação do Command.';
      return;
    }
    const sent = q.items.filter(x => x.sent).length;
    const left = q.items.length - sent;
    const modo = q.autoSend ? 'automática' : 'revisada';
    $('queue').innerHTML = `<strong>${left}</strong> aguardando · ${sent} enviada(s) · ${q.running ? `em andamento (${modo})` : 'parada'}`;
  }

  async function renderStats() {
    const s = await store.stats();
    const cfg = await store.settings();
    $('stats').innerHTML = `<strong>${s.sent}</strong> de ${cfg.dailyCap} abordagens hoje`;
  }

  async function loadSettings() {
    const cfg = await store.settings();
    for (const f of FIELDS) $(f).value = cfg[f];
    for (const f of FLAGS) $(f).checked = !!cfg[f];
  }

  async function save() {
    const cfg = await store.settings();
    for (const f of FIELDS) {
      const n = Number($(f).value);
      if (Number.isFinite(n)) cfg[f] = n;
    }
    for (const f of FLAGS) cfg[f] = $(f).checked;
    if (cfg.hoursEnd <= cfg.hoursStart) cfg.hoursEnd = cfg.hoursStart + 1;
    await store.set('settings', Object.assign({}, DEFAULT_SETTINGS, cfg));
    await loadSettings();
    await renderStats();
    $('saved').classList.add('show');
    setTimeout(() => $('saved').classList.remove('show'), 1800);
  }

  /* Biblioteca e o melhor roteiro dos últimos 30 dias, para ver o placar sem
     abrir o estúdio. */
  async function renderRoteiros() {
    const lista = await window.AP.roteiros.list();
    const { rows } = window.AP.estatisticas(await window.AP.log.all(), lista, Date.now() - 30 * 864e5);
    const lider = rows.find(r => r.sent >= 5);
    $('roteiros').innerHTML = `<strong>${lista.length}</strong> na biblioteca` +
      (lider ? `<br>Melhor em 30 dias: ${window.AP.esc(lider.name)}, ${Math.round(lider.rate * 100)}% de resposta (${lider.replied}/${lider.sent})` : '<br>O placar aparece depois dos primeiros envios.');
  }

  $('save').addEventListener('click', save);
  $('studio').addEventListener('click', () => chrome.runtime.openOptionsPage());
  loadSettings(); renderQueue(); renderStats(); renderRoteiros();
})();
