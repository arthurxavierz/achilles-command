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

`prospect-enrich.mjs` visita o site público somente quando solicitado e procura e-mail, redes sociais, telefone e link de WhatsApp visíveis.

## Segurança da Places API

A `GOOGLE_PLACES_API_KEY` fica exclusivamente no Netlify. O navegador chama a Function autenticada; a Function chama o Google.

## Supabase

Mantém autenticação, organizações, leads, prospects, conversas, campanhas, propostas, projetos e tarefas. As tabelas usam `organization_id` e RLS.

## Claude

`ai-proxy.mjs` possui tarefas para assistente, abordagem e suporte. Busca e scoring não dependem do Claude.

## WhatsApp

Na fase atual, `wa.me` abre o WhatsApp com texto preenchido. `whatsapp-send.mjs` fica preparado para Cloud API futura.
