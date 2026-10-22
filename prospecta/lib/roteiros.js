/* Achilles Prospecta: roteiros de abordagem.

   Até a 1.5 a mensagem de cada lead vinha pronta do Command, montada pelo
   próprio sistema. Trocar o discurso de uma lista inteira exigia mudar o
   código do Command. Aqui o discurso vira dado: um roteiro é um texto com
   variáveis, variações e anexos, guardado na extensão, e a fila pode alternar
   entre vários deles para comparar qual responde mais.

   Carregado depois do shared.js em todos os contextos (Command, WhatsApp,
   estúdio e popup). Não toca em DOM: só texto, armazenamento e contas. */
(function () {
  const AP = window.AP;
  if (!AP) return;

  const COMMAND_ID = 'command';
  const COMMAND_NAME = 'Abordagem do Command';
  // Ordem fixa, validada para daltonismo sobre fundo escuro. A cor identifica o
  // roteiro em todo lugar (prévia, gaveta, placar), sempre ao lado do nome.
  const CORES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9', '#e66767', '#008300'];
  const MAX_FILE = 15 * 1024 * 1024;   // o WhatsApp recusa mídia acima de 16 MB
  const MAX_FILES = 3;
  const LOG_MAX = 5000;

  const uid = (p = 'r') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  /* --- artigo do nome -----------------------------------------------------
     Mesma regra do Command: "a Clínica Vida", "o Restaurante Sabor". Quando o
     gênero não é dedutível o nome segue sem artigo, porque artigo errado na
     primeira mensagem denuncia texto de máquina. */
  const NAME_ARTICLE = {
    a: ['clinica', 'academia', 'farmacia', 'drogaria', 'padaria', 'confeitaria', 'pizzaria', 'sorveteria', 'lanchonete', 'churrascaria', 'cafeteria', 'loja', 'casa', 'otica', 'oficina', 'imobiliaria', 'escola', 'autoescola', 'creche', 'barbearia', 'papelaria', 'joalheria', 'floricultura', 'pousada', 'distribuidora', 'transportadora', 'construtora', 'corretora', 'agencia', 'assessoria', 'consultoria', 'grafica', 'pastelaria', 'serralheria', 'marmoraria', 'veterinaria', 'empresa', 'associacao', 'unidade'],
    o: ['restaurante', 'bar', 'hotel', 'motel', 'mercado', 'supermercado', 'minimercado', 'mercadinho', 'salao', 'centro', 'consultorio', 'laboratorio', 'escritorio', 'instituto', 'hospital', 'colegio', 'acougue', 'posto', 'estudio', 'studio', 'espaco', 'grupo', 'auto', 'buffet', 'cafe', 'pet', 'deposito', 'armazem', 'atelie', 'sitio', 'clube', 'ponto', 'servico', 'comercio']
  };

  function nameArticle(name = '') {
    const raw = String(name).trim().split(/\s+/)[0] || '';
    if (!raw) return '';
    const first = raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (NAME_ARTICLE.a.includes(first)) return 'a';
    if (NAME_ARTICLE.o.includes(first)) return 'o';
    if (/(cao|sao|dade|agem|eza|ura|encia|ancia|aria|eria)$/.test(first)) return 'a';
    if (/a$/.test(first)) return 'a';
    if (/o$/.test(first)) return 'o';
    return '';
  }

  const CONTRACOES = {
    '':  { o: 'o',    a: 'a',    '': '' },
    de:  { o: 'do',   a: 'da',   '': 'de' },
    em:  { o: 'no',   a: 'na',   '': 'em' },
    por: { o: 'pelo', a: 'pela', '': 'por' }
  };

  function comArtigo(name, prep = '') {
    const nome = String(name || '').trim();
    if (!nome) return { '': 'a empresa de vocês', de: 'da empresa de vocês', em: 'na empresa de vocês', por: 'pela empresa de vocês' }[prep];
    const t = CONTRACOES[prep] || CONTRACOES[''];
    return `${t[nameArticle(nome)]} ${nome}`.trim();
  }

  /* --- variáveis ----------------------------------------------------------
     A ordem desta lista é a ordem dos atalhos no editor. `exemplo` aparece
     na ajuda; `vazio` explica o que acontece quando o lead não tem o dado. */
  const VARIAVEIS = [
    { key: 'saudacao', label: 'Saudação', exemplo: 'Boa tarde', desc: 'Bom dia, Boa tarde ou Boa noite, no horário de quem recebe.' },
    { key: 'primeiro_nome', label: 'Primeiro nome', exemplo: 'João', desc: 'Quem assina pela empresa (vem da Receita). Quando não existe, some junto com a vírgula.' },
    { key: 'empresa', label: 'Empresa', exemplo: 'Clínica Vida', desc: 'Nome do estabelecimento.' },
    { key: 'a_empresa', label: 'a Empresa', exemplo: 'a Clínica Vida', desc: 'Nome com artigo, deduzido do próprio nome.' },
    { key: 'da_empresa', label: 'da Empresa', exemplo: 'da Clínica Vida', desc: 'de + artigo + nome.' },
    { key: 'na_empresa', label: 'na Empresa', exemplo: 'na Clínica Vida', desc: 'em + artigo + nome.' },
    { key: 'pela_empresa', label: 'pela Empresa', exemplo: 'pela Clínica Vida', desc: 'por + artigo + nome.' },
    { key: 'cidade', label: 'Cidade', exemplo: 'Uberaba', desc: 'Cidade do cadastro.' },
    { key: 'uf', label: 'UF', exemplo: 'MG', desc: 'Estado do cadastro.' },
    { key: 'segmento', label: 'Segmento', exemplo: 'Clínica odontológica', desc: 'Categoria do Google ou descrição do CNAE.' },
    { key: 'nota', label: 'Nota', exemplo: '4,8', desc: 'Nota no Google (só na busca pelo Google Maps).' },
    { key: 'avaliacoes', label: 'Avaliações', exemplo: '312', desc: 'Quantidade de avaliações no Google.' },
    { key: 'consultor', label: 'Seu nome', exemplo: 'Arthur', desc: 'Quem assina. Ajustável no estúdio, para cada pessoa usar o próprio nome.' },
    { key: 'agencia', label: 'Sua empresa', exemplo: 'Achilles Media', desc: 'Nome da agência que assina.' },
    { key: 'abordagem_padrao', label: 'Abordagem do Command', exemplo: '(texto que o sistema montou)', desc: 'A mensagem que o Command montaria para este lead. Útil para acrescentar um P.S. sem reescrever tudo.' }
  ];
  const VAR_KEYS = new Set(VARIAVEIS.map(v => v.key));

  /* Aceita os nomes com acento e os sinônimos que a gente digita sem pensar. */
  const ALIAS = {
    saudação: 'saudacao', nome: 'primeiro_nome', contato: 'primeiro_nome', 'primeiro-nome': 'primeiro_nome',
    estabelecimento: 'empresa', categoria: 'segmento', avaliações: 'avaliacoes', 'agência': 'agencia', vendedor: 'consultor'
  };
  const canon = (k) => { const s = String(k || '').trim().toLowerCase(); return ALIAS[s] || s; };

  function valores(item = {}, ctx = {}) {
    const fora = !AP.pareceBrasileiro(item);
    const idioma = fora ? (item.language || 'en') : 'pt';
    const hora = fora ? AP.localHour(item.longitude, ctx.now || new Date()) : null;
    const rating = Number(item.rating || 0);
    const reviews = Number(item.userRatingCount || 0);
    return {
      saudacao: AP.greeting(ctx.now || new Date(), idioma, hora),
      primeiro_nome: String(item.contactFirstName || '').trim(),
      empresa: String(item.name || '').trim() || 'sua empresa',
      a_empresa: comArtigo(item.name, ''),
      da_empresa: comArtigo(item.name, 'de'),
      na_empresa: comArtigo(item.name, 'em'),
      pela_empresa: comArtigo(item.name, 'por'),
      cidade: String(item.city || '').trim(),
      uf: String(item.state || '').trim(),
      segmento: String(item.category || '').trim(),
      nota: rating ? rating.toFixed(1).replace('.', ',') : '',
      avaliacoes: reviews ? reviews.toLocaleString('pt-BR') : '',
      consultor: String(ctx.consultor || '').trim() || 'Arthur',
      agencia: String(ctx.agencia || '').trim() || 'Achilles Media',
      abordagem_padrao: String(item.commandMessage || '').trim()
    };
  }

  /* --- sorteio previsível -------------------------------------------------
     As variações {a|b|c} são sorteadas por lead, mas com semente: a prévia no
     Command e a mensagem que sai no WhatsApp precisam ser a mesma frase. */
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Variação: {Oi|Olá|E aí}. Resolve de dentro para fora, então aceita
     aninhamento: {Oi|Olá{!|,}}. Chave sem barra fica como está, o que deixa
     passar um {texto} que a pessoa quis escrever literalmente. */
  function spin(text, random = Math.random) {
    let out = String(text || '');
    const re = /\{([^{}]*\|[^{}]*)\}/;
    let guard = 0;
    while (re.test(out) && guard++ < 500) {
      out = out.replace(re, (_, body) => {
        const ops = body.split('|');
        return ops[Math.floor(random() * ops.length)] ?? '';
      });
    }
    return out;
  }

  function contarVariacoes(text) {
    // Quantas mensagens diferentes o roteiro produz (sem aninhamento, que é raro).
    let total = 1;
    String(text || '').replace(/\{\{[^}]*\}\}/g, '').replace(/\{([^{}]*\|[^{}]*)\}/g, (_, b) => { total *= b.split('|').length; return ''; });
    return total;
  }

  /* Faxina depois de trocar as variáveis. Variável vazia deixa rastro:
     "Bom dia, !" vira "Bom dia!", "Olá , tudo" vira "Olá, tudo". */
  function limpar(text) {
    return String(text || '')
      .split('\n')
      .map(l => l
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/[ \t]+([,.!?;:])/g, '$1')
        .replace(/,(\s*[!?.])/g, '$1')
        .replace(/([!?.]),/g, '$1')
        .replace(/^\s*,\s*/, '')
        .trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /* Monta a mensagem final de um lead. `ctx` traz quem assina e, opcional,
     `seed` para refazer o sorteio na prévia. */
  function render(template, item = {}, ctx = {}) {
    const v = valores(item, ctx);
    // A abordagem do Command chega com {{saudacao}} ainda por resolver.
    if (v.abordagem_padrao) v.abordagem_padrao = render(v.abordagem_padrao, { ...item, commandMessage: '' }, ctx);
    const comVars = String(template || '').replace(/\{\{\s*([^}|]+?)\s*(?:\|([^}]*))?\}\}/g, (all, key, fallback) => {
      const k = canon(key);
      if (!VAR_KEYS.has(k)) return all;
      const val = v[k];
      if (val) return val;
      return fallback != null ? fallback : '';
    });
    const semente = hash(`${item.wa || item.prospectId || item.id || item.name || ''}|${template}|${ctx.seed || 0}`);
    return limpar(spin(comVars, rng(semente)));
  }

  /* Variáveis que o roteiro usa e que estão vazias para este lead. Vai para
     a prévia, para a pessoa saber antes de disparar. */
  function faltando(template, item = {}, ctx = {}) {
    const v = valores(item, ctx);
    const miss = new Set();
    String(template || '').replace(/\{\{\s*([^}|]+?)\s*(\|[^}]*)?\}\}/g, (_, key, fb) => {
      const k = canon(key);
      if (VAR_KEYS.has(k) && !v[k] && fb == null) miss.add(k);
      return '';
    });
    return [...miss];
  }

  function desconhecidas(template) {
    const out = new Set();
    String(template || '').replace(/\{\{\s*([^}|]+?)\s*(\|[^}]*)?\}\}/g, (_, key) => {
      if (!VAR_KEYS.has(canon(key))) out.add(key.trim());
      return '';
    });
    return [...out];
  }

  /* --- biblioteca --------------------------------------------------------- */
  const SEMENTES = [
    {
      name: 'Leque de soluções',
      text: [
        '{{saudacao}}, {{primeiro_nome}}! Tudo bem com você?',
        'Sou o {{consultor}}, da {{agencia}}, trabalhamos com soluções digitais para empresas aqui da região, desde sistemas e automações até presença digital. Analisando {{a_empresa}}, percebemos diversos pontos em que poderíamos colaborar na sua operação e/ou posicionamento.',
        'A ideia é entender a necessidade de vocês e mostrar o que faz sentido no caso de vocês.',
        'Consigo te apresentar brevemente?'
      ].join('\n\n')
    },
    {
      name: 'Curto e direto',
      text: [
        '{{saudacao}}, {{primeiro_nome}}! {Tudo bem?|Tudo certo?|Como vai?}',
        'Aqui é o {{consultor}}, da {{agencia}}. {Dei uma olhada {{na_empresa}}|Estive olhando {{a_empresa}}} e {anotei|separei} duas ideias {rápidas|práticas} para trazer mais clientes pelo digital.',
        '{Posso te mandar?|Te mando por aqui?}'
      ].join('\n\n')
    }
  ];

  const roteiros = {
    async list() {
      let list = await AP.store.get('roteiros', null);
      if (!Array.isArray(list)) {
        const now = Date.now();
        list = SEMENTES.map((s, i) => ({
          id: uid('r'), name: s.name, text: s.text, attachments: [], attachMode: 'after',
          color: CORES[i % CORES.length], createdAt: now + i, updatedAt: now + i
        }));
        await AP.store.set('roteiros', list);
      }
      return list;
    },
    async get(id) { return (await roteiros.list()).find(r => r.id === id) || null; },
    async save(r) {
      const list = await roteiros.list();
      const now = Date.now();
      const clean = {
        id: r.id || uid('r'),
        name: String(r.name || '').trim() || 'Roteiro sem nome',
        text: String(r.text || ''),
        attachments: (r.attachments || []).slice(0, MAX_FILES).map(a => ({ id: a.id, name: a.name, type: a.type, size: a.size })),
        attachMode: r.attachMode === 'caption' ? 'caption' : 'after',
        color: r.color || CORES.find(c => !list.some(x => x.color === c && x.id !== r.id)) || CORES[list.length % CORES.length],
        createdAt: r.createdAt || now,
        updatedAt: now
      };
      const i = list.findIndex(x => x.id === clean.id);
      if (i >= 0) list[i] = clean; else list.push(clean);
      await AP.store.set('roteiros', list);
      return clean;
    },
    async duplicate(id) {
      const r = await roteiros.get(id); if (!r) return null;
      return roteiros.save({ ...r, id: null, name: `${r.name} (cópia)`, color: null, createdAt: null });
    },
    async remove(id) {
      const list = await roteiros.list();
      const alvo = list.find(r => r.id === id);
      const resto = list.filter(r => r.id !== id);
      await AP.store.set('roteiros', resto);
      // Anexo que nenhum outro roteiro usa sai do armazenamento junto.
      const emUso = new Set(resto.flatMap(r => (r.attachments || []).map(a => a.id)));
      for (const a of (alvo && alvo.attachments) || []) if (!emUso.has(a.id)) await files.remove(a.id);
    },
    /* Exporta com os anexos embutidos, para passar a biblioteca inteira para
       outra pessoa num arquivo só. */
    async exportar(ids) {
      const list = (await roteiros.list()).filter(r => !ids || ids.includes(r.id));
      const anexos = {};
      for (const r of list) for (const a of r.attachments || []) {
        if (!anexos[a.id]) { const f = await files.get(a.id); if (f) anexos[a.id] = f; }
      }
      return { formato: 'achilles-prospecta/roteiros', versao: 1, exportadoEm: new Date().toISOString(), roteiros: list, anexos };
    },
    async importar(pacote) {
      if (!pacote || !Array.isArray(pacote.roteiros)) throw new Error('Arquivo não é uma biblioteca de roteiros do Prospecta.');
      const atuais = await roteiros.list();
      const nomes = new Set(atuais.map(r => r.name));
      let n = 0;
      for (const r of pacote.roteiros) {
        const mapa = [];
        for (const a of r.attachments || []) {
          const f = pacote.anexos && pacote.anexos[a.id];
          if (f && f.data) mapa.push(await files.putData({ name: f.name, type: f.type, size: f.size, data: f.data }));
        }
        let name = String(r.name || 'Roteiro importado');
        while (nomes.has(name)) name = `${name} (importado)`;
        nomes.add(name);
        await roteiros.save({ name, text: r.text, attachMode: r.attachMode, attachments: mapa });
        n++;
      }
      return n;
    }
  };

  /* --- anexos --------------------------------------------------------------
     Ficam no chrome.storage como data URL (a extensão pede unlimitedStorage).
     IndexedDB seria mais leve, mas cada contexto (WhatsApp, Command, estúdio)
     enxergaria um banco diferente, e o anexo precisa estar nos três. */
  const files = {
    async put(file) {
      if (file.size > MAX_FILE) throw new Error(`${file.name} passa de 15 MB, o limite do WhatsApp para mídia.`);
      const data = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = () => rej(new Error(`Não consegui ler ${file.name}.`));
        fr.readAsDataURL(file);
      });
      return files.putData({ name: file.name, type: file.type || 'application/octet-stream', size: file.size, data });
    },
    async putData({ name, type, size, data }) {
      const id = uid('f');
      await AP.store.set(`file:${id}`, { name, type, size, data });
      return { id, name, type, size };
    },
    async get(id) { return AP.store.get(`file:${id}`, null); },
    async remove(id) { await chrome.storage.local.remove(`file:${id}`); },
    async toFile(meta) {
      const f = await files.get(meta.id);
      if (!f) return null;
      const res = await fetch(f.data);
      const blob = await res.blob();
      return new File([blob], f.name, { type: f.type || blob.type });
    },
    kind(meta = {}) {
      const t = String(meta.type || '');
      if (t.startsWith('image/')) return 'imagem';
      if (t.startsWith('video/')) return 'vídeo';
      if (t.startsWith('audio/')) return 'áudio';
      if (t === 'application/pdf') return 'PDF';
      return 'arquivo';
    },
    size(bytes) {
      const b = Number(bytes || 0);
      if (b < 1024) return `${b} B`;
      if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
      return `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
    }
  };

  /* --- quem assina ---------------------------------------------------------
     O Command manda o nome configurado lá. O estúdio pode sobrescrever, que é
     o caso de outra pessoa usando a mesma conta do Command. */
  async function remetente(doCommand = {}) {
    const s = await AP.store.get('sender', {});
    return {
      consultor: String(s.consultor || '').trim() || String(doCommand.consultor || '').trim() || 'Arthur',
      agencia: String(s.agencia || '').trim() || String(doCommand.agencia || '').trim() || 'Achilles Media'
    };
  }

  /* --- distribuição --------------------------------------------------------
     A lista chega ordenada por oportunidade. Distribuir alternando
     (A, B, A, B...) dá a cada roteiro leads de score parecido; sortear
     poderia jogar os melhores leads todos num roteiro só e decidir o teste
     por sorte. */
  function distribuir(n, variantes) {
    const v = variantes.filter(Boolean);
    if (!v.length) return [];
    return Array.from({ length: n }, (_, i) => v[i % v.length]);
  }

  /* --- registro de envios e respostas -------------------------------------- */
  const tail8 = (d) => String(d || '').replace(/\D/g, '').slice(-8);

  /* Leitura e escrita do registro em fila única: o laço de envio e a
     varredura de respostas rodam no mesmo script e gravariam um por cima do
     outro. */
  let trava = Promise.resolve();
  const serial = (fn) => { const p = trava.then(fn, fn); trava = p.catch(() => {}); return p; };

  const JANELA = 30 * 864e5;     // resposta depois de 30 dias já é outra conversa
  const RAPIDA = 90 * 1000;      // abaixo disso é quase sempre a saudação automática do WhatsApp Business

  const log = {
    async all() { return AP.store.get('sendLog', []); },
    add(e) {
      return serial(async () => {
        const l = await log.all();
        l.push({ id: uid('e'), at: Date.now(), replied: false, repliedAt: null, ...e });
        await AP.store.set('sendLog', l.slice(-LOG_MAX));
      });
    },
    /* Recebe o que a tela do WhatsApp mostra sobre um número (mensagens não
       lidas na lista, mensagens recebidas na conversa aberta) e decide se
       isso é uma resposta. Vale o envio mais recente para aquele número.

       A primeira mensagem que chega rápido demais vira "rápida": provável
       resposta automática, fora do placar. Ela vira resposta de verdade quando
       chega mais alguma coisa depois de um minuto. */
    observar(digits, sinal = {}, agora = Date.now()) {
      return serial(async () => {
        const key = tail8(digits);
        if (key.length < 8) return null;
        const l = await log.all();
        let e = null;
        for (let i = l.length - 1; i >= 0; i--) {
          if (l[i].at < agora - JANELA) break;
          if (tail8(l[i].wa) === key) { e = l[i]; break; }
        }
        if (!e) return null;
        const unread = sinal.unread == null ? null : Number(sinal.unread);
        const incoming = sinal.incoming == null ? null : Number(sinal.incoming);
        const antes = e.seen || { unread: null, incoming: null };
        const salvar = async () => { await AP.store.set('sendLog', l); };

        if (!e.replied) {
          const respondeu = (unread != null && unread > 0) || (incoming != null && incoming > 0);
          if (!respondeu) return null;
          e.replied = true; e.repliedAt = agora; e.repliedHow = 'auto';
          e.quick = agora - e.at < RAPIDA;
          e.seen = { unread, incoming };
          await salvar();
          return { entry: e, novo: true };
        }

        if (e.quick && e.repliedHow === 'auto') {
          const passou = agora - e.repliedAt > 60 * 1000;
          // Chegou mais coisa: o não lido subiu, voltou a aparecer depois de
          // lido, ou a conversa aberta tem mais mensagens recebidas.
          const mais = (unread != null && unread > 0 && (antes.unread == null || antes.unread === 0 || unread > antes.unread))
            || (incoming != null && antes.incoming != null && incoming > antes.incoming);
          if (passou && mais) {
            e.quick = false; e.repliedAt = agora;
            e.seen = { unread, incoming };
            await salvar();
            return { entry: e, novo: true };
          }
        }

        // Guarda o último estado visto, sem regravar quando nada mudou.
        const novoSeen = { unread: unread != null ? unread : antes.unread, incoming: incoming != null ? incoming : antes.incoming };
        if (novoSeen.unread !== antes.unread || novoSeen.incoming !== antes.incoming) { e.seen = novoSeen; await salvar(); }
        return null;
      });
    },
    toggle(id) {
      return serial(async () => {
        const l = await log.all();
        const e = l.find(x => x.id === id); if (!e) return null;
        if (e.replied && e.quick) { e.quick = false; }        // automática que era gente de verdade
        else { e.replied = !e.replied; e.quick = false; }
        e.repliedAt = e.replied ? Date.now() : null; e.repliedHow = 'manual';
        await AP.store.set('sendLog', l);
        return e;
      });
    },
    async pendentesOuRapidas(agora = Date.now()) {
      return (await log.all()).filter(e => e.at >= agora - JANELA && (!e.replied || (e.quick && e.repliedHow === 'auto')));
    },
    limpar(scriptId) {
      return serial(async () => {
        const l = await log.all();
        await AP.store.set('sendLog', scriptId ? l.filter(e => (e.scriptId || COMMAND_ID) !== scriptId) : []);
      });
    }
  };

  /* --- estatística do teste ------------------------------------------------
     Taxa de resposta por roteiro e a confiança de que o líder é melhor que o
     segundo (teste de duas proporções). Com amostra pequena a resposta
     honesta é "ainda não dá para saber", e é isso que o estúdio mostra. */
  function phi(z) {
    // Aproximação de Abramowitz-Stegun para a normal acumulada.
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
  }

  function confianca(a, b) {
    if (!a.sent || !b.sent) return null;
    const p1 = a.replied / a.sent, p2 = b.replied / b.sent;
    const p = (a.replied + b.replied) / (a.sent + b.sent);
    const se = Math.sqrt(p * (1 - p) * (1 / a.sent + 1 / b.sent));
    if (!se) return p1 === p2 ? 0.5 : (p1 > p2 ? 1 : 0);
    return phi((p1 - p2) / se);
  }

  function estatisticas(entries, lista = [], desde = 0) {
    const nomes = new Map(lista.map(r => [r.id, r]));
    const por = new Map();
    for (const e of entries) {
      if (desde && e.at < desde) continue;
      const id = e.scriptId || COMMAND_ID;
      if (!por.has(id)) {
        const r = nomes.get(id);
        por.set(id, { id, name: r ? r.name : (id === COMMAND_ID ? COMMAND_NAME : (e.scriptName || 'Roteiro removido')), color: r ? r.color : (id === COMMAND_ID ? '#b9b2a3' : '#5d564b'), sent: 0, replied: 0, removed: !r && id !== COMMAND_ID });
      }
      const s = por.get(id);
      s.sent++;
      if (e.replied && !e.quick) s.replied++;
      if (e.replied && e.quick) s.automaticas = (s.automaticas || 0) + 1;
    }
    const rows = [...por.values()].map(s => ({ ...s, rate: s.sent ? s.replied / s.sent : 0 }))
      .sort((a, b) => b.rate - a.rate || b.sent - a.sent);
    let veredito = null;
    if (rows.length >= 2) {
      const [a, b] = rows;
      const c = confianca(a, b);
      const minimo = Math.min(a.sent, b.sent);
      veredito = {
        lider: a, segundo: b, confianca: c, minimo,
        texto: c == null ? '' :
          minimo < 20 ? `Amostra pequena: ${minimo} envio(s) no roteiro com menos dados. Com menos de 20 por roteiro qualquer diferença ainda é sorte.` :
          c >= 0.95 ? `${a.name} responde mais que ${b.name}, com ${Math.min(99, Math.round(c * 100))}% de confiança. Dá para adotar.` :
          c >= 0.8 ? `${a.name} está na frente (${Math.min(99, Math.round(c * 100))}% de confiança). Vale mais uma rodada antes de decidir.` :
          `Empate técnico: a diferença entre ${a.name} e ${b.name} ainda cabe no acaso.`
      };
    }
    return { rows, veredito, total: rows.reduce((n, r) => n + r.sent, 0), respostas: rows.reduce((n, r) => n + r.replied, 0) };
  }

  Object.assign(AP, {
    COMMAND_ID, COMMAND_NAME, CORES, MAX_FILE, MAX_FILES,
    uid, nameArticle, comArtigo, VARIAVEIS, valores, spin, contarVariacoes, limpar, render, faltando, desconhecidas,
    roteiros, files, remetente, distribuir, log, estatisticas, confianca, tail8
  });
})();
