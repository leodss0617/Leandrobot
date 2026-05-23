import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from "react-native";
import { runSimulation, SimulateResult, SourceType, COLOR_LABEL } from "../src/api";

const FILTERS: { key: SourceType | "all"; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "tipminer", label: "TipMiner" },
  { key: "megatroia", label: "Mega Tróia" },
];

export default function SimulatorScreen() {
  const [filter, setFilter] = useState<SourceType | "all">("all");
  const [window, setWindow] = useState("30");
  const [limit, setLimit] = useState("500");
  const [result, setResult] = useState<SimulateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const src = filter === "all" ? undefined : filter;
      const r = await runSimulation(src, parseInt(window) || 30, parseInt(limit) || 500);
      setResult(r);
    } catch (e: any) {
      setResult(null);
      let msg = "Falha na simulação.";
      try {
        const parsed = JSON.parse(e.message);
        if (parsed?.detail) msg = parsed.detail;
      } catch {
        if (e?.message) msg = e.message;
      }
      setErr(msg);
    }
    setLoading(false);
  }, [filter, window, limit]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={run} tintColor="#FF1F1F" />}
      testID="simulator-screen"
    >
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🧪 Simulador histórico</Text>
        <Text style={styles.help}>
          Roda o algoritmo de previsão sobre o histórico salvo. Para cada rodada, prevê a cor usando as anteriores
          e compara com a real. Útil para validar a estratégia.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Fonte</Text>
        <View style={styles.row}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.chip, filter === f.key && styles.chipActive]}
            >
              <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[styles.label, { marginTop: 10 }]}>Janela (rodadas anteriores)</Text>
        <TextInput
          value={window}
          onChangeText={setWindow}
          keyboardType="number-pad"
          style={styles.input}
          testID="sim-window"
        />
        <Text style={styles.label}>Limite (rodadas totais)</Text>
        <TextInput
          value={limit}
          onChangeText={setLimit}
          keyboardType="number-pad"
          style={styles.input}
          testID="sim-limit"
        />

        <TouchableOpacity style={styles.runBtn} onPress={run} disabled={loading} testID="sim-run">
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.runText}>▶  Rodar simulação</Text>}
        </TouchableOpacity>
      </View>

      {err && (
        <View style={[styles.card, { borderColor: "#7a1f1f" }]}>
          <Text style={styles.errText}>⚠️ {err}</Text>
        </View>
      )}

      {result && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📊 Resultado</Text>
          <Row label="Previsões totais" value={String(result.total_predictions)} />
          <Row label="Acertos" value={String(result.hits)} color="#86efac" />
          <Row label="Erros" value={String(result.misses)} color="#fca5a5" />
          <Row label="Taxa de acerto" value={`${result.hit_rate_pct}%`} color="#FFD700" big />
          <View style={styles.divider} />
          <Text style={styles.subTitle}>Por cor prevista</Text>
          {(["red", "black", "white"] as const).map((c) => {
            const bc = result.by_color[c];
            if (!bc) return null;
            const tot = bc.hits + bc.misses;
            const rate = tot ? ((bc.hits / tot) * 100).toFixed(1) : "0.0";
            return (
              <Row
                key={c}
                label={COLOR_LABEL[c]}
                value={`${bc.hits}✓ · ${bc.misses}✗ · ${rate}%`}
              />
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

function Row({
  label,
  value,
  color,
  big,
}: {
  label: string;
  value: string;
  color?: string;
  big?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, big && { fontSize: 22 }, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0c0c0c" },
  card: {
    backgroundColor: "#141414",
    padding: 14,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#1f1f1f",
  },
  cardTitle: { color: "#fff", fontWeight: "800", fontSize: 15, marginBottom: 8 },
  help: { color: "#bbb", fontSize: 12, lineHeight: 18 },
  label: { color: "#9a9a9a", fontSize: 12, fontWeight: "700", marginBottom: 6, marginTop: 4 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  chipActive: { backgroundColor: "#22090a", borderColor: "#FF1F1F" },
  chipText: { color: "#9a9a9a", fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: "#FF1F1F" },
  input: {
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    color: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    fontSize: 16,
    marginBottom: 4,
  },
  runBtn: {
    backgroundColor: "#E11D2A",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 12,
  },
  runText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  errText: { color: "#fca5a5", fontSize: 13, lineHeight: 18 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, alignItems: "center" },
  summaryLabel: { color: "#9a9a9a", fontSize: 13 },
  summaryValue: { color: "#fff", fontWeight: "800", fontSize: 14 },
  divider: { height: 1, backgroundColor: "#1f1f1f", marginVertical: 10 },
  subTitle: { color: "#fff", fontWeight: "700", marginBottom: 6 },
});
