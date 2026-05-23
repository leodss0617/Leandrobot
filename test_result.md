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
  version: "2.0"
  test_sequence: 2
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
