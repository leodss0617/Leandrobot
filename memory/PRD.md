# PRD - Coletor de Rodadas Blaze (TipMiner / Mega Tróia)

## Visão Geral
Aplicativo mobile (Expo) que coleta rodadas do Blaze Double diretamente das páginas públicas do **TipMiner** e **Mega Tróia** via WebView com extração por JavaScript injetado. Armazena histórico, calcula estatísticas, gera previsão estatística e executa o sistema **Martingale (Gale)** automaticamente.

## Stack
- Frontend: Expo SDK 54 + expo-router (Drawer) + react-native-webview
- Backend: FastAPI + MongoDB (motor) + APScheduler (polling)
- Sem integrações externas / sem LLM

## Funcionalidades

### Captura (aba 1)
- WebView que carrega TipMiner, Mega Tróia ou Blaze
- Seletor flutuante para alternar entre sites
- FAB "Coletar rodadas" — injeta script que percorre o DOM da página, identifica elementos com texto 0-14 próximos de um horário HH:MM, deduplica e envia em lote para o backend
- Auto-coleta (polling a cada 8s via WebView no app mobile)
- Mapeamento de cor: `0 = branco`, `1-7 = vermelho`, `8-14 = preto`

### Bot + Gales (aba 2) ✅ IMPLEMENTADO
- **Sistema Martingale completo**: previsão inicial → Gale 1 → Gale 2 → até acertar ou perder
- **Máximo de gales configurável** (0 a 4)
- **Uma previsão ativa por vez**: sistema sequencial
- **Auto-previsão**: gera próxima automaticamente ao finalizar
- **Trilho visual de gales** mostrando Entrada, G1, G2
- **Placar de acertos/erros** com estatísticas detalhadas
- **Acertos por nível de gale** (quantos acertaram direto, no G1, G2...)
- **Regras das Pedras Pagadoras** integradas (12/14, 13, gêmeas, etc.)
- **Status do polling** com aviso se API bloqueada

### Histórico (aba 3)
- Lista das últimas 300 rodadas com filtro por site
- Pull-to-refresh
- Bolinha colorida com o número + horário + carimbo de captura

### Análise (aba 4)
- **Previsão da próxima cor** com nível de confiança, baseada em:
  - Reversão à média (50%)
  - Cadeia de Markov de 1 passo a partir da última cor (30%)
  - Bônus de raridade do branco (15%) quando dry-spell > 14
  - Bônus de quebra de sequência (8%) quando streak ≥ 4
- Frequências (vermelho / preto / branco) em barras
- Sequência atual + há quantas rodadas o branco não cai
- Top 5 números mais frequentes

### Regras (aba 5)
- Motor de regras configurável
- Regras built-in das Pedras Pagadoras
- Condições: streak, after_color, gap_white, last_n_pattern, twin_numbers, etc.

### Ajustes (aba 6)
- Configuração de gales máximos (0-4)
- Fonte preferida (Blaze, TipMiner, Mega Tróia)
- Auto-prever próxima (liga/desliga)
- Ignorar previsões de branco
- Carregar/recriar regras das Pedras Pagadoras
- Contadores por site
- Limpar histórico

## API (todos prefixados com `/api`)
### Rounds
- `POST /api/rounds/bulk` — inserir em lote
- `GET /api/rounds?source=&limit=` — listar
- `DELETE /api/rounds?source=` — limpar

### Previsão Ativa (Gales) ✅
- `GET /api/active-prediction` — obter previsão ativa
- `POST /api/active-prediction` — criar nova previsão
- `DELETE /api/active-prediction` — cancelar
- `POST /api/active-prediction/advance` — forçar avaliação
- `GET /api/active-prediction/history` — histórico
- `DELETE /api/active-prediction/history` — limpar histórico

### Estatísticas
- `GET /api/stats` — frequências e streak
- `GET /api/prediction` — previsão estatística
- `GET /api/predictions/stats` — placar de acertos/erros
- `GET /api/poll-status` — status do polling automático

### Configurações
- `GET /api/settings` — obter configurações
- `PUT /api/settings` — atualizar

### Regras
- `GET /api/rules` — listar
- `POST /api/rules` — criar
- `PUT /api/rules/{id}` — atualizar
- `DELETE /api/rules/{id}` — excluir
- `GET /api/rules/evaluate` — avaliar regras contra estado atual
- `POST /api/rules/seed-pedras` — carregar regras built-in

## Modelo (MongoDB)
```
# Collection: rounds
{ id, number(0-14), color, source, time_str?, seconds?, site_ts?, captured_at }

# Collection: active_predictions
{ id, source, predicted_color, max_gales, current_gale, status, anchor_*, hit_at_gale?, ... }

# Collection: prediction_logs
{ id, predicted_color, actual_color, is_hit, hit_at_gale?, max_gales?, ... }

# Collection: rules
{ id, name, enabled, conditions, action, priority }

# Collection: settings
{ key, max_gales, preferred_source, auto_predict, skip_white_predictions }
```

## Design
- Tema escuro: fundo `#0c0c0c`, cards `#141414`, bordas `#1f1f1f`
- Acento: Blaze red `#E11D2A` / dourado `#FFD700`
- Touch targets ≥ 44px, navegação por Drawer

## Limitações conhecidas
- **API Blaze bloqueada por geolocalização** (451 Unavailable For Legal Reasons) - usar coleta manual via WebView no app mobile
- Preview web mostra fallback porque sites externos bloqueiam iframes
- Previsão é estatística (não garantia). Disclaimer visível na tela de análise
