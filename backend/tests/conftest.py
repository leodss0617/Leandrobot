import os
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

# Load frontend .env to get EXPO_PUBLIC_BACKEND_URL (external URL)
load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")


@pytest.fixture(scope="session")
def base_url():
    assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set in frontend/.env"
    return BASE_URL


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session", autouse=True)
def _cleanup_test_data(api_client, base_url):
    """Cleanup all test sources before and after the run."""
    for src in ("tipminer", "megatroia", "manual"):
        try:
            api_client.delete(f"{base_url}/api/rounds", params={"source": src}, timeout=10)
        except Exception:
            pass
    yield
    for src in ("tipminer", "megatroia", "manual"):
        try:
            api_client.delete(f"{base_url}/api/rounds", params={"source": src}, timeout=10)
        except Exception:
            pass
