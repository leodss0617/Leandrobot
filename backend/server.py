from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta
from collections import Counter
import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ---------------- Models ----------------
SourceLiteral = Literal["tipminer", "megatroia", "blaze", "manual"]
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
    hit_at_gale: Optional[int] = None  # se acertou, em qual gale (0,1,2..)
    max_gales: Optional[int] = None
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
    by_gale: dict = Field(default_factory=dict)  # {"0": hits, "1": hits, "2": hits, ...}
    current_green_streak: int = 0
    current_red_streak: int = 0


# ---------------- User Settings ----------------
class UserSettings(BaseModel):
    max_gales: int = 2
    preferred_source: SourceLiteral = "blaze"
    auto_predict: bool = True
    skip_white_predictions: bool = False  # se True, ignora previsoes de branco


# ---------------- Active Prediction (single, with gale chain) ----------------
ActivePredStatus = Literal["pending", "hit", "loss", "cancelled"]


class ActivePrediction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    source: SourceLiteral
    predicted_color: ColorLiteral
    max_gales: int = 2
    current_gale: int = 0  # 0 = entrada inicial, 1 = G1, 2 = G2, ...
    status: ActivePredStatus = "pending"
    anchor_round_id: Optional[str] = None
    anchor_number: Optional[int] = None
    anchor_color: Optional[ColorLiteral] = None
    anchor_time_str: Optional[str] = None
    checked_round_ids: List[str] = Field(default_factory=list)  # rounds avaliados nesta tentativa
    hit_at_gale: Optional[int] = None  # em qual gale acertou (se status=hit)
    confidence: Optional[float] = None
    rationale: Optional[str] = None
    rule_name: Optional[str] = None  # se veio de uma regra
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    finished_at: Optional[datetime] = None


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
    def sort_key(r: RoundIn):
        m = time_str_to_minutes(r.time_str)
        sec = int(r.seconds) if r.seconds and r.seconds.isdigit() else 0
        return (m if m is not None else -1, sec)

    sorted_rounds = sorted(payload.rounds, key=sort_key, reverse=True)

    # Blaze Double tem ~2 rodadas por minuto. Quando o site exibe apenas HH:MM
    # (sem segundos), permitimos ate MAX_PER_MINUTE rodadas com a mesma
    # combinacao (source, number, time_str) para nao perder rodadas legitimas.
    MAX_PER_MINUTE = 2

    from collections import defaultdict
    batch_count: dict = defaultdict(int)

    # Snapshot dos contadores ja existentes no banco (uma unica leitura por key),
    # para evitar que itens recem inseridos no MESMO batch sejam contados.
    initial_counts: dict = {}
    seen_keys: set = set()
    for r in sorted_rounds:
        if not r.seconds:
            seen_keys.add((payload.source, r.number, r.time_str))
    for src, num, ts in seen_keys:
        initial_counts[(src, num, ts)] = await db.rounds.count_documents({
            "source": src,
            "number": num,
            "time_str": ts,
            "seconds": None,
        })

    base = datetime.now(timezone.utc)
    for idx, r in enumerate(sorted_rounds):
        color = r.color or color_for_number(r.number)

        if r.seconds:
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
        else:
            key = (payload.source, r.number, r.time_str)
            total = initial_counts.get(key, 0) + batch_count[key]
            if total >= MAX_PER_MINUTE:
                duplicates += 1
                continue
            batch_count[key] += 1

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
    # Apos inserir rodadas novas, avalia a previsao pendente (auto-advance)
    if inserted > 0:
        try:
            await _advance_active_prediction()
        except Exception as e:
            logger.warning(f"advance after bulk insert failed: {e}")
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
    docs = await db.prediction_logs.find(q, {"_id": 0}).sort("logged_at", -1).to_list(length=5000)
    total = len(docs)
    hits = sum(1 for d in docs if d.get("is_hit"))
    misses = total - hits
    color_hits = sum(1 for d in docs if d.get("is_hit") and d.get("predicted_color") in ("red", "black"))
    color_misses = sum(1 for d in docs if not d.get("is_hit") and d.get("predicted_color") in ("red", "black"))
    white_hits = sum(1 for d in docs if d.get("is_hit") and d.get("predicted_color") == "white")
    white_misses = sum(1 for d in docs if not d.get("is_hit") and d.get("predicted_color") == "white")
    hit_rate = round(hits / total * 100, 1) if total else 0.0

    # Breakdown por gale (hit_at_gale)
    by_gale: dict = {}
    for d in docs:
        if d.get("is_hit"):
            g = d.get("hit_at_gale", 0) or 0
            key = str(g)
            by_gale[key] = by_gale.get(key, 0) + 1

    # Sequencias (greens/reds em sequencia) sobre os logs mais recentes
    current_green = 0
    current_red = 0
    for d in docs:
        if d.get("is_hit"):
            current_green += 1
        else:
            break
    for d in docs:
        if not d.get("is_hit"):
            current_red += 1
        else:
            break

    return PredictionStats(
        total=total,
        hits=hits,
        misses=misses,
        hit_rate_pct=hit_rate,
        color_hits=color_hits,
        color_misses=color_misses,
        white_hits=white_hits,
        white_misses=white_misses,
        by_gale=by_gale,
        current_green_streak=current_green,
        current_red_streak=current_red,
    )


@api_router.delete("/predictions/log")
async def clear_predictions(source: Optional[SourceLiteral] = None):
    q: dict = {}
    if source:
        q["source"] = source
    res = await db.prediction_logs.delete_many(q)
    return {"deleted": res.deleted_count}


# ---------------- Settings (single doc) ----------------
SETTINGS_KEY = "user_settings"


async def get_settings_doc() -> UserSettings:
    doc = await db.settings.find_one({"key": SETTINGS_KEY}, {"_id": 0, "key": 0})
    if not doc:
        s = UserSettings()
        await db.settings.insert_one({"key": SETTINGS_KEY, **s.model_dump()})
        return s
    try:
        return UserSettings(**doc)
    except Exception:
        return UserSettings()


@api_router.get("/settings", response_model=UserSettings)
async def get_settings():
    return await get_settings_doc()


@api_router.put("/settings", response_model=UserSettings)
async def update_settings(s: UserSettings):
    s.max_gales = max(0, min(s.max_gales, 4))
    await db.settings.update_one(
        {"key": SETTINGS_KEY},
        {"$set": s.model_dump()},
        upsert=True,
    )
    return s


# ---------------- Active Prediction (one at a time) ----------------
def _active_pred_doc_to_model(d: dict) -> ActivePrediction:
    # Filtra chaves desconhecidas
    allowed = set(ActivePrediction.model_fields.keys())
    clean = {k: v for k, v in d.items() if k in allowed}
    return ActivePrediction(**clean)


async def get_pending_active() -> Optional[dict]:
    return await db.active_predictions.find_one({"status": "pending"}, {"_id": 0})


def _predict_color_from_history(colors: List[str]) -> tuple[str, float, str]:
    """Replica a logica do /prediction sobre uma lista de cores newest-first."""
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
        f"Janela {total}. Seq {streak_len}x {streak_color}. "
        f"Branco ha {last_white_ago if last_white_ago is not None else '15+'} rod."
    )
    return next_color, confidence, rationale


async def _generate_active_prediction(source: SourceLiteral, max_gales: int,
                                      skip_white: bool = False) -> Optional[ActivePrediction]:
    """Cria nova ActivePrediction com base no historico e regras ativas.
    Prioriza: (1) regra ativa que casa  (2) algoritmo estatistico."""
    q = {"source": source}
    cursor = db.rounds.find(q, {"_id": 0}).sort("captured_at", -1).limit(50)
    docs = await cursor.to_list(length=50)
    if len(docs) < 5:
        return None

    colors = [d["color"] for d in docs]
    anchor = docs[0]

    # Tenta encontrar regra ativa que casa
    rule_name = None
    pred_color = None
    confidence = None
    rationale = None
    rule_gales = None
    try:
        rules_docs = await db.rules.find({"enabled": True}, {"_id": 0}).sort("priority", -1).to_list(length=500)
        for rd in rules_docs:
            try:
                rule = Rule(**rd)
            except Exception:
                continue
            if _eval_rule(rule, colors):
                rule_name = rule.name
                pred_color = rule.action.color
                rationale = f"Regra '{rule.name}'" + (f" - {rule.action.note}" if rule.action.note else "")
                rule_gales = rule.action.gales
                confidence = 70.0
                break
    except Exception:
        pass

    # Fallback: algoritmo estatistico
    if pred_color is None:
        pred_color, confidence, rationale = _predict_color_from_history(colors)

    # Se skip_white estiver ligado e o algoritmo previu branco, escolhe a 2a cor
    if skip_white and pred_color == "white":
        # decide entre red/black baseado em frequencia
        total = len(colors)
        c = Counter(colors)
        # menos frequente entre red/black tem chance maior pela reversao a media
        pred_color = "red" if c.get("red", 0) <= c.get("black", 0) else "black"
        rationale = (rationale or "") + " (branco ignorado por config)"

    # gales: usa o da regra se houver, senao usa o config
    effective_gales = rule_gales if rule_gales is not None else max_gales
    effective_gales = max(0, min(effective_gales, 4))

    obj = ActivePrediction(
        source=source,
        predicted_color=pred_color,
        max_gales=effective_gales,
        current_gale=0,
        status="pending",
        anchor_round_id=anchor.get("id"),
        anchor_number=anchor.get("number"),
        anchor_color=anchor.get("color"),
        anchor_time_str=anchor.get("time_str"),
        confidence=confidence,
        rationale=rationale,
        rule_name=rule_name,
    )
    await db.active_predictions.insert_one(obj.model_dump())
    return obj


async def _advance_active_prediction() -> Optional[dict]:
    """Avalia a previsao pending contra rodadas que chegaram apos a ancora.
    Retorna o doc atualizado (ou None se nao havia pending)."""
    pending = await get_pending_active()
    if not pending:
        return None

    src = pending.get("source")
    anchor_id = pending.get("anchor_round_id")
    if not anchor_id:
        return pending

    # Pega a captured_at da ancora
    anchor_doc = await db.rounds.find_one({"id": anchor_id}, {"_id": 0})
    if not anchor_doc:
        return pending
    anchor_captured = anchor_doc.get("captured_at")
    if not anchor_captured:
        return pending

    # Lista todas as rodadas APOS a ancora (mais antiga primeiro)
    q = {"source": src, "captured_at": {"$gt": anchor_captured}}
    cursor = db.rounds.find(q, {"_id": 0}).sort("captured_at", 1)
    new_rounds = await cursor.to_list(length=200)
    if not new_rounds:
        return pending

    checked_ids = list(pending.get("checked_round_ids", []))
    current_gale = pending.get("current_gale", 0)
    max_gales = pending.get("max_gales", 0)
    predicted = pending.get("predicted_color")
    status = pending.get("status", "pending")
    hit_at_gale = None

    # Avalia cada rodada nova que ainda nao foi checada
    for r in new_rounds:
        rid = r.get("id")
        if rid in checked_ids:
            continue
        actual = r.get("color")
        checked_ids.append(rid)
        if actual == predicted:
            status = "hit"
            hit_at_gale = current_gale
            break
        else:
            # erro nesta rodada -> avanca gale ou perde
            if current_gale >= max_gales:
                status = "loss"
                break
            else:
                current_gale += 1
                # continua para a proxima rodada (proximo gale)

    update = {
        "checked_round_ids": checked_ids,
        "current_gale": current_gale,
        "status": status,
        "updated_at": datetime.now(timezone.utc),
    }
    if status in ("hit", "loss"):
        update["finished_at"] = datetime.now(timezone.utc)
        if status == "hit":
            update["hit_at_gale"] = hit_at_gale

    await db.active_predictions.update_one({"id": pending["id"]}, {"$set": update})

    # Se finalizou, registra no log para estatisticas
    if status in ("hit", "loss"):
        # actual_color = cor da ultima rodada avaliada
        last_actual = None
        for r in reversed(new_rounds):
            if r.get("id") in checked_ids:
                last_actual = r.get("color")
                break
        if last_actual:
            log = PredictionLog(
                predicted_color=predicted,
                actual_color=last_actual,
                is_hit=(status == "hit"),
                source=src,
                confidence=pending.get("confidence"),
                note=pending.get("rule_name") or "auto",
                hit_at_gale=hit_at_gale if status == "hit" else None,
                max_gales=max_gales,
            )
            await db.prediction_logs.insert_one(log.model_dump())

        # Auto-prever proxima?
        try:
            settings = await get_settings_doc()
            if settings.auto_predict:
                await _generate_active_prediction(
                    settings.preferred_source,
                    settings.max_gales,
                    settings.skip_white_predictions,
                )
        except Exception as e:
            logger.warning(f"auto-predict next failed: {e}")

    return await db.active_predictions.find_one({"id": pending["id"]}, {"_id": 0})


@api_router.get("/active-prediction")
async def get_active_prediction():
    # Sempre avalia antes de retornar (pega rodadas novas)
    try:
        await _advance_active_prediction()
    except Exception as e:
        logger.warning(f"advance on GET failed: {e}")
    pending = await db.active_predictions.find_one(
        {"status": "pending"}, {"_id": 0}
    )
    if pending:
        return _active_pred_doc_to_model(pending)
    # Senao, retorna a ultima finalizada (hit/loss/cancelled)
    last = await db.active_predictions.find_one(
        {}, {"_id": 0}, sort=[("created_at", -1)]
    )
    if last:
        return _active_pred_doc_to_model(last)
    return None


@api_router.post("/active-prediction", response_model=ActivePrediction)
async def create_active_prediction(source: Optional[SourceLiteral] = None,
                                   max_gales: Optional[int] = None):
    # Cancela qualquer pending anterior
    await db.active_predictions.update_many(
        {"status": "pending"},
        {"$set": {"status": "cancelled", "finished_at": datetime.now(timezone.utc)}},
    )
    settings = await get_settings_doc()
    src = source or settings.preferred_source
    mg = max_gales if max_gales is not None else settings.max_gales
    obj = await _generate_active_prediction(src, mg, settings.skip_white_predictions)
    if not obj:
        raise HTTPException(
            status_code=400,
            detail="Historico insuficiente para gerar previsao (>=5 rodadas).",
        )
    return obj


@api_router.delete("/active-prediction")
async def cancel_active_prediction():
    res = await db.active_predictions.update_many(
        {"status": "pending"},
        {"$set": {"status": "cancelled", "finished_at": datetime.now(timezone.utc)}},
    )
    return {"cancelled": res.modified_count}


@api_router.post("/active-prediction/advance")
async def advance_active_prediction_endpoint():
    """Forca uma avaliacao imediata (uso opcional pelo cliente)."""
    doc = await _advance_active_prediction()
    if not doc:
        raise HTTPException(status_code=404, detail="Nenhuma previsao pending.")
    return _active_pred_doc_to_model(doc)


@api_router.get("/active-prediction/history")
async def active_prediction_history(limit: int = 20):
    limit = max(1, min(limit, 100))
    cursor = db.active_predictions.find(
        {"status": {"$in": ["hit", "loss", "cancelled"]}},
        {"_id": 0},
    ).sort("finished_at", -1).limit(limit)
    docs = await cursor.to_list(length=limit)
    return [_active_pred_doc_to_model(d) for d in docs]


@api_router.delete("/active-prediction/history")
async def clear_active_prediction_history():
    res = await db.active_predictions.delete_many({})
    return {"deleted": res.deleted_count}


# ---------------- Simulator ----------------
class SimulateResult(BaseModel):
    total_predictions: int
    hits: int
    misses: int
    hit_rate_pct: float
    by_color: dict


# ---------------- Rules Engine ----------------
class RuleCondition(BaseModel):
    # type: "streak" | "after_color" | "gap_white" | "last_n_pattern"
    type: str
    color: Optional[ColorLiteral] = None
    op: Optional[str] = None  # ">=", "==", "<="
    value: Optional[int] = None
    pattern: Optional[List[ColorLiteral]] = None  # for last_n_pattern


class RuleAction(BaseModel):
    color: ColorLiteral
    gales: int = 0
    note: Optional[str] = None


class RuleIn(BaseModel):
    name: str
    enabled: bool = True
    conditions: List[RuleCondition]
    action: RuleAction
    priority: int = 0


class Rule(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    enabled: bool = True
    conditions: List[RuleCondition]
    action: RuleAction
    priority: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RuleMatch(BaseModel):
    matched: bool
    rule: Optional[Rule] = None
    reason: Optional[str] = None


def _eval_rule(rule: Rule, colors_newest_first: List[str]) -> bool:
    """Avalia se a regra casa contra o estado atual (newest first)."""
    if not colors_newest_first:
        return False
    last = colors_newest_first[0]
    # Computa streak
    streak_color = last
    streak_len = 0
    for c in colors_newest_first:
        if c == streak_color:
            streak_len += 1
        else:
            break
    # Computa gap branco (rodadas desde o ultimo branco)
    gap_white = None
    for i, c in enumerate(colors_newest_first):
        if c == "white":
            gap_white = i
            break
    if gap_white is None:
        gap_white = len(colors_newest_first)  # nunca apareceu no histórico atual

    def cmp(actual: int, op: str, target: int) -> bool:
        if op == ">=":
            return actual >= target
        if op == "<=":
            return actual <= target
        if op == "==":
            return actual == target
        if op == ">":
            return actual > target
        if op == "<":
            return actual < target
        return False

    for cond in rule.conditions:
        t = cond.type
        if t == "streak":
            if not cond.color or not cond.op or cond.value is None:
                return False
            if streak_color != cond.color:
                return False
            if not cmp(streak_len, cond.op, cond.value):
                return False
        elif t == "after_color":
            if not cond.color or last != cond.color:
                return False
        elif t == "gap_white":
            if not cond.op or cond.value is None:
                return False
            if not cmp(gap_white, cond.op, cond.value):
                return False
        elif t == "last_n_pattern":
            if not cond.pattern:
                return False
            if len(colors_newest_first) < len(cond.pattern):
                return False
            # pattern is given newest-first
            for i, p in enumerate(cond.pattern):
                if colors_newest_first[i] != p:
                    return False
        else:
            return False
    return True


@api_router.post("/rules", response_model=Rule)
async def create_rule(r: RuleIn):
    obj = Rule(**r.model_dump())
    await db.rules.insert_one(obj.model_dump())
    return obj


@api_router.get("/rules", response_model=List[Rule])
async def list_rules():
    docs = await db.rules.find({}, {"_id": 0}).sort("priority", -1).to_list(length=500)
    return [Rule(**d) for d in docs]


@api_router.put("/rules/{rule_id}", response_model=Rule)
async def update_rule(rule_id: str, r: RuleIn):
    existing = await db.rules.find_one({"id": rule_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Rule not found")
    updated = {**existing, **r.model_dump()}
    updated["id"] = rule_id
    await db.rules.replace_one({"id": rule_id}, updated)
    return Rule(**updated)


@api_router.delete("/rules/{rule_id}")
async def delete_rule(rule_id: str):
    res = await db.rules.delete_one({"id": rule_id})
    return {"deleted": res.deleted_count}


@api_router.get("/rules/evaluate", response_model=RuleMatch)
async def evaluate_rules(source: Optional[SourceLiteral] = None, window: int = 30):
    q: dict = {}
    if source:
        q["source"] = source
    window = max(5, min(window, 200))
    cursor = db.rounds.find(q, {"_id": 0}).sort("captured_at", -1).limit(window)
    rounds_docs = await cursor.to_list(length=window)
    colors = [d["color"] for d in rounds_docs]  # newest first
    if not colors:
        return RuleMatch(matched=False, reason="Sem rodadas no histórico.")

    rules_docs = await db.rules.find({"enabled": True}, {"_id": 0}).sort("priority", -1).to_list(length=500)
    for rd in rules_docs:
        rule = Rule(**rd)
        if _eval_rule(rule, colors):
            return RuleMatch(matched=True, rule=rule, reason=f"Regra '{rule.name}' casou.")
    return RuleMatch(matched=False, reason="Nenhuma regra ativa casou com o estado atual.")


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


# ---------------- Background Poller (24/7 collection) ----------------
BLAZE_API_URLS = [
    "https://blaze.bet.br/api/roulette_games/recent",
    "https://blaze-1.com/api/roulette_games/recent",
    "https://blaze.com/api/roulette_games/recent",
]


def _normalize_blaze_item(item: dict) -> Optional[dict]:
    """Normaliza um item retornado pelas APIs publicas da Blaze.
    Espera campos: roll (0-14), color (0=white,1=red,2=black) ou string,
    created_at (ISO timestamp)."""
    try:
        roll = item.get("roll")
        if roll is None:
            roll = item.get("number")
        if roll is None:
            return None
        roll = int(roll)
        if not (0 <= roll <= 14):
            return None
        # color
        raw_color = item.get("color")
        if isinstance(raw_color, int):
            color_map = {0: "white", 1: "red", 2: "black"}
            color = color_map.get(raw_color, color_for_number(roll))
        elif isinstance(raw_color, str) and raw_color.lower() in ("white", "red", "black"):
            color = raw_color.lower()
        else:
            color = color_for_number(roll)
        ts = item.get("created_at") or item.get("createdAt") or item.get("timestamp")
        time_str = None
        seconds = None
        site_ts = None
        if ts:
            try:
                dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
                time_str = dt.strftime("%H:%M")
                seconds = dt.strftime("%S")
                site_ts = str(ts)
            except Exception:
                site_ts = str(ts)
        return {
            "number": roll,
            "color": color,
            "time_str": time_str,
            "seconds": seconds,
            "site_ts": site_ts,
        }
    except Exception:
        return None


async def poll_blaze():
    """Roda a cada 60s: consulta a API publica da Blaze e insere rodadas novas."""
    items = None
    last_err = None
    async with httpx.AsyncClient(timeout=10.0, headers={"User-Agent": "Mozilla/5.0"}) as client:
        for url in BLAZE_API_URLS:
            try:
                r = await client.get(url)
                if r.status_code == 200:
                    data = r.json()
                    if isinstance(data, list) and data:
                        items = data
                        break
                    if isinstance(data, dict) and isinstance(data.get("data"), list):
                        items = data["data"]
                        break
            except Exception as e:
                last_err = e
                continue
    if not items:
        logger.debug(f"poll_blaze: nenhuma API respondeu ({last_err})")
        return
    inserted = 0
    duplicates = 0
    for it in items:
        norm = _normalize_blaze_item(it)
        if not norm:
            continue
        dedupe = {
            "source": "blaze",
            "number": norm["number"],
            "time_str": norm["time_str"],
            "seconds": norm["seconds"],
        }
        existing = await db.rounds.find_one(dedupe, {"_id": 0, "id": 1})
        if existing:
            duplicates += 1
            continue
        obj = Round(
            number=norm["number"],
            color=norm["color"],  # type: ignore
            source="blaze",
            time_str=norm["time_str"],
            seconds=norm["seconds"],
            site_ts=norm["site_ts"],
        )
        await db.rounds.insert_one(obj.model_dump())
        inserted += 1
    if inserted:
        logger.info(f"poll_blaze: {inserted} novas, {duplicates} duplicadas")
        # Avalia previsao pendente apos receber rodadas novas
        try:
            await _advance_active_prediction()
        except Exception as e:
            logger.warning(f"advance after poll_blaze failed: {e}")


# Regras default — carregadas no primeiro startup
DEFAULT_RULES = [
    {
        "name": "3 pretos seguidos → Vermelho",
        "conditions": [{"type": "streak", "color": "black", "op": ">=", "value": 3}],
        "action": {"color": "red", "gales": 1, "note": "Quebra de sequência de preto"},
        "priority": 5,
    },
    {
        "name": "3 vermelhos seguidos → Preto",
        "conditions": [{"type": "streak", "color": "red", "op": ">=", "value": 3}],
        "action": {"color": "black", "gales": 1, "note": "Quebra de sequência de vermelho"},
        "priority": 5,
    },
    {
        "name": "4 pretos seguidos → Vermelho (G2)",
        "conditions": [{"type": "streak", "color": "black", "op": ">=", "value": 4}],
        "action": {"color": "red", "gales": 2, "note": "Sequência longa de preto"},
        "priority": 8,
    },
    {
        "name": "4 vermelhos seguidos → Preto (G2)",
        "conditions": [{"type": "streak", "color": "red", "op": ">=", "value": 4}],
        "action": {"color": "black", "gales": 2, "note": "Sequência longa de vermelho"},
        "priority": 8,
    },
    {
        "name": "5+ pretos → Vermelho (G3)",
        "conditions": [{"type": "streak", "color": "black", "op": ">=", "value": 5}],
        "action": {"color": "red", "gales": 3, "note": "Sequência extrema"},
        "priority": 12,
    },
    {
        "name": "5+ vermelhos → Preto (G3)",
        "conditions": [{"type": "streak", "color": "red", "op": ">=", "value": 5}],
        "action": {"color": "black", "gales": 3, "note": "Sequência extrema"},
        "priority": 12,
    },
    {
        "name": "Após branco → Vermelho",
        "conditions": [{"type": "after_color", "color": "white"}],
        "action": {"color": "red", "gales": 1, "note": "Padrão pós-branco"},
        "priority": 7,
    },
    {
        "name": "Branco sem cair há 18+ → Apostar Branco",
        "conditions": [{"type": "gap_white", "op": ">=", "value": 18}],
        "action": {"color": "white", "gales": 0, "note": "Branco atrasado"},
        "priority": 10,
    },
    {
        "name": "Branco sem cair há 25+ → Branco (alta confiança)",
        "conditions": [{"type": "gap_white", "op": ">=", "value": 25}],
        "action": {"color": "white", "gales": 0, "note": "Branco MUITO atrasado"},
        "priority": 15,
    },
    {
        "name": "Padrão V-P-V-P → Vermelho",
        "conditions": [{"type": "last_n_pattern", "pattern": ["black", "red", "black", "red"]}],
        "action": {"color": "red", "gales": 1, "note": "Alternância detectada"},
        "priority": 6,
    },
    {
        "name": "Padrão P-V-P-V → Preto",
        "conditions": [{"type": "last_n_pattern", "pattern": ["red", "black", "red", "black"]}],
        "action": {"color": "black", "gales": 1, "note": "Alternância detectada"},
        "priority": 6,
    },
]


async def seed_default_rules():
    """Insere regras default se nenhuma regra existir ainda."""
    count = await db.rules.count_documents({})
    if count > 0:
        return
    for r in DEFAULT_RULES:
        obj = Rule(
            name=r["name"],
            enabled=True,
            conditions=[RuleCondition(**c) for c in r["conditions"]],
            action=RuleAction(**r["action"]),
            priority=r["priority"],
        )
        await db.rules.insert_one(obj.model_dump())
    logger.info(f"seed_default_rules: {len(DEFAULT_RULES)} regras inseridas")


scheduler = AsyncIOScheduler()


@app.on_event("startup")
async def on_startup():
    try:
        await seed_default_rules()
    except Exception as e:
        logger.warning(f"seed_default_rules failed: {e}")
    try:
        # Roda a cada 30s e tambem agora
        scheduler.add_job(poll_blaze, "interval", seconds=30, id="poll_blaze",
                          replace_existing=True, max_instances=1, coalesce=True)
        scheduler.start()
        # Executa um primeiro poll em background
        asyncio.create_task(poll_blaze())
        logger.info("Background poller iniciado (Blaze, intervalo 30s)")
    except Exception as e:
        logger.warning(f"scheduler start failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    try:
        scheduler.shutdown(wait=False)
    except Exception:
        pass
    client.close()
