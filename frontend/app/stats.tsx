import { useCallback, useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useFocusEffect } from "expo-router";
import {
  getStats,
  getPrediction,
  getPredictionsStats,
  evaluateRules,
  logPrediction,
  clearPredictions,
  Stats,
  Prediction,
  PredictionStats,
  RuleMatch,
  SourceType,
  COLOR_HEX,
  COLOR_LABEL,
  ColorType,
} from "../src/api";

const FILTERS: { key: SourceType | "all"; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "tipminer", label: "TipMiner" },
  { key: "megatroia", label: "Mega Tróia" },
];

export default function StatsScreen() {
  const [filter, setFilter] = useState<SourceType | "all">("all");
  const [stats, setStats] = useState<Stats | null>(null);
  const [pred, setPred] = useState<Prediction | null>(null);
  const [predErr, setPredErr] = useState<string | null>(null);
  const [pStats, setPStats] = useState<PredictionStats | null>(null);
  const [ruleMatch, setRuleMatch] = useState<RuleMatch | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const src = filter === "all" ? undefined : filter;
    try { const s = await getStats(src, 200); setStats(s); } catch { setStats(null); }
    try {
      const p = await getPrediction(src, 50);
      setPred(p); setPredErr(null);
    } catch (e: any) {
      setPred(null);
      let msg = "Colete mais rodadas para gerar uma previsão.";
      try { const parsed = JSON.parse(e.message); if (parsed?.detail) msg = parsed.detail; } catch {}
      setPredErr(msg);
    }
    try { setPStats(await getPredictionsStats(src)); } catch { setPStats(null); }
    try { setRuleMatch(await evaluateRules(src)); } catch { setRuleMatch(null); }
    setLoading(false);
  }, [filter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [load]);

  // Auto-refresh a cada 20s
  useEffect(() => {
    if (autoRef.current) { clearInterval(autoRef.current); autoRef.current = null; }
    if (autoRefresh) {
      autoRef.current = setInterval(() => { load(); }, 20000);
    }
    return () => { if (autoRef.current) clearInterval(autoRef.current); };
  }, [autoRefresh, load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const registrarResultado = (actual: ColorType) => {
    if (!pred) return;
    Alert.alert(
      "Registrar resultado",
      `Eu previ: ${COLOR_LABEL[pred.next_color]}\nSaiu: ${COLOR_LABEL[actual]}\n\n${pred.next_color === actual ? "✅ ACERTO" : "❌ ERRO"}`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Confirmar",
          onPress: async () => {
            try {
              const src = filter === "all" ? undefined : filter;
              await logPrediction({
                predicted_color: pred.next_color,
                actual_color: actual,
                source: src,
                confidence: pred.confidence,
              });
              await load();
            } catch (e: any) {
              Alert.alert("Erro", e?.message || "Falha ao salvar.");
            }
          },
        },
      ],
    );
  };

  const limparPlacar = () => {
    Alert.alert("Limpar placar", "Apagar todos os acertos/erros registrados?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Apagar",
        style: "destructive",
        onPress: async () => {
          try {
            const src = filter === "all" ? undefined : filter;
            await clearPredictions(src);
            await load();
          } catch (e: any) {
            Alert.alert("Erro", e?.message || "Falha ao limpar.");
          }
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF1F1F" />}
      testID="stats-screen"
    >
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.filterChip, autoRefresh && styles.filterChipActive]}
          onPress={() => setAutoRefresh((v) => !v)}
          testID="auto-refresh-toggle"
        >
          <Text style={[styles.filterText, autoRefresh && styles.filterTextActive]}>
            {autoRefresh ? "⚡ Auto" : "Auto off"}
          </Text>
        </TouchableOpacity>
      </View>

      {loading && !stats && !pred ? (
        <View style={styles.center}><ActivityIndicator color="#FF1F1F" size="large" /></View>
      ) : (
        <>
          {/* Regra ativa */}
          {ruleMatch?.matched && ruleMatch.rule && (
            <View style={[styles.card, { borderColor: "#1f7a47", backgroundColor: "#0d3320" }]} testID="rule-active">
              <Text style={styles.ruleAlert}>🎯 REGRA ATIVA: {ruleMatch.rule.name}</Text>
              <View style={styles.ruleAlertRow}>
                <View
                  style={[
                    styles.predBall,
                    {
                      backgroundColor: COLOR_HEX[ruleMatch.rule.action.color],
                      borderColor: ruleMatch.rule.action.color === "white" ? "#888" : "#000",
                      width: 50, height: 50, borderRadius: 25,
                    },
                  ]}
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.ruleAlertText}>
                    Apostar <Text style={styles.bold}>{COLOR_LABEL[ruleMatch.rule.action.color]}</Text>
                    {ruleMatch.rule.action.gales > 0 ? ` · até G${ruleMatch.rule.action.gales}` : ""}
                  </Text>
                  {ruleMatch.rule.action.note ? (
                    <Text style={styles.ruleAlertNote}>{ruleMatch.rule.action.note}</Text>
                  ) : null}
                </View>
              </View>
            </View>
          )}

          {/* Previsão com âncora */}
          <View style={styles.card} testID="prediction-card">
            <View style={styles.cardHeader}>
              <Text style={styles.cardEmoji}>⚡</Text>
              <Text style={styles.cardTitle}>Próxima Cor</Text>
            </View>
            {pred ? (
              <>
                <View style={styles.predRow}>
                  <View style={[styles.predBall, { backgroundColor: COLOR_HEX[pred.next_color], borderColor: pred.next_color === "white" ? "#888" : "#000" }]}>
                    <Text style={{ fontSize: 32, color: pred.next_color === "white" ? "#111" : "#fff" }}>➜</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 16 }}>
                    <Text style={styles.predLabel}>{COLOR_LABEL[pred.next_color]}</Text>
                    <Text style={styles.predConf}>Confiança: {pred.confidence}%</Text>
                  </View>
                </View>

                {pred.anchor && (
                  <View style={styles.anchorBox}>
                    <Text style={styles.anchorTitle}>⚓ Faça a entrada DEPOIS DA RODADA:</Text>
                    <View style={styles.anchorRow}>
                      <View style={[styles.anchorBall, { backgroundColor: COLOR_HEX[pred.anchor.color], borderColor: pred.anchor.color === "white" ? "#888" : "#000" }]}>
                        <Text style={[styles.anchorNum, { color: pred.anchor.color === "white" ? "#111" : "#fff" }]}>
                          {pred.anchor.number}
                        </Text>
                      </View>
                      <Text style={styles.anchorTime}>
                        {COLOR_LABEL[pred.anchor.color]}
                        {pred.anchor.time_str ? ` · ${pred.anchor.time_str}${pred.anchor.seconds ? ":" + pred.anchor.seconds : ""}` : ""}
                      </Text>
                    </View>
                  </View>
                )}

                <View style={styles.scoreRow}>
                  <ScoreBar label="Vermelho" value={pred.red_score} color="#E11D2A" />
                  <ScoreBar label="Preto" value={pred.black_score} color="#222" />
                  <ScoreBar label="Branco" value={pred.white_score} color="#e0e0e0" textColor="#111" />
                </View>
                <Text style={styles.rationale}>{pred.rationale}</Text>

                {/* Botões para registrar resultado */}
                <Text style={[styles.subTitle, { marginTop: 12 }]}>📋 Registrar o que saiu na rodada seguinte:</Text>
                <View style={styles.actionRow}>
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#E11D2A" }]} onPress={() => registrarResultado("red")} testID="log-red">
                    <Text style={styles.actionText}>Vermelho</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#1a1a1a", borderWidth: 1, borderColor: "#444" }]} onPress={() => registrarResultado("black")} testID="log-black">
                    <Text style={styles.actionText}>Preto</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#e8e8e8" }]} onPress={() => registrarResultado("white")} testID="log-white">
                    <Text style={[styles.actionText, { color: "#111" }]}>Branco</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.disclaimer}>⚠️ Análise estatística. Aposte com responsabilidade.</Text>
              </>
            ) : (
              <Text style={styles.emptyHint}>{predErr || "Sem dados para prever ainda."}</Text>
            )}
          </View>

          {/* Previsão do branco */}
          {pred?.white && pred.white.confidence > 0 && (
            <View style={styles.card} testID="white-card">
              <View style={styles.cardHeader}>
                <Text style={styles.cardEmoji}>⚪</Text>
                <Text style={styles.cardTitle}>Previsão do Branco</Text>
              </View>
              <View style={styles.whiteRow}>
                <View style={styles.whiteBall}>
                  <Text style={{ fontSize: 24, color: "#111", fontWeight: "800" }}>0</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={styles.whiteTitle}>
                    Em ~{pred.white.estimated_rounds_until_next} rodada
                    {(pred.white.estimated_rounds_until_next ?? 0) !== 1 ? "s" : ""}
                  </Text>
                  {pred.white.estimated_time_str && (
                    <Text style={styles.whiteTime}>Horário estimado: {pred.white.estimated_time_str}</Text>
                  )}
                  <Text style={styles.whiteSub}>Confiança: {pred.white.confidence}%</Text>
                </View>
              </View>
              <View style={styles.divider} />
              <Row label="Gap médio entre brancos" value={`${pred.white.avg_gap} rodadas`} />
              <Row label="Gap mediano" value={`${pred.white.median_gap} rodadas`} />
              <Row label="Rodadas desde o último branco" value={`${pred.white.rounds_since_last}`} />
              <Text style={styles.disclaimer}>
                ⚠️ Estimativa baseada na média histórica de aparições do branco. Não é garantia.
              </Text>
            </View>
          )}

          {/* Placar de acertos/erros */}
          <View style={styles.card} testID="hits-card">
            <View style={styles.cardHeader}>
              <Text style={styles.cardEmoji}>🎯</Text>
              <Text style={styles.cardTitle}>Placar (acertos/erros)</Text>
              {pStats && pStats.total > 0 && (
                <TouchableOpacity onPress={limparPlacar} testID="clear-hits">
                  <Text style={styles.clearLink}>Limpar</Text>
                </TouchableOpacity>
              )}
            </View>
            {pStats && pStats.total > 0 ? (
              <>
                <View style={styles.scorecard}>
                  <View style={styles.scoreBlock}>
                    <Text style={styles.scoreBig}>{pStats.hits}</Text>
                    <Text style={[styles.scoreSmall, { color: "#86efac" }]}>✓ acertos</Text>
                  </View>
                  <View style={styles.scoreBlock}>
                    <Text style={styles.scoreBig}>{pStats.misses}</Text>
                    <Text style={[styles.scoreSmall, { color: "#fca5a5" }]}>✗ erros</Text>
                  </View>
                  <View style={styles.scoreBlock}>
                    <Text style={[styles.scoreBig, { color: "#FFD700" }]}>{pStats.hit_rate_pct}%</Text>
                    <Text style={styles.scoreSmall}>taxa</Text>
                  </View>
                </View>
                <View style={styles.divider} />
                <Row label="🎨 Cores (V/P)" value={`${pStats.color_hits}✓ · ${pStats.color_misses}✗`} />
                <Row label="⚪ Branco" value={`${pStats.white_hits}✓ · ${pStats.white_misses}✗`} />
              </>
            ) : (
              <Text style={styles.emptyHint}>
                Faça previsões e registre o que saiu (botões acima) para começar o placar.
              </Text>
            )}
          </View>

          {/* Frequências */}
          <View style={styles.card} testID="stats-card">
            <View style={styles.cardHeader}>
              <Text style={styles.cardEmoji}>📊</Text>
              <Text style={styles.cardTitle}>Frequências (últimas {stats?.total ?? 0})</Text>
            </View>
            {stats && stats.total > 0 ? (
              <>
                <StatRow color="red" pct={stats.red_pct} count={stats.red} />
                <StatRow color="black" pct={stats.black_pct} count={stats.black} />
                <StatRow color="white" pct={stats.white_pct} count={stats.white} />
                <View style={styles.divider} />
                <Row label="📈 Sequência atual" value={`${stats.current_streak_len}x ${stats.current_streak_color ? COLOR_LABEL[stats.current_streak_color] : "—"}`} />
                <Row label="❄️ Branco visto há" value={stats.last_white_ago === null ? "nunca" : `${stats.last_white_ago} rodadas`} />
                {stats.hot_numbers.length > 0 && (
                  <>
                    <View style={styles.divider} />
                    <Text style={styles.subTitle}>🔥 Números mais frequentes</Text>
                    <View style={styles.hotRow}>
                      {stats.hot_numbers.map((h) => {
                        const c = h.number === 0 ? "white" : h.number <= 7 ? "red" : "black";
                        const isW = c === "white";
                        return (
                          <View key={h.number} style={[styles.hotBall, { backgroundColor: COLOR_HEX[c], borderColor: isW ? "#888" : "#000" }]}>
                            <Text style={{ color: isW ? "#111" : "#fff", fontWeight: "800", fontSize: 18 }}>{h.number}</Text>
                            <Text style={{ color: isW ? "#444" : "#ddd", fontSize: 10 }}>{h.count}x</Text>
                          </View>
                        );
                      })}
                    </View>
                  </>
                )}
              </>
            ) : (
              <Text style={styles.emptyHint}>Nenhuma rodada coletada ainda.</Text>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function StatRow({ color, pct, count }: { color: ColorType; pct: number; count: number }) {
  const isW = color === "white";
  return (
    <View style={styles.statRow}>
      <View style={[styles.dot, { backgroundColor: COLOR_HEX[color], borderColor: isW ? "#888" : "#000" }]} />
      <Text style={styles.statLabel} numberOfLines={1}>{COLOR_LABEL[color]}</Text>
      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${Math.min(100, pct)}%`, backgroundColor: COLOR_HEX[color] }]} />
      </View>
      <Text style={styles.statValue} numberOfLines={1}>{pct}%</Text>
      <Text style={styles.statCount} numberOfLines={1}>({count})</Text>
    </View>
  );
}

function ScoreBar({ label, value, color, textColor = "#fff" }: { label: string; value: number; color: string; textColor?: string; }) {
  return (
    <View style={styles.scoreCol}>
      <Text style={styles.scoreLabel} numberOfLines={1}>{label}</Text>
      <View style={[styles.scoreBox, { backgroundColor: color, borderColor: color === "#e0e0e0" ? "#888" : color }]}>
        <Text style={[styles.scoreVal, { color: textColor }]}>{value}%</Text>
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0c0c0c" },
  filterRow: { flexDirection: "row", gap: 8, marginBottom: 14, flexWrap: "wrap" },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "#1a1a1a", borderWidth: 1, borderColor: "#2a2a2a" },
  filterChipActive: { backgroundColor: "#22090a", borderColor: "#FF1F1F" },
  filterText: { color: "#9a9a9a", fontWeight: "700", fontSize: 12 },
  filterTextActive: { color: "#FF1F1F" },
  center: { paddingVertical: 40, alignItems: "center" },
  card: { backgroundColor: "#141414", borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: "#1f1f1f" },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  cardEmoji: { fontSize: 18 },
  cardTitle: { color: "#fff", fontWeight: "800", fontSize: 15, flex: 1 },
  clearLink: { color: "#FF1F1F", fontSize: 12, fontWeight: "700" },
  predRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  predBall: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  predLabel: { color: "#fff", fontWeight: "800", fontSize: 22 },
  predConf: { color: "#FFD700", fontWeight: "700", marginTop: 2, fontSize: 13 },
  anchorBox: { backgroundColor: "#0d2330", borderColor: "#1d6a87", borderWidth: 1, padding: 10, borderRadius: 10, marginTop: 10 },
  anchorTitle: { color: "#7fc4dd", fontSize: 11, fontWeight: "700", marginBottom: 6 },
  anchorRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  anchorBall: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  anchorNum: { fontSize: 14, fontWeight: "800" },
  anchorTime: { color: "#fff", fontWeight: "700", fontSize: 14 },
  scoreRow: { flexDirection: "row", marginTop: 14, gap: 6 },
  scoreCol: { flex: 1, alignItems: "center" },
  scoreLabel: { color: "#9a9a9a", fontSize: 10, fontWeight: "700", marginBottom: 4 },
  scoreBox: { width: "100%", paddingVertical: 8, borderRadius: 8, alignItems: "center", borderWidth: 1 },
  scoreVal: { fontWeight: "800", fontSize: 13 },
  rationale: { color: "#bdbdbd", fontSize: 12, marginTop: 12, lineHeight: 18 },
  actionRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  actionText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  disclaimer: { color: "#888", fontSize: 11, marginTop: 8, fontStyle: "italic" },
  emptyHint: { color: "#9a9a9a", fontSize: 13, paddingVertical: 8, textAlign: "center" },
  statRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, gap: 6 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1 },
  statLabel: { color: "#ccc", fontWeight: "600", width: 64, fontSize: 12 },
  barBg: { flex: 1, height: 8, backgroundColor: "#1f1f1f", borderRadius: 4, overflow: "hidden", minWidth: 30 },
  barFill: { height: "100%" },
  statValue: { color: "#fff", fontWeight: "700", width: 48, textAlign: "right", fontSize: 12 },
  statCount: { color: "#888", fontWeight: "600", width: 40, textAlign: "right", fontSize: 11 },
  divider: { height: 1, backgroundColor: "#1f1f1f", marginVertical: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  rowLabel: { color: "#9a9a9a", fontSize: 13, flex: 1 },
  rowValue: { color: "#fff", fontWeight: "700", fontSize: 13 },
  subTitle: { color: "#fff", fontWeight: "700", marginBottom: 8 },
  hotRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  hotBall: { width: 52, height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  whiteRow: { flexDirection: "row", alignItems: "center" },
  whiteBall: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#f4f4f4", borderColor: "#888", borderWidth: 2, alignItems: "center", justifyContent: "center" },
  whiteTitle: { color: "#fff", fontWeight: "800", fontSize: 18 },
  whiteTime: { color: "#FFD700", fontWeight: "700", fontSize: 14, marginTop: 2 },
  whiteSub: { color: "#9a9a9a", fontSize: 12, marginTop: 2 },
  scorecard: { flexDirection: "row", justifyContent: "space-around" },
  scoreBlock: { alignItems: "center" },
  scoreBig: { color: "#fff", fontWeight: "800", fontSize: 28 },
  scoreSmall: { color: "#9a9a9a", fontSize: 11, fontWeight: "700", marginTop: 2 },
  ruleAlert: { color: "#86efac", fontWeight: "800", fontSize: 14, marginBottom: 10 },
  ruleAlertRow: { flexDirection: "row", alignItems: "center" },
  ruleAlertText: { color: "#fff", fontSize: 15 },
  ruleAlertNote: { color: "#bdbdbd", fontSize: 12, marginTop: 2, fontStyle: "italic" },
  bold: { fontWeight: "800", color: "#fff" },
});
