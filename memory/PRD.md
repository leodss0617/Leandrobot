# PRD - Coletor de Rodadas Blaze (TipMiner / Mega Tróia)

## Visão Geral
Aplicativo mobile (Expo) que coleta rodadas do Blaze Double automaticamente. Versão atual (jan/2026) adiciona o modo **"Coletor Automático"** que chama a API pública da Blaze direto do celular do usuário (IP brasileiro, sem geo-block), eliminando a necessidade de WebView aberta.

## Stack
- Frontend: Expo SDK 54 + expo-router (Drawer) + react-native-webview + **expo-keep-awake**
- Backend: FastAPI + MongoDB (motor) + APScheduler
- Sem integrações externas / sem LLM

## Funcionalidades

### ⚡ Coletor Automático (NOVO — aba 1)
- Tela `app/auto.tsx` com botão único "INICIAR COLETOR AUTOMÁTICO"
- Faz fetch direto em `https://blaze.bet.br/api/roulette_games/recent` (e fallbacks) a cada 5s
- Normaliza payload Blaze e envia em lote para `POST /api/rounds/bulk`
- Toggle "Manter tela acordada" (expo-keep-awake) — impede o celular de dormir
- Indicador visual ATIVO/COLETANDO/BLOQUEADO + ciclos/novas/repetidas/erros
- Log ao vivo das últimas 30 operações
- Funciona porque o **IP do celular do usuário é brasileiro** — a API da Blaze responde 200 normal
- Backend nos servidores Emergent (EUA) recebe 451 → o poll-status do backend mostra "BLOQUEADO" automaticamente

### Captura manual (aba 2)
- WebView com TipMiner/Mega Tróia/Blaze
- Coleta manual via injeção de JS (mantido como fallback)

### Bot + Gales (aba 3)
- Sistema Martingale completo (até G4)
- Auto-previsão, regras das Pedras Pagadoras, placar de acertos

### Histórico, Análise, Regras, Calculadora, Simulador, Ajustes
- (sem mudanças)

## API (todas com prefixo `/api`)
### Rounds
- `POST /api/rounds/bulk` — usado pelo Coletor Automático para enviar lote
- `GET /api/rounds?source=&limit=` / `DELETE /api/rounds?source=`

### Poll Status
- `GET /api/poll-status` — agora retorna `blocked=true` também em falha de DNS, não só em HTTP 451

### Demais endpoints (inalterados)
- /api/stats, /api/prediction, /api/white-forecast, /api/white-alert
- /api/active-prediction (CRUD + history)
- /api/predictions/log + /api/predictions/stats
- /api/rules (CRUD + evaluate + seed-pedras)
- /api/settings, /api/simulate

## Como o usuário usa
1. Abre o app no celular (Brasil)
2. Drawer → **⚡ Coletor Auto**
3. Toca **INICIAR COLETOR AUTOMÁTICO**
4. Deixa "Manter tela acordada" ligado + plugue o carregador
5. Rodadas chegam a cada 5s automaticamente; bot/análise/regras consomem do banco

## Limitações conhecidas
- **Backend Emergent não consegue chamar Blaze** (geo-block 451). Por isso a coleta acontece no DEVICE.
- **iOS**: ao colocar app em segundo plano por >30s, o JS pausa. Mantenha a tela em primeiro plano.
- **Android**: com keep-awake e app em foreground, roda indefinidamente; retire das restrições de bateria para melhor estabilidade.
- Para coleta 100% em segundo plano (tela apagada), seria necessário Custom Dev Build com Foreground Service Notification — não disponível em Expo Go.

## Implementação técnica (2026-01)
- `src/blazeCollector.ts` — função `collectOnce()` tenta 3 URLs da Blaze, normaliza payload e posta no backend
- `app/auto.tsx` — UI da tela com poll loop (setInterval 5s), AppState observer, keep-awake hook
- `package.json` — adicionado `expo-keep-awake ~15.0.8`
- `_layout.tsx` — nova entrada `⚡ Coletor Auto` no drawer
- `server.py` — `poll_blaze()` agora marca `blocked=true` também em falha de DNS

## Tarefas concluídas (jan/2026)
- [x] Análise do projeto e identificação do geo-block como bloqueio para coleta automática
- [x] Novo módulo `blazeCollector.ts` com fetch direto + dedupe via backend
- [x] Nova tela `Coletor Automático` com toggle keep-awake e log ao vivo
- [x] Drawer atualizado com nova entrada `⚡ Coletor Auto`
- [x] Backend `poll-status` indica `blocked=true` também em falha de DNS
- [x] Backend testado (24/24 tests passando, incluindo source=blaze e active-prediction lifecycle)

## Backlog (P1/P2)
- [ ] P1: Foreground Service notification (Android) para coleta com tela bloqueada (requer EAS Build)
- [ ] P1: Background fetch task com `expo-background-fetch` (limitado a 15min no iOS)
- [ ] P2: Modo "delegado" — usuário compartilha rodadas via WebSocket com outros usuários do app
- [ ] P2: Persistência local (AsyncStorage) das rodadas para offline-first
- [ ] P2: Push notification quando o bot acerta um Gale

## Modelo (MongoDB) — inalterado
```
rounds: { id, number(0-14), color, source, time_str?, seconds?, site_ts?, captured_at }
active_predictions: { id, source, predicted_color, max_gales, current_gale, status, ... }
prediction_logs: { id, predicted_color, actual_color, is_hit, hit_at_gale?, ... }
rules: { id, name, enabled, conditions, action, priority }
settings: { key, max_gales, preferred_source, auto_predict, skip_white_predictions }
```

## Design
- Tema escuro: fundo `#0c0c0c`, cards `#141414`, bordas `#1f1f1f`
- Acento: Blaze red `#E11D2A` / dourado `#FFD700`
- Status colors: verde `#22C55E` (ATIVO), laranja `#FFA726` (COLETANDO), vermelho `#FF5252` (BLOQUEADO)
