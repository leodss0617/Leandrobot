import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { listRounds, Round, SourceType, COLOR_HEX } from "../src/api";

const FILTERS: { key: SourceType | "all"; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "tipminer", label: "TipMiner" },
  { key: "megatroia", label: "Mega Tróia" },
];

export default function HistoryScreen() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [filter, setFilter] = useState<SourceType | "all">("all");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const src = filter === "all" ? undefined : filter;
      const data = await listRounds(src, 300);
      setRounds(data);
    } catch (e) {
      console.warn("Falha ao carregar histórico", e);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={styles.container} testID="history-screen">
      {/* Filtros */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            testID={`history-filter-${f.key}`}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && rounds.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color="#FF1F1F" size="large" />
        </View>
      ) : rounds.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="cube-outline" size={56} color="#3a3a3a" />
          <Text style={styles.emptyTitle}>Nenhuma rodada salva</Text>
          <Text style={styles.emptyText}>
            Vá até a aba Captura e pressione o botão Coletar rodadas para começar.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rounds}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF1F1F" />
          }
          renderItem={({ item }) => <RoundRow item={item} />}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}
    </View>
  );
}

function RoundRow({ item }: { item: Round }) {
  const isWhite = item.color === "white";
  const time = item.time_str || "—";
  const dt = new Date(item.captured_at);
  const captured = isNaN(dt.getTime())
    ? ""
    : `${dt.toLocaleDateString("pt-BR")} ${dt.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })}`;

  return (
    <View style={styles.row} testID={`round-row-${item.id}`}>
      <View
        style={[
          styles.ball,
          { backgroundColor: COLOR_HEX[item.color], borderColor: isWhite ? "#888" : "#000" },
        ]}
      >
        <Text style={[styles.ballNum, { color: isWhite ? "#111" : "#fff" }]}>{item.number}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>
          {item.color === "red" ? "Vermelho" : item.color === "black" ? "Preto" : "Branco"} · {time}
          {item.seconds ? `:${item.seconds}` : ""}
        </Text>
        <Text style={styles.rowSub}>
          {item.source === "tipminer" ? "TipMiner" : item.source === "megatroia" ? "Mega Tróia" : "Manual"} · capturado {captured}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0c0c0c" },
  filterRow: {
    flexDirection: "row",
    padding: 12,
    gap: 8,
    backgroundColor: "#111",
    borderBottomWidth: 1,
    borderBottomColor: "#1f1f1f",
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  filterChipActive: {
    backgroundColor: "#22090a",
    borderColor: "#FF1F1F",
  },
  filterText: { color: "#9a9a9a", fontWeight: "700", fontSize: 12 },
  filterTextActive: { color: "#FF1F1F" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  emptyTitle: { color: "#fff", fontSize: 18, fontWeight: "700", marginTop: 8 },
  emptyText: { color: "#8a8a8a", fontSize: 13, textAlign: "center", lineHeight: 18 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#141414",
    padding: 12,
    borderRadius: 12,
    gap: 14,
    borderWidth: 1,
    borderColor: "#1f1f1f",
  },
  ball: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  ballNum: { fontSize: 16, fontWeight: "800" },
  rowTitle: { color: "#fff", fontWeight: "700", fontSize: 14 },
  rowSub: { color: "#7a7a7a", fontSize: 11, marginTop: 2 },
});
