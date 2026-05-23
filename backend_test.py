#!/usr/bin/env python3
"""
Backend Test Suite for Bot v3 - Pedras Pagadoras Rules + White-Forecast
Tests the new features as specified in the review request.
"""

import requests
import json
from typing import Dict, Any, List, Optional

# Base URL from review request
BASE_URL = "https://bot-repertoire.preview.emergentagent.com/api"

class TestResult:
    def __init__(self):
        self.passed = []
        self.failed = []
        self.warnings = []
    
    def add_pass(self, test_name: str, details: str = ""):
        self.passed.append({"test": test_name, "details": details})
        print(f"✅ PASS: {test_name}")
        if details:
            print(f"   {details}")
    
    def add_fail(self, test_name: str, details: str):
        self.failed.append({"test": test_name, "details": details})
        print(f"❌ FAIL: {test_name}")
        print(f"   {details}")
    
    def add_warning(self, test_name: str, details: str):
        self.warnings.append({"test": test_name, "details": details})
        print(f"⚠️  WARNING: {test_name}")
        print(f"   {details}")
    
    def summary(self):
        print("\n" + "="*80)
        print("TEST SUMMARY")
        print("="*80)
        print(f"✅ Passed: {len(self.passed)}")
        print(f"❌ Failed: {len(self.failed)}")
        print(f"⚠️  Warnings: {len(self.warnings)}")
        
        if self.failed:
            print("\n" + "="*80)
            print("FAILED TESTS:")
            print("="*80)
            for fail in self.failed:
                print(f"\n❌ {fail['test']}")
                print(f"   {fail['details']}")
        
        return len(self.failed) == 0

result = TestResult()

def make_request(method: str, endpoint: str, **kwargs) -> tuple[Optional[requests.Response], Optional[str]]:
    """Make HTTP request and return response or error"""
    url = f"{BASE_URL}{endpoint}"
    try:
        resp = requests.request(method, url, timeout=10, **kwargs)
        return resp, None
    except Exception as e:
        return None, str(e)

def insert_round(number: int, time_str: str, source: str = "blaze") -> bool:
    """Helper to insert a single round"""
    resp, err = make_request("POST", "/rounds", json={
        "number": number,
        "source": source,
        "time_str": time_str
    })
    if err or not resp or resp.status_code != 200:
        return False
    return True

def insert_rounds_sequence(numbers: List[int], start_time: str = "10:01", source: str = "blaze") -> bool:
    """Helper to insert a sequence of rounds with incrementing times"""
    hour, minute = map(int, start_time.split(":"))
    for i, num in enumerate(numbers):
        new_minute = minute + i
        new_hour = hour + (new_minute // 60)
        new_minute = new_minute % 60
        time_str = f"{new_hour:02d}:{new_minute:02d}"
        if not insert_round(num, time_str, source):
            return False
    return True

print("="*80)
print("BOT V3 BACKEND TEST SUITE")
print("Testing Pedras Pagadoras Rules + White-Forecast")
print("="*80)
print(f"Base URL: {BASE_URL}\n")

# ============================================================================
# STEP 1: CLEAN FIRST
# ============================================================================
print("\n" + "="*80)
print("STEP 1: CLEANING DATABASE")
print("="*80)

# DELETE /api/rounds
resp, err = make_request("DELETE", "/rounds")
if err:
    result.add_fail("Clean: DELETE /rounds", f"Request failed: {err}")
elif resp.status_code != 200:
    result.add_fail("Clean: DELETE /rounds", f"Status {resp.status_code}: {resp.text}")
else:
    result.add_pass("Clean: DELETE /rounds", f"Deleted {resp.json().get('deleted', 0)} rounds")

# DELETE /api/active-prediction
resp, err = make_request("DELETE", "/active-prediction")
if err:
    result.add_fail("Clean: DELETE /active-prediction", f"Request failed: {err}")
elif resp.status_code != 200:
    result.add_fail("Clean: DELETE /active-prediction", f"Status {resp.status_code}: {resp.text}")
else:
    result.add_pass("Clean: DELETE /active-prediction", f"Cancelled {resp.json().get('cancelled', 0)} predictions")

# DELETE /api/active-prediction/history
resp, err = make_request("DELETE", "/active-prediction/history")
if err:
    result.add_fail("Clean: DELETE /active-prediction/history", f"Request failed: {err}")
elif resp.status_code != 200:
    result.add_fail("Clean: DELETE /active-prediction/history", f"Status {resp.status_code}: {resp.text}")
else:
    result.add_pass("Clean: DELETE /active-prediction/history", f"Deleted {resp.json().get('deleted', 0)} history items")

# PUT /api/settings
settings_payload = {
    "max_gales": 2,
    "preferred_source": "blaze",
    "auto_predict": False,
    "skip_white_predictions": False
}
resp, err = make_request("PUT", "/settings", json=settings_payload)
if err:
    result.add_fail("Clean: PUT /settings", f"Request failed: {err}")
elif resp.status_code != 200:
    result.add_fail("Clean: PUT /settings", f"Status {resp.status_code}: {resp.text}")
else:
    data = resp.json()
    if data.get("max_gales") == 2 and data.get("preferred_source") == "blaze":
        result.add_pass("Clean: PUT /settings", "Settings configured correctly")
    else:
        result.add_fail("Clean: PUT /settings", f"Settings mismatch: {data}")

# ============================================================================
# STEP 2: SEED PEDRAS PAGADORAS RULES
# ============================================================================
print("\n" + "="*80)
print("STEP 2: SEED PEDRAS PAGADORAS RULES")
print("="*80)

resp, err = make_request("POST", "/rules/seed-pedras?replace=true")
if err:
    result.add_fail("Seed Pedras Rules", f"Request failed: {err}")
elif resp.status_code != 200:
    result.add_fail("Seed Pedras Rules", f"Status {resp.status_code}: {resp.text}")
else:
    data = resp.json()
    inserted = data.get("inserted", 0)
    total_seed = data.get("total_seed", 0)
    
    if inserted >= 14 and total_seed >= 14:
        result.add_pass("Seed Pedras Rules", f"Inserted {inserted}, total_seed {total_seed}")
    else:
        result.add_fail("Seed Pedras Rules", f"Expected inserted >= 14, got {inserted}. total_seed: {total_seed}")

# Verify rules were created
resp, err = make_request("GET", "/rules")
if err:
    result.add_fail("Verify Seeded Rules", f"Request failed: {err}")
elif resp.status_code != 200:
    result.add_fail("Verify Seeded Rules", f"Status {resp.status_code}: {resp.text}")
else:
    rules = resp.json()
    if not isinstance(rules, list):
        result.add_fail("Verify Seeded Rules", f"Expected list, got {type(rules)}")
    else:
        # Check for expected rule names
        rule_names = [r.get("name", "") for r in rules]
        expected_names = [
            "🎯 Pedra 12 (Gatilho Elite) → BRANCO",
            "🎯 Pedra 14 (Gatilho Elite) → BRANCO",
            "🌀 Pedra 13 (Puxador de Vácuo) → BRANCO",
            "👯 Pedras Gêmeas → BRANCO",
            "🪞 Pedra 7 ou 9 (Espelho/Fim de Ciclo) → BRANCO",
            "❄️ Pedras Baixas (3x 1/2/3) → NÃO ENTRAR",
            "🔥 Combo: 12/14 após 4 pretos seguidos → BRANCO",
            "🏄 Surfe de Cor (5+ vermelhos) → VERMELHO",
            "🏄 Surfe de Cor (5+ pretos) → PRETO",
            "♟️ Xadrez longo após 6 alternâncias → quebra",
            "🎲 Dobradinha"
        ]
        
        found_count = 0
        missing = []
        for expected in expected_names:
            # Partial match for some names
            if any(expected in name for name in rule_names):
                found_count += 1
            else:
                missing.append(expected)
        
        if found_count >= 10:
            result.add_pass("Verify Seeded Rules", f"Found {len(rules)} rules, matched {found_count} expected patterns")
        else:
            result.add_warning("Verify Seeded Rules", f"Only found {found_count} of expected rule patterns. Missing: {missing}")

# ============================================================================
# STEP 3: TEST PEDRA 14 (GATILHO ELITE) RULE
# ============================================================================
print("\n" + "="*80)
print("STEP 3: TEST PEDRA 14 (GATILHO ELITE) RULE")
print("="*80)

# Clean rounds first
make_request("DELETE", "/rounds")
make_request("DELETE", "/active-prediction")

# Insert sequence: 9, 8, 10, 11, 14
if not insert_rounds_sequence([9, 8, 10, 11, 14], "10:01"):
    result.add_fail("Pedra 14 Test: Insert Rounds", "Failed to insert rounds")
else:
    result.add_pass("Pedra 14 Test: Insert Rounds", "Inserted sequence: 9, 8, 10, 11, 14")
    
    # POST /api/active-prediction?source=blaze
    resp, err = make_request("POST", "/active-prediction?source=blaze")
    if err:
        result.add_fail("Pedra 14 Test: Create Prediction", f"Request failed: {err}")
    elif resp.status_code != 200:
        result.add_fail("Pedra 14 Test: Create Prediction", f"Status {resp.status_code}: {resp.text}")
    else:
        data = resp.json()
        predicted_color = data.get("predicted_color")
        rule_name = data.get("rule_name", "")
        
        if predicted_color == "white" and "Pedra 14" in rule_name:
            result.add_pass("Pedra 14 Test: Prediction", f"Predicted white with rule: {rule_name}")
        else:
            result.add_fail("Pedra 14 Test: Prediction", 
                          f"Expected predicted_color='white' and rule_name containing 'Pedra 14', "
                          f"got predicted_color='{predicted_color}', rule_name='{rule_name}'")

# ============================================================================
# STEP 4: TEST PEDRAS GÊMEAS RULE
# ============================================================================
print("\n" + "="*80)
print("STEP 4: TEST PEDRAS GÊMEAS (TWIN STONES) RULE")
print("="*80)

make_request("DELETE", "/active-prediction")
make_request("DELETE", "/rounds")

# Insert sequence: 9, 3, 7, 5, 5 (twin at the end)
if not insert_rounds_sequence([9, 3, 7, 5, 5], "10:01"):
    result.add_fail("Pedras Gêmeas Test: Insert Rounds", "Failed to insert rounds")
else:
    result.add_pass("Pedras Gêmeas Test: Insert Rounds", "Inserted sequence: 9, 3, 7, 5, 5")
    
    resp, err = make_request("POST", "/active-prediction?source=blaze")
    if err:
        result.add_fail("Pedras Gêmeas Test: Create Prediction", f"Request failed: {err}")
    elif resp.status_code != 200:
        result.add_fail("Pedras Gêmeas Test: Create Prediction", f"Status {resp.status_code}: {resp.text}")
    else:
        data = resp.json()
        predicted_color = data.get("predicted_color")
        rule_name = data.get("rule_name", "")
        
        if predicted_color == "white" and "Gêmeas" in rule_name:
            result.add_pass("Pedras Gêmeas Test: Prediction", f"Predicted white with rule: {rule_name}")
        else:
            result.add_fail("Pedras Gêmeas Test: Prediction",
                          f"Expected predicted_color='white' and rule_name containing 'Gêmeas', "
                          f"got predicted_color='{predicted_color}', rule_name='{rule_name}'")

# ============================================================================
# STEP 5: TEST SKIP RULE (PEDRAS BAIXAS - RESFRIAMENTO)
# ============================================================================
print("\n" + "="*80)
print("STEP 5: TEST SKIP RULE (PEDRAS BAIXAS - RESFRIAMENTO)")
print("="*80)

make_request("DELETE", "/active-prediction")
make_request("DELETE", "/rounds")

# Insert sequence: 9, 8, 1, 2, 3 (three low stones at the end)
if not insert_rounds_sequence([9, 8, 1, 2, 3], "10:01"):
    result.add_fail("Skip Rule Test: Insert Rounds", "Failed to insert rounds")
else:
    result.add_pass("Skip Rule Test: Insert Rounds", "Inserted sequence: 9, 8, 1, 2, 3")
    
    resp, err = make_request("POST", "/active-prediction?source=blaze")
    if err:
        result.add_fail("Skip Rule Test: Create Prediction", f"Request failed: {err}")
    elif resp.status_code == 400:
        # Expected: 400 error when skip rule blocks prediction
        result.add_pass("Skip Rule Test: Prediction Blocked", f"Got expected 400 error: {resp.text}")
    elif resp.status_code == 200:
        # Check if prediction was NOT created (None response)
        data = resp.json()
        if data is None or not data:
            result.add_pass("Skip Rule Test: Prediction Blocked", "No prediction created (skip rule active)")
        else:
            result.add_fail("Skip Rule Test: Prediction Blocked",
                          f"Expected 400 or no prediction, but got 200 with data: {data}")
    else:
        result.add_fail("Skip Rule Test: Prediction Blocked",
                      f"Unexpected status {resp.status_code}: {resp.text}")

# ============================================================================
# STEP 6: TEST COMBO (12/14 + 4 SAME COLOR)
# ============================================================================
print("\n" + "="*80)
print("STEP 6: TEST COMBO (12/14 + 4 SAME COLOR)")
print("="*80)

make_request("DELETE", "/active-prediction")
make_request("DELETE", "/rounds")

# Insert sequence: 9 (black), 8 (black), 10 (black), 11 (black), 12 (red)
# 4 blacks followed by 12 (which is red)
if not insert_rounds_sequence([9, 8, 10, 11, 12], "10:01"):
    result.add_fail("Combo Test: Insert Rounds", "Failed to insert rounds")
else:
    result.add_pass("Combo Test: Insert Rounds", "Inserted sequence: 9, 8, 10, 11, 12 (4 blacks + 12)")
    
    # First check with /rules/evaluate
    resp, err = make_request("GET", "/rules/evaluate?source=blaze")
    if err:
        result.add_warning("Combo Test: Evaluate Rules", f"Request failed: {err}")
    elif resp.status_code != 200:
        result.add_warning("Combo Test: Evaluate Rules", f"Status {resp.status_code}: {resp.text}")
    else:
        data = resp.json()
        if data.get("matched"):
            rule = data.get("rule", {})
            rule_name = rule.get("name", "")
            if "Combo" in rule_name and "pretos" in rule_name:
                result.add_pass("Combo Test: Rule Evaluation", f"Matched combo rule: {rule_name}")
            else:
                result.add_warning("Combo Test: Rule Evaluation", 
                                 f"Matched rule but not combo: {rule_name}")
        else:
            result.add_warning("Combo Test: Rule Evaluation", "No rule matched")
    
    # Now create prediction
    resp, err = make_request("POST", "/active-prediction?source=blaze")
    if err:
        result.add_fail("Combo Test: Create Prediction", f"Request failed: {err}")
    elif resp.status_code != 200:
        result.add_fail("Combo Test: Create Prediction", f"Status {resp.status_code}: {resp.text}")
    else:
        data = resp.json()
        rule_name = data.get("rule_name", "")
        
        if "Combo" in rule_name and "pretos" in rule_name:
            result.add_pass("Combo Test: Prediction", f"Used combo rule: {rule_name}")
        else:
            result.add_fail("Combo Test: Prediction",
                          f"Expected rule_name containing 'Combo' and 'pretos', got: {rule_name}")

# ============================================================================
# STEP 7: TEST WHITE-FORECAST
# ============================================================================
print("\n" + "="*80)
print("STEP 7: TEST WHITE-FORECAST")
print("="*80)

make_request("DELETE", "/rounds")

# Insert chronologically (oldest first): 5, 9, 11, 7
# Then insert white round at 10:22
# Then insert 7 after white
rounds_to_insert = [
    (5, "10:18"),
    (9, "10:19"),
    (11, "10:20"),
    (7, "10:21"),
    (0, "10:22"),  # white
    (7, "10:23"),  # stone after white
]

success = True
for num, time_str in rounds_to_insert:
    if not insert_round(num, time_str):
        success = False
        break

if not success:
    result.add_fail("White-Forecast Test: Insert Rounds", "Failed to insert rounds")
else:
    result.add_pass("White-Forecast Test: Insert Rounds", "Inserted sequence with white at 10:22")
    
    resp, err = make_request("GET", "/white-forecast?source=blaze")
    if err:
        result.add_fail("White-Forecast Test: Get Forecast", f"Request failed: {err}")
    elif resp.status_code != 200:
        result.add_fail("White-Forecast Test: Get Forecast", f"Status {resp.status_code}: {resp.text}")
    else:
        data = resp.json()
        
        # Verify fields
        checks = []
        
        last_white_time = data.get("last_white_time")
        if last_white_time == "10:22":
            checks.append("✓ last_white_time = 10:22")
        else:
            checks.append(f"✗ last_white_time = {last_white_time} (expected 10:22)")
        
        last_white_terminal = data.get("last_white_terminal")
        if last_white_terminal == 2:
            checks.append("✓ last_white_terminal = 2")
        else:
            checks.append(f"✗ last_white_terminal = {last_white_terminal} (expected 2)")
        
        mirror_terminal = data.get("mirror_terminal")
        if mirror_terminal == 7:
            checks.append("✓ mirror_terminal = 7")
        else:
            checks.append(f"✗ mirror_terminal = {mirror_terminal} (expected 7)")
        
        next_stone_after_white = data.get("next_stone_after_white")
        if next_stone_after_white == 7:
            checks.append("✓ next_stone_after_white = 7")
        else:
            checks.append(f"✗ next_stone_after_white = {next_stone_after_white} (expected 7)")
        
        targets = data.get("targets", [])
        if len(targets) >= 4:
            checks.append(f"✓ targets array has {len(targets)} items (>= 4)")
            
            # Check for specific target types
            target_types = [t.get("type") for t in targets]
            
            if "sniper_short" in target_types:
                sniper = next(t for t in targets if t.get("type") == "sniper_short")
                if sniper.get("time_str") == "10:27" and sniper.get("minutes_ahead") == 5:
                    checks.append("✓ sniper_short target: 10:27, 5 min ahead")
                else:
                    checks.append(f"✗ sniper_short: {sniper.get('time_str')}, {sniper.get('minutes_ahead')} min")
            else:
                checks.append("✗ sniper_short target not found")
            
            if "elite_long" in target_types:
                elite = next(t for t in targets if t.get("type") == "elite_long")
                # Should be around 10:37 (15 min ahead, but could be 11 min for elite_long)
                checks.append(f"✓ elite_long target: {elite.get('time_str')}, {elite.get('minutes_ahead')} min ahead")
            else:
                checks.append("✗ elite_long target not found")
            
            soma_targets = [t for t in targets if t.get("type") == "soma_rastro"]
            if soma_targets:
                soma = soma_targets[0]
                if soma.get("time_str") == "10:29" and soma.get("minutes_ahead") == 7:
                    checks.append("✓ soma_rastro target: 10:29, 7 min ahead")
                else:
                    checks.append(f"✗ soma_rastro: {soma.get('time_str')}, {soma.get('minutes_ahead')} min")
            else:
                checks.append("✗ soma_rastro target not found")
            
            soma_double_targets = [t for t in targets if t.get("type") == "soma_rastro_double"]
            if soma_double_targets:
                soma_double = soma_double_targets[0]
                if soma_double.get("time_str") == "10:36" and soma_double.get("minutes_ahead") == 14:
                    checks.append("✓ soma_rastro_double target: 10:36, 14 min ahead")
                else:
                    checks.append(f"✗ soma_rastro_double: {soma_double.get('time_str')}, {soma_double.get('minutes_ahead')} min")
            else:
                checks.append("✗ soma_rastro_double target not found")
        else:
            checks.append(f"✗ targets array has only {len(targets)} items (expected >= 4)")
        
        # Determine pass/fail
        failed_checks = [c for c in checks if c.startswith("✗")]
        if not failed_checks:
            result.add_pass("White-Forecast Test: Forecast Data", "\n   ".join(checks))
        else:
            result.add_fail("White-Forecast Test: Forecast Data", "\n   ".join(checks))

# ============================================================================
# STEP 8: WHITE-FORECAST EDGE CASES
# ============================================================================
print("\n" + "="*80)
print("STEP 8: WHITE-FORECAST EDGE CASES")
print("="*80)

# Test 8a: Empty database
make_request("DELETE", "/rounds")

resp, err = make_request("GET", "/white-forecast?source=blaze")
if err:
    result.add_fail("White-Forecast Edge: Empty DB", f"Request failed: {err}")
elif resp.status_code != 200:
    result.add_fail("White-Forecast Edge: Empty DB", f"Status {resp.status_code}: {resp.text}")
else:
    data = resp.json()
    notes = data.get("notes", "")
    targets = data.get("targets", [])
    
    if "Sem rodadas" in notes and len(targets) == 0:
        result.add_pass("White-Forecast Edge: Empty DB", f"Correct response: {notes}")
    else:
        result.add_fail("White-Forecast Edge: Empty DB",
                      f"Expected notes about 'Sem rodadas' and empty targets, got: {data}")

# Test 8b: Rounds but no white
insert_rounds_sequence([9, 8, 10, 11, 12], "10:01")

resp, err = make_request("GET", "/white-forecast?source=blaze")
if err:
    result.add_fail("White-Forecast Edge: No White", f"Request failed: {err}")
elif resp.status_code != 200:
    result.add_fail("White-Forecast Edge: No White", f"Status {resp.status_code}: {resp.text}")
else:
    data = resp.json()
    notes = data.get("notes", "")
    targets = data.get("targets", [])
    
    if "Nenhum branco" in notes and len(targets) == 0:
        result.add_pass("White-Forecast Edge: No White", f"Correct response: {notes}")
    else:
        result.add_fail("White-Forecast Edge: No White",
                      f"Expected notes about 'Nenhum branco' and empty targets, got: {data}")

# ============================================================================
# STEP 9: REGRESSION - EXISTING ENDPOINTS
# ============================================================================
print("\n" + "="*80)
print("STEP 9: REGRESSION TEST - EXISTING ENDPOINTS")
print("="*80)

endpoints_to_test = [
    ("GET", "/settings"),
    ("GET", "/active-prediction"),
    ("GET", "/predictions/stats"),
    ("GET", "/rules"),
    ("GET", "/rules/evaluate?source=blaze"),
]

for method, endpoint in endpoints_to_test:
    resp, err = make_request(method, endpoint)
    if err:
        result.add_fail(f"Regression: {method} {endpoint}", f"Request failed: {err}")
    elif resp.status_code != 200:
        result.add_fail(f"Regression: {method} {endpoint}", f"Status {resp.status_code}: {resp.text}")
    else:
        result.add_pass(f"Regression: {method} {endpoint}", "Endpoint working")

# ============================================================================
# STEP 10: IDEMPOTENCY OF SEED
# ============================================================================
print("\n" + "="*80)
print("STEP 10: IDEMPOTENCY OF SEED")
print("="*80)

# Test 10a: Seed without replace (should skip existing)
resp, err = make_request("POST", "/rules/seed-pedras?replace=false")
if err:
    result.add_fail("Idempotency: Seed without replace", f"Request failed: {err}")
elif resp.status_code != 200:
    result.add_fail("Idempotency: Seed without replace", f"Status {resp.status_code}: {resp.text}")
else:
    data = resp.json()
    inserted = data.get("inserted", 0)
    skipped = data.get("skipped_existing", 0)
    
    if inserted == 0 and skipped >= 14:
        result.add_pass("Idempotency: Seed without replace", 
                       f"Correctly skipped existing: inserted={inserted}, skipped={skipped}")
    else:
        result.add_fail("Idempotency: Seed without replace",
                      f"Expected inserted=0 and skipped>=14, got inserted={inserted}, skipped={skipped}")

# Test 10b: Seed with replace (should replace all)
resp, err = make_request("POST", "/rules/seed-pedras?replace=true")
if err:
    result.add_fail("Idempotency: Seed with replace", f"Request failed: {err}")
elif resp.status_code != 200:
    result.add_fail("Idempotency: Seed with replace", f"Status {resp.status_code}: {resp.text}")
else:
    data = resp.json()
    inserted = data.get("inserted", 0)
    
    if inserted >= 14:
        result.add_pass("Idempotency: Seed with replace", f"Correctly replaced: inserted={inserted}")
    else:
        result.add_fail("Idempotency: Seed with replace",
                      f"Expected inserted>=14, got inserted={inserted}")

# ============================================================================
# FINAL SUMMARY
# ============================================================================
print("\n")
success = result.summary()

if success:
    print("\n🎉 ALL TESTS PASSED!")
    exit(0)
else:
    print("\n💥 SOME TESTS FAILED - See details above")
    exit(1)
