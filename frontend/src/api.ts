// API client for backend
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

export interface BulkResult {
  inserted: number;
  duplicates: number;
  total: number;
}

export interface Stats {
  total: number;
  red: number;
  black: number;
  white: number;
  red_pct: number;
  black_pct: number;
  white_pct: number;
  current_streak_color: ColorType | null;
  current_streak_len: number;
  last_white_ago: number | null;
  hot_numbers: { number: number; count: number }[];
}

export interface Prediction {
  next_color: ColorType;
  confidence: number;
  rationale: string;
  red_score: number;
  black_score: number;
  white_score: number;
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
  const params = new URLSearchParams();
  if (source) params.append("source", source);
  params.append("limit", String(limit));
  const res = await fetch(`${API_BASE}/rounds?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function clearRounds(source?: SourceType): Promise<{ deleted: number }> {
  const params = new URLSearchParams();
  if (source) params.append("source", source);
  const url = `${API_BASE}/rounds${params.toString() ? "?" + params.toString() : ""}`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getStats(source?: SourceType, limit = 200): Promise<Stats> {
  const params = new URLSearchParams();
  if (source) params.append("source", source);
  params.append("limit", String(limit));
  const res = await fetch(`${API_BASE}/stats?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getPrediction(source?: SourceType, window = 50): Promise<Prediction> {
  const params = new URLSearchParams();
  if (source) params.append("source", source);
  params.append("window", String(window));
  const res = await fetch(`${API_BASE}/prediction?${params.toString()}`);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `HTTP ${res.status}`);
  }
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
