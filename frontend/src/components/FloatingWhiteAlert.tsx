import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getWhiteAlert, WhiteAlert } from "../api";
import { playSound, isSoundEnabled } from "../sounds";

const POLL_INTERVAL_MS = 6000;
const AUTO_DISMISS_MS = 5 * 60 * 1000; // 5 minutos

export default function FloatingWhiteAlert() {
  const insets = useSafeAreaInsets();
  const [alert, setAlert] = useState<WhiteAlert | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const lastTriggerRef = useRef<string | null>(null);
  const slide = useRef(new Animated.Value(-300)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = () => {
    Animated.timing(slide, { toValue: -300, duration: 300, useNativeDriver: true }).start();
  };
  const show = () => {
    Animated.spring(slide, { toValue: 0, useNativeDriver: true, bounciness: 8 }).start();
  };

  const isVisible = !!alert?.active && alert.trigger_round_id !== dismissedId;

  // Poll do backend
  useEffect(() => {
    let mounted = true;
    let interval: ReturnType<typeof setInterval> | null = null;
    const tick = async () => {
      try {
        const a = await getWhiteAlert();
        if (!mounted) return;
        if (a.active && a.trigger_round_id) {
          // Novo trigger? (id diferente)
          const isNew = a.trigger_round_id !== lastTriggerRef.current;
          lastTriggerRef.current = a.trigger_round_id;
          setAlert(a);
          if (isNew && a.trigger_round_id !== dismissedId) {
            // tocar som e animar
            try { if (isSoundEnabled()) await playSound("alert"); } catch {}
            // auto-dismiss programado
            if (dismissTimer.current) clearTimeout(dismissTimer.current);
            dismissTimer.current = setTimeout(() => {
              setDismissedId(a.trigger_round_id || null);
            }, AUTO_DISMISS_MS);
          }
        } else {
          // sem alerta no momento
          setAlert(a);
        }
      } catch {
        // silencia
      }
    };
    tick();
    interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [dismissedId]);

  // Animar entrada/saída conforme visibilidade
  useEffect(() => {
    if (isVisible) show();
    else hide();
  }, [isVisible]);

  if (!alert?.active) return null;
  if (alert.trigger_round_id === dismissedId) return null;

  const targetTime = alert.suggested_target?.time_str;
  const minutesAhead = alert.suggested_target?.minutes_ahead;

  return (
    <Animated.View
      style={[
        styles.container,
        { top: insets.top + 6, transform: [{ translateY: slide }] },
        Platform.OS === "web" && { position: "fixed" as any },
      ]}
      pointerEvents="box-none"
      testID="floating-white-alert"
    >
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.whiteBall}>
            <Text style={styles.whiteBallTxt}>B</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>⚠️ ALERTA DE BRANCO</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{alert.rule_name}</Text>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => setDismissedId(alert.trigger_round_id || null)}
            testID="dismiss-white-alert"
          >
            <Text style={styles.closeTxt}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          {alert.rationale ? (
            <Text style={styles.rationale}>{alert.rationale}</Text>
          ) : null}
          <View style={styles.triggerRow}>
            <Text style={styles.triggerLabel}>Gatilho:</Text>
            <View style={styles.triggerPill}>
              <Text style={styles.triggerNum}>
                {alert.trigger_round_number ?? "?"}
                {alert.trigger_round_time ? `  ${alert.trigger_round_time}` : ""}
              </Text>
            </View>
          </View>

          {targetTime && (
            <View style={styles.targetRow}>
              <Text style={styles.targetLabel}>🎯 Alvo provável:</Text>
              <Text style={styles.targetTime}>{targetTime}</Text>
              {minutesAhead != null && (
                <Text style={styles.targetAhead}>+{minutesAhead}min</Text>
              )}
            </View>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 9999,
    elevation: 12,
  },
  card: {
    backgroundColor: "#1a1a1a",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#FFD700",
    padding: 12,
    shadowColor: "#FFD700",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  whiteBall: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFD700",
  },
  whiteBallTxt: { color: "#111", fontWeight: "900", fontSize: 16 },
  title: { color: "#FFD700", fontWeight: "900", fontSize: 13, letterSpacing: 0.5 },
  subtitle: { color: "#fff", fontWeight: "700", fontSize: 12, marginTop: 2 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
  },
  closeTxt: { color: "#bbb", fontSize: 16, fontWeight: "800" },
  body: { marginTop: 10, gap: 8 },
  rationale: { color: "#bbb", fontSize: 11, lineHeight: 15, fontStyle: "italic" },
  triggerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  triggerLabel: { color: "#7a7a7a", fontSize: 11, fontWeight: "700" },
  triggerPill: {
    backgroundColor: "#3a2f0a",
    borderColor: "#FFD700",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  triggerNum: { color: "#FFD700", fontWeight: "800", fontSize: 12 },
  targetRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  targetLabel: { color: "#7a7a7a", fontSize: 11, fontWeight: "700" },
  targetTime: { color: "#fff", fontWeight: "900", fontSize: 18 },
  targetAhead: { color: "#FFD700", fontSize: 11, fontWeight: "700", marginLeft: "auto" },
});
