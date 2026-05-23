const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL;

export const API_BASE = `${BACKEND}/api`;

export type SourceType = "tipminer" | "megatroia" | "blaze" | "manual";
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
  by_gale: Record<string, number>;
  current_green_streak: number;
  current_red_streak: number;
}

export interface UserSettings {
  max_gales: number;
  preferred_source: SourceType;
  auto_predict: boolean;
  skip_white_predictions: boolean;
}

export type ActivePredStatus = "pending" | "hit" | "loss" | "cancelled";

export interface ActivePrediction {
  id: string;
  source: SourceType;
  predicted_color: ColorType;
  max_gales: number;
  current_gale: number;
  status: ActivePredStatus;
  anchor_round_id?: string | null;
  anchor_number?: number | null;
  anchor_color?: ColorType | null;
  anchor_time_str?: string | null;
  checked_round_ids: string[];
  hit_at_gale?: number | null;
  confidence?: number | null;
  rationale?: string | null;
  rule_name?: string | null;
  created_at: string;
  updated_at: string;
  finished_at?: string | null;
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

// ---------------- Rules ----------------
export type RuleCondType = "streak" | "after_color" | "gap_white" | "last_n_pattern";
export interface RuleCondition {
  type: RuleCondType;
  color?: ColorType;
  op?: ">=" | "==" | "<=" | ">" | "<";
  value?: number;
  pattern?: ColorType[];
}
export interface RuleAction {
  color: ColorType;
  gales: number;
  note?: string;
}
export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: RuleCondition[];
  action: RuleAction;
  priority: number;
  created_at?: string;
}
export interface RuleMatch {
  matched: boolean;
  rule?: Rule | null;
  reason?: string | null;
}

export async function listRules(): Promise<Rule[]> {
  const res = await fetch(`${API_BASE}/rules`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
export async function createRule(r: Omit<Rule, "id" | "created_at">): Promise<Rule> {
  const res = await fetch(`${API_BASE}/rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(r),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function updateRule(id: string, r: Omit<Rule, "id" | "created_at">): Promise<Rule> {
  const res = await fetch(`${API_BASE}/rules/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(r),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function deleteRule(id: string): Promise<{ deleted: number }> {
  const res = await fetch(`${API_BASE}/rules/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
export async function evaluateRules(source?: SourceType, window = 30): Promise<RuleMatch> {
  const p = new URLSearchParams();
  if (source) p.append("source", source);
  p.append("window", String(window));
  const res = await fetch(`${API_BASE}/rules/evaluate?${p}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------------- Settings ----------------
export async function getSettings(): Promise<UserSettings> {
  const res = await fetch(`${API_BASE}/settings`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function updateSettings(s: UserSettings): Promise<UserSettings> {
  const res = await fetch(`${API_BASE}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(s),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ---------------- Active Prediction ----------------
export async function getActivePrediction(): Promise<ActivePrediction | null> {
  const res = await fetch(`${API_BASE}/active-prediction`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function createActivePrediction(source?: SourceType, max_gales?: number): Promise<ActivePrediction> {
  const p = new URLSearchParams();
  if (source) p.append("source", source);
  if (max_gales !== undefined) p.append("max_gales", String(max_gales));
  const res = await fetch(`${API_BASE}/active-prediction?${p}`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function cancelActivePrediction(): Promise<{ cancelled: number }> {
  const res = await fetch(`${API_BASE}/active-prediction`, { method: "DELETE" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getActivePredictionHistory(limit = 20): Promise<ActivePrediction[]> {
  const res = await fetch(`${API_BASE}/active-prediction/history?limit=${limit}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function clearActivePredictionHistory(): Promise<{ deleted: number }> {
  const res = await fetch(`${API_BASE}/active-prediction/history`, { method: "DELETE" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface WhiteForecastTarget {
  time_str: string;
  minutes_ahead: number;
  rationale: string;
  type: "sniper_short" | "elite_long" | "soma_rastro" | "soma_rastro_double";
  confidence: number;
}

export interface WhiteForecast {
  last_white_time: string | null;
  last_white_terminal: number | null;
  mirror_terminal: number | null;
  next_stone_after_white: number | null;
  targets: WhiteForecastTarget[];
  notes: string | null;
}

export async function getWhiteForecast(source?: SourceType): Promise<WhiteForecast> {
  const p = new URLSearchParams();
  if (source) p.append("source", source);
  const res = await fetch(`${API_BASE}/white-forecast?${p}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface WhiteAlert {
  active: boolean;
  trigger_round_id?: string | null;
  trigger_round_number?: number | null;
  trigger_round_time?: string | null;
  trigger_round_color?: ColorType | null;
  rule_name?: string | null;
  rationale?: string | null;
  confidence?: number | null;
  suggested_target?: WhiteForecastTarget | null;
  expires_in_minutes?: number | null;
}

export async function getWhiteAlert(source?: SourceType): Promise<WhiteAlert> {
  const p = new URLSearchParams();
  if (source) p.append("source", source);
  const res = await fetch(`${API_BASE}/white-alert?${p}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function seedPedrasRules(replace = false): Promise<{ inserted: number; skipped_existing: number; total_seed: number }> {
  const res = await fetch(`${API_BASE}/rules/seed-pedras?replace=${replace}`, { method: "POST" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

// Poll Status
export interface PollStatus {
  status: string;
  blocked: boolean;
  message: string;
  last_poll_at: string | null;
  last_insert_count: number;
}

export async function getPollStatus(): Promise<PollStatus> {
  const res = await fetch(`${API_BASE}/poll-status`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
