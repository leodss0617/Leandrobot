import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "expo-router";
import {
  getStats,
  getPrediction,
  Stats,
  Prediction,
  SourceType,
  COLOR_HEX,
  COLOR_LABEL,
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
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const src = filter === "all" ? undefined : filter;
    try {
      const s = await getStats(src, 200);
      setStats(s);
    } catch {
      setStats(null);
    }
    try {
      const p = await getPrediction(src, 50);
      setPred(p);
      setPredErr(null);
    } catch (e: any) {
      setPred(null);
      let msg = "Colete mais rodadas para gerar uma previsão.";
      try {
        const parsed = JSON.parse(e.message);
        if (parsed?.detail) msg = parsed.detail;
      } catch {}
      setPredErr(msg);
    }
    setLoading(false);
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
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
            testID={`stats-filter-${f.key}`}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && !stats && !pred ? (
        <View style={styles.center}>
          <ActivityIndicator color="#FF1F1F" size="large" />
        </View>
      ) : (
        <>
          {/* Previsão */}
          <View style={styles.card} testID="prediction-card">
            <View style={styles.cardHeader}>
              <Text style={styles.cardEmoji}>⚡</Text>
              <Text style={styles.cardTitle}>Próxima Cor</Text>
            </View>
            {pred ? (
              <>
                <View style={styles.predRow}>
                  <View
                    style={[
                      styles.predBall,
                      {
                        backgroundColor: COLOR_HEX[pred.next_color],
                        borderColor: pred.next_color === "white" ? "#888" : "#000",
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 32, color: pred.next_color === "white" ? "#111" : "#fff" }}>
                      ➜
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 16 }}>
                    <Text style={styles.predLabel} testID="prediction-color">
                      {COLOR_LABEL[pred.next_color]}
                    </Text>
                    <Text style={styles.predConf} testID="prediction-confidence">
                      Confiança: {pred.confidence}%
                    </Text>
                  </View>
                </View>
                <View style={styles.scoreRow}>
                  <ScoreBar label="Vermelho" value={pred.red_score} color="#E11D2A" />
                  <ScoreBar label="Preto" value={pred.black_score} color="#222" />
                  <ScoreBar label="Branco" value={pred.white_score} color="#e0e0e0" textColor="#111" />
                </View>
                <Text style={styles.rationale}>{pred.rationale}</Text>
                <Text style={styles.disclaimer}>
                  ⚠️ Análise estatística não é garantia. Aposte com responsabilidade.
                </Text>
              </>
            ) : (
              <Text style={styles.emptyHint}>{predErr || "Sem dados para prever ainda."}</Text>
            )}
          </View>

          {/* Estatísticas gerais */}
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
                <View style={styles.metricRow}>
                  <Text style={styles.metricEmoji}>📈</Text>
                  <Text style={styles.metricText}>
                    Sequência atual:{" "}
                    <Text style={styles.metricStrong}>
                      {stats.current_streak_len}x{" "}
                      {stats.current_streak_color ? COLOR_LABEL[stats.current_streak_color] : "—"}
                    </Text>
                  </Text>
                </View>
                <View style={styles.metricRow}>
                  <Text style={styles.metricEmoji}>❄️</Text>
                  <Text style={styles.metricText}>
                    Branco visto há:{" "}
                    <Text style={styles.metricStrong}>
                      {stats.last_white_ago === null ? "nunca" : `${stats.last_white_ago} rodadas`}
                    </Text>
                  </Text>
                </View>
                {stats.hot_numbers.length > 0 && (
                  <>
                    <View style={styles.divider} />
                    <Text style={styles.subTitle}>🔥 Números mais frequentes</Text>
                    <View style={styles.hotRow}>
                      {stats.hot_numbers.map((h) => {
                        const c = h.number === 0 ? "white" : h.number <= 7 ? "red" : "black";
                        const isWhite = c === "white";
                        return (
                          <View
                            key={h.number}
                            style={[
                              styles.hotBall,
                              { backgroundColor: COLOR_HEX[c], borderColor: isWhite ? "#888" : "#000" },
                            ]}
                          >
                            <Text style={{ color: isWhite ? "#111" : "#fff", fontWeight: "800", fontSize: 18 }}>
                              {h.number}
                            </Text>
                            <Text style={{ color: isWhite ? "#444" : "#ddd", fontSize: 10 }}>
                              {h.count}x
                            </Text>
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

function StatRow({
  color,
  pct,
  count,
}: {
  color: "red" | "black" | "white";
  pct: number;
  count: number;
}) {
  const isWhite = color === "white";
  return (
    <View style={styles.statRow}>
      <View
        style={[
          styles.dot,
          { backgroundColor: COLOR_HEX[color], borderColor: isWhite ? "#888" : "#000" },
        ]}
      />
      <Text style={styles.statLabel} numberOfLines={1}>{COLOR_LABEL[color]}</Text>
      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${Math.min(100, pct)}%`, backgroundColor: COLOR_HEX[color] }]} />
      </View>
      <Text style={styles.statValue} numberOfLines={1}>
        {pct}%
      </Text>
      <Text style={styles.statCount} numberOfLines={1}>
        ({count})
      </Text>
    </View>
  );
}

function ScoreBar({
  label,
  value,
  color,
  textColor = "#fff",
}: {
  label: string;
  value: number;
  color: string;
  textColor?: string;
}) {
  return (
    <View style={styles.scoreCol}>
      <Text style={styles.scoreLabel} numberOfLines={1}>{label}</Text>
      <View style={[styles.scoreBox, { backgroundColor: color, borderColor: color === "#e0e0e0" ? "#888" : color }]}>
        <Text style={[styles.scoreVal, { color: textColor }]}>{value}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0c0c0c" },
  filterRow: { flexDirection: "row", gap: 8, marginBottom: 14, flexWrap: "wrap" },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  filterChipActive: { backgroundColor: "#22090a", borderColor: "#FF1F1F" },
  filterText: { color: "#9a9a9a", fontWeight: "700", fontSize: 12 },
  filterTextActive: { color: "#FF1F1F" },
  center: { paddingVertical: 40, alignItems: "center" },
  card: {
    backgroundColor: "#141414",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#1f1f1f",
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  cardEmoji: { fontSize: 18 },
  cardTitle: { color: "#fff", fontWeight: "800", fontSize: 15, flex: 1 },
  predRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  predBall: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  predLabel: { color: "#fff", fontWeight: "800", fontSize: 22 },
  predConf: { color: "#FFD700", fontWeight: "700", marginTop: 2, fontSize: 13 },
  scoreRow: { flexDirection: "row", marginTop: 14, gap: 6 },
  scoreCol: { flex: 1, alignItems: "center" },
  scoreLabel: { color: "#9a9a9a", fontSize: 10, fontWeight: "700", marginBottom: 4 },
  scoreBox: {
    width: "100%",
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
  },
  scoreVal: { fontWeight: "800", fontSize: 13 },
  rationale: { color: "#bdbdbd", fontSize: 12, marginTop: 12, lineHeight: 18 },
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
  metricRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  metricEmoji: { fontSize: 14 },
  metricText: { color: "#9a9a9a", fontSize: 13, flex: 1 },
  metricStrong: { color: "#fff", fontWeight: "700" },
  subTitle: { color: "#fff", fontWeight: "700", marginBottom: 8 },
  hotRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  hotBall: {
    width: 52,
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
});
