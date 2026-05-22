import { useRef, useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
  Switch,
} from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { postBulkRounds, SourceType } from "../src/api";

const SITES: { key: SourceType; label: string; url: string; emoji: string }[] = [
  {
    key: "tipminer",
    label: "TipMiner",
    url: "https://www.tipminer.com/br/historico/blaze/double",
    emoji: "💎",
  },
  {
    key: "megatroia",
    label: "Mega Tróia",
    url: "https://megatroia.com.br/",
    emoji: "🔥",
  },
  {
    key: "blaze" as SourceType,
    label: "Blaze",
    url: "https://blaze.bet.br/pt/games/double",
    emoji: "🅱️",
  },
];

const INJECTED_SCRAPER = `
(function () {
  function colorForNumber(n) {
    if (n === 0) return "white";
    return (n >= 1 && n <= 7) ? "red" : "black";
  }
  var TIME_RE_EXACT = /^([01]?\\d|2[0-3]):([0-5]\\d)(?::([0-5]\\d))?$/;
  function isLeaf(el) { return !el.children || el.children.length === 0; }
  function findTimeNear(numEl) {
    var nr = numEl.getBoundingClientRect();
    var ncx = nr.left + nr.width / 2;
    var ncy = nr.top + nr.height / 2;
    var ancestor = numEl.parentElement;
    var depth = 0;
    var best = null;
    var bestDist = Infinity;
    while (ancestor && depth < 5) {
      var descs = ancestor.querySelectorAll('*');
      for (var j = 0; j < descs.length && j < 800; j++) {
        var d = descs[j];
        if (!isLeaf(d)) continue;
        var t = (d.textContent || '').trim();
        var m = t.match(TIME_RE_EXACT);
        if (!m) continue;
        var dr = d.getBoundingClientRect();
        if (dr.width === 0 || dr.height === 0) continue;
        var dcx = dr.left + dr.width / 2;
        var dcy = dr.top + dr.height / 2;
        var dx = Math.abs(dcx - ncx);
        var dy = Math.abs(dcy - ncy);
        if (dx > 120 || dy > 120) continue;
        var dist = dx + dy;
        if (dist < bestDist) {
          bestDist = dist;
          best = { time: m[1].padStart(2, '0') + ':' + m[2], seconds: m[3] || null };
        }
      }
      if (best) return best;
      ancestor = ancestor.parentElement;
      depth++;
    }
    return best;
  }
  function isVisible(el) {
    var s = window.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) < 0.1) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 12 || r.height < 12 || r.width > 140 || r.height > 140) return false;
    var ratio = r.width / Math.max(r.height, 1);
    if (ratio < 0.35 || ratio > 2.8) return false;
    return true;
  }
  function isUiNode(el) {
    var p = el;
    var depth = 0;
    while (p && depth < 10) {
      var id = (p.id || '') + ' ' + (typeof p.className === 'string' ? p.className : '');
      if (/bdp-|coletor-overlay/.test(id)) return true;
      p = p.parentElement;
      depth++;
    }
    return false;
  }
  try {
    var NUM_RE = /^(0|[1-9]|1[0-4])$/;
    var nodes = document.querySelectorAll('div, span, li, td, a, button, p, b, strong, i');
    var seen = new Map();
    var results = [];
    var scanned = 0;
    var numCandidates = 0;
    var withTime = 0;
    for (var i = 0; i < nodes.length; i++) {
      if (scanned > 80000) break;
      scanned++;
      var el = nodes[i];
      if (!isLeaf(el)) continue;
      if (isUiNode(el)) continue;
      var text = (el.textContent || '').trim();
      if (text.length > 2 || !NUM_RE.test(text)) continue;
      if (!isVisible(el)) continue;
      numCandidates++;
      var n = parseInt(text, 10);
      var tAnchor = findTimeNear(el);
      if (!tAnchor) continue;
      withTime++;
      var r = el.getBoundingClientRect();
      var cx = Math.round(r.left + r.width / 2);
      var cy = Math.round(r.top + r.height / 2);
      var key = n + '|' + tAnchor.time + '|' + (tAnchor.seconds || '') + '|' + Math.round(cy / 20) + '|' + Math.round(cx / 20);
      if (seen.has(key)) continue;
      seen.set(key, true);
      results.push({
        number: n,
        color: colorForNumber(n),
        time_str: tAnchor.time,
        seconds: tAnchor.seconds,
        _cx: cx,
        _cy: cy,
      });
    }
    results.sort(function (a, b) {
      if (Math.abs(a._cy - b._cy) > 20) return a._cy - b._cy;
      return b._cx - a._cx;
    });
    results = results.map(function (r) { delete r._cx; delete r._cy; return r; });
    var payload = {
      type: 'ROUNDS',
      rounds: results,
      diag: {
        url: location.href,
        scanned: scanned,
        numCandidates: numCandidates,
        withTime: withTime,
      },
    };
    window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  } catch (err) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: String(err && err.message || err) }));
  }
  true;
})();
`;

export default function CaptureScreen() {
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [activeSite, setActiveSite] = useState<SourceType>("tipminer");
  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [autoCollect, setAutoCollect] = useState(false);
  const [lastAutoAt, setLastAutoAt] = useState<number | null>(null);
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const current = SITES.find((s) => s.key === activeSite)!;

  // Auto-coleta: a cada 30s injeta o scraper sem mostrar alertas
  useEffect(() => {
    if (autoRef.current) {
      clearInterval(autoRef.current);
      autoRef.current = null;
    }
    if (autoCollect && Platform.OS !== "web") {
      autoRef.current = setInterval(() => {
        webRef.current?.injectJavaScript(INJECTED_SCRAPER);
        setLastAutoAt(Date.now());
      }, 30000);
    }
    return () => {
      if (autoRef.current) clearInterval(autoRef.current);
    };
  }, [autoCollect]);

  const onMessage = useCallback(
    async (event: { nativeEvent: { data: string } }) => {
      const isAuto = autoCollect;
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === "ERROR") {
          setCapturing(false);
          if (!isAuto) Alert.alert("Erro na coleta", data.message);
          return;
        }
        if (data.type !== "ROUNDS") return;
        const rounds = data.rounds || [];
        const diag = data.diag || {};
        if (rounds.length === 0) {
          setCapturing(false);
          setLastResult(
            `Nenhuma rodada detectada. Candidatos: ${diag.numCandidates ?? 0} · com horário: ${diag.withTime ?? 0}`,
          );
          if (!isAuto) {
            Alert.alert(
              "Sem rodadas",
              `Não consegui detectar rodadas nesta tela.\n\n🔍 Candidatos: ${diag.numCandidates ?? 0} · Com horário: ${diag.withTime ?? 0}\n\n👉 Aguarde a página carregar e role até a grade do histórico.`,
            );
          }
          return;
        }
        const res = await postBulkRounds(activeSite, rounds);
        setCapturing(false);
        setLastResult(
          `✓ ${res.inserted} novas · ${res.duplicates} repetidas · ${res.total} total${isAuto ? " (auto)" : ""}`,
        );
        if (!isAuto) {
          Alert.alert(
            "Coleta concluída",
            `Detectadas: ${rounds.length}\nNovas salvas: ${res.inserted}\nDuplicadas: ${res.duplicates}\nHistórico total: ${res.total}`,
          );
        }
      } catch (e: any) {
        setCapturing(false);
        if (!isAuto) Alert.alert("Erro", e?.message || "Falha ao processar rodadas");
      }
    },
    [activeSite, autoCollect],
  );

  const handleCapture = () => {
    if (capturing) return;
    setCapturing(true);
    setLastResult(null);
    webRef.current?.injectJavaScript(INJECTED_SCRAPER);
  };

  const switchSite = (key: SourceType) => {
    setActiveSite(key);
    setShowSwitcher(false);
    setLastResult(null);
  };

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, styles.webFallback]} testID="capture-web-fallback">
        <Text style={{ fontSize: 56 }}>📱</Text>
        <Text style={styles.webTitle}>Use o aplicativo no celular</Text>
        <Text style={styles.webText}>
          A coleta de rodadas via WebView funciona somente no app mobile (iOS/Android via Expo Go).
        </Text>
        <Text style={styles.webText}>Você pode abrir os sites no navegador:</Text>
        {SITES.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={styles.webLinkBtn}
            onPress={() => Linking.openURL(s.url)}
            testID={`web-open-${s.key}`}
          >
            <Text style={{ fontSize: 18 }}>{s.emoji}</Text>
            <Text style={styles.webLinkText}>Abrir {s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.container} testID="capture-screen">
      <View style={styles.topBar} testID="site-topbar">
        <TouchableOpacity
          style={styles.siteToggle}
          onPress={() => setShowSwitcher((s) => !s)}
          testID="site-toggle-btn"
        >
          <Text style={styles.siteEmoji}>{current.emoji}</Text>
          <Text style={styles.siteToggleText} numberOfLines={1}>{current.label}</Text>
          <Text style={styles.chev}>{showSwitcher ? "▲" : "▼"}</Text>
        </TouchableOpacity>
        <View style={styles.autoBox}>
          <Text style={styles.autoLabel}>Auto</Text>
          <Switch
            value={autoCollect}
            onValueChange={setAutoCollect}
            trackColor={{ false: "#333", true: "#7a1f1f" }}
            thumbColor={autoCollect ? "#FF1F1F" : "#888"}
            testID="auto-collect-switch"
          />
        </View>
        <TouchableOpacity
          style={styles.reloadBtn}
          onPress={() => webRef.current?.reload()}
          testID="reload-btn"
        >
          <Text style={{ fontSize: 16 }}>🔄</Text>
        </TouchableOpacity>
      </View>
      {autoCollect && (
        <View style={styles.autoBanner} testID="auto-banner">
          <Text style={styles.autoBannerText}>
            ⚡ Auto-coleta ATIVA — re-injetando a cada 30s
            {lastAutoAt ? ` · última: ${new Date(lastAutoAt).toLocaleTimeString("pt-BR")}` : ""}
          </Text>
        </View>
      )}

      {showSwitcher && (
        <View style={styles.switcher} testID="site-switcher">
          {SITES.map((s) => (
            <TouchableOpacity
              key={s.key}
              style={[styles.switcherItem, s.key === activeSite && styles.switcherItemActive]}
              onPress={() => switchSite(s.key)}
              testID={`site-option-${s.key}`}
            >
              <Text style={{ fontSize: 20 }}>{s.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.switcherLabel}>{s.label}</Text>
                <Text style={styles.switcherUrl} numberOfLines={1}>{s.url}</Text>
              </View>
              {s.key === activeSite && <Text style={styles.checkMark}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.webContainer}>
        <WebView
          ref={webRef}
          source={{ uri: current.url }}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onMessage={onMessage}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          allowsBackForwardNavigationGestures
          userAgent={
            Platform.OS === "ios"
              ? "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
              : "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
          }
          style={{ flex: 1, backgroundColor: "#0c0c0c" }}
          testID="rounds-webview"
        />
        {loading && (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color="#FF1F1F" />
            <Text style={styles.loadingText}>Carregando {current.label}…</Text>
          </View>
        )}
      </View>

      {lastResult && (
        <View style={[styles.statusPill, { bottom: insets.bottom + 92 }]} testID="capture-status">
          <Text style={styles.statusText} numberOfLines={2}>{lastResult}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={handleCapture}
        disabled={capturing}
        activeOpacity={0.85}
        testID="capture-fab"
      >
        {capturing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ fontSize: 18 }}>⬇️</Text>
        )}
        <Text style={styles.fabText}>
          {capturing ? "Coletando…" : "Coletar rodadas"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0c0c0c" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#111",
    borderBottomWidth: 1,
    borderBottomColor: "#1f1f1f",
    gap: 8,
  },
  siteToggle: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    gap: 8,
    flex: 1,
  },
  siteEmoji: { fontSize: 18 },
  siteToggleText: { color: "#fff", fontSize: 14, fontWeight: "700", flex: 1 },
  chev: { color: "#bbb", fontSize: 12 },
  checkMark: { color: "#FF1F1F", fontSize: 18, fontWeight: "800" },
  reloadBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
  },
  autoBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    gap: 4,
  },
  autoLabel: { color: "#bbb", fontSize: 11, fontWeight: "700" },
  autoBanner: {
    backgroundColor: "#3a1010",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#5a1a1a",
  },
  autoBannerText: { color: "#ffb84a", fontSize: 11, fontWeight: "600", textAlign: "center" },
  switcher: {
    backgroundColor: "#141414",
    borderBottomWidth: 1,
    borderBottomColor: "#1f1f1f",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  switcherItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
    borderRadius: 10,
    marginVertical: 3,
    backgroundColor: "#1a1a1a",
  },
  switcherItemActive: {
    borderWidth: 1,
    borderColor: "#FF1F1F",
    backgroundColor: "#22090a",
  },
  switcherLabel: { color: "#fff", fontSize: 14, fontWeight: "700" },
  switcherUrl: { color: "#7a7a7a", fontSize: 11, marginTop: 2 },
  webContainer: { flex: 1, position: "relative" },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(12,12,12,0.75)",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingText: { color: "#fff", fontSize: 13 },
  fab: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E11D2A",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 30,
    gap: 8,
    elevation: 8,
  },
  fabText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  statusPill: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: "#0d3320",
    borderColor: "#1f7a47",
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  statusText: { color: "#a8efc6", fontSize: 13, fontWeight: "600", textAlign: "center" },
  webFallback: { alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  webTitle: { color: "#fff", fontSize: 22, fontWeight: "800", marginTop: 8 },
  webText: { color: "#bbb", fontSize: 14, textAlign: "center", lineHeight: 20 },
  webLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#E11D2A",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  webLinkText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
