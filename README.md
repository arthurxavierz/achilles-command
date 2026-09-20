# Achilles Command

Central interna da Achilles Media para comercial, operação e IA.

## O que esta versão já faz

- Dashboard, CRM/Kanban, conversas, campanhas, propostas, projetos e tarefas.
- **Captação nativa de empresas** dentro do próprio Command, por duas origens: Google Maps (segmento + cidade + raio) e **extrator por CNAE** (cadastro da Receita, por atividade, estado, cidade e data de abertura).
- Prévia revisável no extrator, listas nomeadas e importação manual — importar nunca dispara mensagem.
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
netlify/functions/prospect-search.mjs captação por Google Places
netlify/functions/cnae-search.mjs     extrator por CNAE (cadastro da Receita)
assets/cnae.json                      base CNAE 2.3 do IBGE usada na busca
tools/gerar-cnae.mjs                  regera a base a partir do IBGE
netlify/functions/prospect-enrich.mjs enriquecimento do site público
netlify/functions/ai-proxy.mjs        Claude/OpenAI sem expor chave
netlify/functions/lead-intake.mjs     entrada pública de lead no Supabase
netlify/functions/whatsapp-send.mjs   Cloud API opcional
netlify/lib/auth.mjs                  proteção das Functions internas
supabase/schema.sql                   banco novo
supabase/migration_2026_08_02_prospeccao.sql banco já existente
supabase/migration_2026_09_19_extrator_cnae.sql listas e campos do extrator
docs/GUIA_IMPLEMENTACAO.md            passo a passo completo
docs/GUIA_DE_USO.md                    uso diário
docs/GUIA_EXTRATOR_CNAE.md            extrator por CNAE: configuração e uso
```

## Segurança

Nunca coloque `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CNPJA_TOKEN` ou token da Meta em `config.js` ou no GitHub. Esses valores ficam somente nas variáveis de ambiente do Netlify.
