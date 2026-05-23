import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Switch,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { clearRounds, listRounds, SourceType, COLOR_HEX, UserSettings, getSettings, updateSettings, seedPedrasRules } from "../src/api";

export default function SettingsScreen() {
  const [counts, setCounts] = useState<{ all: number; tipminer: number; megatroia: number; blaze: number }>({
    all: 0,
    tipminer: 0,
    megatroia: 0,
    blaze: 0,
  });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"all" | SourceType | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [all, tip, mt, bz, s] = await Promise.all([
        listRounds(undefined, 1000),
        listRounds("tipminer", 1000),
        listRounds("megatroia", 1000),
        listRounds("blaze", 1000),
        getSettings(),
      ]);
      setCounts({ all: all.length, tipminer: tip.length, megatroia: mt.length, blaze: bz.length });
      setSettings(s);
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
      {/* Configurações do Bot */}
      <View style={styles.card} testID="bot-settings-card">
        <View style={styles.headerRow}>
          <Text style={styles.headerEmoji}>🤖</Text>
          <Text style={styles.cardTitle}>Configurações do Bot</Text>
        </View>
        {!settings ? (
          <ActivityIndicator color="#FF1F1F" style={{ marginVertical: 14 }} />
        ) : (
          <>
            <Text style={styles.fieldLabel}>Máximo de gales</Text>
            <Text style={styles.fieldHint}>
              Quantas tentativas extras o bot faz após errar a entrada inicial.
            </Text>
            <View style={styles.chipRow}>
              {[0, 1, 2, 3, 4].map((g) => {
                const selected = settings.max_gales === g;
                return (
                  <TouchableOpacity
                    key={g}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={async () => {
                      if (savingSettings) return;
                      setSavingSettings(true);
                      try {
                        const s = await updateSettings({ ...settings, max_gales: g });
                        setSettings(s);
                      } catch (e: any) {
                        Alert.alert("Erro", e?.message || "Falha");
                      } finally {
                        setSavingSettings(false);
                      }
                    }}
                    testID={`chip-gale-${g}`}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {g === 0 ? "Sem gale" : `G${g}`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Fonte preferida (Bot)</Text>
            <Text style={styles.fieldHint}>
              De onde o bot lê o histórico das rodadas para fazer as previsões.
            </Text>
            <View style={styles.chipRow}>
              {(["blaze", "tipminer", "megatroia"] as SourceType[]).map((src) => {
                const selected = settings.preferred_source === src;
                const label = src === "blaze" ? "Blaze" : src === "tipminer" ? "TipMiner" : "Mega Tróia";
                return (
                  <TouchableOpacity
                    key={src}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={async () => {
                      if (savingSettings) return;
                      setSavingSettings(true);
                      try {
                        const s = await updateSettings({ ...settings, preferred_source: src });
                        setSettings(s);
                      } catch (e: any) {
                        Alert.alert("Erro", e?.message || "Falha");
                      } finally {
                        setSavingSettings(false);
                      }
                    }}
                    testID={`chip-src-${src}`}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>🔁 Auto-prever próxima</Text>
                <Text style={styles.fieldHint}>
                  Cria nova previsão automaticamente quando a anterior termina.
                </Text>
              </View>
              <Switch
                value={settings.auto_predict}
                onValueChange={async (v) => {
                  setSavingSettings(true);
                  try {
                    const s = await updateSettings({ ...settings, auto_predict: v });
                    setSettings(s);
                  } catch (e: any) {
                    Alert.alert("Erro", e?.message || "Falha");
                  } finally {
                    setSavingSettings(false);
                  }
                }}
                trackColor={{ false: "#333", true: "#1f7a47" }}
                thumbColor={settings.auto_predict ? "#86efac" : "#888"}
                testID="switch-auto-predict"
              />
            </View>

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>⚪ Ignorar previsões de branco</Text>
                <Text style={styles.fieldHint}>
                  Quando o algoritmo previr branco, o bot usa a 2ª cor (vermelho/preto).
                </Text>
              </View>
              <Switch
                value={settings.skip_white_predictions}
                onValueChange={async (v) => {
                  setSavingSettings(true);
                  try {
                    const s = await updateSettings({ ...settings, skip_white_predictions: v });
                    setSettings(s);
                  } catch (e: any) {
                    Alert.alert("Erro", e?.message || "Falha");
                  } finally {
                    setSavingSettings(false);
                  }
                }}
                trackColor={{ false: "#333", true: "#1f7a47" }}
                thumbColor={settings.skip_white_predictions ? "#86efac" : "#888"}
                testID="switch-skip-white"
              />
            </View>
          </>
        )}
      </View>

      <View style={styles.card} testID="rules-seed-card">
        <View style={styles.headerRow}>
          <Text style={styles.headerEmoji}>🎯</Text>
          <Text style={styles.cardTitle}>Regras das Pedras Pagadoras</Text>
        </View>
        <Text style={styles.helpText}>
          Carrega o pacote de regras das mentorias (Pedras 12/14, 13, Gêmeas, Baixas, 7/9, Combos
          e Fluxo de Cores). Use &quot;Recriar&quot; para forçar reset das regras built-in.
        </Text>
        <TouchableOpacity
          style={[styles.action, { backgroundColor: "#1f7a47" }]}
          onPress={async () => {
            try {
              const r = await seedPedrasRules(false);
              Alert.alert("Regras carregadas", `Adicionadas: ${r.inserted}\nJá existiam: ${r.skipped_existing}\nTotal: ${r.total_seed}`);
            } catch (e: any) {
              Alert.alert("Erro", e?.message || "Falha");
            }
          }}
          testID="seed-rules-btn"
        >
          <Text style={styles.actionText}>📥 Carregar regras (mantém customizações)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.action, { backgroundColor: "#7a1f1f", marginTop: 8 }]}
          onPress={() =>
            Alert.alert("Recriar regras?", "Vai apagar e recriar as regras built-in das Pedras Pagadoras. Regras customizadas suas (com outros nomes) serão mantidas.", [
              { text: "Cancelar", style: "cancel" },
              {
                text: "Recriar",
                style: "destructive",
                onPress: async () => {
                  try {
                    const r = await seedPedrasRules(true);
                    Alert.alert("Regras recriadas", `Recriadas: ${r.inserted}\nTotal: ${r.total_seed}`);
                  } catch (e: any) {
                    Alert.alert("Erro", e?.message || "Falha");
                  }
                },
              },
            ])
          }
          testID="reseed-rules-btn"
        >
          <Text style={styles.actionText}>🔄 Recriar regras (forçar reset)</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        </View>
        {loading ? (
          <ActivityIndicator color="#FF1F1F" style={{ marginVertical: 14 }} />
        ) : (
          <>
            <CountRow label="Total geral" value={counts.all} />
            <CountRow label="Blaze (oficial)" value={counts.blaze} tintColor="#FF1F1F" />
            <CountRow label="TipMiner" value={counts.tipminer} tintColor={COLOR_HEX.red} />
            <CountRow label="Mega Tróia" value={counts.megatroia} tintColor="#FFD700" />
          </>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.headerEmoji}>🗑️</Text>
          <Text style={styles.cardTitle}>Limpar histórico</Text>
        </View>
        <DangerBtn
          label="Apagar rodadas da Blaze"
          busy={busy === "blaze"}
          onPress={() => confirmClear("blaze", "as rodadas da Blaze")}
          testID="clear-blaze"
        />
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
          <Text style={styles.headerEmoji}>ℹ️</Text>
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
          <Text style={{ fontSize: 16 }}>🗑️</Text>
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
  headerEmoji: { fontSize: 18 },
  cardTitle: { color: "#fff", fontWeight: "800", fontSize: 15, flex: 1 },
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
  action: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  helpText: { color: "#bbb", fontSize: 13, lineHeight: 20, marginBottom: 6 },
  bold: { color: "#fff", fontWeight: "800" },
  fieldLabel: { color: "#fff", fontWeight: "700", fontSize: 13, marginBottom: 2 },
  fieldHint: { color: "#9a9a9a", fontSize: 11, lineHeight: 14, marginBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  chipSelected: { backgroundColor: "#E11D2A", borderColor: "#E11D2A" },
  chipText: { color: "#bbb", fontWeight: "700", fontSize: 12 },
  chipTextSelected: { color: "#fff" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 14,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#1f1f1f",
    gap: 12,
  },
});
