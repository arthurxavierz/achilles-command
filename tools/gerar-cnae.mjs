/* ==========================================================================
   Gera assets/cnae.json a partir da tabela CNAE 2.3 do IBGE.

   Rode com `node tools/gerar-cnae.mjs` na raiz do projeto. O IBGE muda a
   tabela de tempos em tempos; regerar é a forma de atualizar o extrator.

   Além do código e da descrição, cada subclasse ganha uma lista de apelidos e
   um rótulo de exibição (`r`), que é o apelido principal já acentuado — o que
   entra nas mensagens de abordagem.
   Motivo: a descrição oficial é jurídica, não é como as pessoas falam. Quem
   quer prospectar pet shop procura "pet shop", não "comércio varejista de
   animais vivos e de artigos e alimentos para animais de estimação"; quem
   quer clínica procura "clínica", e a palavra aparece em duas subclasses das
   1.332. Os apelidos são um índice de busca extra — a base continua inteira,
   ninguém fica de fora por não estar nesta lista.
   ========================================================================== */

import { writeFileSync } from 'node:fs';

const titleCase = (s = '') => String(s)
  .toLocaleLowerCase('pt-BR')
  .replace(/(^|[\s(\-\/])([a-zà-ú])/g, (m, p, c) => p + c.toLocaleUpperCase('pt-BR'))
  .replace(/\b(De|Da|Do|Das|Dos|E|Em|Para|Por|Com|A|O|As|Os|Ao|Aos|Na|No|Nas|Nos|Sob|Sem)\b/g, m => m.toLocaleLowerCase('pt-BR'))
  .replace(/^./, c => c.toLocaleUpperCase('pt-BR'));

/* Apelido -> o que a descrição oficial precisa conter para receber aquele
   apelido. Cada entrada é conferida no fim do script: apelido que não casa
   com nenhuma subclasse aparece no aviso, em vez de morrer em silêncio. */
const APELIDOS = {
  'clinica': /atividade m[ée]dica|cl[íi]nic|ambulatori|pronto.socorro|unidades? de atendimento/i,
  'consultorio': /atividade m[ée]dica|atividade odontol/i,
  'medico': /atividade m[ée]dica|ambulatori/i,
  'dentista': /odontol[óo]gica/i,
  'odontologia': /odontol[óo]gica/i,
  'fisioterapia': /fisioterapia/i,
  'psicologia': /psicolog|psicanal/i,
  'nutricionista': /nutri..o|nutricion/i,
  'laboratorio': /laborat[óo]rios? cl[íi]nicos|an[áa]lises cl[íi]nicas|laborat[óo]rios? de/i,
  'hospital': /hospitalar/i,
  'veterinario': /veterin[áa]ri/i,
  'pet shop': /animais de estima..o|veterin[áa]ri|higiene e embelezamento de animais/i,
  'farmacia': /farmac[êe]uticos para uso humano|manipula..o de f[óo]rmulas/i,
  'otica': /artigos de [óo]ptica/i,
  'academia': /condicionamento f[íi]sico|esporte/i,
  'personal trainer': /condicionamento f[íi]sico|ensino de esportes/i,
  'estetica': /est[ée]tica|cuidados com a beleza/i,
  'salao de beleza': /cabeleireiros|est[ée]tica|cuidados com a beleza/i,
  'cabeleireiro': /cabeleireiros/i,
  'barbearia': /cabeleireiros/i,
  'manicure': /cabeleireiros/i,
  'tatuagem': /tatuagem/i,
  'restaurante': /restaurantes e similares|servi..es? ambulantes de alimenta..o|fornecimento de alimentos/i,
  'lanchonete': /lanchonetes/i,
  'pizzaria': /restaurantes e similares/i,
  'bar': /bares e outros estabelecimentos/i,
  'cafeteria': /lanchonetes/i,
  'padaria': /padaria|panifica..o/i,
  'confeitaria': /confeitaria|doces e balas/i,
  'sorveteria': /sorvetes/i,
  'acai': /sorvetes|lanchonetes/i,
  'food truck': /ambulantes de alimenta..o/i,
  'buffet': /servi..es? de alimenta..o para eventos|cantinas/i,
  'hotel': /hot[ée]is/i,
  'pousada': /hot[ée]is|alojamento/i,
  'oficina mecanica': /repara..o mec[âa]nica de ve[íi]culos/i,
  'oficina': /repara..o .* ve[íi]culos automotores|funilaria|manuten..o e repara..o de motocicletas/i,
  'auto center': /repara..o .* ve[íi]culos automotores|pneum[áa]ticos/i,
  'funilaria': /funilaria/i,
  'lava jato': /lava.jato|lavagem, lubrifica..o/i,
  'autopecas': /pe.as e acess[óo]rios (novos|usados|novos e usados) para ve[íi]culos|pneum[áa]ticos e c[âa]maras/i,
  'concessionaria': /com[ée]rcio .* autom[óo]veis|caminhonetas e utilit[áa]rios/i,
  'moto': /motocicletas/i,
  'imobiliaria': /im[óo]veis/i,
  'corretor de imoveis': /corretagem .* im[óo]veis/i,
  'construtora': /constru..o de edif[íi]cios|incorpora..o de empreendimentos/i,
  'arquitetura': /arquitetura/i,
  'engenharia': /engenharia/i,
  'reforma': /obras de alvenaria|reforma|acabamento/i,
  'marcenaria': /m[óo]veis .* madeira|marcenaria|esquadrias de madeira/i,
  'serralheria': /esquadrias de metal|serralheria/i,
  'vidracaria': /vidros|vidra..ari/i,
  'advogado': /advocat[íi]cios|auxiliares da justi.a/i,
  'advocacia': /advocat[íi]cios/i,
  'contabilidade': /contabilidade|auditoria/i,
  'contador': /contabilidade/i,
  'consultoria': /consultoria em gest[ãa]o/i,
  'marketing': /publicidade|marketing|pesquisas de mercado/i,
  'publicidade': /publicidade|ag[êe]ncias? de propaganda/i,
  'agencia de marketing': /publicidade|ag[êe]ncias? de propaganda/i,
  'design': /design/i,
  'software': /software|desenvolvimento .* programas|sistemas? de computa..o/i,
  'ti': /software|suporte t[ée]cnico|consultoria em tecnologia/i,
  'escola': /ensino fundamental|ensino m[ée]dio|educa..o infantil/i,
  'curso': /cursos|ensino profissional|treinamento/i,
  'idiomas': /idiomas/i,
  'autoescola': /forma..o de condutores|cursos de pilotagem/i,
  'creche': /educa..o infantil|creche/i,
  'faculdade': /educa..o superior/i,
  'loja de roupas': /vestu[áa]rio e acess[óo]rios/i,
  'calcados': /cal.ados/i,
  'joalheria': /j[óo]ias|bijuteria|rel[óo]gios/i,
  'papelaria': /papelaria|artigos de escrit[óo]rio/i,
  'material de construcao': /material de constru..o|ferragens/i,
  'supermercado': /supermercados|minimercados|mercearias/i,
  'mercado': /supermercados|minimercados|mercearias/i,
  'distribuidora': /com[ée]rcio atacadista/i,
  'atacado': /com[ée]rcio atacadista/i,
  'transportadora': /transporte rodovi[áa]rio de carga/i,
  'logistica': /armazenamento|log[íi]stica|operador de transporte/i,
  'mudanca': /mudan.as/i,
  'limpeza': /limpeza em pr[ée]dios|limpeza/i,
  'seguranca': /vigil[âa]ncia|seguran..a|sistemas de seguran..a/i,
  'dedetizadora': /imuniza..o e controle de pragas/i,
  'jardinagem': /paisag[íi]stico|jardin/i,
  'energia solar': /energia el[ée]trica|instala..es? el[ée]tricas/i,
  'ar condicionado': /ar.condicionado|climatiza..o|refrigera..o/i,
  'assistencia tecnica': /repara..o e manuten..o de equipamentos|manuten..o de aparelhos/i,
  'celular': /telefonia|equipamentos de telefonia/i,
  'informatica': /equipamentos de inform[áa]tica/i,
  'grafica': /impress[ãa]o|servi..os? de pr[ée].impress[ãa]o|gr[áa]fic/i,
  'fotografia': /fotogr[áa]fic/i,
  'eventos': /eventos|feiras|congressos/i,
  'festas': /eventos|casas de festas|aluguel de/i,
  'turismo': /ag[êe]ncias de viagens|turismo/i,
  'viagens': /ag[êe]ncias de viagens|operadores tur[íi]sticos/i,
  'seguros': /seguros|corretores e agentes de seguros/i,
  'financeira': /cr[ée]dito|financeir/i,
  'despachante': /despachantes/i,
  'funeraria': /funer[áa]ri/i,
  'igreja': /organiza..es religiosas/i,
  'lavanderia': /lavanderia|tinturaria/i,
  'chaveiro': /chaveiro/i,
  'costura': /costura|confec..o .* vestu[áa]rio/i,
  'floricultura': /flores|plantas ornamentais/i,
  'agropecuaria': /agropecu[áa]ri|insumos agr[íi]colas|defensivos/i,
  'posto de combustivel': /combust[íi]veis para ve[íi]culos/i,
  'estacionamento': /estacionamento/i,
  'coworking': /escrit[óo]rio virtual|aluguel de .* comerciais/i
};

/* Os apelidos acima são chaves de busca, então vivem sem acento — quem digita
   "clinica" precisa achar. Mas o mesmo termo vai para dentro de uma mensagem
   de WhatsApp ("quem procura clínica na região"), e aí acento faz falta.
   Este mapa dá a forma de exibição; o que não está aqui já está apresentável. */
const ROTULOS = {
  'clinica': 'clínica', 'consultorio': 'consultório', 'medico': 'médico',
  'laboratorio': 'laboratório', 'veterinario': 'veterinário', 'farmacia': 'farmácia',
  'otica': 'ótica', 'estetica': 'estética', 'salao de beleza': 'salão de beleza',
  'acai': 'açaí', 'oficina mecanica': 'oficina mecânica', 'autopecas': 'autopeças',
  'concessionaria': 'concessionária', 'imobiliaria': 'imobiliária',
  'corretor de imoveis': 'corretor de imóveis', 'vidracaria': 'vidraçaria',
  'grafica': 'gráfica', 'logistica': 'logística', 'mudanca': 'mudança',
  'seguranca': 'segurança', 'informatica': 'informática',
  'assistencia tecnica': 'assistência técnica', 'calcados': 'calçados',
  'material de construcao': 'material de construção', 'funeraria': 'funerária',
  'agropecuaria': 'agropecuária', 'posto de combustivel': 'posto de combustível',
  'agencia de marketing': 'agência de marketing', 'ti': 'TI'
};

const rotuloDe = termo => ROTULOS[termo] || termo;

const res = await fetch('https://servicodados.ibge.gov.br/api/v2/cnae/subclasses');
if (!res.ok) throw new Error(`IBGE respondeu ${res.status}`);
const data = await res.json();

const usados = new Map(Object.keys(APELIDOS).map(k => [k, 0]));

const rows = data
  .map(s => {
    const classe = s.classe || {};
    const grupo = classe.grupo || {};
    const divisao = grupo.divisao || {};
    const secao = divisao.secao || {};
    const descricao = String(s.descricao || '');

    const apelidos = [];
    for (const [termo, re] of Object.entries(APELIDOS)) {
      if (re.test(descricao)) {
        apelidos.push(termo);
        usados.set(termo, usados.get(termo) + 1);
      }
    }

    return {
      id: String(s.id).replace(/\D/g, '').padStart(7, '0'),
      d: titleCase(descricao),
      s: titleCase(secao.descricao || ''),
      ...(apelidos.length ? { a: apelidos.join(' '), r: rotuloDe(apelidos[0]) } : {})
    };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

writeFileSync('assets/cnae.json', JSON.stringify({
  versao: 'CNAE 2.3 / IBGE',
  geradoEm: new Date().toISOString().slice(0, 10),
  total: rows.length,
  subclasses: rows
}));

const orfaos = [...usados].filter(([, n]) => n === 0).map(([t]) => t);
console.log(`subclasses: ${rows.length}`);
console.log(`com apelido: ${rows.filter(r => r.a).length}`);
if (orfaos.length) console.warn(`AVISO — apelidos sem nenhuma subclasse: ${orfaos.join(', ')}`);
