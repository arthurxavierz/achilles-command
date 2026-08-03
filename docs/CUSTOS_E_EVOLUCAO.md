# Custos e evolução

## Operação inicial recomendada

| Componente | Como fica agora | Custo incremental esperado |
|---|---|---:|
| Captação | Google Places API (New) via Netlify Function | R$ 0 enquanto dentro da franquia |
| Score | Regras do Achilles Command | R$ 0 |
| Mapa visual | OpenStreetMap + Leaflet | R$ 0 para o volume inicial |
| CRM e banco | Supabase Free, enquanto couber na franquia | R$ 0 |
| Frontend/Functions | Netlify Free, enquanto couber na franquia | R$ 0 |
| WhatsApp de prospecção | Abertura manual | R$ 0 |
| Claude | Somente se ativado | variável por tokens |
| WhatsApp Cloud API | Desativada | R$ 0 |

## Google Places

A busca pede telefone, site, rating e quantidade de avaliações. Esses campos levam a consulta ao tier **Text Search Enterprise**.

Na tabela vigente em agosto de 2026, o tier possui franquia de **1.000 requisições/mês**.

A API retorna até 20 lugares por página e até 60 resultados no total por consulta textual:

```text
20 resultados -> até 1 chamada
30 resultados -> até 2 chamadas
50/60 resultados -> até 3 chamadas
```

O faturamento precisa estar ativado no Google Cloud mesmo que o uso permaneça na franquia gratuita. Configure orçamento e alertas.

## Claude

Google Places, mapa, score, CSV e CRM não chamam Claude. A API da Anthropic só é usada quando você pede geração/sugestão de texto ou usa o Achilles Assistant.

## WhatsApp

Para cerca de 30 abordagens manuais por dia, Cloud API não é necessária. Ela passa a fazer sentido para envio/recebimento automático, webhooks e atendimento com IA.

## Referências

- Google Places Text Search: https://developers.google.com/maps/documentation/places/web-service/text-search
- Google Maps pricing: https://developers.google.com/maps/billing-and-pricing/pricing
- Anthropic: https://www.anthropic.com/pricing
- Supabase: https://supabase.com/pricing
- Netlify: https://www.netlify.com/pricing/
- WhatsApp Business Platform: https://developers.facebook.com/docs/whatsapp/
