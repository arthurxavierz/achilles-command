# Achilles Command

Central interna da Achilles Media para comercial, operação e IA.

## O que esta versão já faz

- Dashboard, CRM/Kanban, conversas, campanhas, propostas, projetos e tarefas.
- **Captação nativa de empresas** dentro do próprio Command: segmento + cidade + raio.
- Mapa dos resultados, telefone/WhatsApp/e-mail/site quando publicados, CSV e score de oportunidade.
- Enriquecimento opcional pelo site público da empresa para tentar localizar e-mail, telefone e redes sociais.
- Editor de abordagem e abertura do WhatsApp com a mensagem preenchida; o clique final continua humano.
- Claude API opcional para gerar abordagens, sugerir respostas e atuar como Achilles Assistant usando o contexto do ERP.
- Supabase para autenticação e persistência.
- Function já preparada para WhatsApp Cloud API futuro, desativada por padrão.

## Captação sem Docker

A captação foi escrita dentro deste projeto. Não existe outro aplicativo, container ou serviço de scraper para instalar.

Fluxo atual:

```text
Achilles Command
  -> Netlify Function prospect-search
  -> geocodificação da cidade
  -> dados públicos OpenStreetMap/Overpass
  -> score Achilles
  -> lista + mapa + CRM + CSV
  -> prospect-enrich, se houver site
  -> abordagem manual ou Claude
  -> WhatsApp
```

Isso foi escolhido para a primeira versão porque funciona em ambiente serverless e não exige chave paga de mapas. A cobertura depende dos dados públicos disponíveis em cada cidade. Cada card possui atalho para conferir a empresa no Google Maps.

## Começar

Leia primeiro `COMECE_AQUI.md` e depois `docs/GUIA_IMPLEMENTACAO.md`.

Para usar a captação localmente com as Functions, execute o projeto com Netlify CLI, não apenas com `python -m http.server`.

## Estrutura principal

```text
index.html / app.js / styles.css      painel
chat.html / chat.js                   chatbot público por regras
netlify/functions/prospect-search.mjs captação nativa
netlify/functions/prospect-enrich.mjs enriquecimento do site público
netlify/functions/ai-proxy.mjs        Claude/OpenAI sem expor chave
netlify/functions/lead-intake.mjs     entrada pública de lead no Supabase
netlify/functions/whatsapp-send.mjs   Cloud API opcional
netlify/lib/auth.mjs                  proteção das Functions internas
supabase/schema.sql                   banco novo
supabase/migration_2026_08_02_prospeccao.sql banco já existente
docs/GUIA_IMPLEMENTACAO.md            passo a passo completo
docs/GUIA_DE_USO.md                    uso diário
```

## Segurança

Nunca coloque `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ou token da Meta em `config.js` ou no GitHub. Esses valores ficam somente nas variáveis de ambiente do Netlify.
