# Extrator por CNAE, captação pelo cadastro da Receita

A aba **Captação** passou a ter duas origens. Você escolhe no topo da tela:

| Origem | De onde vem | Serve para |
| --- | --- | --- |
| **Google Maps** | Places API | Quem tem perfil público, com nota e avaliações. É o que já existia. |
| **CNAE / Receita** | Cópia própria do cadastro público de CNPJ | Quem existe formalmente, filtrado por atividade, estado e data de abertura. Sem custo por busca. |

São recortes diferentes do mesmo mercado. O Google encontra quem cuida da presença digital; o extrator encontra também quem não cuida, que costuma ser exatamente o cliente da Achilles.

Depois de importar, **as duas origens viram a mesma coisa**: cards na captação, com abordagem editável, botão de WhatsApp, envio para o CRM e a ponte para a extensão Prospecta. Nada foi reescrito, só ganhou uma segunda porta de entrada.

---

## 1. O que você precisa fazer antes de usar

O extrator lê uma **cópia própria** do cadastro da Receita, guardada no seu Supabase. Você baixa a base uma vez, atualiza uma vez por mês, e a partir daí busca à vontade sem pagar por consulta.

### Passo 1, Rodar as duas migrações no Supabase

No painel do Supabase, **SQL Editor**, nesta ordem:

```text
supabase/migration_2026_09_19_extrator_cnae.sql   listas nomeadas e campos de CNPJ nos prospects
supabase/migration_2026_09_20_base_cnpj.sql       a base própria de CNPJ
supabase/migration_2026_09_21_responsavel.sql     nome de quem assina pela empresa
```

A segunda cria `cnpj_estabelecimentos`, `cnpj_empresas` e a visão `cnpj_busca`, que junta as duas. Leitura é liberada para quem está logado no Command; escrita, só para o carregador.

### Passo 2, Carregar a base

Você **não precisa baixar nada à mão**. O carregador busca os arquivos na Receita, lê e guarda só o que passa no filtro.

Cada arquivo é baixado para uma pasta de cache (`.cache-receita`) e apagado assim que é lido, então o pico de disco é o maior arquivo, 2,1 GB, e não os 5 GB somados. Use `--manter` se quiser guardar os ZIPs para a próxima vez.

**O download é retomável.** Numa baixada de 5 GB a conexão cai, e quando cai ele continua de onde parou em vez de recomeçar, tentando até 8 vezes. Se mesmo assim o comando morrer, rodar de novo é barato: o que já estiver inteiro no cache não é baixado outra vez, e o que já foi gravado no banco é regravado por cima sem duplicar.

Antes, as duas variáveis de ambiente (as mesmas do Netlify). No PowerShell:

```powershell
$env:SUPABASE_URL="https://SEU-PROJETO.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."
```

A `service_role` é a chave de servidor. Ela só é usada aqui, no seu computador, e nunca vai para o navegador.

Depois:

```bash
# 1. Mede quanto seria importado. Não grava nada. Rode primeiro.
node tools/carregar-base-cnpj.mjs --contar

# 2. Ver funcionando em poucos minutos, com 1 dos 10 arquivos.
node tools/carregar-base-cnpj.mjs --contar --arquivos 1

# 3. Carregar de verdade. Reserve algumas horas.
node tools/carregar-base-cnpj.mjs --carregar
```

O padrão é **MG, GO e DF**, somente empresas ativas, somente prováveis celulares, e restrito aos 405 CNAEs de negócio local.

Medido numa carga real da competência 2026-09:

| | |
| --- | --- |
| Empresas | **1.797.165** (MG 1.141.156 · GO 454.461 · DF 201.548) |
| Razões sociais | 1.782.171 |
| Tempo | ~65 min |
| Espaço no banco | **~1,1 GB** |

**Esse 1,1 GB não cabe no plano gratuito do Supabase, que são 500 MB.** Confira o espaço do seu plano antes de carregar: estourar o limite trava a gravação no meio.

Para mudar o recorte:

```bash
# mais estados
node tools/carregar-base-cnpj.mjs --carregar --ufs MG,GO,DF,SP,PR

# todos os CNAEs, inclusive indústria e agro (triplica o volume)
node tools/carregar-base-cnpj.mjs --carregar --todos-cnaes

# incluir também os telefones fixos
node tools/carregar-base-cnpj.mjs --carregar --com-telefone
```

Rodar de novo não duplica nada: o carregador faz upsert pelo CNPJ. Ampliar o recorte é rodar de novo com os estados novos.

**Sobre o plano do Supabase:** o gratuito são 500 MB e o recorte padrão ocupa ~1,1 GB, então ele exige o plano Pro. Para caber no gratuito é preciso apertar bem mais, um estado só e uma lista curta de CNAEs.

Uma advertência sobre estimar antes de carregar: `--contar --arquivos 1` projeta a partir de um arquivo só, e os dez não são equivalentes. O arquivo 0 sozinho responde por 44% do resultado, e entre os outros nove a variação vai de 52 mil a 148 mil empresas. O script corrige isso com as proporções medidas numa carga real, mas se o seu recorte de estados ou CNAEs for muito diferente, só o `--contar` completo responde de verdade.

### Passo 2b, Preencher o responsável

Se a base já estava carregada antes da migração do responsável, não é preciso refazer tudo:

```bash
node tools/carregar-base-cnpj.mjs --apenas-responsaveis
```

Isso lê só os arquivos de Empresas e de Sócios (cerca de 2 GB) e preenche o nome nas empresas que já estão no banco. Em uma carga nova, com `--carregar`, já vem junto.

### Passo 3, Atualizar uma vez por mês

A Receita publica um arquivo novo todo mês. Para trocar a base:

```bash
node tools/carregar-base-cnpj.mjs --carregar --competencia 2026-10 --limpar-antigas
```

`--limpar-antigas` apaga as linhas da competência anterior depois que a nova entrou. Entre uma carga e outra, a tela mostra a data dos dados, para você saber a idade do que está vendo.

### Opcional, CNPJá como reserva

Se você precisar de um estado ou de um CNAE que não está na base carregada, dá para apontar o extrator para a API do CNPJá sem mexer em mais nada:

```text
CNAE_PROVIDER = cnpja
CNPJA_TOKEN   = seu token de cnpja.com
```

Isso cobra por registro lido. Na prática é mais barato ampliar a carga da base própria; a reserva existe para uma busca pontual fora do recorte.

## 2. Como usar no dia a dia

### CNAE ou atividade

Digite como você fala: `clínica`, `pet shop`, `oficina`, `restaurante`, `advogado`, `salão de beleza`, `autoescola`. Também aceita o código direto, se você já souber.

A base é a **CNAE 2.3 completa do IBGE, 1.332 subclasses**, em `assets/cnae.json`. Como a descrição oficial é jurídica ("comércio varejista de animais vivos e de artigos e alimentos para animais de estimação"), cada subclasse recebeu apelidos populares para que a busca funcione com a palavra que você usaria. A lista de apelidos é só um atalho de busca: nenhuma subclasse fica escondida por não estar nela.

Marque quantos CNAEs quiser. Ao escolher, a janela de sugestões fecha e o campo esvazia, para você marcar o próximo sem cliques extras.

### Estados e cidades

Estado é obrigatório, cidade não. **Sem cidade, a busca cobre o estado inteiro.** As sugestões de cidade vêm do IBGE e respeitam os estados já escolhidos. Se você tirar o estado, as cidades daquele estado saem junto, cidade sem estado é um filtro que mente.

### Período de abertura

"Aberta a partir de" e "aberta até". Serve para dois recortes bem diferentes:

- **Empresa nova** (últimos 1,2 anos): ainda está montando presença, costuma precisar de site e posicionamento.
- **Empresa antiga** (8 anos ou mais): já tem operação rodando, costuma precisar de automação e sistema.

O score do extrator já leva isso em conta na hora de sugerir o melhor encaixe.

### As quatro chaves

- **Somente empresas ativas**, deixe ligado. Empresa baixada não compra.
- **Somente com telefone**, deixe ligado. Sem contato, o lead não serve para abordagem.
- **Somente prováveis celulares**, o corte mais duro e o mais útil: fixo não abre conversa no WhatsApp. Leia a seção 3 antes de confiar nele.
- **Incluir CNAE secundário**, amplia bastante o resultado. Uma empresa registrada como comércio mas que também presta o serviço que você procura aparece aqui.

### A prévia

A busca **não importa nada**, mas isso não quer dizer que você fica só olhando. A prévia usa **o mesmo card da busca por Google Maps**: score, os três encaixes (Site, Digital, IA), o melhor deles, e os botões de **Abordagem**, **WhatsApp** e **Adicionar ao CRM** já funcionando ali.

Ou seja: dá para abrir a conversa com uma empresa direto da prévia, sem importar nada. O que a importação faz é outra coisa, dar um nome à lista e guardar o conjunto para você voltar depois.

A diferença em relação ao card do Google é o que o cadastro da Receita não tem: não há nota, avaliações, link do site **nem encaixe de serviço sugerido**, o motivo está na seção 4. Em troca aparecem o CNPJ, o nome de quem assina pela empresa e a etiqueta de qualidade do telefone.

Cada card traz uma etiqueta de telefone:

| Etiqueta | O que significa |
| --- | --- |
| **Provável celular · 9º dígito reconstruído** | Era celular na numeração antiga. É o que dá para abordar, com a ressalva da seção 3. |
| **Celular · candidato a WhatsApp** | Número já veio com 9 dígitos. Raro nesta base. |
| **Fixo · não abre WhatsApp** | Número fixo. |
| **Telefone incompleto** | Quantidade de dígitos fora do padrão. |
| **Sem telefone** | Não entra na importação. |

Empresa que você já tem no Achilles aparece marcada com **"Já está no Achilles"**, dá para desmarcar antes de importar, e mesmo se esquecer, a importação não duplica.

Quem tem provável celular já vem pré-marcado. O resto é decisão sua.

Acima da busca fica uma faixa dizendo qual recorte está carregado (estados, quantidade e mês dos dados). Se você pedir um estado ou um CNAE fora da carga, a tela explica isso em vez de devolver uma lista vazia sem motivo, são coisas diferentes: “não existe empresa” e “não foi carregado”.

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
- **Excluir** pede confirmação e avisa quantos contatos vão sair. Quem já virou lead **continua no CRM**, apagar a lista não apaga o trabalho comercial já feito.

---

## 3. O telefone: leia isto antes de qualquer disparo

Esta é a limitação mais importante do sistema, e ela vem da fonte.

**O cadastro da Receita guarda o telefone com 8 dígitos.** O nono dígito dos celulares simplesmente não está lá. Conferido no arquivo de setembro de 2026: 910.396 telefones de 8 dígitos e **nenhum** de 9.

Isso não se resolve pagando. As APIs comerciais leem essa mesma base e devolvem o mesmo número truncado, foi testado.

O que o Achilles faz: na numeração antiga, celular começava com 6, 7, 8 ou 9 e fixo começava com 2, 3, 4 ou 5. Um número de 8 dígitos começando com 6 a 9 era celular, e hoje é o mesmo número com um 9 na frente. Isso vale para cerca de **45% dos telefones** da base.

Por isso a tela diz **"provável celular · 9º dígito reconstruído"**, e nunca "WhatsApp". A diferença não é preciosismo:

- o número pode ter sido reciclado para outro dono;
- o cadastro pode estar desatualizado há anos;
- a linha pode estar desativada;
- e mesmo estando certa, nada garante que existe WhatsApp naquele número.

Confirmar de verdade exige uma API de validação de WhatsApp à parte, com custo por número. Vale quando o volume justificar; não vale para 20 contatos por dia.

Os outros cuidados, que valem desde o primeiro disparo:

- Telefone em base pública é ponto de partida, não autorização. Abordagem fria pede contexto e uma saída fácil para quem não quer receber.
- Quem pedir para não receber mais precisa ser marcado e nunca mais abordado.
- Volume alto em número novo queima o número. Comece baixo e suba devagar.
- A base é pública, mas o uso continua sujeito à LGPD e às regras do WhatsApp.

## 3b. O nome de quem atende

A mensagem abre com uma saudação, e "Bom dia! Tudo bem?" sem nome soa como disparo. O cadastro da Receita traz quem assina pela empresa, e isso entra na abertura: "Bom dia, João! Tudo bem?".

De onde o nome vem:

- **Empresário Individual**, a razão social já é a pessoa ("JOAO DA SILVA 12345678900"). O documento colado no nome é removido.
- **Demais empresas**, o sócio-administrador, no arquivo de Sócios.

Na carga de MG/GO/DF isso cobre a grande maioria das empresas. As que sobram são sociedades só de pessoa jurídica ou sem sócio no cadastro; nesses casos a mensagem simplesmente abre sem nome, como antes.

**Cuidado que vale repetir:** o sócio-administrador é quem responde pela empresa no papel. Pode não ser quem atende o WhatsApp, e o cadastro pode estar velho. Por isso o nome só abre a conversa, o sistema não afirma nada sobre a pessoa e não guarda nenhum outro dado dela além do primeiro nome e do nome completo.

## 3c. A mensagem

Um contato do extrator recebe a mesma estrutura de abordagem que um do Google, abertura, contexto, proposta e convite, mas com um conteúdo deliberadamente genérico.

O motivo é o mesmo do score: aqui não existe fato observado sobre a empresa. Escolher o discurso por um "melhor encaixe" deduzido do CNAE seria chutar, e chute na primeira mensagem custa o contato.

O resultado, para uma clínica em Uberaba:

> Bom dia, João! Tudo bem com você?
>
> Sou o Arthur, da Achilles Media, trabalhamos com soluções digitais para empresas aqui da região, desde sistemas e automações até presença digital. Analisando a Clínica São José, percebemos diversos pontos em que poderíamos colaborar na sua operação e/ou posicionamento.
>
> A ideia primordialmente é entender a necessidade de vocês e mostrar o que faz sentido no caso de vocês.
>
> Consigo te apresentar brevemente?

O artigo antes do nome sai do próprio nome: "a Clínica", "o Restaurante". Quando não dá para deduzir, o nome vai sem artigo, porque concordância errada na primeira frase custa mais do que a ausência dela.

O `{{saudacao}}` continua sendo variável, resolvida no momento do envio: mensagem preparada de manhã não pode chegar dando bom dia às oito da noite.

Como em toda abordagem do Command, você edita antes de enviar, e o texto editado passa a ser o oficial daquele contato. Se você gerar com o Claude, ele recebe a instrução explícita de não afirmar nada sobre site ou presença digital, senão escreveria "vi que vocês precisam de X", que é exatamente o chute que saiu da tela.

## 4. O score do extrator, e por que não há encaixe sugerido

O card do Google Maps mostra três notas, Site, Posicionamento digital e Automação, e aponta o melhor encaixe. Isso funciona lá porque existe fato observado: dá para ver se a empresa tem site, qual a nota e quantas avaliações tem.

**O extrator não mostra isso, de propósito.** A primeira versão mostrava, com as notas deduzidas do prefixo do CNAE, da idade da empresa e do porte. Ou seja: um número com aparência de critério, sem critério por trás. O risco disso não é ser impreciso, é você decidir por ele, e priorizar "automação" para uma empresa só porque o CNAE dela começa com 69.

O que sobrou é o que o cadastro realmente diz, e serve só para ordenar a lista:

| Sinal | Peso |
| --- | --- |
| Provável celular | +16 (o que mais pesa: lead sem contato não é lead) |
| Telefone fixo | −10 |
| Sem telefone | −25 |
| E-mail no cadastro | +6 |
| Aberta há menos de 2 anos | +8 |
| Porte ME ou EPP | +5 |
| Porte "Demais" | −5 |
| Situação diferente de ativa | −30 |

Empresa nova pontua mais porque costuma ser conversa mais fácil, não porque seja empresa melhor.

**Qual serviço oferecer sai da conversa, não do CNAE.** É por isso que a mensagem apresenta o leque em vez de escolher um lado.

O card de um contato do extrator também diz **"Site não verificado"**, e não "sem site". A Receita não guarda esse campo, ninguém procurou o site dessa empresa, e afirmar que ela não tem seria inventar.

## 5. Conferindo que está tudo certo

Dois testes acompanham o código.

```bash
# Function de extração e leitura de telefone. Não precisa instalar nada.
node tools/testar-cnae-search.mjs

# Interface completa. Precisa do jsdom uma vez: npm install jsdom
node tools/testar-extrator-ui.mjs

# Prévia: abordagem, WhatsApp e CRM funcionando antes de importar.
node tools/testar-previa.mjs

# Carregador. Precisa de 3 ZIPs da Receita numa pasta; o arquivo explica quais.
node tools/testar-carregador.mjs C:/caminho/da/pasta
```

São 195 verificações. O primeiro cobre os dois provedores, os filtros enviados ao banco e a leitura do telefone. O terceiro roda o carregador de verdade contra um Supabase simulado e confere o que seria gravado. O segundo percorre o caminho inteiro num DOM simulado e checa as três regras que não podem quebrar: importar não cria lead no CRM, não marca ninguém como abordado, e reimportar a mesma busca não duplica contato.

Checklist manual, na primeira vez:

1. Abra Captação e troque para **CNAE / Receita**. Confira a faixa com o recorte carregado.
2. Digite `clínica` e confirme que aparecem sugestões com código e descrição.
3. Marque um CNAE, deixe MG, sem cidade.
4. Limite 50, somente ativas, somente com telefone.
5. Busque e confira que a prévia traz CNPJ, cidade e etiqueta de telefone.
6. Peça um estado fora da carga (SP, por exemplo) e confirme que a tela **explica** em vez de devolver lista vazia.
7. Desmarque tudo e confirme que **Importar** fica bloqueado.
8. Marque 2 ou 3, dê um nome à lista e importe.
9. Confirme que os cards apareceram e que **nenhum lead novo** surgiu no CRM.
10. Abra o WhatsApp de um contato **seu** antes de abordar qualquer empresa de verdade.
11. Pegue 5 números reconstruídos e confira no WhatsApp se existem mesmo. É assim que você descobre a taxa de acerto da reconstrução do 9º dígito na sua região.

---

## 6. O que ficou para depois

O material do curso descreve um sistema completo de disparo cadenciado: fila, chips, limites diários, aquecimento de número, variações de mensagem, webhook de resposta e painel de eventos. Isso é uma construção grande e com risco operacional próprio, número bloqueado é prejuízo direto.

O que existe hoje no Achilles e já cobre parte disso:

- **Extrator + listas nomeadas**, este documento.
- **Abordagem editável por contato**, com geração pelo Claude, já existia.
- **Extensão Prospecta**, que monta a fila de abordagem a partir da lista visível na captação, já existia, e agora recebe também os contatos vindos do extrator, sem nenhuma mudança.
- **`netlify/functions/whatsapp-send.mjs`**, pronta para a Cloud API e desligada por padrão.
- **`supabase/schema.sql`** já tem a tabela `message_queue`.

A ordem que faz sentido a partir daqui, uma etapa por vez:

1. **Usar o extrator por algumas semanas** com volume baixo e abordagem manual. É o que diz se o filtro de CNAE está trazendo o cliente certo, e isso importa mais que qualquer automação.
2. **Cadência de mensagens**: variações de abordagem e follow-up programado, ainda com envio manual.
3. **Fila com limite diário e intervalo**, usando a `message_queue` que já existe.
4. **Controle de chips e aquecimento**, só quando o volume justificar mais de um número.
5. **Webhook de resposta**, para a conversa voltar sozinha para o CRM.

Automatizar o disparo antes de validar o filtro é o caminho mais rápido para queimar número mandando mensagem para a lista errada.
