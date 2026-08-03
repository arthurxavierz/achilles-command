# Arquitetura do Achilles Command

## Visão atual

```text
                         +----------------------+
                         |    Claude API        |
                         | opcional             |
                         +----------^-----------+
                                    |
Usuário -> Achilles Command -> Netlify Functions
              |                     |
              |                     +-> captação nativa
              |                     |   OSM/Overpass
              |                     +-> enriquecimento de site
              |                     +-> proxy de IA
              |                     +-> WhatsApp Cloud futuro
              |
              +-> Supabase Auth + banco
              |
              +-> WhatsApp manual (wa.me)
```

## Captação

`prospect-search.mjs` faz parte do próprio Achilles Command. Ela recebe segmento, cidade, UF e raio, localiza a cidade, consulta dados empresariais públicos e devolve registros normalizados.

O score é determinístico; ele não gasta IA. Hoje valoriza principalmente:

- existência de telefone/WhatsApp/e-mail;
- ausência de site, que pode representar oportunidade comercial para a Achilles;
- presença social limitada;
- endereço e identificação suficientes para abordagem.

`prospect-enrich.mjs` é chamado somente quando o usuário clica em **Enriquecer**. Ele visita o site público informado pela empresa e procura contatos e links sociais visíveis na página.

## Supabase

Mantém autenticação, organizações, leads, prospects, conversas, campanhas, propostas, projetos e tarefas. As tabelas usam `organization_id` e RLS para separar os dados.

## Netlify Functions

Servem como backend leve. Segredos nunca vão para o navegador. As Functions internas validam a sessão do Supabase através de `netlify/lib/auth.mjs`.

`lead-intake.mjs` é uma exceção intencional: é público para permitir que o chatbot do site registre um novo lead. Ele usa Service Role somente no servidor.

## Claude

`ai-proxy.mjs` possui três tarefas:

- `assistant`: consulta contextual do Command;
- `outreach`: primeira abordagem comercial;
- `support`: sugestão de resposta em atendimento.

O score e a busca não dependem do Claude.

## WhatsApp

Na fase atual, `wa.me` abre o WhatsApp com texto preenchido. Isso não exige API.

`whatsapp-send.mjs` foi deixado como camada futura para Cloud API. Ele fica desligado até `WHATSAPP_CLOUD_ENABLED=true` e as credenciais da Meta serem configuradas.
