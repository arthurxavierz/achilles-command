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

Na abordagem, a tarefa `outreach` recebe os sinais do prospect e a observação escrita no editor, que entra no prompt como ângulo principal da mensagem. Quando a IA não está configurada, o Command mantém a abordagem padrão e avisa — nunca apresenta o texto base como se tivesse vindo do modelo. A mensagem aprovada fica em `prospects.approach_message` e é a que o botão de WhatsApp usa.

## WhatsApp

Na fase atual, `wa.me` abre o WhatsApp com texto preenchido. `whatsapp-send.mjs` fica preparado para Cloud API futura.
