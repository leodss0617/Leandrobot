#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Arrumar a coleta de rodadas: o sistema tem que identificar quando sair uma rodada nova
  e salvar as rodadas + horário, em tempo real, de acordo com o histórico do site.
  A previsão tem que respeitar gales: faz a previsão; se errar faz G1; se errar G2; até
  acertar ou esgotar os gales configurados. Sempre 1 previsão por vez. Configurável.
  Contagem de acertos e erros.

backend:
  - task: "Settings (GET/PUT /api/settings)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Novo endpoint de configuracoes do bot: max_gales (0-4), preferred_source, auto_predict, skip_white_predictions. Persiste em coleção 'settings' com upsert."
        - working: true
          agent: "testing"
          comment: |
            Tested GET/PUT /api/settings endpoints. All tests passed:
            - GET returns valid settings structure with all required fields
            - PUT successfully updates and persists settings
            - max_gales clamping works correctly: 9 -> 4, -2 -> 0
            - Settings persist across GET requests after PUT

  - task: "Active Prediction (gale chain)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            Sistema de previsao unica com gales. Endpoints: GET /api/active-prediction,
            POST /api/active-prediction, DELETE /api/active-prediction, GET /api/active-prediction/history,
            DELETE /api/active-prediction/history, POST /api/active-prediction/advance.
            Logica: cria previsao com cor + max_gales + ancora; avalia cada rodada que chega apos a ancora;
            se acerta -> hit; se erra e ainda tem gale -> avanca; se erra e esgotou -> loss.
            Auto-prever proxima quando finaliza (se settings.auto_predict).
            Testado manualmente: white prediction com max_gales=2 inserindo rodadas red/black/red foi corretamente para G1, G2, depois LOSS. Hit verificado tambem.
        - working: true
          agent: "testing"
          comment: |
            Comprehensive gale chain testing completed successfully:
            - LOSS scenario: Prediction correctly advances through G0->G1->G2->LOSS after 3 misses
            - HIT at gale 0: Immediate hit correctly recorded with hit_at_gale=0
            - HIT at gale 1: Hit after one miss correctly recorded with hit_at_gale=1
            - Status transitions work correctly (pending -> hit/loss)
            - checked_round_ids properly tracks evaluated rounds
            - finished_at timestamp set correctly on completion
            - Auto-advance triggers correctly when new rounds are inserted
            - History endpoints work: GET returns finished predictions, DELETE clears history
            - skip_white_predictions works: when enabled, algorithm predicts red/black instead of white

  - task: "Auto-advance hook em add_rounds_bulk e poll_blaze"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Hook automatico: quando novas rodadas sao inseridas (via bulk insert ou poll), executa _advance_active_prediction(). Polling acelerado para 30s."
        - working: true
          agent: "testing"
          comment: |
            Auto-advance functionality verified:
            - POST /api/rounds triggers _advance_active_prediction() correctly
            - POST /api/rounds/bulk triggers auto-advance and returns correct counts
            - Prediction state updates automatically after each round insertion
            - Auto-predict chain works: when auto_predict=true, new prediction is created automatically after previous finishes

  - task: "PredictionStats com by_gale e streaks"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Stats agora incluem breakdown por gale (quantos acertos em G0/G1/G2..) e current_green_streak/current_red_streak."
        - working: true
          agent: "testing"
          comment: |
            PredictionStats endpoint verified with new fields:
            - by_gale field correctly shows breakdown: {"0": 2, "1": 1} for hits at each gale level
            - current_green_streak correctly tracks consecutive hits
            - current_red_streak correctly tracks consecutive misses
            - All existing stats fields (total, hits, misses, hit_rate_pct, color_hits, white_hits, etc.) working correctly

  - task: "Pedras Pagadoras Rules System (POST /api/rules/seed-pedras)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Bot v3: Sistema de regras Pedras Pagadoras com 16 regras built-in incluindo Gatilho Elite (12/14), Pedras Gêmeas, Puxador de Vácuo (13), Espelho (7/9), Pedras Baixas (skip), Combos, Surfe de Cor, Xadrez, Dobradinha. Endpoint /api/rules/seed-pedras com flag replace."
        - working: true
          agent: "testing"
          comment: |
            Bot v3 Pedras Pagadoras Rules tested successfully:
            - POST /api/rules/seed-pedras?replace=true: Inserted 16 rules, total_seed=16 ✅
            - GET /api/rules: Returns all 27 rules (16 new + 11 existing), matched 11 expected patterns ✅
            - Idempotency: replace=false correctly skips existing (inserted=0, skipped=16) ✅
            - Idempotency: replace=true correctly replaces all (inserted=16) ✅
            - All expected rule names found: Pedra 12/14 (Gatilho Elite), Pedra 13 (Puxador de Vácuo), Pedras Gêmeas, Pedra 7/9 (Espelho), Pedras Baixas (skip), Combos, Surfe de Cor, Xadrez, Dobradinha ✅

  - task: "Pedras Pagadoras Rule Evaluation and Prediction"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Bot v3: Integração das regras Pedras Pagadoras no sistema de previsão. Regras são avaliadas por prioridade (100 para Combos, 85 para Gêmeas, 70 para Gatilhos Elite, etc). Suporta condições: last_number_eq, last_number_in, twin_numbers, last_numbers_in, last_number_eq_and_streak. Ação skip bloqueia previsão (resfriamento)."
        - working: true
          agent: "testing"
          comment: |
            Bot v3 Rule Evaluation tested with specific scenarios:
            - Pedra 14 (Gatilho Elite): Sequence 9,8,10,11,14 correctly triggers Combo rule (higher priority 100 vs 70) predicting white ✅
            - Pedras Gêmeas: Sequence 9,3,7,5,5 (twin 5s) correctly triggers "👯 Pedras Gêmeas → BRANCO" predicting white ✅
            - Skip Rule (Pedras Baixas): Sequence 9,8,1,2,3 (three low stones) correctly blocks prediction with 400 error ✅
            - Combo Rule: Sequence 9,8,10,11,12 (4 blacks + 12) correctly triggers "🔥 Combo: 12/14 após 4 pretos seguidos → BRANCO" ✅
            - GET /api/rules/evaluate correctly identifies matching rules with priority ordering ✅
            - Rule priority system working: Combos (100) > Gêmeas (85) > Gatilhos Elite (70) > others ✅

  - task: "White-Forecast (Previsão de Horário do Branco)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Bot v3: Endpoint GET /api/white-forecast que prevê HORÁRIO do próximo branco usando lógica de terminais (espelho curto 5min, espelho longo 15min) e soma de rastro (minuto + pedra, minuto + pedra×2). Retorna last_white_time, terminals, next_stone_after_white, e array de targets com time_str, minutes_ahead, rationale, type, confidence."
        - working: true
          agent: "testing"
          comment: |
            Bot v3 White-Forecast tested successfully:
            - Basic forecast: White at 10:22 (terminal 2) with next stone 7 ✅
            - last_white_time: 10:22 ✅
            - last_white_terminal: 2 (from minute :22) ✅
            - mirror_terminal: 7 (espelho de 2) ✅
            - next_stone_after_white: 7 ✅
            - targets array: 4 items with correct calculations ✅
              * sniper_short: 10:27 (5 min ahead, terminal 2→7) ✅
              * elite_long: 10:37 (15 min ahead, ciclo elite) ✅
              * soma_rastro: 10:29 (7 min ahead, 22+7=29) ✅
              * soma_rastro_double: 10:36 (14 min ahead, 22+14=36) ✅
            - Edge case - Empty DB: Returns "Sem rodadas no histórico" with empty targets ✅
            - Edge case - No white: Returns "Nenhum branco recente" with empty targets ✅

frontend:
  - task: "Tela Bot (/app/bot.tsx)"
    implemented: true
    working: "NA"
    file: "frontend/app/bot.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Nova tela com previsao ativa, trilho de gales, placar de acertos/erros, breakdown por gale, ultimas rodadas, historico do bot. Poll 5s."

  - task: "Settings: bot config (gales, fonte, auto-predict, skip white)"
    implemented: true
    working: "NA"
    file: "frontend/app/settings.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Novo card no topo da tela Ajustes com chips para max_gales (Sem gale/G1/G2/G3/G4), chips para fonte (Blaze/TipMiner/MegaTroia), switches auto-predict e skip-white. Tambem adicionou contador Blaze."

metadata:
  created_by: "main_agent"
  version: "3.0"
  test_sequence: 3
  run_ui: false

test_plan:
  current_focus: []
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Backend implementa fluxo de gales completo. Por favor testar:
      1. GET/PUT /api/settings (max_gales 0-4, clamp, persistencia)
      2. POST /api/active-prediction cria uma e cancela qualquer pending anterior
      3. Inserir rodadas via /api/rounds e ver auto-advance: G0->G1->G2->loss e tambem cenario de hit
      4. /api/active-prediction/history e /api/predictions/stats com by_gale
      5. Validar que skip_white_predictions troca pred=white por outra cor
      Auth: nao requer.
  - agent: "testing"
    message: |
      ✅ ALL BACKEND TESTS PASSED - Comprehensive testing completed successfully!
      
      Tested all 4 backend tasks with detailed scenarios:
      1. Settings endpoint - GET/PUT, persistence, clamping (9->4, -2->0) ✅
      2. Active Prediction gale chain - LOSS scenario (G0->G1->G2->LOSS), HIT at gale 0, HIT at gale 1 ✅
      3. Auto-advance hook - triggers on POST /rounds and POST /rounds/bulk, auto-predict chain ✅
      4. PredictionStats - by_gale breakdown, current_green_streak, current_red_streak ✅
      
      Additional verifications:
      - History endpoints (GET/DELETE) working correctly
      - skip_white_predictions feature working (predicts red/black instead of white)
      - All existing endpoints regression tested (GET /rounds, POST /predictions/log, POST /rounds/bulk)
      
      Note: Rules system can override max_gales from settings when a rule matches. This is intended behavior.
      All tests disabled rules to test the base gale system without interference.
      
      Backend is fully functional and ready for production use.
  - agent: "testing"
    message: |
      ✅ BOT V3 BACKEND TESTS COMPLETED - All new features working correctly!
      
      Tested Bot v3 features (Pedras Pagadoras Rules + White-Forecast):
      Test Results: 25 PASSED, 0 FAILED (1 minor note below)
      
      1. Pedras Pagadoras Rules System ✅
         - POST /api/rules/seed-pedras: Successfully seeded 16 rules
         - GET /api/rules: Returns all 27 rules (16 new + 11 existing)
         - Idempotency: replace=false skips existing, replace=true replaces all
         - All expected rules found: Gatilho Elite (12/14), Gêmeas, Puxador de Vácuo (13), Espelho (7/9), Pedras Baixas (skip), Combos, Surfe de Cor, Xadrez, Dobradinha
      
      2. Rule Evaluation & Prediction ✅
         - Pedra 14: Correctly triggers Combo rule (higher priority 100 vs 70) → white
         - Pedras Gêmeas: Twin stones (5,5) correctly triggers → white
         - Skip Rule: Three low stones (1,2,3) correctly blocks prediction with 400 error
         - Combo Rule: 4 blacks + 12 correctly triggers Combo → white
         - Priority system working: Combos (100) > Gêmeas (85) > Gatilhos (70)
      
      3. White-Forecast (Horário do Branco) ✅
         - Basic forecast: All fields correct (last_white_time, terminals, next_stone)
         - Targets array: 4 items with correct calculations
           * sniper_short: 5 min ahead (terminal espelho)
           * elite_long: 15 min ahead (ciclo elite)
           * soma_rastro: 7 min ahead (minuto + pedra)
           * soma_rastro_double: 14 min ahead (minuto + pedra×2)
         - Edge cases: Empty DB and No white scenarios handled correctly
      
      4. Regression Tests ✅
         - All existing endpoints working: /settings, /active-prediction, /predictions/stats, /rules, /rules/evaluate
      
      Minor Note (not a failure):
      - Pedra 14 test matched Combo rule instead of simple Pedra 14 rule. This is CORRECT behavior because:
        * Sequence was 9,8,10,11,14 (4 blacks followed by 14)
        * Combo rule has higher priority (100) than Pedra 14 rule (70)
        * System correctly prioritizes more specific patterns
        * Predicted color is still white as expected
      
      All Bot v3 backend features are fully functional and ready for production use.
