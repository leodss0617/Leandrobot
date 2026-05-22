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
from datetime import datetime, timezone
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


class RoundIn(BaseModel):
    number: int = Field(ge=0, le=14)
    color: Optional[ColorLiteral] = None
    source: Optional[SourceLiteral] = None  # optional in bulk (parent provides it)
    time_str: Optional[str] = None  # HH:MM as seen on site
    seconds: Optional[str] = None
    site_ts: Optional[str] = None  # site-provided timestamp if any


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


class Prediction(BaseModel):
    next_color: ColorLiteral
    confidence: float
    rationale: str
    red_score: float
    black_score: float
    white_score: float


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
    for r in payload.rounds:
        color = r.color or color_for_number(r.number)
        # Build a dedupe key: source + number + time_str + seconds (or site_ts)
        dedupe = {
            "source": payload.source,
            "number": r.number,
            "color": color,
            "time_str": r.time_str,
            "seconds": r.seconds,
        }
        existing = await db.rounds.find_one(dedupe, {"_id": 0, "id": 1})
        if existing:
            duplicates += 1
            continue
        obj = Round(
            number=r.number,
            color=color,
            source=payload.source,
            time_str=r.time_str,
            seconds=r.seconds,
            site_ts=r.site_ts,
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
    limit = max(1, min(limit, 1000))
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
    limit = max(10, min(limit, 1000))
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

    colors = [d["color"] for d in docs]  # newest first
    c = Counter(colors)
    red = c.get("red", 0)
    black = c.get("black", 0)
    white = c.get("white", 0)

    # Streak: walk from newest
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

    colors = [d["color"] for d in docs]  # newest first
    total = len(colors)
    c = Counter(colors)
    red_freq = c.get("red", 0) / total
    black_freq = c.get("black", 0) / total
    white_freq = c.get("white", 0) / total

    # Score = weighted: 50% inverse-frequency (mean reversion), 30% Markov from last color,
    # 20% rarity boost for white based on dry spell
    base_red = (1 - red_freq) * 0.5
    base_black = (1 - black_freq) * 0.5
    base_white = (1 - white_freq) * 0.5

    # Markov: count transitions in chronological order
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

    # White dry spell boost
    last_white_ago = None
    for idx, col in enumerate(colors):
        if col == "white":
            last_white_ago = idx
            break
    if last_white_ago is None or last_white_ago >= 14:
        white_score += 0.15

    # Streak break tendency
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
        f"Janela {total} rodadas. Sequencia atual: {streak_len}x {streak_color}. "
        f"Branco visto ha {last_white_ago if last_white_ago is not None else 'mais de '+str(total)} rodada(s). "
        f"Frequencias: R {round(red_freq*100,1)}% / P {round(black_freq*100,1)}% / B {round(white_freq*100,1)}%."
    )

    return Prediction(
        next_color=next_color,  # type: ignore
        confidence=confidence,
        rationale=rationale,
        red_score=round(norm["red"] * 100, 1),
        black_score=round(norm["black"] * 100, 1),
        white_score=round(norm["white"] * 100, 1),
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
