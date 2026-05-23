import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "expo-router";
import {
  ActivePrediction,
  UserSettings,
  PredictionStats,
  WhiteForecast,
  PollStatus,
  getActivePrediction,
  createActivePrediction,
  cancelActivePrediction,
  getActivePredictionHistory,
  clearActivePredictionHistory,
  getSettings,
  getPredictionsStats,
  getWhiteForecast,
  getPollStatus,
  listRounds,
  Round,
  COLOR_HEX,
  COLOR_LABEL,
  ColorType,
} from "../src/api";

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "⏳ Aguardando rodada", color: "#FFD700", bg: "#3a2f0a" },
  hit: { label: "✅ ACERTO", color: "#86efac", bg: "#0d3320" },
  loss: { label: "❌ ERRO", color: "#fca5a5", bg: "#3a1010" },
  cancelled: { label: "⏹️ Cancelada", color: "#9a9a9a", bg: "#1a1a1a" },
};

const GALE_LABEL = (g: number) => (g === 0 ? "Entrada" : `Gale ${g}`);

export default function BotScreen() {
  const [active, setActive] = useState<ActivePrediction | null>(null);
  const [history, setHistory] = useState<ActivePrediction[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [stats, setStats] = useState<PredictionStats | null>(null);
  const [recent, setRecent] = useState<Round[]>([]);
  const [whiteForecast, setWhiteForecast] = useState<WhiteForecast | null>(null);
  const [pollStatus, setPollStatus] = useState<PollStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const a = await getActivePrediction();
      setActive(a);
    } catch {
      setActive(null);
    }
    try { setHistory(await getActivePredictionHistory(15)); } catch { setHistory([]); }
    try { setSettings(await getSettings()); } catch { setSettings(null); }
    try { setStats(await getPredictionsStats()); } catch { setStats(null); }
    try { setRecent(await listRounds(undefined, 8)); } catch { setRecent([]); }
    try { setWhiteForecast(await getWhiteForecast()); } catch { setWhiteForecast(null); }
    try { setPollStatus(await getPollStatus()); } catch { setPollStatus(null); }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Polling rapido para atualizar em tempo real
  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    pollRef.current = setInterval(() => { load(); }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const novaPrevisao = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await createActivePrediction();
      await load();
    } catch (e: any) {
      Alert.alert("Erro", e?.message || "Falha ao gerar previsão. Colete mais rodadas.");
    } finally {
      setBusy(false);
    }
  };

  const cancelar = async () => {
    if (busy) return;
    Alert.alert("Cancelar previsão", "Cancelar a previsão atual?", [
      { text: "Manter", style: "cancel" },
      {
        text: "Cancelar previsão",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try { await cancelActivePrediction(); await load(); }
          catch (e: any) { Alert.alert("Erro", e?.message || "Falha"); }
          finally { setBusy(false); }
        },
      },
    ]);
  };

  const limparHistorico = () => {
    Alert.alert("Limpar histórico", "Apagar todo o histórico do bot e placar?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Apagar",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try { await clearActivePredictionHistory(); await load(); }
          catch (e: any) { Alert.alert("Erro", e?.message || "Falha"); }
          finally { setBusy(false); }
        },
      },
    ]);
  };

  const isPending = active?.status === "pending";
  const isFinished = active && (active.status === "hit" || active.status === "loss" || active.status === "cancelled");

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF1F1F" />}
      testID="bot-screen"
    >
      {/* Card principal: previsão ativa */}
      <View style={styles.mainCard} testID="bot-main-card">
        <View style={styles.headerRow}>
          <Text style={styles.headerEmoji}>🤖</Text>
          <Text style={styles.headerTitle}>Bot Leandro</Text>
          {settings && (
            <Text style={styles.headerBadge}>
              {settings.preferred_source.toUpperCase()} · G{settings.max_gales}
            </Text>
          )}
        </View>

        {/* Status do Polling */}
        {pollStatus && (pollStatus.status === "error" || pollStatus.status === "blocked") && (
          <View style={styles.pollWarning} testID="poll-warning">
            <Text style={styles.pollWarningIcon}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.pollWarningTitle}>
                {pollStatus.status === "blocked" ? "API bloqueada (geolocalização)" : "Erro no polling automático"}
              </Text>
              <Text style={styles.pollWarningText}>
                Use a aba &quot;Captura&quot; para coletar rodadas manualmente via WebView.
              </Text>
            </View>
          </View>
        )}

        {loading && !active ? (
          <View style={styles.center}><ActivityIndicator color="#FF1F1F" size="large" /></View>
        ) : !active ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 50 }}>🎯</Text>
            <Text style={styles.emptyTitle}>Nenhuma previsão ainda</Text>
            <Text style={styles.emptyText}>
              Toque em &quot;Nova previsão&quot; para começar. O bot vai monitorar as rodadas
              novas e fazer gales automáticos até acertar ou esgotar.
            </Text>
          </View>
        ) : (
          <ActiveCard active={active} />
        )}

        {/* Botões de ação */}
        <View style={styles.actionRow}>
          {isPending ? (
            <TouchableOpacity
              style={[styles.btn, styles.btnDanger]}
              onPress={cancelar}
              disabled={busy}
              testID="cancel-btn"
            >
              <Text style={styles.btnText}>⏹️ Cancelar</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary]}
              onPress={novaPrevisao}
              disabled={busy}
              testID="new-prediction-btn"
            >
              {busy ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.btnText}>▶️ Nova previsão</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
        {isFinished && (
          <Text style={styles.hint}>
            {settings?.auto_predict
              ? "🔁 Auto-previsão ligada: a próxima já foi gerada automaticamente."
              : "Toque em \"Nova previsão\" para gerar a próxima."}
          </Text>
        )}
      </View>

      {/* Placar */}
      {stats && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardEmoji}>📊</Text>
            <Text style={styles.cardTitle}>Placar do Bot</Text>
          </View>
          <View style={styles.scorecard}>
            <View style={styles.scoreBlock}>
              <Text style={styles.scoreBig}>{stats.hits}</Text>
              <Text style={[styles.scoreSmall, { color: "#86efac" }]}>✓ acertos</Text>
            </View>
            <View style={styles.scoreBlock}>
              <Text style={styles.scoreBig}>{stats.misses}</Text>
              <Text style={[styles.scoreSmall, { color: "#fca5a5" }]}>✗ erros</Text>
            </View>
            <View style={styles.scoreBlock}>
              <Text style={[styles.scoreBig, { color: "#FFD700" }]}>{stats.hit_rate_pct}%</Text>
              <Text style={styles.scoreSmall}>taxa</Text>
            </View>
          </View>
          {Object.keys(stats.by_gale).length > 0 && (
            <>
              <View style={styles.divider} />
              <Text style={styles.subTitle}>🎯 Acertos por nível</Text>
              <View style={styles.galeRow}>
                {[0, 1, 2, 3, 4].map((g) => {
                  const v = stats.by_gale[String(g)] || 0;
                  if (v === 0 && g > (settings?.max_gales ?? 2)) return null;
                  return (
                    <View key={g} style={styles.galeBlock}>
                      <Text style={styles.galeNum}>{v}</Text>
                      <Text style={styles.galeLabel}>{g === 0 ? "Direto" : `G${g}`}</Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}
          {(stats.current_green_streak > 0 || stats.current_red_streak > 0) && (
            <>
              <View style={styles.divider} />
              <View style={styles.streakRow}>
                {stats.current_green_streak > 0 && (
                  <View style={[styles.streakBox, { backgroundColor: "#0d3320", borderColor: "#1f7a47" }]}>
                    <Text style={{ color: "#86efac", fontWeight: "800", fontSize: 16 }}>
                      🔥 {stats.current_green_streak} greens seguidos
                    </Text>
                  </View>
                )}
                {stats.current_red_streak > 0 && (
                  <View style={[styles.streakBox, { backgroundColor: "#3a1010", borderColor: "#7a1f1f" }]}>
                    <Text style={{ color: "#fca5a5", fontWeight: "800", fontSize: 16 }}>
                      💀 {stats.current_red_streak} reds seguidos
                    </Text>
                  </View>
                )}
              </View>
            </>
          )}
        </View>
      )}

      {/* Últimas rodadas */}
      {recent.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardEmoji}>🕐</Text>
            <Text style={styles.cardTitle}>Últimas rodadas</Text>
          </View>
          <View style={styles.recentRow}>
            {recent.slice(0, 8).map((r) => {
              const isW = r.color === "white";
              return (
                <View
                  key={r.id}
                  style={[
                    styles.recentBall,
                    { backgroundColor: COLOR_HEX[r.color], borderColor: isW ? "#888" : "#000" },
                  ]}
                >
                  <Text style={{ color: isW ? "#111" : "#fff", fontWeight: "800", fontSize: 14 }}>
                    {r.number}
                  </Text>
                  {r.time_str && (
                    <Text style={{ color: isW ? "#666" : "#ddd", fontSize: 8 }}>
                      {r.time_str}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Histórico do bot */}
      {history.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardEmoji}>📜</Text>
            <Text style={styles.cardTitle}>Últimas previsões do bot</Text>
            <TouchableOpacity onPress={limparHistorico}>
              <Text style={styles.clearLink}>Limpar</Text>
            </TouchableOpacity>
          </View>
          {history.map((h) => (
            <HistoryRow key={h.id} h={h} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function ActiveCard({ active }: { active: ActivePrediction }) {
  const status = STATUS_LABEL[active.status] || STATUS_LABEL.pending;
  const isW = active.predicted_color === "white";

  return (
    <View>
      <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
        <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
      </View>

      <View style={styles.predictionRow}>
        <View
          style={[
            styles.bigBall,
            { backgroundColor: COLOR_HEX[active.predicted_color], borderColor: isW ? "#888" : "#000" },
          ]}
        >
          <Text style={{ color: isW ? "#111" : "#fff", fontSize: 32, fontWeight: "900" }}>
            {active.predicted_color === "red" ? "V" : active.predicted_color === "black" ? "P" : "B"}
          </Text>
        </View>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={styles.predLabel}>{COLOR_LABEL[active.predicted_color]}</Text>
          <Text style={styles.predGale}>
            {active.status === "pending"
              ? `Aguardando · ${GALE_LABEL(active.current_gale)}`
              : active.status === "hit"
              ? `Acertou em ${GALE_LABEL(active.hit_at_gale ?? 0)}`
              : active.status === "loss"
              ? `Perdeu após G${active.max_gales}`
              : "Cancelada"}
          </Text>
          {active.confidence ? (
            <Text style={styles.predConf}>{active.confidence}% confiança</Text>
          ) : null}
        </View>
      </View>

      {/* Trilho dos gales */}
      <View style={styles.galeTrack}>
        {Array.from({ length: active.max_gales + 1 }, (_, i) => {
          const passed = i < active.current_gale;
          const current = i === active.current_gale && active.status === "pending";
          const hit = active.status === "hit" && active.hit_at_gale === i;
          const loss = active.status === "loss" && i === active.max_gales;
          return (
            <View
              key={i}
              style={[
                styles.galeStep,
                passed && { backgroundColor: "#3a1010", borderColor: "#7a1f1f" },
                current && { backgroundColor: "#3a2f0a", borderColor: "#FFD700" },
                hit && { backgroundColor: "#0d3320", borderColor: "#1f7a47" },
                loss && { backgroundColor: "#3a1010", borderColor: "#7a1f1f" },
              ]}
            >
              <Text
                style={[
                  styles.galeStepText,
                  passed && { color: "#fca5a5" },
                  current && { color: "#FFD700" },
                  hit && { color: "#86efac" },
                  loss && { color: "#fca5a5" },
                ]}
              >
                {i === 0 ? "E" : `G${i}`}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Âncora */}
      {active.anchor_number !== undefined && active.anchor_number !== null && (
        <View style={styles.anchorBox}>
          <Text style={styles.anchorTitle}>⚓ Entrada DEPOIS da rodada:</Text>
          <View style={styles.anchorRow}>
            <View
              style={[
                styles.anchorBall,
                {
                  backgroundColor: COLOR_HEX[active.anchor_color || "red"],
                  borderColor: active.anchor_color === "white" ? "#888" : "#000",
                },
              ]}
            >
              <Text
                style={{
                  color: active.anchor_color === "white" ? "#111" : "#fff",
                  fontWeight: "800",
                }}
              >
                {active.anchor_number}
              </Text>
            </View>
            <Text style={styles.anchorTime}>{active.anchor_time_str || "—"}</Text>
            {active.checked_round_ids.length > 0 && (
              <Text style={styles.checkedCount}>
                {active.checked_round_ids.length} rodada{active.checked_round_ids.length > 1 ? "s" : ""} avaliada{active.checked_round_ids.length > 1 ? "s" : ""}
              </Text>
            )}
          </View>
        </View>
      )}

      {active.rule_name && (
        <View style={styles.ruleBadge}>
          <Text style={styles.ruleBadgeText}>🎯 Regra: {active.rule_name}</Text>
        </View>
      )}
      {active.rationale && (
        <Text style={styles.rationale}>{active.rationale}</Text>
      )}
    </View>
  );
}

function HistoryRow({ h }: { h: ActivePrediction }) {
  const isHit = h.status === "hit";
  const isLoss = h.status === "loss";
  const color = isHit ? "#86efac" : isLoss ? "#fca5a5" : "#9a9a9a";
  const icon = isHit ? "✓" : isLoss ? "✗" : "⏹";
  const isW = h.predicted_color === "white";
  return (
    <View style={styles.historyRow}>
      <View
        style={[
          styles.historyBall,
          { backgroundColor: COLOR_HEX[h.predicted_color], borderColor: isW ? "#888" : "#000" },
        ]}
      />
      <Text style={[styles.historyIcon, { color }]}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.historyTitle}>
          {COLOR_LABEL[h.predicted_color]}
          {isHit && h.hit_at_gale !== null && h.hit_at_gale !== undefined
            ? ` · ${GALE_LABEL(h.hit_at_gale)}`
            : isLoss
            ? ` · perdeu G${h.max_gales}`
            : ""}
        </Text>
        {h.rule_name && <Text style={styles.historySub}>Regra: {h.rule_name}</Text>}
      </View>
      <Text style={styles.historyTime}>
        {h.finished_at ? new Date(h.finished_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0c0c0c" },
  mainCard: {
    backgroundColor: "#141414",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#1f1f1f",
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  headerEmoji: { fontSize: 22 },
  headerTitle: { color: "#fff", fontWeight: "900", fontSize: 18, flex: 1 },
  headerBadge: {
    color: "#FFD700",
    fontWeight: "800",
    fontSize: 11,
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  center: { paddingVertical: 30, alignItems: "center" },
  empty: { paddingVertical: 14, alignItems: "center", gap: 8 },
  emptyTitle: { color: "#fff", fontWeight: "800", fontSize: 16 },
  emptyText: { color: "#9a9a9a", fontSize: 13, textAlign: "center", lineHeight: 18, paddingHorizontal: 12 },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 12,
    alignSelf: "flex-start",
  },
  statusText: { fontWeight: "800", fontSize: 14 },
  predictionRow: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  bigBall: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  predLabel: { color: "#fff", fontWeight: "900", fontSize: 24 },
  predGale: { color: "#FFD700", fontWeight: "700", fontSize: 14, marginTop: 2 },
  predConf: { color: "#9a9a9a", fontWeight: "600", fontSize: 12, marginTop: 2 },
  galeTrack: { flexDirection: "row", gap: 6, marginBottom: 12 },
  galeStep: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  galeStepText: { color: "#888", fontWeight: "800", fontSize: 12 },
  anchorBox: {
    backgroundColor: "#0d2330",
    borderColor: "#1d6a87",
    borderWidth: 1,
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  anchorTitle: { color: "#7fc4dd", fontSize: 11, fontWeight: "700", marginBottom: 8 },
  anchorRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  anchorBall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  anchorTime: { color: "#fff", fontWeight: "700", fontSize: 14 },
  checkedCount: { color: "#7fc4dd", fontSize: 11, marginLeft: "auto" },
  ruleBadge: {
    backgroundColor: "#0d3320",
    borderColor: "#1f7a47",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 8,
    alignSelf: "flex-start",
  },
  ruleBadgeText: { color: "#86efac", fontSize: 12, fontWeight: "700" },
  rationale: { color: "#bbb", fontSize: 12, lineHeight: 16, fontStyle: "italic" },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  btnPrimary: { backgroundColor: "#E11D2A" },
  btnDanger: { backgroundColor: "#3a1010", borderWidth: 1, borderColor: "#7a1f1f" },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  hint: { color: "#7a7a7a", fontSize: 11, textAlign: "center", marginTop: 8, fontStyle: "italic" },

  card: {
    backgroundColor: "#141414",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#1f1f1f",
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  cardEmoji: { fontSize: 18 },
  cardTitle: { color: "#fff", fontWeight: "800", fontSize: 14, flex: 1 },
  clearLink: { color: "#FF1F1F", fontSize: 12, fontWeight: "700" },
  scorecard: { flexDirection: "row", justifyContent: "space-around" },
  scoreBlock: { alignItems: "center" },
  scoreBig: { color: "#fff", fontWeight: "800", fontSize: 28 },
  scoreSmall: { color: "#9a9a9a", fontSize: 11, fontWeight: "700", marginTop: 2 },
  divider: { height: 1, backgroundColor: "#1f1f1f", marginVertical: 10 },
  subTitle: { color: "#fff", fontWeight: "700", marginBottom: 8, fontSize: 13 },
  galeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  galeBlock: {
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    alignItems: "center",
    minWidth: 60,
  },
  galeNum: { color: "#86efac", fontWeight: "800", fontSize: 18 },
  galeLabel: { color: "#9a9a9a", fontSize: 10, marginTop: 2, fontWeight: "700" },
  streakRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  streakBox: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, flex: 1 },
  recentRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  recentBall: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1f1f1f",
  },
  historyBall: { width: 22, height: 22, borderRadius: 11, borderWidth: 1 },
  historyIcon: { fontWeight: "900", fontSize: 16, width: 20, textAlign: "center" },
  historyTitle: { color: "#fff", fontWeight: "700", fontSize: 13 },
  historySub: { color: "#7a7a7a", fontSize: 10, marginTop: 2 },
  historyTime: { color: "#7a7a7a", fontSize: 11, fontWeight: "600" },

  // Poll Warning
  pollWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#3a2f0a",
    borderColor: "#7a6a1f",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  pollWarningIcon: { fontSize: 20 },
  pollWarningTitle: { color: "#FFD700", fontWeight: "800", fontSize: 13, marginBottom: 2 },
  pollWarningText: { color: "#bbb", fontSize: 11, lineHeight: 15 },

  // White forecast
  wfHeader: {
    padding: 10,
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    marginBottom: 10,
    gap: 4,
  },
  wfHeaderText: { color: "#bbb", fontSize: 12, fontWeight: "600" },
  wfTarget: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
    gap: 10,
  },
  wfIcon: { fontSize: 22 },
  wfTime: { color: "#fff", fontWeight: "900", fontSize: 22 },
  wfRationale: { color: "#bbb", fontSize: 11, marginTop: 2 },
  wfConfBox: { alignItems: "flex-end" },
  wfConfNum: { color: "#FFD700", fontWeight: "800", fontSize: 12 },
  wfConfLabel: { color: "#9a9a9a", fontSize: 10, fontWeight: "700" },
  wfHint: { color: "#7a7a7a", fontSize: 10, fontStyle: "italic", textAlign: "center", marginTop: 4 },
});
