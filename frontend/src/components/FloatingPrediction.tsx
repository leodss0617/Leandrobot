import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Animated, PanResponder, Dimensions } from "react-native";
import {
  getPrediction,
  evaluateRules,
  Prediction,
  RuleMatch,
  COLOR_HEX,
  COLOR_LABEL,
} from "../api";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

export function FloatingPrediction() {
  const [pred, setPred] = useState<Prediction | null>(null);
  const [match, setMatch] = useState<RuleMatch | null>(null);
  const [visible, setVisible] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const pan = useRef(new Animated.ValueXY({ x: SCREEN_W - 240, y: 80 })).current;

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const p = await getPrediction(undefined, 50);
        if (alive) setPred(p);
      } catch {
        if (alive) setPred(null);
      }
      try {
        const m = await evaluateRules();
        if (alive) setMatch(m);
      } catch {
        if (alive) setMatch(null);
      }
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
      onPanResponderGrant: () => {
        // @ts-ignore
        pan.setOffset({ x: pan.x._value, y: pan.y._value });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: () => {
        pan.flattenOffset();
        // @ts-ignore
        const x = Math.max(8, Math.min(SCREEN_W - 232, pan.x._value));
        // @ts-ignore
        const y = Math.max(40, Math.min(SCREEN_H - 200, pan.y._value));
        Animated.spring(pan, { toValue: { x, y }, useNativeDriver: false, friction: 6 }).start();
      },
    }),
  ).current;

  // Verifica se tem previsão de red/black válida (BRANCO vai para FloatingWhiteAlert separado)
  const candidateColor = match?.matched && match.rule ? match.rule.action.color : pred?.next_color;
  const hasPrediction = candidateColor === "red" || candidateColor === "black";

  if (!visible) {
    if (!hasPrediction) return null; // não mostra botão se não tem previsão útil
    return (
      <TouchableOpacity
        style={styles.reopenBtn}
        onPress={() => setVisible(true)}
        testID="floating-reopen"
      >
        <Text style={{ color: "#fff", fontSize: 18 }}>⚡</Text>
      </TouchableOpacity>
    );
  }

  const ruleAction = match?.matched && match.rule ? match.rule.action : null;
  const showColor = ruleAction?.color || pred?.next_color;
  const showLabel = ruleAction ? COLOR_LABEL[ruleAction.color] : pred ? COLOR_LABEL[pred.next_color] : "—";
  const isRule = !!ruleAction;
  const isWhite = showColor === "white";

  // Só exibe se a previsão for VERMELHO ou PRETO (Branco vai para FloatingWhiteAlert)
  if (showColor !== "red" && showColor !== "black") return null;

  return (
    <Animated.View
      style={[
        styles.floating,
        { transform: pan.getTranslateTransform() },
        isRule && { borderColor: "#1f7a47", backgroundColor: "#0d3320" },
      ]}
      {...panResponder.panHandlers}
      testID="floating-prediction"
    >
      <View style={styles.row}>
        <View
          style={[
            styles.ball,
            { backgroundColor: showColor ? COLOR_HEX[showColor] : "#333", borderColor: isWhite ? "#888" : "#000" },
          ]}
        >
          <Text style={{ color: isWhite ? "#111" : "#fff", fontWeight: "800", fontSize: 14 }}>
            {isRule ? "R" : "P"}
          </Text>
        </View>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.title} numberOfLines={1}>
            {isRule ? "🎯 Regra" : "⚡ Previsão"}
          </Text>
          <Text style={styles.value} numberOfLines={1}>
            {showLabel}
            {isRule && ruleAction.gales > 0 ? ` · G${ruleAction.gales}` : ""}
          </Text>
          {!isRule && pred && (
            <Text style={styles.sub} numberOfLines={1}>{pred.confidence}% conf.</Text>
          )}
        </View>
        <View style={styles.btns}>
          <TouchableOpacity onPress={() => setCollapsed((c) => !c)} style={styles.iconBtn}>
            <Text style={{ color: "#bbb", fontSize: 12 }}>{collapsed ? "▼" : "▲"}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setVisible(false)} style={styles.iconBtn}>
            <Text style={{ color: "#fca5a5", fontSize: 12 }}>×</Text>
          </TouchableOpacity>
        </View>
      </View>
      {!collapsed && (
        <>
          {pred?.anchor && (
            <View style={styles.anchorRow}>
              <Text style={styles.anchorLabel}>⚓ Após:</Text>
              <View
                style={[
                  styles.anchorBall,
                  { backgroundColor: COLOR_HEX[pred.anchor.color], borderColor: pred.anchor.color === "white" ? "#888" : "#000" },
                ]}
              >
                <Text style={{ color: pred.anchor.color === "white" ? "#111" : "#fff", fontWeight: "800", fontSize: 9 }}>
                  {pred.anchor.number}
                </Text>
              </View>
              <Text style={styles.anchorTime} numberOfLines={1}>
                {pred.anchor.time_str || "—"}
              </Text>
            </View>
          )}
          {pred?.white && pred.white.estimated_time_str && (
            <Text style={styles.whiteLine} numberOfLines={1}>
              ⚪ Branco ~{pred.white.estimated_rounds_until_next}r · {pred.white.estimated_time_str}
            </Text>
          )}
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  floating: {
    position: "absolute",
    width: 220,
    backgroundColor: "rgba(20,20,20,0.96)",
    borderColor: "#FF1F1F",
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
    zIndex: 9999,
    elevation: 20,
  },
  row: { flexDirection: "row", alignItems: "center" },
  ball: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  title: { color: "#9a9a9a", fontSize: 9, fontWeight: "800" },
  value: { color: "#fff", fontSize: 14, fontWeight: "800" },
  sub: { color: "#FFD700", fontSize: 9, fontWeight: "700" },
  btns: { flexDirection: "column", gap: 2 },
  iconBtn: { width: 22, height: 18, alignItems: "center", justifyContent: "center" },
  anchorRow: { flexDirection: "row", alignItems: "center", marginTop: 6, gap: 4 },
  anchorLabel: { color: "#7fc4dd", fontSize: 9, fontWeight: "700" },
  anchorBall: {
    width: 18, height: 18, borderRadius: 9,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  anchorTime: { color: "#fff", fontSize: 10, fontWeight: "700", flex: 1 },
  whiteLine: { color: "#f4f4f4", fontSize: 10, marginTop: 4, fontWeight: "600" },
  reopenBtn: {
    position: "absolute",
    right: 16,
    bottom: 100,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "#E11D2A",
    alignItems: "center", justifyContent: "center",
    elevation: 10,
    zIndex: 9999,
  },
});
