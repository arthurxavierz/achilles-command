/* Achilles Prospecta — helpers compartilhados pelos dois content scripts.
   Carregado antes deles pelo manifest, então expõe tudo em window.AP. */
(function () {
  const DAY = () => new Date().toISOString().slice(0, 10);

  const DEFAULT_SETTINGS = {
    pauseBetween: 20,      // segundos entre um lead e o próximo
    dailyCap: 30,          // teto de abordagens por dia
    hoursStart: 8,         // janela de trabalho (hora local)
    hoursEnd: 19,
    respectHours: true,
    autoSend: false,       // modo automático: a extensão aperta o Enter por você
    autoSendDelay: 4,      // segundos de janela para você cancelar antes de sair
    returnToCommand: true  // ao terminar/pausar, volta o foco para a aba do Command
  };

  const store = {
    async get(key, fallback) {
      const r = await chrome.storage.local.get(key);
      return r[key] === undefined ? fallback : r[key];
    },
    async set(key, value) { await chrome.storage.local.set({ [key]: value }); },
    async settings() {
      return Object.assign({}, DEFAULT_SETTINGS, await store.get('settings', {}));
    },
    async stats() {
      const s = await store.get('stats', { day: DAY(), sent: 0 });
      if (s.day !== DAY()) return { day: DAY(), sent: 0 };
      return s;
    },
    async bumpSent() {
      const s = await store.stats();
      s.sent += 1;
      await store.set('stats', s);
      return s;
    }
  };

  /* --- telefone -----------------------------------------------------------
     Mesma regra do Command: no Brasil só celular abre conversa. DDD + 9
     dígitos começando com 9. Repetida aqui porque a extensão também recebe
     números digitados à mão. */
  function brDigits(value) {
    let d = String(value || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.length === 10 || d.length === 11) d = `55${d}`;
    return (d.length === 12 || d.length === 13) ? d : '';
  }

  /* Fora do Brasil o número não diz se é celular, então a regra brasileira
     descartaria o lead calado: um telefone canadense de 11 dígitos ganhava um
     55 na frente e era rejeitado logo depois. Lá fora vale qualquer número
     discavel, e quem avisa que o WhatsApp não está confirmado é o Command. */
  function intlDigits(value) {
    const d = String(value || '').replace(/\D/g, '');
    return d.length >= 8 && d.length <= 15 ? d : '';
  }

  function whatsappDigits(p = {}) {
    const fora = String(p.country || 'BR').toUpperCase() !== 'BR';
    if (fora) return intlDigits(p.whatsapp) || intlDigits(p.phone);
    const explicit = brDigits(p.whatsapp);
    if (explicit) return explicit;
    const phone = brDigits(p.phone);
    const local = phone.slice(2);
    return (local.length === 11 && local[2] === '9') ? phone : '';
  }

  /* --- mensagem -----------------------------------------------------------
     A saudação é resolvida na hora de preencher, não na hora de montar a
     fila: uma fila preparada de manhã e trabalhada à noite não pode chegar
     dando bom dia. */
  const SAUDACOES = {
    pt: ['Bom dia', 'Boa tarde', 'Boa noite'],
    en: ['Good morning', 'Good afternoon', 'Good evening'],
    es: ['Buenos días', 'Buenas tardes', 'Buenas noches']
  };

  function greeting(date = new Date(), idioma = 'pt', hora = null) {
    const h = hora == null ? date.getHours() : hora;
    const lista = SAUDACOES[idioma] || SAUDACOES.pt;
    if (h >= 5 && h < 12) return lista[0];
    if (h >= 12 && h < 18) return lista[1];
    return lista[2];
  }

  /* Hora de quem recebe, pela longitude. Aproximação por fuso geográfico:
     ignora horário de verão e pode errar uma hora, mas errar uma hora ainda
     acerta o período do dia. Sem isto, uma fila trabalhada à noite daqui
     chegaria dando boa noite às nove da manhã em Vancouver. */
  function localHour(longitude, date = new Date()) {
    // Number(null) e Number('') dão 0, que é Greenwich. Sem este teste, lead
    // sem longitude era tratado como se estivesse em Londres.
    if (longitude === null || longitude === undefined || longitude === '') return date.getHours();
    const lon = Number(longitude);
    if (!Number.isFinite(lon)) return date.getHours();
    const utc = date.getUTCHours() + date.getUTCMinutes() / 60;
    return ((Math.floor(utc + Math.round(lon / 15)) % 24) + 24) % 24;
  }

  function resolveMessage(text, item = {}) {
    const fora = String(item.country || 'BR').toUpperCase() !== 'BR';
    const idioma = fora ? (item.language || 'en') : 'pt';
    const hora = fora ? localHour(item.longitude) : null;
    return String(text || '')
      .replace(/\{\{\s*sauda[cç][aã]o\s*\}\}/gi, greeting(new Date(), idioma, hora))
      .replace(/\{\{\s*empresa\s*\}\}/gi, item.name || 'sua empresa');
  }

  function withinHours(settings, date = new Date()) {
    if (!settings.respectHours) return true;
    const h = date.getHours();
    return h >= settings.hoursStart && h < settings.hoursEnd;
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const esc = (s) => String(s == null ? '' : s)
    .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  window.AP = {
    DAY, DEFAULT_SETTINGS, store,
    brDigits, intlDigits, whatsappDigits, greeting, localHour, resolveMessage, withinHours,
    sleep, esc
  };
})();
