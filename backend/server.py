from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta
from collections import Counter


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ---------------- Models ----------------
SourceLiteral = Literal["tipminer", "megatroia", "manual"]
ColorLiteral = Literal["red", "black", "white"]


def color_for_number(n: int) -> ColorLiteral:
    if n == 0:
        return "white"
    return "red" if 1 <= n <= 7 else "black"


def time_str_to_minutes(t: Optional[str]) -> Optional[int]:
    if not t or ":" not in t:
        return None
    try:
        h, m = t.split(":", 1)
        return int(h) * 60 + int(m)
    except Exception:
        return None


class RoundIn(BaseModel):
    number: int = Field(ge=0, le=14)
    color: Optional[ColorLiteral] = None
    source: Optional[SourceLiteral] = None
    time_str: Optional[str] = None
    seconds: Optional[str] = None
    site_ts: Optional[str] = None


class Round(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    number: int
    color: ColorLiteral
    source: SourceLiteral
    time_str: Optional[str] = None
    seconds: Optional[str] = None
    site_ts: Optional[str] = None
    captured_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class BulkRoundsIn(BaseModel):
    source: SourceLiteral
    rounds: List[RoundIn]


class BulkResult(BaseModel):
    inserted: int
    duplicates: int
    total: int


class Stats(BaseModel):
    total: int
    red: int
    black: int
    white: int
    red_pct: float
    black_pct: float
    white_pct: float
    current_streak_color: Optional[ColorLiteral] = None
    current_streak_len: int = 0
    last_white_ago: Optional[int] = None
    hot_numbers: List[dict]


class AnchorInfo(BaseModel):
    number: int
    color: ColorLiteral
    time_str: Optional[str] = None
    seconds: Optional[str] = None


class WhiteEstimate(BaseModel):
    avg_gap: Optional[float] = None
    median_gap: Optional[int] = None
    rounds_since_last: Optional[int] = None
    estimated_rounds_until_next: Optional[int] = None
    estimated_minutes_until_next: Optional[float] = None
    estimated_time_str: Optional[str] = None
    confidence: float = 0.0


class Prediction(BaseModel):
    next_color: ColorLiteral
    confidence: float
    rationale: str
    red_score: float
    black_score: float
    white_score: float
    anchor: Optional[AnchorInfo] = None
    white: Optional[WhiteEstimate] = None


# ---------------- Predictions Log (hit/miss tracking) ----------------
class PredictionLogIn(BaseModel):
    predicted_color: ColorLiteral
    actual_color: ColorLiteral
    source: Optional[SourceLiteral] = None
    confidence: Optional[float] = None
    note: Optional[str] = None


class PredictionLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    predicted_color: ColorLiteral
    actual_color: ColorLiteral
    is_hit: bool
    source: Optional[SourceLiteral] = None
    confidence: Optional[float] = None
    note: Optional[str] = None
    logged_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PredictionStats(BaseModel):
    total: int
    hits: int
    misses: int
    hit_rate_pct: float
    color_hits: int
    color_misses: int
    white_hits: int
    white_misses: int


# ---------------- Helpers ----------------
def round_doc_to_model(d: dict) -> Round:
    return Round(
        id=d.get("id"),
        number=d.get("number"),
        color=d.get("color"),
        source=d.get("source"),
        time_str=d.get("time_str"),
        seconds=d.get("seconds"),
        site_ts=d.get("site_ts"),
        captured_at=d.get("captured_at"),
    )


# ---------------- Routes ----------------
@api_router.get("/")
async def root():
    return {"message": "Blaze Rounds Collector API"}


@api_router.post("/rounds/bulk", response_model=BulkResult)
async def add_rounds_bulk(payload: BulkRoundsIn):
    inserted = 0
    duplicates = 0

    # Ordena as rodadas recebidas: mais nova primeiro (por time_str desc).
    # Se time_str for igual, mantém a ordem recebida do scraper.
    def sort_key(r: RoundIn):
        m = time_str_to_minutes(r.time_str)
        sec = int(r.seconds) if r.seconds and r.seconds.isdigit() else 0
        return (m if m is not None else -1, sec)

    # Maior tempo (mais novo) primeiro
    sorted_rounds = sorted(payload.rounds, key=sort_key, reverse=True)

    # Atribui captured_at decrescentes para preservar a ordem cronológica
    # na listagem (que ordena por captured_at desc).
    base = datetime.now(timezone.utc)
    for idx, r in enumerate(sorted_rounds):
        color = r.color or color_for_number(r.number)
        dedupe = {
            "source": payload.source,
            "number": r.number,
            "time_str": r.time_str,
            "seconds": r.seconds,
        }
        existing = await db.rounds.find_one(dedupe, {"_id": 0, "id": 1})
        if existing:
            duplicates += 1
            continue
        captured_at = base - timedelta(milliseconds=idx)
        obj = Round(
            number=r.number,
            color=color,
            source=payload.source,
            time_str=r.time_str,
            seconds=r.seconds,
            site_ts=r.site_ts,
            captured_at=captured_at,
        )
        await db.rounds.insert_one(obj.model_dump())
        inserted += 1

    total = await db.rounds.count_documents({})
    return BulkResult(inserted=inserted, duplicates=duplicates, total=total)


@api_router.post("/rounds", response_model=Round)
async def add_round(r: RoundIn):
    if not r.source:
        raise HTTPException(status_code=400, detail="source is required")
    color = r.color or color_for_number(r.number)
    obj = Round(
        number=r.number,
        color=color,
        source=r.source,
        time_str=r.time_str,
        seconds=r.seconds,
        site_ts=r.site_ts,
    )
    await db.rounds.insert_one(obj.model_dump())
    return obj


@api_router.get("/rounds", response_model=List[Round])
async def list_rounds(source: Optional[SourceLiteral] = None, limit: int = 200):
    q: dict = {}
    if source:
        q["source"] = source
    limit = max(1, min(limit, 2000))
    cursor = db.rounds.find(q, {"_id": 0}).sort("captured_at", -1).limit(limit)
    docs = await cursor.to_list(length=limit)
    return [round_doc_to_model(d) for d in docs]


@api_router.delete("/rounds")
async def clear_rounds(source: Optional[SourceLiteral] = None):
    q: dict = {}
    if source:
        q["source"] = source
    res = await db.rounds.delete_many(q)
    return {"deleted": res.deleted_count}


@api_router.get("/stats", response_model=Stats)
async def get_stats(source: Optional[SourceLiteral] = None, limit: int = 200):
    q: dict = {}
    if source:
        q["source"] = source
    limit = max(10, min(limit, 2000))
    cursor = db.rounds.find(q, {"_id": 0}).sort("captured_at", -1).limit(limit)
    docs = await cursor.to_list(length=limit)
    total = len(docs)
    if total == 0:
        return Stats(
            total=0, red=0, black=0, white=0,
            red_pct=0.0, black_pct=0.0, white_pct=0.0,
            current_streak_color=None, current_streak_len=0,
            last_white_ago=None, hot_numbers=[],
        )

    colors = [d["color"] for d in docs]
    c = Counter(colors)
    red = c.get("red", 0)
    black = c.get("black", 0)
    white = c.get("white", 0)

    streak_color = colors[0]
    streak_len = 0
    for col in colors:
        if col == streak_color:
            streak_len += 1
        else:
            break

    last_white_ago = None
    for idx, col in enumerate(colors):
        if col == "white":
            last_white_ago = idx
            break

    num_counter = Counter([d["number"] for d in docs])
    hot = [{"number": n, "count": cnt} for n, cnt in num_counter.most_common(5)]

    return Stats(
        total=total,
        red=red, black=black, white=white,
        red_pct=round(red / total * 100, 1),
        black_pct=round(black / total * 100, 1),
        white_pct=round(white / total * 100, 1),
        current_streak_color=streak_color,
        current_streak_len=streak_len,
        last_white_ago=last_white_ago,
        hot_numbers=hot,
    )


def _compute_white_estimate(docs: List[dict]) -> WhiteEstimate:
    """Estimativa de quando o próximo branco aparece, baseado nos gaps históricos."""
    if not docs:
        return WhiteEstimate(confidence=0.0)
    # docs é newest-first; converte para chronological (oldest-first)
    chrono = list(reversed(docs))
    white_indices = [i for i, d in enumerate(chrono) if d["color"] == "white"]
    if len(white_indices) < 2:
        return WhiteEstimate(confidence=0.0)
    gaps = [white_indices[i + 1] - white_indices[i] for i in range(len(white_indices) - 1)]
    avg_gap = sum(gaps) / len(gaps)
    sorted_gaps = sorted(gaps)
    median_gap = sorted_gaps[len(sorted_gaps) // 2]
    # rodadas desde o ultimo branco
    rounds_since_last = (len(chrono) - 1) - white_indices[-1]
    estimated_rounds_until_next = max(1, int(round(avg_gap - rounds_since_last)))
    # Cada rodada Blaze leva ~30s = 0.5min
    minutes_per_round = 0.5
    estimated_minutes = estimated_rounds_until_next * minutes_per_round

    # Hora estimada
    estimated_time_str = None
    last_doc_with_time = next((d for d in docs if d.get("time_str")), None)
    if last_doc_with_time:
        m = time_str_to_minutes(last_doc_with_time["time_str"])
        if m is not None:
            target = (m + int(round(estimated_minutes))) % (24 * 60)
            estimated_time_str = f"{target // 60:02d}:{target % 60:02d}"

    # Confiança: maior se temos muitos brancos no histórico e o gap atual é compatível
    base_conf = min(95.0, 30.0 + len(white_indices) * 5)
    # penalize se já estamos muito além do gap médio
    if rounds_since_last > avg_gap * 1.5:
        base_conf *= 0.7

    return WhiteEstimate(
        avg_gap=round(avg_gap, 1),
        median_gap=median_gap,
        rounds_since_last=rounds_since_last,
        estimated_rounds_until_next=estimated_rounds_until_next,
        estimated_minutes_until_next=round(estimated_minutes, 1),
        estimated_time_str=estimated_time_str,
        confidence=round(base_conf, 1),
    )


@api_router.get("/prediction", response_model=Prediction)
async def predict(source: Optional[SourceLiteral] = None, window: int = 50):
    q: dict = {}
    if source:
        q["source"] = source
    window = max(10, min(window, 500))
    cursor = db.rounds.find(q, {"_id": 0}).sort("captured_at", -1).limit(window)
    docs = await cursor.to_list(length=window)
    if len(docs) < 5:
        raise HTTPException(status_code=400, detail="Sao necessarias pelo menos 5 rodadas para gerar uma previsao.")

    colors = [d["color"] for d in docs]
    total = len(colors)
    c = Counter(colors)
    red_freq = c.get("red", 0) / total
    black_freq = c.get("black", 0) / total
    white_freq = c.get("white", 0) / total

    base_red = (1 - red_freq) * 0.5
    base_black = (1 - black_freq) * 0.5
    base_white = (1 - white_freq) * 0.5

    chrono = list(reversed(colors))
    transitions = Counter()
    for prev, nxt in zip(chrono, chrono[1:]):
        transitions[(prev, nxt)] += 1
    last_color = colors[0]
    total_from_last = sum(v for (p, _), v in transitions.items() if p == last_color) or 1
    p_red = transitions.get((last_color, "red"), 0) / total_from_last
    p_black = transitions.get((last_color, "black"), 0) / total_from_last
    p_white = transitions.get((last_color, "white"), 0) / total_from_last

    red_score = base_red + p_red * 0.3
    black_score = base_black + p_black * 0.3
    white_score = base_white + p_white * 0.3

    last_white_ago = None
    for idx, col in enumerate(colors):
        if col == "white":
            last_white_ago = idx
            break
    if last_white_ago is None or last_white_ago >= 14:
        white_score += 0.15

    streak_color = colors[0]
    streak_len = 0
    for col in colors:
        if col == streak_color:
            streak_len += 1
        else:
            break
    if streak_len >= 4:
        if streak_color == "red":
            black_score += 0.08
        elif streak_color == "black":
            red_score += 0.08

    scores = {"red": red_score, "black": black_score, "white": white_score}
    s_sum = sum(scores.values()) or 1
    norm = {k: v / s_sum for k, v in scores.items()}
    next_color = max(norm, key=norm.get)
    confidence = round(norm[next_color] * 100, 1)

    rationale = (
        f"Janela {total} rodadas. Sequencia: {streak_len}x {streak_color}. "
        f"Branco ha {last_white_ago if last_white_ago is not None else 'mais de '+str(total)} rodada(s). "
        f"Freq: R {round(red_freq*100,1)}% / P {round(black_freq*100,1)}% / B {round(white_freq*100,1)}%."
    )

    # Âncora: rodada mais recente (após a qual se faz a entrada)
    anchor_doc = docs[0]
    anchor = AnchorInfo(
        number=anchor_doc["number"],
        color=anchor_doc["color"],
        time_str=anchor_doc.get("time_str"),
        seconds=anchor_doc.get("seconds"),
    )

    # Estimativa do branco
    white_est = _compute_white_estimate(docs)

    return Prediction(
        next_color=next_color,  # type: ignore
        confidence=confidence,
        rationale=rationale,
        red_score=round(norm["red"] * 100, 1),
        black_score=round(norm["black"] * 100, 1),
        white_score=round(norm["white"] * 100, 1),
        anchor=anchor,
        white=white_est,
    )


# ---------------- Hit / Miss Tracking ----------------
@api_router.post("/predictions/log", response_model=PredictionLog)
async def log_prediction(p: PredictionLogIn):
    is_hit = p.predicted_color == p.actual_color
    obj = PredictionLog(
        predicted_color=p.predicted_color,
        actual_color=p.actual_color,
        is_hit=is_hit,
        source=p.source,
        confidence=p.confidence,
        note=p.note,
    )
    await db.prediction_logs.insert_one(obj.model_dump())
    return obj


@api_router.get("/predictions/stats", response_model=PredictionStats)
async def predictions_stats(source: Optional[SourceLiteral] = None):
    q: dict = {}
    if source:
        q["source"] = source
    docs = await db.prediction_logs.find(q, {"_id": 0}).to_list(length=5000)
    total = len(docs)
    hits = sum(1 for d in docs if d.get("is_hit"))
    misses = total - hits
    color_hits = sum(1 for d in docs if d.get("is_hit") and d.get("predicted_color") in ("red", "black"))
    color_misses = sum(1 for d in docs if not d.get("is_hit") and d.get("predicted_color") in ("red", "black"))
    white_hits = sum(1 for d in docs if d.get("is_hit") and d.get("predicted_color") == "white")
    white_misses = sum(1 for d in docs if not d.get("is_hit") and d.get("predicted_color") == "white")
    hit_rate = round(hits / total * 100, 1) if total else 0.0
    return PredictionStats(
        total=total,
        hits=hits,
        misses=misses,
        hit_rate_pct=hit_rate,
        color_hits=color_hits,
        color_misses=color_misses,
        white_hits=white_hits,
        white_misses=white_misses,
    )


@api_router.delete("/predictions/log")
async def clear_predictions(source: Optional[SourceLiteral] = None):
    q: dict = {}
    if source:
        q["source"] = source
    res = await db.prediction_logs.delete_many(q)
    return {"deleted": res.deleted_count}


# ---------------- Simulator ----------------
class SimulateResult(BaseModel):
    total_predictions: int
    hits: int
    misses: int
    hit_rate_pct: float
    by_color: dict


@api_router.get("/simulate", response_model=SimulateResult)
async def simulate(source: Optional[SourceLiteral] = None, window: int = 30, limit: int = 500):
    """Simula o preditor sobre o histórico salvo: para cada rodada,
    usa as `window` rodadas anteriores para prever e compara com a rodada real."""
    q: dict = {}
    if source:
        q["source"] = source
    limit = max(30, min(limit, 2000))
    cursor = db.rounds.find(q, {"_id": 0}).sort("captured_at", -1).limit(limit)
    docs = await cursor.to_list(length=limit)
    if len(docs) < window + 5:
        raise HTTPException(status_code=400, detail=f"Sao necessarias pelo menos {window+5} rodadas para simular.")

    chrono = list(reversed(docs))  # oldest-first
    hits = 0
    misses = 0
    by_color = {"red": {"hits": 0, "misses": 0}, "black": {"hits": 0, "misses": 0}, "white": {"hits": 0, "misses": 0}}

    for i in range(window, len(chrono)):
        history = chrono[i - window:i]  # oldest-first
        colors = [d["color"] for d in reversed(history)]  # newest first like predict()
        total = len(colors)
        c = Counter(colors)
        red_freq = c.get("red", 0) / total
        black_freq = c.get("black", 0) / total
        white_freq = c.get("white", 0) / total
        base_red = (1 - red_freq) * 0.5
        base_black = (1 - black_freq) * 0.5
        base_white = (1 - white_freq) * 0.5
        chrono_hist = list(reversed(colors))
        transitions = Counter()
        for prev, nxt in zip(chrono_hist, chrono_hist[1:]):
            transitions[(prev, nxt)] += 1
        last_color = colors[0]
        total_from_last = sum(v for (p, _), v in transitions.items() if p == last_color) or 1
        p_red = transitions.get((last_color, "red"), 0) / total_from_last
        p_black = transitions.get((last_color, "black"), 0) / total_from_last
        p_white = transitions.get((last_color, "white"), 0) / total_from_last
        red_score = base_red + p_red * 0.3
        black_score = base_black + p_black * 0.3
        white_score = base_white + p_white * 0.3
        last_white_ago = None
        for idx, col in enumerate(colors):
            if col == "white":
                last_white_ago = idx
                break
        if last_white_ago is None or last_white_ago >= 14:
            white_score += 0.15
        streak_color = colors[0]
        streak_len = 0
        for col in colors:
            if col == streak_color:
                streak_len += 1
            else:
                break
        if streak_len >= 4:
            if streak_color == "red":
                black_score += 0.08
            elif streak_color == "black":
                red_score += 0.08
        scores = {"red": red_score, "black": black_score, "white": white_score}
        predicted = max(scores, key=scores.get)
        actual = chrono[i]["color"]
        if predicted == actual:
            hits += 1
            by_color[predicted]["hits"] += 1
        else:
            misses += 1
            by_color[predicted]["misses"] += 1

    total_p = hits + misses
    return SimulateResult(
        total_predictions=total_p,
        hits=hits,
        misses=misses,
        hit_rate_pct=round(hits / total_p * 100, 1) if total_p else 0.0,
        by_color=by_color,
    )


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
