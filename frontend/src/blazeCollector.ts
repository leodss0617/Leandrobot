// Coletor direto da Blaze: como o celular do usuário está no Brasil,
// chamamos a API pública da Blaze pelo próprio device (sem geo-block).
// Os resultados são enviados em lote para o backend via POST /api/rounds/bulk.

import { postBulkRounds } from "./api";

const BLAZE_API_URLS = [
  "https://blaze.bet.br/api/roulette_games/recent",
  "https://blaze.com/api/roulette_games/recent",
  "https://blaze-1.com/api/roulette_games/recent",
];

export interface BlazeRoundRaw {
  number: number;
  time_str: string | null;
  seconds: string | null;
  site_ts: string;
}

function colorFromNumber(n: number): "red" | "black" | "white" {
  if (n === 0) return "white";
  return n >= 1 && n <= 7 ? "red" : "black";
}

function normalizeBlazeItem(item: any): BlazeRoundRaw | null {
  if (!item) return null;
  let roll: number | null = null;
  if (typeof item.roll === "number") roll = item.roll;
  else if (typeof item.number === "number") roll = item.number;
  if (roll === null || roll < 0 || roll > 14) return null;
  const ts = item.created_at || item.createdAt || item.timestamp;
  let time_str: string | null = null;
  let seconds: string | null = null;
  let site_ts = "";
  if (ts) {
    site_ts = String(ts);
    try {
      const d = new Date(ts);
      if (!isNaN(d.getTime())) {
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        const ss = String(d.getSeconds()).padStart(2, "0");
        time_str = `${hh}:${mm}`;
        seconds = ss;
      }
    } catch {}
  }
  return { number: roll, time_str, seconds, site_ts };
}

export interface CollectResult {
  ok: boolean;
  inserted: number;
  duplicates: number;
  total: number;
  fetched: number;
  source_url: string | null;
  error: string | null;
  blocked: boolean;
}

/**
 * Faz UM ciclo de coleta: tenta cada URL da Blaze, pega rodadas recentes,
 * normaliza e envia em lote para o backend.
 * Retorna ok=false se TODAS as URLs falharem.
 */
export async function collectOnce(timeoutMs: number = 8000): Promise<CollectResult> {
  let items: any[] | null = null;
  let sourceUrl: string | null = null;
  let lastError: string | null = null;
  let blocked = false;

  for (const url of BLAZE_API_URLS) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" },
      });
      clearTimeout(tid);
      if (!r.ok) {
        if (r.status === 451) blocked = true;
        lastError = `HTTP ${r.status} em ${url}`;
        continue;
      }
      const data = await r.json();
      if (data && data.error) {
        const msg = data.error?.message || JSON.stringify(data.error);
        if (/country/i.test(msg) || /supported/i.test(msg)) blocked = true;
        lastError = msg;
        continue;
      }
      if (Array.isArray(data) && data.length > 0) {
        items = data;
        sourceUrl = url;
        break;
      }
      if (Array.isArray(data?.data) && data.data.length > 0) {
        items = data.data;
        sourceUrl = url;
        break;
      }
      lastError = "Resposta sem rodadas";
    } catch (e: any) {
      clearTimeout(tid);
      lastError = e?.message || String(e);
    }
  }

  if (!items || !sourceUrl) {
    return {
      ok: false,
      inserted: 0,
      duplicates: 0,
      total: 0,
      fetched: 0,
      source_url: null,
      error: lastError || "Nenhuma URL respondeu",
      blocked,
    };
  }

  const rounds = items
    .map(normalizeBlazeItem)
    .filter((r): r is BlazeRoundRaw => r !== null)
    .map((r) => ({
      number: r.number,
      time_str: r.time_str || undefined,
      seconds: r.seconds || undefined,
      site_ts: r.site_ts || undefined,
    }));

  if (rounds.length === 0) {
    return {
      ok: false,
      inserted: 0,
      duplicates: 0,
      total: 0,
      fetched: 0,
      source_url: sourceUrl,
      error: "Nenhuma rodada válida após normalização",
      blocked: false,
    };
  }

  try {
    const res = await postBulkRounds("blaze", rounds);
    return {
      ok: true,
      inserted: res.inserted,
      duplicates: res.duplicates,
      total: res.total,
      fetched: rounds.length,
      source_url: sourceUrl,
      error: null,
      blocked: false,
    };
  } catch (e: any) {
    return {
      ok: false,
      inserted: 0,
      duplicates: 0,
      total: 0,
      fetched: rounds.length,
      source_url: sourceUrl,
      error: `Falha ao enviar para o backend: ${e?.message || e}`,
      blocked: false,
    };
  }
}

// Expor função utilitária para uso em background tasks
export { colorFromNumber };
