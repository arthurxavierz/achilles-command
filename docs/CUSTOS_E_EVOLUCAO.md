# Custos e evolução

## Operação inicial recomendada

| Componente | Como fica agora | Custo incremental esperado |
|---|---|---:|
| Captação de empresas | Function nativa + dados públicos OSM/Overpass | R$ 0 |
| Score | Regras do Achilles Command | R$ 0 |
| Mapa | OpenStreetMap + Leaflet | R$ 0 para o volume inicial |
| CRM e banco | Supabase Free, enquanto couber na franquia | R$ 0 |
| Frontend/Functions | Netlify Free, enquanto couber na franquia | R$ 0 |
| WhatsApp de prospecção | Abertura manual com mensagem preenchida | R$ 0 |
| Claude | Somente se ativado | variável por tokens |
| WhatsApp Cloud API | Desativada | R$ 0 |

## Onde aparece custo de IA

A busca, o mapa, o score, o CSV e o CRM não chamam Claude.

Claude é chamado apenas quando você pede algo como:

1. gerar uma abordagem personalizada;
2. sugerir uma resposta numa conversa;
3. consultar o Achilles Assistant.

Como referência, o Haiku é apropriado para essas tarefas de baixo custo. O gasto real depende do tamanho do contexto e da quantidade de chamadas. Para algumas dezenas de abordagens por dia, o custo tende a ser pequeno, mas acompanhe o painel de uso da Anthropic.

## WhatsApp

Para cerca de 30 abordagens manuais por dia, a primeira versão não precisa da Cloud API. A API passa a fazer sentido quando você quiser que o Command envie/receba mensagens sozinho, receba webhooks e permita que o Claude participe do atendimento automaticamente.

## Limites da captação gratuita

A fonte gratuita atual não é o banco do Google Maps. A cobertura do OpenStreetMap varia por cidade. Por isso o Command inclui link de verificação no Google Maps e enriquecimento do site público.

Se um dia a Achilles precisar de cobertura comercial equivalente à do Google Maps em grande escala, a arquitetura permite trocar apenas o provider da Function por Google Places, outro provedor ou uma infraestrutura de navegador. O restante do Command não precisa ser refeito.

## Fontes oficiais para conferir preços e políticas

- Anthropic: https://www.anthropic.com/pricing
- Supabase: https://supabase.com/pricing
- Netlify: https://www.netlify.com/pricing/
- WhatsApp Business Platform: https://developers.facebook.com/docs/whatsapp/
- OpenStreetMap: https://www.openstreetmap.org/
- Nominatim policy: https://operations.osmfoundation.org/policies/nominatim/
