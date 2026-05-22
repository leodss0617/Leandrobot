# PRD - Coletor de Rodadas Blaze (TipMiner / Mega Tróia)

## Visão Geral
Aplicativo mobile (Expo) que coleta rodadas do Blaze Double diretamente das páginas públicas do **TipMiner** e **Mega Tróia** via WebView com extração por JavaScript injetado. Armazena histórico, calcula estatísticas e gera previsão estatística para a próxima cor.

## Stack
- Frontend: Expo SDK 54 + expo-router (Tabs) + react-native-webview
- Backend: FastAPI + MongoDB (motor)
- Sem integrações externas / sem LLM

## Funcionalidades

### Captura (aba 1)
- WebView que carrega TipMiner ou Mega Tróia
- Seletor flutuante para alternar entre os 2 sites
- FAB "Coletar rodadas" — injeta script que percorre o DOM da página, identifica elementos com texto 0-14 próximos de um horário HH:MM, deduplica e envia em lote para o backend
- Mapeamento de cor: `0 = branco`, `1-7 = vermelho`, `8-14 = preto`

### Histórico (aba 2)
- Lista das últimas 300 rodadas com filtro por site
- Pull-to-refresh
- Bolinha colorida com o número + horário + carimbo de captura

### Análise (aba 3)
- **Previsão da próxima cor** com nível de confiança, baseada em:
  - Reversão à média (50%)
  - Cadeia de Markov de 1 passo a partir da última cor (30%)
  - Bônus de raridade do branco (15%) quando dry-spell > 14
  - Bônus de quebra de sequência (8%) quando streak ≥ 4
- Frequências (vermelho / preto / branco) em barras
- Sequência atual + há quantas rodadas o branco não cai
- Top 5 números mais frequentes

### Ajustes (aba 4)
- Contadores por site
- Limpar histórico (parcial por site / total)
- Guia de uso

## API (todos prefixados com `/api`)
- `POST /api/rounds/bulk` — `{ source, rounds: [{ number, time_str?, seconds?, site_ts? }] }` → dedupe por (source, number, time_str, seconds)
- `POST /api/rounds` — inserir avulsa (source obrigatório no body)
- `GET /api/rounds?source=&limit=` — listar (newest first)
- `DELETE /api/rounds?source=` — limpar
- `GET /api/stats?source=&limit=` — frequências + streak + números quentes
- `GET /api/prediction?source=&window=` — `{ next_color, confidence, red_score, black_score, white_score, rationale }`

## Modelo (MongoDB collection: `rounds`)
```
{ id, number(0-14), color(red|black|white), source(tipminer|megatroia|manual),
  time_str?, seconds?, site_ts?, captured_at }
```

## Design
- Tema escuro: fundo `#0c0c0c`, cards `#141414`, bordas `#1f1f1f`
- Acento: Blaze red `#E11D2A` / dourado `#FFD700`
- Touch targets ≥ 44px, navegação por Tabs (4 abas)

## Limitações conhecidas
- Preview web mostra fallback porque sites externos bloqueiam iframes (X-Frame-Options). O app só extrai rodadas no celular via Expo Go.
- Previsão é estatística (não garantia). Disclaimer visível na tela de análise.
