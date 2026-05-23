#!/usr/bin/env python3
"""
Comprehensive backend test for Bot Repertoire system.
Tests settings, active prediction with gale chain, auto-predict, skip_white, and stats.
"""
import requests
import json
import time
from typing import Optional

# Base URL from frontend/.env EXPO_PUBLIC_BACKEND_URL
BASE_URL = "https://bot-repertoire.preview.emergentagent.com/api"

def log(msg: str):
    print(f"[TEST] {msg}")

def log_error(msg: str):
    print(f"[ERROR] {msg}")

def log_success(msg: str):
    print(f"[SUCCESS] {msg}")

# ============================================================================
# STEP 0: Clear all data and disable rules
# ============================================================================
def clear_all_data():
    log("=== STEP 0: Clearing all data ===")
    
    # Cancel any pending predictions
    r = requests.delete(f"{BASE_URL}/active-prediction")
    log(f"DELETE /active-prediction: {r.status_code} - {r.json()}")
    
    # Clear history
    r = requests.delete(f"{BASE_URL}/active-prediction/history")
    log(f"DELETE /active-prediction/history: {r.status_code} - {r.json()}")
    
    # Clear prediction logs
    r = requests.delete(f"{BASE_URL}/predictions/log")
    log(f"DELETE /predictions/log: {r.status_code} - {r.json()}")
    
    # Clear rounds
    r = requests.delete(f"{BASE_URL}/rounds")
    log(f"DELETE /rounds: {r.status_code} - {r.json()}")
    
    # Disable all rules to prevent interference with tests
    try:
        r = requests.get(f"{BASE_URL}/rules")
        if r.status_code == 200:
            rules = r.json()
            for rule in rules:
                rule_id = rule.get("id")
                if rule_id:
                    # Disable the rule
                    rule["enabled"] = False
                    requests.put(f"{BASE_URL}/rules/{rule_id}", json=rule)
            log(f"Disabled {len(rules)} rules")
    except Exception as e:
        log(f"Warning: Could not disable rules: {e}")
    
    log_success("All data cleared and rules disabled")

# ============================================================================
# STEP 1: Settings Tests
# ============================================================================
def test_settings():
    log("\n=== STEP 1: Testing Settings ===")
    
    # GET current settings (may already exist from previous runs)
    r = requests.get(f"{BASE_URL}/settings")
    assert r.status_code == 200, f"GET /settings failed: {r.status_code}"
    settings = r.json()
    log(f"GET /settings: {json.dumps(settings, indent=2)}")
    
    # Verify structure (values may vary if doc already exists)
    assert "max_gales" in settings, "Expected max_gales in settings"
    assert "preferred_source" in settings, "Expected preferred_source in settings"
    assert "auto_predict" in settings, "Expected auto_predict in settings"
    assert "skip_white_predictions" in settings, "Expected skip_white_predictions in settings"
    log_success("Settings structure verified")
    
    # PUT new settings
    new_settings = {
        "max_gales": 3,
        "preferred_source": "tipminer",
        "auto_predict": False,
        "skip_white_predictions": True
    }
    r = requests.put(f"{BASE_URL}/settings", json=new_settings)
    assert r.status_code == 200, f"PUT /settings failed: {r.status_code}"
    updated = r.json()
    log(f"PUT /settings: {json.dumps(updated, indent=2)}")
    
    # Verify persistence
    r = requests.get(f"{BASE_URL}/settings")
    assert r.status_code == 200, f"GET /settings failed: {r.status_code}"
    settings = r.json()
    assert settings["max_gales"] == 3, f"Expected max_gales=3, got {settings['max_gales']}"
    assert settings["preferred_source"] == "tipminer", f"Expected preferred_source=tipminer, got {settings['preferred_source']}"
    assert settings["auto_predict"] == False, f"Expected auto_predict=False, got {settings['auto_predict']}"
    assert settings["skip_white_predictions"] == True, f"Expected skip_white_predictions=True, got {settings['skip_white_predictions']}"
    log_success("Settings persistence verified")
    
    # Test max_gales clamping to 4
    r = requests.put(f"{BASE_URL}/settings", json={"max_gales": 9, "preferred_source": "blaze", "auto_predict": False, "skip_white_predictions": False})
    assert r.status_code == 200, f"PUT /settings with max_gales=9 failed: {r.status_code}"
    settings = r.json()
    assert settings["max_gales"] == 4, f"Expected max_gales clamped to 4, got {settings['max_gales']}"
    log_success("max_gales=9 clamped to 4")
    
    # Test max_gales clamping to 0
    r = requests.put(f"{BASE_URL}/settings", json={"max_gales": -2, "preferred_source": "blaze", "auto_predict": False, "skip_white_predictions": False})
    assert r.status_code == 200, f"PUT /settings with max_gales=-2 failed: {r.status_code}"
    settings = r.json()
    assert settings["max_gales"] == 0, f"Expected max_gales clamped to 0, got {settings['max_gales']}"
    log_success("max_gales=-2 clamped to 0")
    
    log_success("All settings tests passed")

# ============================================================================
# STEP 2: Active Prediction Lifecycle (LOSS scenario)
# ============================================================================
def test_active_prediction_loss():
    log("\n=== STEP 2: Testing Active Prediction Lifecycle (LOSS) ===")
    
    # Set settings for clean testing
    settings = {
        "max_gales": 2,
        "preferred_source": "blaze",
        "auto_predict": False,
        "skip_white_predictions": False
    }
    r = requests.put(f"{BASE_URL}/settings", json=settings)
    assert r.status_code == 200, f"PUT /settings failed: {r.status_code}"
    log("Settings configured: max_gales=2, auto_predict=False")
    
    # Insert 6 rounds for history
    rounds = [
        {"number": 5, "source": "blaze", "time_str": "10:00"},  # red
        {"number": 9, "source": "blaze", "time_str": "10:01"},  # black
        {"number": 8, "source": "blaze", "time_str": "10:02"},  # black
        {"number": 7, "source": "blaze", "time_str": "10:03"},  # red
        {"number": 10, "source": "blaze", "time_str": "10:04"}, # black
        {"number": 3, "source": "blaze", "time_str": "10:05"},  # red
    ]
    for rd in rounds:
        r = requests.post(f"{BASE_URL}/rounds", json=rd)
        assert r.status_code == 200, f"POST /rounds failed: {r.status_code}"
    log(f"Inserted {len(rounds)} rounds for history")
    
    # Create active prediction
    r = requests.post(f"{BASE_URL}/active-prediction?source=blaze")
    assert r.status_code == 200, f"POST /active-prediction failed: {r.status_code}"
    pred = r.json()
    log(f"POST /active-prediction: {json.dumps(pred, indent=2)}")
    
    # Verify initial state
    assert pred["status"] == "pending", f"Expected status=pending, got {pred['status']}"
    assert pred["current_gale"] == 0, f"Expected current_gale=0, got {pred['current_gale']}"
    assert pred["max_gales"] == 2, f"Expected max_gales=2, got {pred['max_gales']}"
    assert pred["anchor_round_id"] is not None, f"Expected anchor_round_id, got None"
    assert pred["predicted_color"] in ["red", "black", "white"], f"Invalid predicted_color: {pred['predicted_color']}"
    
    predicted_color = pred["predicted_color"]
    pred_id = pred["id"]
    log(f"Predicted color: {predicted_color}")
    log_success("Active prediction created with status=pending, current_gale=0")
    
    # GET active prediction
    r = requests.get(f"{BASE_URL}/active-prediction")
    assert r.status_code == 200, f"GET /active-prediction failed: {r.status_code}"
    active = r.json()
    assert active["id"] == pred_id, f"Expected same prediction id, got different"
    assert active["status"] == "pending", f"Expected status=pending, got {active['status']}"
    log_success("GET /active-prediction returns same prediction")
    
    # Insert 3 rounds that DON'T match prediction (force LOSS)
    if predicted_color == "red":
        miss_rounds = [
            {"number": 8, "source": "blaze", "time_str": "10:06"},   # black
            {"number": 10, "source": "blaze", "time_str": "10:07"},  # black
            {"number": 11, "source": "blaze", "time_str": "10:08"},  # black
        ]
    elif predicted_color == "black":
        miss_rounds = [
            {"number": 2, "source": "blaze", "time_str": "10:06"},  # red
            {"number": 4, "source": "blaze", "time_str": "10:07"},  # red
            {"number": 6, "source": "blaze", "time_str": "10:08"},  # red
        ]
    else:  # white
        miss_rounds = [
            {"number": 3, "source": "blaze", "time_str": "10:06"},  # red
            {"number": 8, "source": "blaze", "time_str": "10:07"},  # black
            {"number": 4, "source": "blaze", "time_str": "10:08"},  # red
        ]
    
    log(f"Inserting 3 miss rounds to force LOSS...")
    
    # After 1st miss
    r = requests.post(f"{BASE_URL}/rounds", json=miss_rounds[0])
    assert r.status_code == 200, f"POST /rounds failed: {r.status_code}"
    time.sleep(0.5)  # Give time for auto-advance
    r = requests.get(f"{BASE_URL}/active-prediction")
    assert r.status_code == 200, f"GET /active-prediction failed: {r.status_code}"
    active = r.json()
    log(f"After 1st miss: status={active['status']}, current_gale={active['current_gale']}, checked_round_ids={len(active['checked_round_ids'])}")
    assert active["status"] == "pending", f"Expected status=pending after 1st miss, got {active['status']}"
    assert active["current_gale"] == 1, f"Expected current_gale=1 after 1st miss, got {active['current_gale']}"
    assert len(active["checked_round_ids"]) == 1, f"Expected 1 checked_round_id, got {len(active['checked_round_ids'])}"
    log_success("After 1st miss: status=pending, current_gale=1, checked_round_ids=1")
    
    # After 2nd miss
    r = requests.post(f"{BASE_URL}/rounds", json=miss_rounds[1])
    assert r.status_code == 200, f"POST /rounds failed: {r.status_code}"
    time.sleep(0.5)
    r = requests.get(f"{BASE_URL}/active-prediction")
    assert r.status_code == 200, f"GET /active-prediction failed: {r.status_code}"
    active = r.json()
    log(f"After 2nd miss: status={active['status']}, current_gale={active['current_gale']}, checked_round_ids={len(active['checked_round_ids'])}")
    assert active["status"] == "pending", f"Expected status=pending after 2nd miss, got {active['status']}"
    assert active["current_gale"] == 2, f"Expected current_gale=2 after 2nd miss, got {active['current_gale']}"
    assert len(active["checked_round_ids"]) == 2, f"Expected 2 checked_round_ids, got {len(active['checked_round_ids'])}"
    log_success("After 2nd miss: status=pending, current_gale=2, checked_round_ids=2")
    
    # After 3rd miss (should be LOSS)
    r = requests.post(f"{BASE_URL}/rounds", json=miss_rounds[2])
    assert r.status_code == 200, f"POST /rounds failed: {r.status_code}"
    time.sleep(0.5)
    r = requests.get(f"{BASE_URL}/active-prediction")
    assert r.status_code == 200, f"GET /active-prediction failed: {r.status_code}"
    active = r.json()
    log(f"After 3rd miss: status={active['status']}, finished_at={active.get('finished_at')}, hit_at_gale={active.get('hit_at_gale')}")
    assert active["status"] == "loss", f"Expected status=loss after 3rd miss, got {active['status']}"
    assert active["finished_at"] is not None, f"Expected finished_at to be set, got None"
    assert active["hit_at_gale"] is None, f"Expected hit_at_gale=None for loss, got {active['hit_at_gale']}"
    log_success("After 3rd miss: status=loss, finished_at set, hit_at_gale=None")
    
    # Check stats
    r = requests.get(f"{BASE_URL}/predictions/stats")
    assert r.status_code == 200, f"GET /predictions/stats failed: {r.status_code}"
    stats = r.json()
    log(f"Stats: total={stats['total']}, hits={stats['hits']}, misses={stats['misses']}")
    assert stats["total"] == 1, f"Expected total=1, got {stats['total']}"
    assert stats["misses"] == 1, f"Expected misses=1, got {stats['misses']}"
    assert stats["hits"] == 0, f"Expected hits=0, got {stats['hits']}"
    log_success("Stats verified: total=1, misses=1, hits=0")
    
    log_success("Active prediction LOSS scenario test passed")

# ============================================================================
# STEP 3: HIT scenario at gale 0
# ============================================================================
def test_active_prediction_hit_gale0():
    log("\n=== STEP 3: Testing Active Prediction HIT at gale 0 ===")
    
    # Clear active prediction
    r = requests.delete(f"{BASE_URL}/active-prediction")
    assert r.status_code == 200, f"DELETE /active-prediction failed: {r.status_code}"
    log("Cleared active prediction")
    
    # Create new prediction
    r = requests.post(f"{BASE_URL}/active-prediction?source=blaze")
    assert r.status_code == 200, f"POST /active-prediction failed: {r.status_code}"
    pred = r.json()
    predicted_color = pred["predicted_color"]
    log(f"Created prediction with color: {predicted_color}")
    
    # Insert ONE round that MATCHES
    if predicted_color == "red":
        match_round = {"number": 2, "source": "blaze", "time_str": "10:20"}
    elif predicted_color == "black":
        match_round = {"number": 8, "source": "blaze", "time_str": "10:20"}
    else:  # white
        match_round = {"number": 0, "source": "blaze", "time_str": "10:20"}
    
    r = requests.post(f"{BASE_URL}/rounds", json=match_round)
    assert r.status_code == 200, f"POST /rounds failed: {r.status_code}"
    log(f"Inserted matching round: {match_round}")
    time.sleep(0.5)
    
    # Check active prediction
    r = requests.get(f"{BASE_URL}/active-prediction")
    assert r.status_code == 200, f"GET /active-prediction failed: {r.status_code}"
    active = r.json()
    log(f"Active prediction: status={active['status']}, hit_at_gale={active.get('hit_at_gale')}")
    assert active["status"] == "hit", f"Expected status=hit, got {active['status']}"
    assert active["hit_at_gale"] == 0, f"Expected hit_at_gale=0, got {active['hit_at_gale']}"
    log_success("HIT at gale 0 verified")
    
    # Check stats
    r = requests.get(f"{BASE_URL}/predictions/stats")
    assert r.status_code == 200, f"GET /predictions/stats failed: {r.status_code}"
    stats = r.json()
    log(f"Stats: total={stats['total']}, hits={stats['hits']}, by_gale={stats.get('by_gale', {})}")
    assert stats["hits"] >= 1, f"Expected hits>=1, got {stats['hits']}"
    assert "0" in stats.get("by_gale", {}), f"Expected '0' in by_gale, got {stats.get('by_gale', {})}"
    assert stats["by_gale"]["0"] >= 1, f"Expected by_gale['0']>=1, got {stats['by_gale']['0']}"
    log_success("Stats verified: hits incremented, by_gale contains '0'")
    
    log_success("HIT at gale 0 test passed")

# ============================================================================
# STEP 4: HIT at gale 1 (after one miss)
# ============================================================================
def test_active_prediction_hit_gale1():
    log("\n=== STEP 4: Testing Active Prediction HIT at gale 1 ===")
    
    # Clear active prediction
    r = requests.delete(f"{BASE_URL}/active-prediction")
    assert r.status_code == 200, f"DELETE /active-prediction failed: {r.status_code}"
    log("Cleared active prediction")
    
    # Create new prediction
    r = requests.post(f"{BASE_URL}/active-prediction?source=blaze")
    assert r.status_code == 200, f"POST /active-prediction failed: {r.status_code}"
    pred = r.json()
    predicted_color = pred["predicted_color"]
    log(f"Created prediction with color: {predicted_color}")
    
    # Insert one MISS round
    if predicted_color == "red":
        miss_round = {"number": 8, "source": "blaze", "time_str": "10:30"}  # black
        match_round = {"number": 2, "source": "blaze", "time_str": "10:31"}  # red
    elif predicted_color == "black":
        miss_round = {"number": 2, "source": "blaze", "time_str": "10:30"}  # red
        match_round = {"number": 8, "source": "blaze", "time_str": "10:31"}  # black
    else:  # white
        miss_round = {"number": 3, "source": "blaze", "time_str": "10:30"}  # red
        match_round = {"number": 0, "source": "blaze", "time_str": "10:31"}  # white
    
    r = requests.post(f"{BASE_URL}/rounds", json=miss_round)
    assert r.status_code == 200, f"POST /rounds failed: {r.status_code}"
    log(f"Inserted miss round: {miss_round}")
    time.sleep(0.5)
    
    # Insert one MATCH round
    r = requests.post(f"{BASE_URL}/rounds", json=match_round)
    assert r.status_code == 200, f"POST /rounds failed: {r.status_code}"
    log(f"Inserted match round: {match_round}")
    time.sleep(0.5)
    
    # Check active prediction
    r = requests.get(f"{BASE_URL}/active-prediction")
    assert r.status_code == 200, f"GET /active-prediction failed: {r.status_code}"
    active = r.json()
    log(f"Active prediction: status={active['status']}, hit_at_gale={active.get('hit_at_gale')}")
    assert active["status"] == "hit", f"Expected status=hit, got {active['status']}"
    assert active["hit_at_gale"] == 1, f"Expected hit_at_gale=1, got {active['hit_at_gale']}"
    log_success("HIT at gale 1 verified")
    
    log_success("HIT at gale 1 test passed")

# ============================================================================
# STEP 5: Auto-predict chain
# ============================================================================
def test_auto_predict_chain():
    log("\n=== STEP 5: Testing Auto-predict chain ===")
    
    # Enable auto_predict
    settings = {
        "max_gales": 2,
        "preferred_source": "blaze",
        "auto_predict": True,
        "skip_white_predictions": False
    }
    r = requests.put(f"{BASE_URL}/settings", json=settings)
    assert r.status_code == 200, f"PUT /settings failed: {r.status_code}"
    log("Enabled auto_predict=True")
    
    # Clear active prediction
    r = requests.delete(f"{BASE_URL}/active-prediction")
    assert r.status_code == 200, f"DELETE /active-prediction failed: {r.status_code}"
    
    # Create new prediction
    r = requests.post(f"{BASE_URL}/active-prediction?source=blaze")
    assert r.status_code == 200, f"POST /active-prediction failed: {r.status_code}"
    pred = r.json()
    original_id = pred["id"]
    predicted_color = pred["predicted_color"]
    log(f"Created prediction with id={original_id}, color={predicted_color}")
    
    # Insert matching round to finish it
    if predicted_color == "red":
        match_round = {"number": 2, "source": "blaze", "time_str": "10:40"}
    elif predicted_color == "black":
        match_round = {"number": 8, "source": "blaze", "time_str": "10:40"}
    else:  # white
        match_round = {"number": 0, "source": "blaze", "time_str": "10:40"}
    
    r = requests.post(f"{BASE_URL}/rounds", json=match_round)
    assert r.status_code == 200, f"POST /rounds failed: {r.status_code}"
    log(f"Inserted matching round to finish prediction")
    time.sleep(1)  # Give time for auto-predict to trigger
    
    # Check active prediction - should be a NEW one
    r = requests.get(f"{BASE_URL}/active-prediction")
    assert r.status_code == 200, f"GET /active-prediction failed: {r.status_code}"
    active = r.json()
    log(f"Active prediction after auto-predict: id={active['id']}, status={active['status']}")
    
    # Verify it's a different prediction
    if active["id"] == original_id:
        # Could be the same if it's still showing the finished one
        # Check if status is pending (new) or hit (old)
        if active["status"] == "pending":
            log_success("Auto-predict created new pending prediction (same id reused - unlikely but possible)")
        else:
            log_error(f"Expected new pending prediction, but got status={active['status']} with same id")
            # This might be timing issue - the new prediction might not be created yet
            log("Waiting a bit more and retrying...")
            time.sleep(2)
            r = requests.get(f"{BASE_URL}/active-prediction")
            active = r.json()
            log(f"Retry: id={active['id']}, status={active['status']}")
    
    # The new prediction should be pending
    assert active["status"] == "pending", f"Expected new prediction to be pending, got {active['status']}"
    log_success(f"Auto-predict created new prediction with id={active['id']}, status=pending")
    
    log_success("Auto-predict chain test passed")

# ============================================================================
# STEP 6: Skip white predictions
# ============================================================================
def test_skip_white():
    log("\n=== STEP 6: Testing skip_white_predictions ===")
    
    # Set skip_white_predictions=True
    settings = {
        "max_gales": 2,
        "preferred_source": "blaze",
        "auto_predict": False,
        "skip_white_predictions": True
    }
    r = requests.put(f"{BASE_URL}/settings", json=settings)
    assert r.status_code == 200, f"PUT /settings failed: {r.status_code}"
    log("Enabled skip_white_predictions=True")
    
    # Insert 8 rounds of mixed red/black (no white) to make algorithm want white
    rounds = [
        {"number": 2, "source": "blaze", "time_str": "11:00"},  # red
        {"number": 8, "source": "blaze", "time_str": "11:01"},  # black
        {"number": 3, "source": "blaze", "time_str": "11:02"},  # red
        {"number": 9, "source": "blaze", "time_str": "11:03"},  # black
        {"number": 4, "source": "blaze", "time_str": "11:04"},  # red
        {"number": 10, "source": "blaze", "time_str": "11:05"}, # black
        {"number": 5, "source": "blaze", "time_str": "11:06"},  # red
        {"number": 11, "source": "blaze", "time_str": "11:07"}, # black
    ]
    for rd in rounds:
        r = requests.post(f"{BASE_URL}/rounds", json=rd)
        assert r.status_code == 200, f"POST /rounds failed: {r.status_code}"
    log(f"Inserted {len(rounds)} rounds (no white)")
    
    # Clear active prediction
    r = requests.delete(f"{BASE_URL}/active-prediction")
    assert r.status_code == 200, f"DELETE /active-prediction failed: {r.status_code}"
    
    # Create new prediction
    r = requests.post(f"{BASE_URL}/active-prediction?source=blaze")
    assert r.status_code == 200, f"POST /active-prediction failed: {r.status_code}"
    pred = r.json()
    predicted_color = pred["predicted_color"]
    log(f"Predicted color with skip_white=True: {predicted_color}")
    
    # Verify it's NOT white
    assert predicted_color in ["red", "black"], f"Expected red or black, got {predicted_color}"
    log_success(f"skip_white_predictions working: predicted {predicted_color} (not white)")
    
    log_success("Skip white test passed")

# ============================================================================
# STEP 7: History and clear
# ============================================================================
def test_history():
    log("\n=== STEP 7: Testing history endpoints ===")
    
    # GET history
    r = requests.get(f"{BASE_URL}/active-prediction/history?limit=5")
    assert r.status_code == 200, f"GET /active-prediction/history failed: {r.status_code}"
    history = r.json()
    log(f"GET /active-prediction/history: {len(history)} items")
    assert isinstance(history, list), f"Expected list, got {type(history)}"
    log_success(f"History returned {len(history)} finished predictions")
    
    # DELETE history
    r = requests.delete(f"{BASE_URL}/active-prediction/history")
    assert r.status_code == 200, f"DELETE /active-prediction/history failed: {r.status_code}"
    result = r.json()
    log(f"DELETE /active-prediction/history: {result}")
    assert "deleted" in result, f"Expected 'deleted' in response, got {result}"
    log_success(f"Deleted {result['deleted']} history items")
    
    # GET history again - should be empty
    r = requests.get(f"{BASE_URL}/active-prediction/history")
    assert r.status_code == 200, f"GET /active-prediction/history failed: {r.status_code}"
    history = r.json()
    assert len(history) == 0, f"Expected empty history, got {len(history)} items"
    log_success("History is empty after clear")
    
    log_success("History tests passed")

# ============================================================================
# STEP 8: Existing endpoints regression
# ============================================================================
def test_existing_endpoints():
    log("\n=== STEP 8: Testing existing endpoints regression ===")
    
    # GET /predictions/stats - verify new fields
    r = requests.get(f"{BASE_URL}/predictions/stats")
    assert r.status_code == 200, f"GET /predictions/stats failed: {r.status_code}"
    stats = r.json()
    log(f"Stats: {json.dumps(stats, indent=2)}")
    assert "by_gale" in stats, f"Expected 'by_gale' in stats"
    assert "current_green_streak" in stats, f"Expected 'current_green_streak' in stats"
    assert "current_red_streak" in stats, f"Expected 'current_red_streak' in stats"
    log_success("Stats has new fields: by_gale, current_green_streak, current_red_streak")
    
    # GET /health (if exists)
    try:
        r = requests.get(f"{BASE_URL.replace('/api', '')}/health")
        if r.status_code == 200:
            log_success("GET /health works")
        else:
            log(f"GET /health returned {r.status_code} (might not exist)")
    except Exception as e:
        log(f"GET /health not available: {e}")
    
    # GET /rounds
    r = requests.get(f"{BASE_URL}/rounds?limit=10")
    assert r.status_code == 200, f"GET /rounds failed: {r.status_code}"
    rounds = r.json()
    assert isinstance(rounds, list), f"Expected list, got {type(rounds)}"
    log_success(f"GET /rounds works, returned {len(rounds)} rounds")
    
    # POST /predictions/log
    log_data = {
        "predicted_color": "red",
        "actual_color": "black",
        "source": "blaze",
        "confidence": 75.0,
        "note": "test log"
    }
    r = requests.post(f"{BASE_URL}/predictions/log", json=log_data)
    assert r.status_code == 200, f"POST /predictions/log failed: {r.status_code}"
    log_success("POST /predictions/log works")
    
    # POST /rounds/bulk - verify auto-advance triggers
    bulk_data = {
        "source": "blaze",
        "rounds": [
            {"number": 6, "time_str": "12:00"}
        ]
    }
    r = requests.post(f"{BASE_URL}/rounds/bulk", json=bulk_data)
    assert r.status_code == 200, f"POST /rounds/bulk failed: {r.status_code}"
    result = r.json()
    log(f"POST /rounds/bulk: {result}")
    log_success("POST /rounds/bulk works (auto-advance should trigger)")
    
    log_success("All existing endpoints regression tests passed")

# ============================================================================
# Main test runner
# ============================================================================
def main():
    log("Starting comprehensive backend tests for Bot Repertoire")
    log(f"Base URL: {BASE_URL}")
    
    try:
        # Step 0: Clear all data
        clear_all_data()
        
        # Step 1: Settings
        test_settings()
        
        # Step 2: Active Prediction LOSS
        test_active_prediction_loss()
        
        # Step 3: HIT at gale 0
        test_active_prediction_hit_gale0()
        
        # Step 4: HIT at gale 1
        test_active_prediction_hit_gale1()
        
        # Step 5: Auto-predict chain
        test_auto_predict_chain()
        
        # Step 6: Skip white
        test_skip_white()
        
        # Step 7: History
        test_history()
        
        # Step 8: Existing endpoints
        test_existing_endpoints()
        
        log("\n" + "="*70)
        log_success("ALL TESTS PASSED!")
        log("="*70)
        
    except AssertionError as e:
        log_error(f"Test failed: {e}")
        raise
    except Exception as e:
        log_error(f"Unexpected error: {e}")
        raise

if __name__ == "__main__":
    main()
