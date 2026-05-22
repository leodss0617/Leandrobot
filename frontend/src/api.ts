const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL;

export const API_BASE = `${BACKEND}/api`;

export type SourceType = "tipminer" | "megatroia" | "manual";
export type ColorType = "red" | "black" | "white";

export interface Round {
  id: string;
  number: number;
  color: ColorType;
  source: SourceType;
  time_str?: string;
  seconds?: string;
  site_ts?: string;
  captured_at: string;
}

export interface BulkResult { inserted: number; duplicates: number; total: number; }

export interface Stats {
  total: number;
  red: number; black: number; white: number;
  red_pct: number; black_pct: number; white_pct: number;
  current_streak_color: ColorType | null;
  current_streak_len: number;
  last_white_ago: number | null;
  hot_numbers: { number: number; count: number }[];
}

export interface AnchorInfo {
  number: number;
  color: ColorType;
  time_str?: string;
  seconds?: string;
}

export interface WhiteEstimate {
  avg_gap: number | null;
  median_gap: number | null;
  rounds_since_last: number | null;
  estimated_rounds_until_next: number | null;
  estimated_minutes_until_next: number | null;
  estimated_time_str: string | null;
  confidence: number;
}

export interface Prediction {
  next_color: ColorType;
  confidence: number;
  rationale: string;
  red_score: number;
  black_score: number;
  white_score: number;
  anchor?: AnchorInfo | null;
  white?: WhiteEstimate | null;
}

export interface PredictionStats {
  total: number;
  hits: number;
  misses: number;
  hit_rate_pct: number;
  color_hits: number;
  color_misses: number;
  white_hits: number;
  white_misses: number;
}

export interface SimulateResult {
  total_predictions: number;
  hits: number;
  misses: number;
  hit_rate_pct: number;
  by_color: Record<ColorType, { hits: number; misses: number }>;
}

export async function postBulkRounds(
  source: SourceType,
  rounds: { number: number; time_str?: string; seconds?: string; site_ts?: string }[],
): Promise<BulkResult> {
  const res = await fetch(`${API_BASE}/rounds/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, rounds }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function listRounds(source?: SourceType, limit = 200): Promise<Round[]> {
  const p = new URLSearchParams();
  if (source) p.append("source", source);
  p.append("limit", String(limit));
  const res = await fetch(`${API_BASE}/rounds?${p}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function clearRounds(source?: SourceType): Promise<{ deleted: number }> {
  const p = new URLSearchParams();
  if (source) p.append("source", source);
  const url = `${API_BASE}/rounds${p.toString() ? "?" + p : ""}`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getStats(source?: SourceType, limit = 200): Promise<Stats> {
  const p = new URLSearchParams();
  if (source) p.append("source", source);
  p.append("limit", String(limit));
  const res = await fetch(`${API_BASE}/stats?${p}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getPrediction(source?: SourceType, window = 50): Promise<Prediction> {
  const p = new URLSearchParams();
  if (source) p.append("source", source);
  p.append("window", String(window));
  const res = await fetch(`${API_BASE}/prediction?${p}`);
  if (!res.ok) { throw new Error(await res.text()); }
  return res.json();
}

export async function logPrediction(payload: {
  predicted_color: ColorType;
  actual_color: ColorType;
  source?: SourceType;
  confidence?: number;
  note?: string;
}): Promise<unknown> {
  const res = await fetch(`${API_BASE}/predictions/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getPredictionsStats(source?: SourceType): Promise<PredictionStats> {
  const p = new URLSearchParams();
  if (source) p.append("source", source);
  const res = await fetch(`${API_BASE}/predictions/stats?${p}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function clearPredictions(source?: SourceType): Promise<{ deleted: number }> {
  const p = new URLSearchParams();
  if (source) p.append("source", source);
  const url = `${API_BASE}/predictions/log${p.toString() ? "?" + p : ""}`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function runSimulation(source?: SourceType, window = 30, limit = 500): Promise<SimulateResult> {
  const p = new URLSearchParams();
  if (source) p.append("source", source);
  p.append("window", String(window));
  p.append("limit", String(limit));
  const res = await fetch(`${API_BASE}/simulate?${p}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const COLOR_HEX: Record<ColorType, string> = {
  red: "#E11D2A",
  black: "#1a1a1a",
  white: "#f4f4f4",
};

export const COLOR_LABEL: Record<ColorType, string> = {
  red: "Vermelho",
  black: "Preto",
  white: "Branco",
};
