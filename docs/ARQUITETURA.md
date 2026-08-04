# Arquitetura do Achilles Command

```text
                         +----------------------+
                         |    Claude API        |
                         | opcional             |
                         +----------^-----------+
                                    |
Usuário -> Achilles Command -> Netlify Functions
              |                     |
              |                     +-> Google Places API (New)
              |                     +-> scoring Achilles
              |                     +-> enriquecimento de site
              |                     +-> proxy de IA
              |                     +-> WhatsApp Cloud futuro
              |
              +-> Supabase Auth + banco
              |
              +-> WhatsApp manual (wa.me)
```

## Captação

`prospect-search.mjs` recebe segmento, cidade, UF, raio e limite. A cidade é localizada para ajudar na busca por proximidade e a Function consulta o Google Places no servidor.

Os dados comerciais utilizados incluem, quando disponíveis:

- nome e categoria;
- endereço e coordenadas;
- telefone;
- site;
- nota;
- quantidade de avaliações;
- status operacional.

O score não usa IA. Ele gera:

- Score Achilles geral;
- potencial para Site;
- potencial para Posicionamento digital;
- potencial para Automação / IA;
- melhor encaixe comercial estimado.

A ordenação é score, depois contato (WhatsApp > fixo > nenhum), depois volume de avaliações. O desempate por contato acontece no servidor, antes do corte pelo limite, e é repetido no navegador para continuar valendo depois do enriquecimento.

Os filtros por canal de contato e por encaixe comercial rodam no navegador sobre o resultado já recebido. Não geram chamada nova ao Google.

A dedução de WhatsApp usa o formato de celular brasileiro (DDD + 9 dígitos iniciados em 9), porque o Google entrega fixo e celular no mesmo campo. Um link `wa.me` obtido no enriquecimento tem prioridade sobre a dedução.

`prospect-enrich.mjs` visita o site público somente quando solicitado e procura e-mail, redes sociais, telefone e link de WhatsApp visíveis.

## Segurança da Places API

A `GOOGLE_PLACES_API_KEY` fica exclusivamente no Netlify. O navegador chama a Function autenticada; a Function chama o Google.

## Supabase

Mantém autenticação, organizações, leads, prospects, conversas, campanhas, propostas, projetos e tarefas. As tabelas usam `organization_id` e RLS.

## Claude

`ai-proxy.mjs` possui tarefas para assistente, abordagem e suporte. Busca e scoring não dependem do Claude.

A abordagem tem três modelos sobre a mesma estrutura validada: genérico, site com protótipo e automação. A escolha usa fato observado antes de média — ausência (ou queda) do site decide o modelo de site; o de automação exige `AUTOMATION_GAP` de vantagem sobre os outros dois scores. `{{saudacao}}` só é resolvida na abertura do WhatsApp, para a mensagem não chegar com a saudação do momento em que foi preparada.

Na abordagem, a tarefa `outreach` recebe os sinais do prospect, o modelo escolhido e a observação escrita no editor, que entra no prompt como ângulo principal da mensagem. Quando a IA não está configurada, o Command mantém a abordagem padrão e avisa — nunca apresenta o texto base como se tivesse vindo do modelo. A mensagem aprovada fica em `prospects.approach_message` e é a que o botão de WhatsApp usa.

## Mobile

A camada responsiva fica no fim de `styles.css`. Três correções são de comportamento, não de layout, e por isso vivem em `app.js`:

- o Kanban dependia de HTML5 drag-and-drop, que não emite evento nenhum em toque. O card passou a abrir no clique e o modal do lead ganhou seletor de etapa. Arrastar continua funcionando no computador;
- a lista de conversas era escondida com `display:none` abaixo de 650px, o que impedia escolher com quem falar. Virou mestre/detalhe controlado por `state.inboxView`;
- o painel de contato some em 1180px levando junto o interruptor de atendimento e o "Sugerir com Claude". Os dois foram replicados numa faixa dentro do chat, e os bindings passaram a usar `querySelectorAll`.

Alvos de toque crescem por `@media (pointer: coarse)`, e não por largura: o critério é o dedo, não a tela. Campos usam 16px no mobile porque o Safari dá zoom ao focar fonte menor, e o zoom não volta sozinho. Alturas de tela usam `dvh`, já que `vh` no celular conta a barra de endereço que some ao rolar.

O HTML de proposta gerado por `downloadProposal` também é responsivo e ganhou `<meta viewport>` — ele é aberto pelo cliente, quase sempre no celular.

## WhatsApp

Na fase atual, `wa.me` abre o WhatsApp com texto preenchido. `whatsapp-send.mjs` fica preparado para Cloud API futura.
