"""Backend tests for Blaze Rounds Collector API.

Covers:
- Root endpoint
- POST /api/rounds/bulk (color inference, dedupe, source types, validation)
- POST /api/rounds (single insert + source required)
- GET /api/rounds (listing, source filter, no Mongo _id)
- DELETE /api/rounds (per source / all)
- GET /api/stats (totals, pcts, streak, hot_numbers)
- GET /api/prediction (400 < 5 rounds, valid response otherwise)
"""
import pytest


# ---------- Root ----------
class TestRoot:
    def test_root_returns_200_with_message(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/", timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "message" in data
        assert isinstance(data["message"], str) and len(data["message"]) > 0


# ---------- Bulk insert / dedupe / validation ----------
class TestBulkRounds:
    def test_bulk_insert_with_inferred_colors(self, api_client, base_url):
        # Ensure clean
        api_client.delete(f"{base_url}/api/rounds", params={"source": "tipminer"}, timeout=10)
        payload = {
            "source": "tipminer",
            "rounds": [
                {"number": 0, "time_str": "10:00", "seconds": "01"},   # white
                {"number": 3, "time_str": "10:01", "seconds": "02"},   # red
                {"number": 7, "time_str": "10:02", "seconds": "03"},   # red
                {"number": 8, "time_str": "10:03", "seconds": "04"},   # black
                {"number": 14, "time_str": "10:04", "seconds": "05"},  # black
            ],
        }
        r = api_client.post(f"{base_url}/api/rounds/bulk", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["inserted"] == 5
        assert body["duplicates"] == 0
        assert body["total"] >= 5

        # GET to verify persistence + colors inferred correctly
        g = api_client.get(f"{base_url}/api/rounds", params={"source": "tipminer", "limit": 50}, timeout=10)
        assert g.status_code == 200
        rounds = g.json()
        assert len(rounds) >= 5
        # No _id leaked
        for rd in rounds:
            assert "_id" not in rd
            assert {"id", "number", "color", "source"} <= set(rd.keys())
        by_num = {rd["number"]: rd["color"] for rd in rounds}
        assert by_num[0] == "white"
        assert by_num[3] == "red"
        assert by_num[7] == "red"
        assert by_num[8] == "black"
        assert by_num[14] == "black"

    def test_bulk_dedupe_same_batch_twice(self, api_client, base_url):
        api_client.delete(f"{base_url}/api/rounds", params={"source": "megatroia"}, timeout=10)
        batch = {
            "source": "megatroia",
            "rounds": [
                {"number": 1, "time_str": "11:00", "seconds": "10"},
                {"number": 9, "time_str": "11:01", "seconds": "11"},
                {"number": 0, "time_str": "11:02", "seconds": "12"},
            ],
        }
        r1 = api_client.post(f"{base_url}/api/rounds/bulk", json=batch, timeout=15).json()
        r2 = api_client.post(f"{base_url}/api/rounds/bulk", json=batch, timeout=15).json()
        assert r1["inserted"] == 3 and r1["duplicates"] == 0
        assert r2["inserted"] == 0 and r2["duplicates"] == 3

    def test_bulk_accepts_manual_source(self, api_client, base_url):
        api_client.delete(f"{base_url}/api/rounds", params={"source": "manual"}, timeout=10)
        payload = {
            "source": "manual",
            "rounds": [{"number": 5, "time_str": "12:00", "seconds": "01"}],
        }
        r = api_client.post(f"{base_url}/api/rounds/bulk", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["inserted"] == 1

    def test_bulk_rejects_invalid_source(self, api_client, base_url):
        payload = {"source": "invalid_src", "rounds": [{"number": 1, "time_str": "13:00"}]}
        r = api_client.post(f"{base_url}/api/rounds/bulk", json=payload, timeout=10)
        assert r.status_code == 422

    def test_bulk_rejects_number_out_of_range(self, api_client, base_url):
        payload = {"source": "tipminer", "rounds": [{"number": 15, "time_str": "13:00"}]}
        r = api_client.post(f"{base_url}/api/rounds/bulk", json=payload, timeout=10)
        assert r.status_code == 422

        payload2 = {"source": "tipminer", "rounds": [{"number": -1, "time_str": "13:00"}]}
        r2 = api_client.post(f"{base_url}/api/rounds/bulk", json=payload2, timeout=10)
        assert r2.status_code == 422


# ---------- Single insert ----------
class TestSingleRound:
    def test_single_round_insert_with_source(self, api_client, base_url):
        r = api_client.post(
            f"{base_url}/api/rounds",
            json={"number": 4, "source": "manual", "time_str": "14:00", "seconds": "30"},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["number"] == 4
        assert body["color"] == "red"
        assert body["source"] == "manual"
        assert "id" in body

    def test_single_round_missing_source_returns_400(self, api_client, base_url):
        r = api_client.post(
            f"{base_url}/api/rounds",
            json={"number": 2, "time_str": "14:01"},
            timeout=10,
        )
        assert r.status_code == 400, r.text


# ---------- List / Delete ----------
class TestListAndDelete:
    def test_list_sorted_desc_and_filtered_by_source(self, api_client, base_url):
        # Seed for tipminer
        api_client.delete(f"{base_url}/api/rounds", params={"source": "tipminer"}, timeout=10)
        api_client.post(
            f"{base_url}/api/rounds/bulk",
            json={
                "source": "tipminer",
                "rounds": [
                    {"number": 2, "time_str": "15:00", "seconds": "01"},
                    {"number": 3, "time_str": "15:01", "seconds": "02"},
                    {"number": 4, "time_str": "15:02", "seconds": "03"},
                ],
            },
            timeout=15,
        )
        g = api_client.get(f"{base_url}/api/rounds", params={"source": "tipminer", "limit": 10}, timeout=10)
        assert g.status_code == 200
        rounds = g.json()
        assert all(r["source"] == "tipminer" for r in rounds)
        # captured_at desc (newest first)
        timestamps = [r["captured_at"] for r in rounds]
        assert timestamps == sorted(timestamps, reverse=True)

    def test_delete_only_specified_source(self, api_client, base_url):
        # Ensure data in both sources
        api_client.post(
            f"{base_url}/api/rounds/bulk",
            json={"source": "tipminer", "rounds": [{"number": 6, "time_str": "16:00", "seconds": "01"}]},
            timeout=15,
        )
        api_client.post(
            f"{base_url}/api/rounds/bulk",
            json={"source": "megatroia", "rounds": [{"number": 10, "time_str": "16:00", "seconds": "01"}]},
            timeout=15,
        )
        d = api_client.delete(f"{base_url}/api/rounds", params={"source": "tipminer"}, timeout=10)
        assert d.status_code == 200
        assert "deleted" in d.json() and d.json()["deleted"] >= 1

        tip = api_client.get(f"{base_url}/api/rounds", params={"source": "tipminer", "limit": 50}, timeout=10).json()
        mega = api_client.get(f"{base_url}/api/rounds", params={"source": "megatroia", "limit": 50}, timeout=10).json()
        assert len(tip) == 0
        assert len(mega) >= 1

    def test_delete_all_when_no_source(self, api_client, base_url):
        # Seed
        api_client.post(
            f"{base_url}/api/rounds/bulk",
            json={"source": "manual", "rounds": [{"number": 11, "time_str": "17:00", "seconds": "01"}]},
            timeout=15,
        )
        d = api_client.delete(f"{base_url}/api/rounds", timeout=10)
        assert d.status_code == 200
        assert "deleted" in d.json()

        all_rounds = api_client.get(f"{base_url}/api/rounds", params={"limit": 100}, timeout=10).json()
        assert all_rounds == []


# ---------- Stats ----------
class TestStats:
    def test_stats_after_known_seed(self, api_client, base_url):
        # Clean ALL
        api_client.delete(f"{base_url}/api/rounds", timeout=10)
        # Seed deterministic data on tipminer.
        # Insert oldest-first; since insertion order maps to captured_at (newest = last inserted)
        # we want the latest entries to be a streak of reds.
        seed = [
            {"number": 0, "time_str": "20:00", "seconds": "01"},   # white (oldest)
            {"number": 8, "time_str": "20:01", "seconds": "02"},   # black
            {"number": 9, "time_str": "20:02", "seconds": "03"},   # black
            {"number": 1, "time_str": "20:03", "seconds": "04"},   # red
            {"number": 2, "time_str": "20:04", "seconds": "05"},   # red
            {"number": 3, "time_str": "20:05", "seconds": "06"},   # red (newest)
        ]
        # Insert one-by-one to enforce captured_at order
        for s in seed:
            api_client.post(
                f"{base_url}/api/rounds",
                json={**s, "source": "tipminer"},
                timeout=10,
            )
        r = api_client.get(f"{base_url}/api/stats", params={"source": "tipminer", "limit": 200}, timeout=10)
        assert r.status_code == 200, r.text
        stats = r.json()
        assert stats["total"] == 6
        assert stats["red"] == 3
        assert stats["black"] == 2
        assert stats["white"] == 1
        # pct sum ~= 100
        s_sum = stats["red_pct"] + stats["black_pct"] + stats["white_pct"]
        assert 99.5 <= s_sum <= 100.5
        # 1 decimal place
        for k in ("red_pct", "black_pct", "white_pct"):
            assert round(stats[k], 1) == stats[k]
        # Streak (newest first = 3 reds)
        assert stats["current_streak_color"] == "red"
        assert stats["current_streak_len"] == 3
        # last_white_ago: oldest is white -> index 5 from newest
        assert stats["last_white_ago"] == 5
        # hot_numbers shape
        assert isinstance(stats["hot_numbers"], list)
        assert len(stats["hot_numbers"]) <= 5
        assert all({"number", "count"} <= set(h.keys()) for h in stats["hot_numbers"])


# ---------- Prediction ----------
class TestPrediction:
    def test_prediction_400_when_less_than_5(self, api_client, base_url):
        api_client.delete(f"{base_url}/api/rounds", timeout=10)
        # Insert 4 rounds
        api_client.post(
            f"{base_url}/api/rounds/bulk",
            json={
                "source": "tipminer",
                "rounds": [
                    {"number": 1, "time_str": "21:00", "seconds": "01"},
                    {"number": 2, "time_str": "21:01", "seconds": "02"},
                    {"number": 3, "time_str": "21:02", "seconds": "03"},
                    {"number": 4, "time_str": "21:03", "seconds": "04"},
                ],
            },
            timeout=15,
        )
        r = api_client.get(f"{base_url}/api/prediction", params={"source": "tipminer"}, timeout=10)
        assert r.status_code == 400, r.text

    def test_prediction_valid_response_with_5_plus(self, api_client, base_url):
        api_client.delete(f"{base_url}/api/rounds", timeout=10)
        api_client.post(
            f"{base_url}/api/rounds/bulk",
            json={
                "source": "tipminer",
                "rounds": [
                    {"number": 1, "time_str": "22:00", "seconds": "01"},
                    {"number": 2, "time_str": "22:01", "seconds": "02"},
                    {"number": 8, "time_str": "22:02", "seconds": "03"},
                    {"number": 9, "time_str": "22:03", "seconds": "04"},
                    {"number": 0, "time_str": "22:04", "seconds": "05"},
                    {"number": 5, "time_str": "22:05", "seconds": "06"},
                ],
            },
            timeout=15,
        )
        r = api_client.get(f"{base_url}/api/prediction", params={"source": "tipminer", "window": 50}, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["next_color"] in ("red", "black", "white")
        assert 0 <= body["confidence"] <= 100
        s_sum = body["red_score"] + body["black_score"] + body["white_score"]
        assert 99.0 <= s_sum <= 101.0
        assert isinstance(body["rationale"], str) and len(body["rationale"]) > 0
        # PT-BR rationale heuristic check
        assert any(tok in body["rationale"].lower() for tok in ("janela", "sequencia", "rodada"))
