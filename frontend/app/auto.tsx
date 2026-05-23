// Coletor Automático: roda no próprio celular do usuário (IP brasileiro)
// e chama a API da Blaze diretamente. Funciona 24/7 enquanto o app
// estiver aberto. Usa expo-keep-awake para não deixar a tela dormir.
// Em Custom Dev Build (EAS), também registra expo-background-fetch
// + notificação persistente (foreground service) p/ rodar com tela apagada.

import { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Platform,
  AppState,
  AppStateStatus,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as KeepAwake from "expo-keep-awake";
import { collectOnce, CollectResult } from "../src/blazeCollector";
import {
  registerBackgroundFetch,
  unregisterBackgroundFetch,
  isBackgroundFetchRegistered,
  showPersistentNotification,
  updatePersistentNotification,
  dismissPersistentNotification,
  requestNotificationPermissions,
  setupNotificationChannel,
} from "../src/backgroundCollector";

const POLL_INTERVAL_MS = 5000; // 5 segundos
const KEEP_AWAKE_TAG = "blaze-auto-collector";

interface LogLine {
  ts: string;
  text: string;
  level: "ok" | "warn" | "err" | "info";
}

export default function AutoCollectorScreen() {
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState(false);
  const [keepScreenOn, setKeepScreenOn] = useState(true);
  const [backgroundMode, setBackgroundMode] = useState(true);
  const [bgRegistered, setBgRegistered] = useState(false);
  const [stats, setStats] = useState({
    cycles: 0,
    inserted: 0,
    duplicates: 0,
    errors: 0,
    lastInserted: 0,
    lastDuplicates: 0,
    lastFetched: 0,
    blocked: false,
  });
  const [lastAt, setLastAt] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<CollectResult | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [running, setRunning] = useState(false);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);

  // ----- Acompanha o estado do app (foreground / background) -----
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setAppState(s));
    return () => sub.remove();
  }, []);

  // ----- Inicializa canal de notificacao + checa registro de background -----
  useEffect(() => {
    setupNotificationChannel().catch(() => {});
    isBackgroundFetchRegistered().then(setBgRegistered).catch(() => {});
  }, []);

  // ----- Keep awake (impede a tela de dormir) -----
  useEffect(() => {
    if (active && keepScreenOn) {
      KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    } else {
      KeepAwake.deactivateKeepAwake(KEEP_AWAKE_TAG);
    }
    return () => {
      KeepAwake.deactivateKeepAwake(KEEP_AWAKE_TAG);
    };
  }, [active, keepScreenOn]);

  const addLog = useCallback((text: string, level: LogLine["level"] = "info") => {
    setLog((prev) => {
      const next: LogLine[] = [
        { ts: new Date().toLocaleTimeString("pt-BR"), text, level },
        ...prev,
      ];
      return next.slice(0, 30);
    });
  }, []);

  const tick = useCallback(async () => {
    if (inFlightRef.current) return; // evita sobreposição
    inFlightRef.current = true;
    setRunning(true);
    try {
      const res = await collectOnce(8000);
      setLastResult(res);
      setLastAt(Date.now());
      setStats((s) => ({
        cycles: s.cycles + 1,
        inserted: s.inserted + (res.inserted || 0),
        duplicates: s.duplicates + (res.duplicates || 0),
        errors: s.errors + (res.ok ? 0 : 1),
        lastInserted: res.inserted || 0,
        lastDuplicates: res.duplicates || 0,
        lastFetched: res.fetched || 0,
        blocked: res.blocked,
      }));
      if (res.ok) {
        if (res.inserted > 0) {
          addLog(
            `✓ ${res.inserted} nova(s) · ${res.duplicates} repetida(s) · total ${res.total}`,
            "ok",
          );
        }
      } else if (res.blocked) {
        addLog(`⛔ Bloqueio geográfico: ${res.error}`, "err");
      } else {
        addLog(`⚠ ${res.error}`, "warn");
      }
    } catch (e: any) {
      addLog(`Erro inesperado: ${e?.message || e}`, "err");
      setStats((s) => ({ ...s, errors: s.errors + 1 }));
    } finally {
      inFlightRef.current = false;
      setRunning(false);
    }
  }, [addLog]);

  // ----- Loop de coleta -----
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (active) {
      addLog("▶ Coletor ATIVADO (5s)", "info");
      // ---- Background fetch + notificacao persistente (foreground service) ----
      if (backgroundMode) {
        (async () => {
          const granted = await requestNotificationPermissions();
          if (!granted) {
            addLog("⚠ Permissao de notificacao negada — background limitado", "warn");
          }
          await showPersistentNotification("🔴 Coletor ATIVO · aguardando rodadas...");
          const reg = await registerBackgroundFetch();
          if (reg.ok) {
            setBgRegistered(true);
            addLog("☁ Background fetch registrado (intervalo ~15min mínimo)", "ok");
          } else {
            addLog(`⚠ Background fetch falhou: ${reg.error}`, "warn");
          }
        })();
      }
      // dispara imediato
      tick();
      intervalRef.current = setInterval(() => {
        tick();
      }, POLL_INTERVAL_MS);
    } else {
      addLog("■ Coletor parado", "info");
      // Limpa background fetch + notificacao
      (async () => {
        await unregisterBackgroundFetch();
        await dismissPersistentNotification();
        setBgRegistered(false);
      })();
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, backgroundMode]);

  // ----- Atualiza a notificacao persistente com o status atual -----
  useEffect(() => {
    if (!active || !backgroundMode) return;
    const text = stats.blocked
      ? "⛔ API bloqueada — verifique sua rede BR"
      : `🟢 ${stats.cycles} ciclos · ${stats.inserted} novas · ${stats.duplicates} dup`;
    updatePersistentNotification(text).catch(() => {});
  }, [stats, active, backgroundMode]);

  const secondsSince = lastAt ? Math.floor((Date.now() - lastAt) / 1000) : null;

  const statusColor = !active
    ? "#666"
    : stats.blocked
      ? "#FF5252"
      : running
        ? "#FFA726"
        : "#22C55E";
  const statusLabel = !active
    ? "PARADO"
    : stats.blocked
      ? "BLOQUEADO"
      : running
        ? "COLETANDO..."
        : "ATIVO";

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top * 0 }]}
      contentContainerStyle={{ paddingBottom: 40 }}
      testID="auto-collector-screen"
    >
      {/* ---------- BIG STATUS CARD ---------- */}
      <View style={[styles.statusCard, { borderColor: statusColor }]}>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        <Text style={styles.statusSub}>
          {active
            ? `Polling a cada ${POLL_INTERVAL_MS / 1000}s · Última ${
                secondsSince !== null ? `há ${secondsSince}s` : "nunca"
              }`
            : "Toque para começar a coletar rodadas direto da Blaze."}
        </Text>

        <TouchableOpacity
          onPress={() => setActive((v) => !v)}
          style={[
            styles.mainBtn,
            { backgroundColor: active ? "#1f1f1f" : "#FF1F1F" },
          ]}
          testID="auto-collector-toggle"
          activeOpacity={0.85}
        >
          <Text style={styles.mainBtnText}>
            {active ? "■  PARAR COLETOR" : "▶  INICIAR COLETOR AUTOMÁTICO"}
          </Text>
        </TouchableOpacity>

        <View style={styles.optionRow}>
          <Text style={styles.optionLabel}>Manter tela acordada</Text>
          <Switch
            value={keepScreenOn}
            onValueChange={setKeepScreenOn}
            trackColor={{ true: "#FF1F1F", false: "#333" }}
            thumbColor={keepScreenOn ? "#fff" : "#888"}
            testID="keep-awake-switch"
          />
        </View>

        <View style={styles.optionRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.optionLabel}>Modo Segundo Plano</Text>
            <Text style={styles.optionHint}>
              Notificação fixa + background fetch (~15min){bgRegistered ? " · ATIVO" : ""}
            </Text>
          </View>
          <Switch
            value={backgroundMode}
            onValueChange={setBackgroundMode}
            trackColor={{ true: "#FF1F1F", false: "#333" }}
            thumbColor={backgroundMode ? "#fff" : "#888"}
            testID="background-mode-switch"
          />
        </View>
      </View>

      {/* ---------- STATS GRID ---------- */}
      <View style={styles.statsRow}>
        <StatBlock label="Ciclos" value={stats.cycles} color="#fff" />
        <StatBlock label="Novas" value={stats.inserted} color="#22C55E" />
        <StatBlock label="Repetidas" value={stats.duplicates} color="#FFA726" />
        <StatBlock label="Erros" value={stats.errors} color="#FF5252" />
      </View>

      {/* ---------- LAST CYCLE ---------- */}
      {lastResult && (
        <View style={styles.lastCard}>
          <Text style={styles.lastTitle}>Último ciclo</Text>
          <Text style={styles.lastLine}>
            Buscadas: <Text style={styles.lastNum}>{lastResult.fetched}</Text>
          </Text>
          <Text style={styles.lastLine}>
            Inseridas: <Text style={styles.lastNum}>{lastResult.inserted}</Text> · Repetidas:{" "}
            <Text style={styles.lastNum}>{lastResult.duplicates}</Text>
          </Text>
          {lastResult.source_url && (
            <Text style={styles.sourceLine} numberOfLines={1}>
              ↗ {lastResult.source_url}
            </Text>
          )}
          {lastResult.error && (
            <Text style={[styles.sourceLine, { color: "#FF8a8a" }]}>! {lastResult.error}</Text>
          )}
        </View>
      )}

      {/* ---------- BLOCKED HINT ---------- */}
      {stats.blocked && (
        <View style={styles.blockedCard}>
          <Text style={styles.blockedTitle}>⚠ API da Blaze bloqueada</Text>
          <Text style={styles.blockedText}>
            Sua rede atual não está conseguindo acessar a Blaze. Verifique se está em rede
            brasileira (Wi-Fi de casa ou dados móveis BR). Se estiver usando VPN, desligue.
          </Text>
        </View>
      )}

      {/* ---------- TIPS ---------- */}
      <View style={styles.tipsCard}>
        <Text style={styles.tipsTitle}>💡 Como manter rodando 24/7</Text>
        <Text style={styles.tipsItem}>
          • Ligue <Text style={styles.b}>Modo Segundo Plano</Text> + permita notificações ao iniciar.
        </Text>
        <Text style={styles.tipsItem}>
          • A notificação fixa <Text style={styles.b}>{"\"Coletor Blaze\""}</Text> indica que o serviço está vivo. Não feche.
        </Text>
        <Text style={styles.tipsItem}>
          • Plugue o celular no carregador para não esgotar a bateria.
        </Text>
        <Text style={styles.tipsItem}>
          • {Platform.OS === "ios" ? "iOS: o sistema decide quando rodar background fetch (~15min+)." : "Android: retire o app das restrições de bateria (Configurações → Apps → Coletor Blaze → Bateria → Sem restrições)."}
        </Text>
        <Text style={styles.tipsItem}>
          • Funciona em <Text style={styles.b}>EAS Build (custom dev client)</Text>. No Expo Go, só o modo foreground funciona.
        </Text>
        <Text style={styles.tipsItem}>
          • Estado do app: <Text style={styles.b}>{appState}</Text>
        </Text>
      </View>

      {/* ---------- LIVE LOG ---------- */}
      <View style={styles.logCard}>
        <Text style={styles.logTitle}>📋 Log ao vivo</Text>
        {log.length === 0 ? (
          <Text style={styles.logEmpty}>(sem eventos ainda)</Text>
        ) : (
          log.map((l, i) => (
            <View key={i} style={styles.logRow}>
              <Text style={styles.logTime}>{l.ts}</Text>
              <Text
                style={[
                  styles.logText,
                  l.level === "ok" && { color: "#22C55E" },
                  l.level === "warn" && { color: "#FFA726" },
                  l.level === "err" && { color: "#FF5252" },
                ]}
              >
                {l.text}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function StatBlock({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.statBlock} testID={`stat-${label.toLowerCase()}`}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0c0c0c", paddingHorizontal: 14, paddingTop: 14 },
  statusCard: {
    backgroundColor: "#141414",
    borderRadius: 18,
    padding: 18,
    borderWidth: 2,
    marginBottom: 16,
  },
  statusRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
  statusLabel: { fontSize: 22, fontWeight: "900", letterSpacing: 0.5 },
  statusSub: { color: "#9a9a9a", fontSize: 12, fontWeight: "600", marginBottom: 14 },
  mainBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  mainBtnText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.6 },
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  optionLabel: { color: "#ddd", fontSize: 13, fontWeight: "600" },
  optionHint: { color: "#777", fontSize: 11, marginTop: 2 },
  statsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  statBlock: {
    flex: 1,
    backgroundColor: "#141414",
    borderRadius: 12,
    paddingVertical: 14,
    marginHorizontal: 3,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1f1f1f",
  },
  statValue: { fontSize: 22, fontWeight: "900" },
  statLabel: { color: "#888", fontSize: 11, fontWeight: "700", marginTop: 2 },
  lastCard: {
    backgroundColor: "#141414",
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#1f1f1f",
  },
  lastTitle: { color: "#FFD700", fontSize: 13, fontWeight: "800", marginBottom: 8 },
  lastLine: { color: "#ccc", fontSize: 13, marginBottom: 2 },
  lastNum: { color: "#fff", fontWeight: "900" },
  sourceLine: { color: "#666", fontSize: 11, marginTop: 4 },
  blockedCard: {
    backgroundColor: "#2a0d0d",
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#FF5252",
  },
  blockedTitle: { color: "#FF8a8a", fontSize: 14, fontWeight: "800", marginBottom: 6 },
  blockedText: { color: "#ffb8b8", fontSize: 12, lineHeight: 18 },
  tipsCard: {
    backgroundColor: "#141414",
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#1f1f1f",
  },
  tipsTitle: { color: "#FFD700", fontSize: 13, fontWeight: "800", marginBottom: 6 },
  tipsItem: { color: "#bbb", fontSize: 12, marginBottom: 4, lineHeight: 18 },
  b: { fontWeight: "900", color: "#fff" },
  logCard: {
    backgroundColor: "#141414",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1f1f1f",
  },
  logTitle: { color: "#FFD700", fontSize: 13, fontWeight: "800", marginBottom: 8 },
  logEmpty: { color: "#666", fontSize: 12, fontStyle: "italic" },
  logRow: { flexDirection: "row", marginBottom: 4 },
  logTime: { color: "#666", fontSize: 11, marginRight: 8, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  logText: { color: "#ccc", fontSize: 12, flex: 1 },
});
