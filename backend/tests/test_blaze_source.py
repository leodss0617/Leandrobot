"""Backend regression tests for the Blaze auto-collector flow.

Covers the new features added for the mobile auto-collector screen:
- POST /api/rounds/bulk with source=blaze
- Color inference for blaze rounds (0=white, 1-7=red, 8-14=black)
- Dedupe with seconds (strict) and without seconds (MAX 2 per minute)
- GET /api/rounds?source=blaze with no _id leak, newest-first ordering
- GET /api/stats?source=blaze shape and values
- DELETE /api/rounds?source=blaze scoped delete
- GET /api/poll-status structure (US backend likely blocked)
- GET /api/prediction?source=blaze after 5+ rounds
- Active prediction lifecycle: POST/GET/DELETE /api/active-prediction
"""
import pytest


# ----------- helpers -----------
def _clean(api_client, base_url, src="blaze"):
    api_client.delete(f"{base_url}/api/rounds", params={"source": src}, timeout=10)


# ----------- POST /api/rounds/bulk source=blaze + color inference -----------
class TestBlazeBulkColorInference:
    def test_bulk_blaze_infers_colors_correctly(self, api_client, base_url):
        _clean(api_client, base_url)
        payload = {
            "source": "blaze",
            "rounds": [
                {"number": 0, "time_str": "10:00", "seconds": "01", "site_ts": "2026-01-15T10:00:01Z"},
                {"number": 1, "time_str": "10:00", "seconds": "31", "site_ts": "2026-01-15T10:00:31Z"},
                {"number": 7, "time_str": "10:01", "seconds": "01", "site_ts": "2026-01-15T10:01:01Z"},
                {"number": 8, "time_str": "10:01", "seconds": "31", "site_ts": "2026-01-15T10:01:31Z"},
                {"number": 14, "time_str": "10:02", "seconds": "01", "site_ts": "2026-01-15T10:02:01Z"},
            ],
        }
        r = api_client.post(f"{base_url}/api/rounds/bulk", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["inserted"] == 5
        assert body["duplicates"] == 0

        # Verify persistence + color inference + no _id leak
        g = api_client.get(
            f"{base_url}/api/rounds",
            params={"source": "blaze", "limit": 50},
            timeout=10,
        )
        assert g.status_code == 200
        rounds = g.json()
        assert len(rounds) == 5
        by_num = {}
        for rd in rounds:
            assert "_id" not in rd
            assert rd["source"] == "blaze"
            by_num[rd["number"]] = rd["color"]
        assert by_num[0] == "white"
        assert by_num[1] == "red"
        assert by_num[7] == "red"
        assert by_num[8] == "black"
        assert by_num[14] == "black"


# ----------- Dedupe with seconds (strict) -----------
class TestBlazeDedupeWithSeconds:
    def test_seconds_dedupe_strict(self, api_client, base_url):
        _clean(api_client, base_url)
        batch = {
            "source": "blaze",
            "rounds": [
                {"number": 3, "time_str": "11:00", "seconds": "10"},
                {"number": 9, "time_str": "11:00", "seconds": "40"},
            ],
        }
        r1 = api_client.post(f"{base_url}/api/rounds/bulk", json=batch, timeout=15).json()
        r2 = api_client.post(f"{base_url}/api/rounds/bulk", json=batch, timeout=15).json()
        assert r1["inserted"] == 2 and r1["duplicates"] == 0
        assert r2["inserted"] == 0 and r2["duplicates"] == 2


# ----------- Dedupe without seconds: MAX 2 per minute -----------
class TestBlazeDedupeMaxPerMinute:
    def test_max_two_same_time_str_when_seconds_missing(self, api_client, base_url):
        _clean(api_client, base_url)
        # Same minute, same number, no seconds: only 2 should be allowed
        payload = {
            "source": "blaze",
            "rounds": [
                {"number": 5, "time_str": "12:00"},
                {"number": 5, "time_str": "12:00"},
                {"number": 5, "time_str": "12:00"},
                {"number": 5, "time_str": "12:00"},
            ],
        }
        r = api_client.post(f"{base_url}/api/rounds/bulk", json=payload, timeout=15).json()
        assert r["inserted"] == 2, r
        assert r["duplicates"] == 2, r

        # Subsequent identical bulk should produce all duplicates
        r2 = api_client.post(f"{base_url}/api/rounds/bulk", json=payload, timeout=15).json()
        assert r2["inserted"] == 0
        assert r2["duplicates"] == 4


# ----------- GET /api/rounds?source=blaze: newest-first, no _id -----------
class TestBlazeListRounds:
    def test_list_blaze_newest_first(self, api_client, base_url):
        _clean(api_client, base_url)
        # Insert one-by-one so captured_at is strictly increasing
        for s in [
            {"number": 2, "time_str": "13:00", "seconds": "01"},
            {"number": 4, "time_str": "13:00", "seconds": "31"},
            {"number": 6, "time_str": "13:01", "seconds": "01"},
        ]:
            api_client.post(f"{base_url}/api/rounds", json={**s, "source": "blaze"}, timeout=10)

        r = api_client.get(
            f"{base_url}/api/rounds",
            params={"source": "blaze", "limit": 50},
            timeout=10,
        )
        assert r.status_code == 200
        rounds = r.json()
        assert len(rounds) == 3
        timestamps = [rd["captured_at"] for rd in rounds]
        assert timestamps == sorted(timestamps, reverse=True)
        for rd in rounds:
            assert "_id" not in rd
            assert rd["source"] == "blaze"


# ----------- DELETE /api/rounds?source=blaze: scoped delete -----------
class TestBlazeScopedDelete:
    def test_delete_blaze_does_not_touch_other_sources(self, api_client, base_url):
        _clean(api_client, base_url)
        api_client.delete(f"{base_url}/api/rounds", params={"source": "tipminer"}, timeout=10)

        api_client.post(
            f"{base_url}/api/rounds/bulk",
            json={
                "source": "blaze",
                "rounds": [{"number": 1, "time_str": "14:00", "seconds": "10"}],
            },
            timeout=15,
        )
        api_client.post(
            f"{base_url}/api/rounds/bulk",
            json={
                "source": "tipminer",
                "rounds": [{"number": 8, "time_str": "14:00", "seconds": "10"}],
            },
            timeout=15,
        )
        d = api_client.delete(
            f"{base_url}/api/rounds", params={"source": "blaze"}, timeout=10
        )
        assert d.status_code == 200
        assert d.json()["deleted"] >= 1

        blaze_left = api_client.get(
            f"{base_url}/api/rounds", params={"source": "blaze", "limit": 50}, timeout=10
        ).json()
        tip_left = api_client.get(
            f"{base_url}/api/rounds", params={"source": "tipminer", "limit": 50}, timeout=10
        ).json()
        assert len(blaze_left) == 0
        assert len(tip_left) >= 1
        # cleanup tipminer
        api_client.delete(f"{base_url}/api/rounds", params={"source": "tipminer"}, timeout=10)


# ----------- GET /api/stats?source=blaze -----------
class TestBlazeStats:
    def test_stats_shape_for_blaze(self, api_client, base_url):
        _clean(api_client, base_url)
        seed = [
            {"number": 0, "time_str": "15:00", "seconds": "01"},   # white (oldest)
            {"number": 8, "time_str": "15:00", "seconds": "31"},   # black
            {"number": 9, "time_str": "15:01", "seconds": "01"},   # black
            {"number": 1, "time_str": "15:01", "seconds": "31"},   # red
            {"number": 2, "time_str": "15:02", "seconds": "01"},   # red
            {"number": 3, "time_str": "15:02", "seconds": "31"},   # red (newest)
        ]
        for s in seed:
            api_client.post(f"{base_url}/api/rounds", json={**s, "source": "blaze"}, timeout=10)

        r = api_client.get(f"{base_url}/api/stats", params={"source": "blaze"}, timeout=10)
        assert r.status_code == 200, r.text
        stats = r.json()
        assert stats["total"] == 6
        assert stats["red"] == 3
        assert stats["black"] == 2
        assert stats["white"] == 1
        s_sum = stats["red_pct"] + stats["black_pct"] + stats["white_pct"]
        assert 99.5 <= s_sum <= 100.5
        assert stats["current_streak_color"] == "red"
        assert stats["current_streak_len"] == 3
        assert stats["last_white_ago"] == 5
        assert isinstance(stats["hot_numbers"], list)
        assert len(stats["hot_numbers"]) <= 5


# ----------- GET /api/poll-status -----------
class TestPollStatus:
    def test_poll_status_shape(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/poll-status", timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        # Required keys per PollStatus model
        for k in ("status", "blocked", "message", "last_poll_at", "last_insert_count"):
            assert k in body, f"missing key {k} in {body}"
        assert isinstance(body["blocked"], bool)
        assert isinstance(body["message"], str)
        assert isinstance(body["last_insert_count"], int)
        # status is a free-form string but should not be empty
        assert isinstance(body["status"], str)


# ----------- GET /api/prediction?source=blaze (>=5 rounds) -----------
class TestBlazePrediction:
    def test_prediction_with_blaze_history(self, api_client, base_url):
        _clean(api_client, base_url)
        api_client.post(
            f"{base_url}/api/rounds/bulk",
            json={
                "source": "blaze",
                "rounds": [
                    {"number": 1, "time_str": "16:00", "seconds": "01"},
                    {"number": 2, "time_str": "16:00", "seconds": "31"},
                    {"number": 8, "time_str": "16:01", "seconds": "01"},
                    {"number": 9, "time_str": "16:01", "seconds": "31"},
                    {"number": 0, "time_str": "16:02", "seconds": "01"},
                    {"number": 5, "time_str": "16:02", "seconds": "31"},
                ],
            },
            timeout=15,
        )
        r = api_client.get(
            f"{base_url}/api/prediction",
            params={"source": "blaze", "window": 50},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["next_color"] in ("red", "black", "white")
        assert 0 <= body["confidence"] <= 100
        s_sum = body["red_score"] + body["black_score"] + body["white_score"]
        assert 99.0 <= s_sum <= 101.0
        # Anchor present
        assert body.get("anchor") is not None
        assert body["anchor"]["color"] in ("red", "black", "white")


# ----------- Active Prediction lifecycle -----------
class TestActivePredictionLifecycle:
    def test_create_get_cancel_active_prediction(self, api_client, base_url):
        _clean(api_client, base_url)
        # Seed enough rounds
        api_client.post(
            f"{base_url}/api/rounds/bulk",
            json={
                "source": "blaze",
                "rounds": [
                    {"number": 1, "time_str": "17:00", "seconds": "01"},
                    {"number": 2, "time_str": "17:00", "seconds": "31"},
                    {"number": 8, "time_str": "17:01", "seconds": "01"},
                    {"number": 9, "time_str": "17:01", "seconds": "31"},
                    {"number": 0, "time_str": "17:02", "seconds": "01"},
                    {"number": 5, "time_str": "17:02", "seconds": "31"},
                ],
            },
            timeout=15,
        )
        # Cancel any prior pending
        api_client.delete(f"{base_url}/api/active-prediction", timeout=10)

        # Create
        c = api_client.post(
            f"{base_url}/api/active-prediction",
            params={"source": "blaze", "max_gales": 2},
            timeout=15,
        )
        assert c.status_code == 200, c.text
        created = c.json()
        assert created["source"] == "blaze"
        assert created["predicted_color"] in ("red", "black", "white")
        assert created["status"] == "pending"
        assert created["max_gales"] == 2
        assert "id" in created and isinstance(created["id"], str)

        # GET returns pending one (or last if none pending)
        g = api_client.get(f"{base_url}/api/active-prediction", timeout=10)
        assert g.status_code == 200, g.text
        got = g.json()
        assert got is not None
        # Either same pending one or already finished
        assert got["id"] == created["id"]

        # DELETE cancels
        d = api_client.delete(f"{base_url}/api/active-prediction", timeout=10)
        assert d.status_code == 200
        assert "cancelled" in d.json()

        # After cancel, GET still returns last (cancelled)
        g2 = api_client.get(f"{base_url}/api/active-prediction", timeout=10).json()
        assert g2 is not None
        assert g2["status"] in ("cancelled", "hit", "loss")

    def test_create_active_prediction_400_without_enough_history(self, api_client, base_url):
        _clean(api_client, base_url)
        api_client.delete(f"{base_url}/api/active-prediction", timeout=10)
        # Insert only 3 rounds (<5 required)
        api_client.post(
            f"{base_url}/api/rounds/bulk",
            json={
                "source": "blaze",
                "rounds": [
                    {"number": 1, "time_str": "18:00", "seconds": "01"},
                    {"number": 2, "time_str": "18:00", "seconds": "31"},
                    {"number": 3, "time_str": "18:01", "seconds": "01"},
                ],
            },
            timeout=15,
        )
        r = api_client.post(
            f"{base_url}/api/active-prediction",
            params={"source": "blaze", "max_gales": 2},
            timeout=10,
        )
        assert r.status_code == 400, r.text


# ----------- Final cleanup (best-effort) -----------
@pytest.fixture(scope="module", autouse=True)
def _module_cleanup(api_client, base_url):
    yield
    try:
        api_client.delete(f"{base_url}/api/rounds", params={"source": "blaze"}, timeout=10)
        api_client.delete(f"{base_url}/api/active-prediction", timeout=10)
    except Exception:
        pass
