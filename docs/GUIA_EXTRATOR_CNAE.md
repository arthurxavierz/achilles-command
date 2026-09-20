# Extrator por CNAE — captação pelo cadastro da Receita

A aba **Captação** passou a ter duas origens. Você escolhe no topo da tela:

| Origem | De onde vem | Serve para |
| --- | --- | --- |
| **Google Maps** | Places API | Quem tem perfil público, com nota e avaliações. É o que já existia. |
| **CNAE / Receita** | Cadastro público de CNPJ | Quem existe formalmente, filtrado por atividade, estado e data de abertura. |

São recortes diferentes do mesmo mercado. O Google encontra quem cuida da presença digital; o extrator encontra também quem não cuida — que costuma ser exatamente o cliente da Achilles.

Depois de importar, **as duas origens viram a mesma coisa**: cards na captação, com abordagem editável, botão de WhatsApp, envio para o CRM e a ponte para a extensão Prospecta. Nada foi reescrito, só ganhou uma segunda porta de entrada.

---

## 1. O que você precisa fazer antes de usar

Três passos. Sem eles a aba abre, mas a busca devolve um aviso em vez de empresas.

### Passo 1 — Rodar a migração no Supabase

No painel do Supabase, **SQL Editor**, cole e execute:

```text
supabase/migration_2026_09_19_extrator_cnae.sql
```

Ela cria a tabela `prospect_lists` (as listas nomeadas) e adiciona em `prospects` os campos que só existem no cadastro da Receita: CNPJ, CNAE, cidade, UF, data de abertura e qualidade do telefone.

Tem também um índice que impede o mesmo CNPJ virar dois contatos na sua organização.

### Passo 2 — Contratar o acesso ao cadastro de CNPJ

O extrator consulta o **CNPJá** (`cnpja.com`). É o provedor usado porque é o único que, numa chamada só, filtra por CNAE + UF + cidade + data de abertura **e já devolve o telefone junto**. Os concorrentes devolvem só a lista de CNPJs, e aí seria preciso uma consulta paga por empresa para descobrir o contato — muito mais caro.

1. Crie a conta em `cnpja.com`.
2. Assine um plano que inclua a **Pesquisa CNPJ** (o endpoint de listagem). A consulta avulsa por CNPJ, sozinha, não serve.
3. Copie o token da área de API.

Sobre custo: a cobrança é por registro lido, então **o campo "Limite" da tela é o seu controle de gasto**. Comece em 50 ou 100 para calibrar o filtro, e só suba o limite quando a prévia estiver vindo com a cara certa. Uma busca de limite 500 lê 500 registros mesmo que você importe 12.

### Passo 3 — Cadastrar o token no Netlify

Em **Site settings → Environment variables**:

```text
CNPJA_TOKEN = o token copiado
```

Depois **faça um novo deploy** — variável nova só entra no ar em um build novo.

O token fica só no servidor. Quem consulta o CNPJá é a Function `cnae-search.mjs`; o navegador nunca vê a chave.

---

## 2. Como usar no dia a dia

### CNAE ou atividade

Digite como você fala: `clínica`, `pet shop`, `oficina`, `restaurante`, `advogado`, `salão de beleza`, `autoescola`. Também aceita o código direto, se você já souber.

A base é a **CNAE 2.3 completa do IBGE — 1.332 subclasses**, em `assets/cnae.json`. Como a descrição oficial é jurídica ("comércio varejista de animais vivos e de artigos e alimentos para animais de estimação"), cada subclasse recebeu apelidos populares para que a busca funcione com a palavra que você usaria. A lista de apelidos é só um atalho de busca: nenhuma subclasse fica escondida por não estar nela.

Marque quantos CNAEs quiser. Ao escolher, a janela de sugestões fecha e o campo esvazia, para você marcar o próximo sem cliques extras.

### Estados e cidades

Estado é obrigatório, cidade não. **Sem cidade, a busca cobre o estado inteiro.** As sugestões de cidade vêm do IBGE e respeitam os estados já escolhidos. Se você tirar o estado, as cidades daquele estado saem junto — cidade sem estado é um filtro que mente.

### Período de abertura

"Aberta a partir de" e "aberta até". Serve para dois recortes bem diferentes:

- **Empresa nova** (últimos 1–2 anos): ainda está montando presença, costuma precisar de site e posicionamento.
- **Empresa antiga** (8 anos ou mais): já tem operação rodando, costuma precisar de automação e sistema.

O score do extrator já leva isso em conta na hora de sugerir o melhor encaixe.

### As quatro chaves

- **Somente empresas ativas** — deixe ligado. Empresa baixada não compra.
- **Somente com telefone** — deixe ligado. Sem contato, o lead não serve para abordagem.
- **Somente celular** — o corte mais duro e o mais útil: fixo não abre conversa no WhatsApp.
- **Incluir CNAE secundário** — amplia bastante o resultado. Uma empresa registrada como comércio mas que também presta o serviço que você procura aparece aqui.

### A prévia

A busca **não importa nada**. Ela mostra uma tabela para você revisar, com empresa, CNPJ, cidade, CNAE, telefone, abertura e score.

Cada telefone recebe uma etiqueta:

| Etiqueta | O que significa |
| --- | --- |
| **Celular · candidato a WhatsApp** | Número de celular. É o que dá para abordar. |
| **Possível fixo** | Número fixo. Não abre conversa no WhatsApp. |
| **Telefone incompleto** | Número com quantidade de dígitos fora do padrão. |
| **Sem telefone** | Não entra na importação. |

Empresa que você já tem no Achilles aparece marcada com **"Já está no Achilles"** — dá para desmarcar antes de importar, e mesmo se esquecer, a importação não duplica.

Quem tem celular já vem pré-marcado. O resto é decisão sua.

### Nomear e importar

Dê um nome à lista (tem um sugerido, do tipo `Atividade Médica Ambulatorial · Uberaba · 2026-09-19`) e clique em **Importar para a captação**.

O que acontece: os selecionados viram contatos na captação e a lista fica registrada.

O que **não** acontece, de propósito:

- nenhuma mensagem é enviada;
- nenhum lead entra no CRM;
- ninguém é marcado como abordado.

Abordar continua sendo um clique seu, empresa por empresa, como já era.

### Listas importadas

Abaixo do extrator ficam todas as listas, com quantos contatos têm, quantos foram abordados e quantos já viraram lead no CRM.

- **Abrir na captação** carrega aquela lista nos cards.
- **Excluir** pede confirmação e avisa quantos contatos vão sair. Quem já virou lead **continua no CRM** — apagar a lista não apaga o trabalho comercial já feito.

---

## 3. Sobre o telefone: leia antes de escalar volume

O telefone vem do cadastro da Receita Federal. A Receita informa o número que a empresa declarou. **Ela não informa se aquele número tem WhatsApp ativo.**

Por isso a interface fala em *candidato a WhatsApp*, nunca em WhatsApp confirmado. Um celular com o formato certo é uma boa aposta, não uma certeza.

Confirmar de verdade exige uma API de validação de WhatsApp à parte, com custo por número. Vale a pena quando o volume justificar; não vale para 20 contatos por dia.

Outros cuidados que valem desde já:

- Telefone de cadastro público é ponto de partida, não autorização. Abordagem comercial fria pede contexto e uma saída fácil para quem não quer receber.
- Quem pedir para não receber mais precisa ser marcado e nunca mais abordado.
- Volume alto em número novo queima o número. O caminho é começar baixo e subir devagar.
- Confira os termos vigentes do CNPJá e do WhatsApp antes de aumentar a escala.

---

## 4. O score do extrator

O score do Google Places usa nota e avaliações. O extrator não tem nenhuma das duas, então usa o que existe no cadastro: o CNAE, o porte, o tempo de atividade e a qualidade do contato.

É uma **estimativa de encaixe comercial**, não um retrato da empresa. Serve para ordenar a lista, não para decidir sozinha.

Uma diferença importante em relação ao Google: o card de um contato vindo do extrator diz **"Site não verificado"**, e não "sem site". A Receita simplesmente não guarda esse campo — ninguém procurou o site dessa empresa. Pela mesma razão, a abordagem gerada para esses contatos usa o discurso equilibrado, e não o de "vi que vocês não têm site": seria afirmar algo que não foi conferido.

---

## 5. Conferindo que está tudo certo

Dois testes acompanham o código.

```bash
# Function de extração. Não precisa instalar nada nem estar online.
node tools/testar-cnae-search.mjs

# Interface completa. Precisa do jsdom uma vez: npm install jsdom
node tools/testar-extrator-ui.mjs
```

O segundo percorre o caminho inteiro num DOM simulado e verifica, entre outras coisas, as três regras que não podem quebrar: importar não cria lead no CRM, não marca ninguém como abordado, e reimportar a mesma busca não duplica contato.

Checklist manual, na primeira vez:

1. Abra Captação e troque para **CNAE / Receita**.
2. Digite `clínica` e confirme que aparecem sugestões com código e descrição.
3. Marque um CNAE, deixe MG, sem cidade.
4. Limite 50, somente ativas, somente com telefone.
5. Busque e confira que a prévia traz CNPJ, cidade e etiqueta de telefone.
6. Desmarque tudo e confirme que **Importar** fica bloqueado.
7. Marque 2 ou 3, dê um nome à lista e importe.
8. Confirme que os cards apareceram e que **nenhum lead novo** surgiu no CRM.
9. Abra o WhatsApp de um contato **seu** antes de abordar qualquer empresa de verdade.

---

## 6. O que ficou para depois

O material do curso descreve um sistema completo de disparo cadenciado: fila, chips, limites diários, aquecimento de número, variações de mensagem, webhook de resposta e painel de eventos. Isso é uma construção grande e com risco operacional próprio — número bloqueado é prejuízo direto.

O que existe hoje no Achilles e já cobre parte disso:

- **Extrator + listas nomeadas** — este documento.
- **Abordagem editável por contato**, com geração pelo Claude — já existia.
- **Extensão Prospecta**, que monta a fila de abordagem a partir da lista visível na captação — já existia, e agora recebe também os contatos vindos do extrator, sem nenhuma mudança.
- **`netlify/functions/whatsapp-send.mjs`**, pronta para a Cloud API e desligada por padrão.
- **`supabase/schema.sql`** já tem a tabela `message_queue`.

A ordem que faz sentido a partir daqui, uma etapa por vez:

1. **Usar o extrator por algumas semanas** com volume baixo e abordagem manual. É o que diz se o filtro de CNAE está trazendo o cliente certo — e isso importa mais que qualquer automação.
2. **Cadência de mensagens**: variações de abordagem e follow-up programado, ainda com envio manual.
3. **Fila com limite diário e intervalo**, usando a `message_queue` que já existe.
4. **Controle de chips e aquecimento**, só quando o volume justificar mais de um número.
5. **Webhook de resposta**, para a conversa voltar sozinha para o CRM.

Automatizar o disparo antes de validar o filtro é o caminho mais rápido para queimar número mandando mensagem para a lista errada.
