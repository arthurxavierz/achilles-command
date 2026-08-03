# Ponte de captação local

Este diretório integra o Achilles Command ao projeto open source `gosom/google-maps-scraper` sem copiar o código do scraper para dentro do Command.

A ponte cria jobs assíncronos, executa o container Docker do scraper e normaliza os resultados para o painel.

## Requisitos

- Python 3.10+
- Docker Desktop aberto

## Teste rápido

1. Copie `.env.example` para `.env` e troque o segredo.
2. Execute `start.bat`.
3. Abra `http://127.0.0.1:8765/health`.

Para integrar com o Command publicado, exponha esta porta por Cloudflare Tunnel e configure `SCRAPER_SERVICE_URL` e `SCRAPER_SERVICE_SECRET` no Netlify. Veja `docs/GUIA_IMPLEMENTACAO.md`.

Projeto usado como motor: https://github.com/gosom/google-maps-scraper (MIT).
