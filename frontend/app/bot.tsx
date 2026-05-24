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
  Platform,
  Switch,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import {
  ActivePrediction,
  UserSettings,
  PredictionStats,
  PollStatus,
  WhiteAlert,
  getActivePrediction,
  createActivePrediction,
  cancelActivePrediction,
  getActivePredictionHistory,
  clearActivePredictionHistory,
  getSettings,
  getPredictionsStats,
  getPollStatus,
  getWhiteAlert,
  listRounds,
  Round,
  COLOR_HEX,
  COLOR_LABEL,
} from "../src/api";
import {
  startBotService,
  stopBotService,
  isBotServiceEnabled,
} from "../src/services/botService";

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pending: { label: "⏳ Aguardando rodada", color: "#FFD700", bg: "rgba(255,215,0,0.08)", border: "rgba(255,215,0,0.35)" },
  hit: { label: "✅ ACERTOU · GREEN", color: "#86efac", bg: "rgba(31,122,71,0.18)", border: "rgba(31,122,71,0.5)" },
  loss: { label: "❌ PERDEU · RED", color: "#fca5a5", bg: "rgba(225,29,42,0.15)", border: "rgba(225,29,42,0.5)" },
  cancelled: { label: "⏹ Cancelada", color: "#9a9a9a", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.12)" },
};

const GALE_LABEL = (g: number) => (g === 0 ? "Entrada" : `Gale ${g}`);

export default function BotScreen() {
  const [active, setActive] = useState<ActivePrediction | null>(null);
  const [history, setHistory] = useState<ActivePrediction[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [stats, setStats] = useState<PredictionStats | null>(null);
  const [recent, setRecent] = useState<Round[]>([]);
  const [pollStatus, setPollStatus] = useState<PollStatus | null>(null);
  const [whiteAlert, setWhiteAlert] = useState<WhiteAlert | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [serviceOn, setServiceOn] = useState(false);
  const [serviceBusy, setServiceBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastStatus = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const a = await getActivePrediction();
      setActive(a);
      if (a && lastStatus.current && lastStatus.current !== a.status) {
        if (a.status === "hit") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        else if (a.status === "loss") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      }
      if (a) lastStatus.current = a.status;
    } catch {
      setActive(null);
    }
    try { setHistory(await getActivePredictionHistory(15)); } catch { setHistory([]); }
    try { setSettings(await getSettings()); } catch { setSettings(null); }
    try { setStats(await getPredictionsStats()); } catch { setStats(null); }
    try { setRecent(await listRounds(undefined, 10)); } catch { setRecent([]); }
    try { setPollStatus(await getPollStatus()); } catch { setPollStatus(null); }
    try { setWhiteAlert(await getWhiteAlert()); } catch { setWhiteAlert(null); }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    isBotServiceEnabled().then(setServiceOn).catch(() => setServiceOn(false));
  }, []);

  // Polling rapido (5s) enquanto a tela esta visivel
  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    pollRef.current = setInterval(() => { load(); }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const novaPrevisao = async () => {
    if (busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setBusy(true);
    try {
      await createActivePrediction();
      await load();
    } catch (e: any) {
      Alert.alert("Sem previsão agora", e?.message?.includes("400")
        ? "Nenhuma regra disparou ou rodadas insuficientes. Aguarde a próxima rodada."
        : (e?.message || "Falha ao gerar previsão. Colete mais rodadas."));
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

  const toggleService = async (next: boolean) => {
    setServiceBusy(true);
    try {
      if (next) {
        const ok = await startBotService();
        if (!ok) {
          Alert.alert(
            "Permissão necessária",
            "Ative as notificações nas configurações do sistema para o Bot rodar em background."
          );
          setServiceOn(false);
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          setServiceOn(true);
        }
      } else {
        await stopBotService();
        setServiceOn(false);
      }
    } finally {
      setServiceBusy(false);
    }
  };

  const isPending = active?.status === "pending";
  const isFinished = active && (active.status === "hit" || active.status === "loss" || active.status === "cancelled");
  const onWeb = Platform.OS === "web";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF1F1F" />}
      testID="bot-screen"
    >
      {/* Hero / Card Principal */}
      <LinearGradient
        colors={isPending
          ? ["#241808", "#1a0e05"]
          : active?.status === "hit"
          ? ["#0f2a1a", "#0a1410"]
          : active?.status === "loss"
          ? ["#2a0d10", "#180708"]
          : ["#151517", "#0e0e10"]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.headerRow}>
          <View style={styles.brandIcon}>
            <Text style={{ fontSize: 18 }}>🤖</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Bot Leandro</Text>
            {settings && (
              <Text style={styles.heroSub}>
                Fonte {settings.preferred_source.toUpperCase()} · até G{settings.max_gales}
                {settings.auto_predict ? " · auto" : ""}
              </Text>
            )}
          </View>
          {pollStatus && (
            <View
              style={[
                styles.pollPill,
                {
                  backgroundColor:
                    pollStatus.status === "ok" ? "rgba(31,122,71,0.18)" : "rgba(255,215,0,0.12)",
                  borderColor:
                    pollStatus.status === "ok" ? "rgba(31,122,71,0.5)" : "rgba(255,215,0,0.45)",
                },
              ]}
            >
              <View
                style={[
                  styles.pollDot,
                  { backgroundColor: pollStatus.status === "ok" ? "#1fdc8a" : "#FFD700" },
                ]}
              />
              <Text style={[styles.pollText, { color: pollStatus.status === "ok" ? "#86efac" : "#FFD700" }]}>
                {pollStatus.status === "ok" ? "LIVE" : "Aguard."}
              </Text>
            </View>
          )}
        </View>

        {pollStatus && (pollStatus.status === "error" || pollStatus.status === "blocked") && (
          <View style={styles.pollWarning}>
            <Text style={styles.pollWarningIcon}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.pollWarningTitle}>
                {pollStatus.status === "blocked" ? "Polling automático bloqueado" : "Erro no polling"}
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
            <Text style={{ fontSize: 56 }}>🎯</Text>
            <Text style={styles.emptyTitle}>Nenhuma previsão ativa</Text>
            <Text style={styles.emptyText}>
              Toque em &quot;Nova previsão&quot; para começar. O bot monitora as rodadas
              que chegam e faz gales automáticos até acertar ou esgotar.
            </Text>
          </View>
        ) : (
          <ActiveCard active={active} />
        )}

        {/* Botão de ação */}
        <View style={styles.actionRow}>
          {isPending ? (
            <TouchableOpacity
              style={[styles.btn, styles.btnDanger]}
              onPress={cancelar}
              disabled={busy}
              activeOpacity={0.85}
              testID="cancel-btn"
            >
              <Text style={styles.btnText}>⏹ Cancelar previsão</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={novaPrevisao}
              disabled={busy}
              activeOpacity={0.85}
              testID="new-prediction-btn"
              style={{ flex: 1 }}
            >
              <LinearGradient
                colors={["#FF2A3C", "#9B0F18"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.btnPrimary}
              >
                {busy ? <ActivityIndicator color="#fff" /> : (
                  <Text style={styles.btnText}>▶ Nova previsão</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
        {isFinished && (
          <Text style={styles.hint}>
            {settings?.auto_predict
              ? "🔁 Auto-previsão ligada · a próxima já foi gerada automaticamente"
              : "Toque em \"Nova previsão\" para gerar a próxima"}
          </Text>
        )}
      </LinearGradient>

      {/* Alerta de Branco - SEPARADO da previsao Vermelho/Preto */}
      {whiteAlert?.active && (
        <LinearGradient
          colors={["#1c1814", "#100c0a"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.whiteAlertCard}
        >
          <View style={styles.whiteAlertRow}>
            <View style={styles.whiteBallBig}>
              <Text style={{ fontSize: 24, fontWeight: "900", color: "#111" }}>B</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.whiteAlertTitle}>⚪ ALERTA DE BRANCO</Text>
              <Text style={styles.whiteAlertRule}>{whiteAlert.rule_name || "Padrão detectado"}</Text>
              {whiteAlert.suggested_target?.time_str && (
                <Text style={styles.whiteAlertTarget}>
                  🕐 Alvo: {whiteAlert.suggested_target.time_str}
                  {whiteAlert.confidence ? ` · ${Math.round(whiteAlert.confidence)}% confiança` : ""}
                </Text>
              )}
            </View>
          </View>
          {whiteAlert.rationale && (
            <Text style={styles.whiteAlertText}>{whiteAlert.rationale}</Text>
          )}
        </LinearGradient>
      )}

      {/* Background Service Toggle */}
      <View style={styles.serviceCard}>
        <LinearGradient
          colors={serviceOn ? ["rgba(31,122,71,0.12)", "rgba(31,122,71,0.04)"] : ["#141417", "#0f0f12"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.serviceInner, serviceOn && { borderColor: "rgba(31,122,71,0.45)" }]}
        >
          <View style={styles.serviceLeft}>
            <View style={[styles.serviceIcon, serviceOn && { backgroundColor: "rgba(31,122,71,0.25)", borderColor: "rgba(31,122,71,0.6)" }]}>
              <Text style={{ fontSize: 20 }}>{serviceOn ? "📲" : "🔔"}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.serviceTitle}>
                {serviceOn ? "Serviço em background ATIVO" : "Ativar serviço em background"}
              </Text>
              <Text style={styles.serviceSub}>
                {serviceOn
                  ? "Você receberá notificações de hit/loss e branco. Sobrevive a reboot."
                  : "Notificações + monitoramento mesmo com o app fechado."}
              </Text>
            </View>
          </View>
          {serviceBusy ? (
            <ActivityIndicator color={serviceOn ? "#86efac" : "#FF1F1F"} />
          ) : (
            <Switch
              value={serviceOn}
              onValueChange={toggleService}
              trackColor={{ false: "#333", true: "#1f7a47" }}
              thumbColor={serviceOn ? "#86efac" : "#888"}
              disabled={onWeb}
              testID="bot-service-switch"
            />
          )}
        </LinearGradient>
        {onWeb && (
          <Text style={styles.webHint}>
            Foreground service só funciona no APK/AAB (EAS Build). No navegador, é apenas preview.
          </Text>
        )}
      </View>

      {/* Placar */}
      {stats && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardEmoji}>📊</Text>
            <Text style={styles.cardTitle}>Placar do Bot</Text>
            <Text style={styles.cardCount}>{stats.total} jogadas</Text>
          </View>
          <View style={styles.scorecard}>
            <ScoreBlock value={stats.hits} label="acertos" color="#86efac" emoji="✓" />
            <View style={styles.scoreDivider} />
            <ScoreBlock value={stats.misses} label="erros" color="#fca5a5" emoji="✗" />
            <View style={styles.scoreDivider} />
            <ScoreBlock value={`${stats.hit_rate_pct}%`} label="acerto" color="#FFD700" emoji="🎯" />
          </View>

          {Object.keys(stats.by_gale).length > 0 && (
            <>
              <Text style={styles.subTitle}>Acertos por nível</Text>
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
            <View style={styles.streakRow}>
              {stats.current_green_streak > 0 && (
                <View style={[styles.streakBox, { backgroundColor: "rgba(31,122,71,0.15)", borderColor: "rgba(31,122,71,0.5)" }]}>
                  <Text style={{ color: "#86efac", fontWeight: "900", fontSize: 16 }}>
                    🔥 {stats.current_green_streak} green{stats.current_green_streak > 1 ? "s" : ""} seguid{stats.current_green_streak > 1 ? "os" : "o"}
                  </Text>
                </View>
              )}
              {stats.current_red_streak > 0 && (
                <View style={[styles.streakBox, { backgroundColor: "rgba(225,29,42,0.15)", borderColor: "rgba(225,29,42,0.5)" }]}>
                  <Text style={{ color: "#fca5a5", fontWeight: "900", fontSize: 16 }}>
                    💀 {stats.current_red_streak} red{stats.current_red_streak > 1 ? "s" : ""} seguid{stats.current_red_streak > 1 ? "os" : "o"}
                  </Text>
                </View>
              )}
            </View>
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
            {recent.slice(0, 12).map((r) => {
              const isW = r.color === "white";
              return (
                <View
                  key={r.id}
                  style={[
                    styles.recentBall,
                    {
                      backgroundColor: COLOR_HEX[r.color],
                      borderColor: isW ? "#999" : r.color === "red" ? "#7a0c14" : "#000",
                    },
                  ]}
                >
                  <Text style={{ color: isW ? "#111" : "#fff", fontWeight: "900", fontSize: 18 }}>
                    {r.number}
                  </Text>
                  {r.time_str && (
                    <Text style={{ color: isW ? "#444" : "rgba(255,255,255,0.7)", fontSize: 9, fontWeight: "700" }}>
                      {r.time_str}
                    </Text>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Histórico do bot */}
      {history.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardEmoji}>📜</Text>
            <Text style={styles.cardTitle}>Últimas previsões</Text>
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

function ScoreBlock({ value, label, color, emoji }: { value: string | number; label: string; color: string; emoji: string }) {
  return (
    <View style={styles.scoreBlock}>
      <Text style={[styles.scoreBig, { color }]}>{value}</Text>
      <Text style={styles.scoreSmall}>{emoji} {label}</Text>
    </View>
  );
}

function ActiveCard({ active }: { active: ActivePrediction }) {
  const status = STATUS_LABEL[active.status] || STATUS_LABEL.pending;
  const isW = active.predicted_color === "white";
  const colorLabel = COLOR_LABEL[active.predicted_color];
  const initial = active.predicted_color === "red" ? "V" : active.predicted_color === "black" ? "P" : "B";

  return (
    <View>
      <View style={[styles.statusPill, { backgroundColor: status.bg, borderColor: status.border }]}>
        <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
      </View>

      <View style={styles.predictionRow}>
        <View
          style={[
            styles.bigBall,
            {
              backgroundColor: COLOR_HEX[active.predicted_color],
              borderColor: isW ? "#aaa" : active.predicted_color === "red" ? "#7a0c14" : "#000",
            },
          ]}
        >
          <Text style={{ color: isW ? "#111" : "#fff", fontSize: 36, fontWeight: "900" }}>
            {initial}
          </Text>
        </View>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={styles.predLabel}>{colorLabel}</Text>
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
            <Text style={styles.predConf}>🎲 {active.confidence}% de confiança</Text>
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
                passed && { backgroundColor: "rgba(225,29,42,0.15)", borderColor: "rgba(225,29,42,0.5)" },
                current && { backgroundColor: "rgba(255,215,0,0.15)", borderColor: "rgba(255,215,0,0.6)" },
                hit && { backgroundColor: "rgba(31,122,71,0.2)", borderColor: "rgba(31,122,71,0.6)" },
                loss && { backgroundColor: "rgba(225,29,42,0.18)", borderColor: "rgba(225,29,42,0.55)" },
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
          <Text style={styles.anchorTitle}>⚓ Entrada DEPOIS da rodada âncora</Text>
          <View style={styles.anchorRow}>
            <View
              style={[
                styles.anchorBall,
                {
                  backgroundColor: COLOR_HEX[active.anchor_color || "red"],
                  borderColor: active.anchor_color === "white" ? "#aaa" : "#000",
                },
              ]}
            >
              <Text style={{ color: active.anchor_color === "white" ? "#111" : "#fff", fontWeight: "900", fontSize: 13 }}>
                {active.anchor_number}
              </Text>
            </View>
            <Text style={styles.anchorTime}>🕐 {active.anchor_time_str || "—"}</Text>
            {active.checked_round_ids.length > 0 && (
              <Text style={styles.checkedCount}>
                {active.checked_round_ids.length} avaliada{active.checked_round_ids.length > 1 ? "s" : ""}
              </Text>
            )}
          </View>
        </View>
      )}

      {active.rule_name && (
        <View style={styles.ruleBadge}>
          <Text style={styles.ruleBadgeText}>🎯 {active.rule_name}</Text>
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
  const bg = isHit ? "rgba(31,122,71,0.1)" : isLoss ? "rgba(225,29,42,0.1)" : "rgba(255,255,255,0.04)";
  const icon = isHit ? "✓" : isLoss ? "✗" : "⏹";
  const isW = h.predicted_color === "white";
  return (
    <View style={[styles.historyRow, { backgroundColor: bg }]}>
      <View
        style={[
          styles.historyBall,
          {
            backgroundColor: COLOR_HEX[h.predicted_color],
            borderColor: isW ? "#999" : h.predicted_color === "red" ? "#7a0c14" : "#000",
          },
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
        {h.rule_name && <Text style={styles.historySub}>{h.rule_name}</Text>}
      </View>
      <Text style={styles.historyTime}>
        {h.finished_at ? new Date(h.finished_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0c" },
  heroCard: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  brandIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: "rgba(225,29,42,0.18)",
    borderWidth: 1,
    borderColor: "rgba(225,29,42,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { color: "#fff", fontWeight: "900", fontSize: 18, letterSpacing: 0.4 },
  heroSub: { color: "#9a9a9a", fontWeight: "700", fontSize: 11, marginTop: 2, letterSpacing: 0.3 },
  pollPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99,
    borderWidth: 1,
  },
  pollDot: { width: 7, height: 7, borderRadius: 4 },
  pollText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  pollWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(255,215,0,0.08)",
    borderColor: "rgba(255,215,0,0.4)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 11,
    marginBottom: 12,
    gap: 8,
  },
  pollWarningIcon: { fontSize: 18 },
  pollWarningTitle: { color: "#FFD700", fontWeight: "800", fontSize: 12, marginBottom: 2 },
  pollWarningText: { color: "#c9c9c9", fontSize: 11, lineHeight: 15 },
  center: { paddingVertical: 30, alignItems: "center" },
  empty: { paddingVertical: 22, alignItems: "center", gap: 8 },
  emptyTitle: { color: "#fff", fontWeight: "900", fontSize: 17 },
  emptyText: { color: "#9a9a9a", fontSize: 12, textAlign: "center", lineHeight: 17, paddingHorizontal: 8 },
  statusPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
    marginBottom: 14,
    alignSelf: "flex-start",
    borderWidth: 1,
  },
  statusText: { fontWeight: "900", fontSize: 13, letterSpacing: 0.3 },
  predictionRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  bigBall: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  predLabel: { color: "#fff", fontWeight: "900", fontSize: 28, letterSpacing: 0.5 },
  predGale: { color: "#FFD700", fontWeight: "800", fontSize: 14, marginTop: 4 },
  predConf: { color: "#9a9a9a", fontWeight: "700", fontSize: 11, marginTop: 4 },
  galeTrack: { flexDirection: "row", gap: 6, marginBottom: 14 },
  galeStep: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  galeStepText: { color: "#888", fontWeight: "900", fontSize: 12, letterSpacing: 0.4 },
  anchorBox: {
    backgroundColor: "rgba(29,106,135,0.13)",
    borderColor: "rgba(29,106,135,0.5)",
    borderWidth: 1,
    padding: 11,
    borderRadius: 12,
    marginBottom: 10,
  },
  anchorTitle: { color: "#7fc4dd", fontSize: 11, fontWeight: "800", marginBottom: 8, letterSpacing: 0.3 },
  anchorRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  anchorBall: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  anchorTime: { color: "#fff", fontWeight: "800", fontSize: 13 },
  checkedCount: { color: "#7fc4dd", fontSize: 11, marginLeft: "auto", fontWeight: "700" },
  ruleBadge: {
    backgroundColor: "rgba(31,122,71,0.18)",
    borderColor: "rgba(31,122,71,0.5)",
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    marginBottom: 8,
    alignSelf: "flex-start",
  },
  ruleBadgeText: { color: "#86efac", fontSize: 12, fontWeight: "800", letterSpacing: 0.3 },
  rationale: { color: "#bbb", fontSize: 12, lineHeight: 17, fontStyle: "italic" },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  btn: { flex: 1, paddingVertical: 15, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  btnPrimary: { paddingVertical: 15, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  btnDanger: {
    backgroundColor: "rgba(225,29,42,0.12)",
    borderWidth: 1.5,
    borderColor: "rgba(225,29,42,0.55)",
  },
  btnText: { color: "#fff", fontWeight: "900", fontSize: 15, letterSpacing: 0.4 },
  hint: { color: "#7a7a7a", fontSize: 11, textAlign: "center", marginTop: 10, fontStyle: "italic" },

  // Service Card
  serviceCard: { marginBottom: 14 },
  serviceInner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  serviceLeft: { flex: 1, flexDirection: "row", alignItems: "center" },
  serviceIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  serviceTitle: { color: "#fff", fontWeight: "900", fontSize: 13, letterSpacing: 0.3 },
  serviceSub: { color: "#9a9a9a", fontSize: 11, marginTop: 3, lineHeight: 15 },
  webHint: {
    color: "#FFD700",
    fontSize: 10,
    fontStyle: "italic",
    marginTop: 6,
    textAlign: "center",
  },

  // Cards
  card: {
    backgroundColor: "#121214",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  cardEmoji: { fontSize: 18 },
  cardTitle: { color: "#fff", fontWeight: "900", fontSize: 14, flex: 1, letterSpacing: 0.3 },
  cardCount: { color: "#9a9a9a", fontWeight: "800", fontSize: 11 },
  clearLink: { color: "#FF1F1F", fontSize: 12, fontWeight: "800" },
  scorecard: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  scoreBlock: { flex: 1, alignItems: "center" },
  scoreBig: { fontWeight: "900", fontSize: 26, letterSpacing: 0.5 },
  scoreSmall: { color: "#9a9a9a", fontSize: 10, fontWeight: "800", marginTop: 3, letterSpacing: 0.4 },
  scoreDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.07)", marginVertical: 4 },
  subTitle: { color: "#9a9a9a", fontWeight: "800", marginTop: 14, marginBottom: 8, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" },
  galeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  galeBlock: {
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    minWidth: 60,
  },
  galeNum: { color: "#86efac", fontWeight: "900", fontSize: 20 },
  galeLabel: { color: "#9a9a9a", fontSize: 10, marginTop: 2, fontWeight: "800", letterSpacing: 0.4 },
  streakRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 12 },
  streakBox: { paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12, borderWidth: 1, flex: 1, alignItems: "center" },
  recentBall: {
    width: 52,
    height: 52,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginVertical: 2,
  },
  historyBall: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5 },
  historyIcon: { fontWeight: "900", fontSize: 16, width: 20, textAlign: "center" },
  historyTitle: { color: "#fff", fontWeight: "800", fontSize: 13 },
  historySub: { color: "#7a7a7a", fontSize: 10, marginTop: 2, fontStyle: "italic" },
  historyTime: { color: "#7a7a7a", fontSize: 11, fontWeight: "700" },

  // White alert
  whiteAlertCard: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.4)",
  },
  whiteAlertRow: { flexDirection: "row", alignItems: "center" },
  whiteBallBig: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#bbb",
  },
  whiteAlertTitle: { color: "#fff", fontWeight: "900", fontSize: 16, letterSpacing: 0.5 },
  whiteAlertRule: { color: "#FFD700", fontSize: 12, fontWeight: "800", marginTop: 3 },
  whiteAlertTarget: { color: "#86efac", fontSize: 12, fontWeight: "700", marginTop: 3 },
  whiteAlertText: { color: "#c9c9c9", fontSize: 11, fontStyle: "italic", marginTop: 10, lineHeight: 15 },
});
