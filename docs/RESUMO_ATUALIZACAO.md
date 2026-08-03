# Resumo da atualização 02/08/2026

## Implementado

### Prospecção

- nova rota **Prospecção** no Achilles Command;
- pesquisa por segmento e cidade;
- integração assíncrona com `gosom/google-maps-scraper` via Docker;
- ponte Python local protegida por segredo;
- proxy Netlify para manter a ponte privada;
- mapa Leaflet/OpenStreetMap;
- score de oportunidade por regras, sem IA;
- deduplicação básica;
- exportação CSV;
- geração de abordagem pelo Claude com fallback local;
- editor da mensagem antes do contato;
- abertura manual no WhatsApp;
- importação do prospect para o CRM;
- persistência de buscas e prospects no Supabase.

### Claude / IA

- proxy server-side com chave fora do frontend;
- prompts separados para assistente, abordagem, resposta de atendimento e chat público;
- Achilles Assistant recebe contexto de prospects, leads, atendimentos, campanhas, propostas, projetos, tarefas e serviços;
- tela Conversas ganhou **Sugerir com IA**, sempre para revisão humana;
- chat público pode usar uma única chamada opcional no encerramento (`publicChatAI`).

### Chat público

- nova Function `public-lead.mjs` para gravar leads no Supabase com a service role protegida no Netlify;
- deduplicação simples por telefone;
- fallback local continua preservando o contato se uma integração falhar.

### Supabase

- tabelas `prospecting_runs` e `prospects`;
- RLS, índices e trigger de atualização;
- migration separada para quem já possuía banco;
- configurações do painel passam a sincronizar `app_settings` quando o Supabase estiver ativo.

### WhatsApp

- permanece manual na versão atual;
- números brasileiros sem DDI recebem `55` ao abrir `wa.me`;
- banco/arquitetura já preservam o caminho para `whatsapp_cloud` no futuro;
- tutorial documenta a evolução sem exigir configuração da Meta agora.

## Arquivos principais novos

```text
netlify/functions/scraper-proxy.mjs
netlify/functions/public-lead.mjs
scraper/server.py
scraper/start.bat
scraper/start.ps1
scraper/.env.example
supabase/migrations/2026-08-02_prospeccao.sql
docs/GUIA_DE_USO.md
docs/TERCEIROS.md
```

## Primeiro arquivo a abrir

```text
docs/GUIA_IMPLEMENTACAO.md
```
