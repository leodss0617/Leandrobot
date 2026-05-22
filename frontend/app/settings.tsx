import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { clearRounds, listRounds, SourceType, COLOR_HEX } from "../src/api";

export default function SettingsScreen() {
  const [counts, setCounts] = useState<{ all: number; tipminer: number; megatroia: number }>({
    all: 0,
    tipminer: 0,
    megatroia: 0,
  });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"all" | SourceType | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [all, tip, mt] = await Promise.all([
        listRounds(undefined, 1000),
        listRounds("tipminer", 1000),
        listRounds("megatroia", 1000),
      ]);
      setCounts({ all: all.length, tipminer: tip.length, megatroia: mt.length });
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const doClear = async (source?: SourceType) => {
    const key = source || "all";
    setBusy(key);
    try {
      const res = await clearRounds(source);
      Alert.alert("Pronto", `${res.deleted} rodada(s) apagadas.`);
      await refresh();
    } catch (e: any) {
      Alert.alert("Erro", e?.message || "Falha ao limpar histórico.");
    } finally {
      setBusy(null);
    }
  };

  const confirmClear = (source?: SourceType, label?: string) => {
    Alert.alert(
      "Confirmar",
      `Apagar ${label || "todas"} as rodadas salvas? Esta ação não pode ser desfeita.`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Apagar", style: "destructive", onPress: () => doClear(source) },
      ],
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }} testID="settings-screen">
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Ionicons name="server" size={20} color="#FF1F1F" />
          <Text style={styles.cardTitle}>Rodadas armazenadas</Text>
        </View>
        {loading ? (
          <ActivityIndicator color="#FF1F1F" style={{ marginVertical: 14 }} />
        ) : (
          <>
            <CountRow label="Total geral" value={counts.all} />
            <CountRow label="TipMiner" value={counts.tipminer} tintColor={COLOR_HEX.red} />
            <CountRow label="Mega Tróia" value={counts.megatroia} tintColor="#FFD700" />
          </>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Ionicons name="trash" size={20} color="#FF1F1F" />
          <Text style={styles.cardTitle}>Limpar histórico</Text>
        </View>
        <DangerBtn
          label="Apagar rodadas do TipMiner"
          busy={busy === "tipminer"}
          onPress={() => confirmClear("tipminer", "as rodadas do TipMiner")}
          testID="clear-tipminer"
        />
        <DangerBtn
          label="Apagar rodadas do Mega Tróia"
          busy={busy === "megatroia"}
          onPress={() => confirmClear("megatroia", "as rodadas do Mega Tróia")}
          testID="clear-megatroia"
        />
        <DangerBtn
          label="Apagar TUDO"
          busy={busy === "all"}
          onPress={() => confirmClear(undefined, "todas")}
          solid
          testID="clear-all"
        />
      </View>

      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Ionicons name="information-circle" size={20} color="#FFD700" />
          <Text style={styles.cardTitle}>Como funciona</Text>
        </View>
        <Text style={styles.helpText}>
          1. Abra a aba <Text style={styles.bold}>Captura</Text> e escolha o site (TipMiner ou Mega Tróia).
        </Text>
        <Text style={styles.helpText}>
          2. Aguarde a página carregar o histórico de rodadas do Double.
        </Text>
        <Text style={styles.helpText}>
          3. Toque em <Text style={styles.bold}>Coletar rodadas</Text>. O app extrai os números (0-14),
          identifica a cor (vermelho 1-7, preto 8-14, branco 0) e salva no banco.
        </Text>
        <Text style={styles.helpText}>
          4. Na aba <Text style={styles.bold}>Análise</Text> você vê frequências, sequências e uma previsão
          estatística da próxima cor.
        </Text>
        <Text style={[styles.helpText, { color: "#ffb84a", marginTop: 8 }]}>
          ⚠️ Este app é apenas uma ferramenta de análise estatística. Apostar envolve risco. Jogue com responsabilidade.
        </Text>
      </View>
    </ScrollView>
  );
}

function CountRow({ label, value, tintColor }: { label: string; value: number; tintColor?: string }) {
  return (
    <View style={styles.countRow}>
      <Text style={styles.countLabel}>{label}</Text>
      <Text style={[styles.countValue, tintColor ? { color: tintColor } : null]}>{value}</Text>
    </View>
  );
}

function DangerBtn({
  label,
  onPress,
  busy,
  solid,
  testID,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  solid?: boolean;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.dangerBtn, solid && styles.dangerBtnSolid]}
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.8}
      testID={testID}
    >
      {busy ? (
        <ActivityIndicator color={solid ? "#fff" : "#FF1F1F"} />
      ) : (
        <>
          <Ionicons name="trash-outline" size={16} color={solid ? "#fff" : "#FF1F1F"} />
          <Text style={[styles.dangerText, solid && { color: "#fff" }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
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
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  cardTitle: { color: "#fff", fontWeight: "800", fontSize: 15 },
  countRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1f1f1f",
  },
  countLabel: { color: "#bbb", fontSize: 14 },
  countValue: { color: "#fff", fontWeight: "800", fontSize: 18 },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#FF1F1F",
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: "transparent",
    justifyContent: "center",
  },
  dangerBtnSolid: { backgroundColor: "#E11D2A", borderColor: "#E11D2A" },
  dangerText: { color: "#FF1F1F", fontWeight: "800", fontSize: 13 },
  helpText: { color: "#bbb", fontSize: 13, lineHeight: 20, marginBottom: 6 },
  bold: { color: "#fff", fontWeight: "800" },
});
