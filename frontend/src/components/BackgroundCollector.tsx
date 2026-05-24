import { useEffect, useRef, useState } from "react";
import { View, Platform, AppState } from "react-native";
import { WebView } from "react-native-webview";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { postBulkRounds, SourceType } from "../api";

/**
 * BackgroundCollector
 * ---------------------------------------------------------------
 * Uma WebView oculta (1x1px, opacity 0) montada no _layout.tsx
 * para que a coleta de rodadas funcione independentemente da
 * tela que o usuário esteja vendo.
 *
 * - Recarrega a página a cada ~3min para garantir dados frescos.
 * - Injeta o scraper a cada 10s.
 * - Resume coleta automaticamente quando o app volta ao foreground.
 * - Pode ser desabilitado em Ajustes.
 */

const SITES: Record<SourceType, string> = {
  tipminer: "https://www.tipminer.com/br/historico/blaze/double",
  megatroia: "https://megatroia.com.br/",
  blaze: "https://blaze.bet.br/pt/games/double",
};

const STORAGE_SITE = "@bg_collector_site";
const STORAGE_ENABLED = "@bg_collector_enabled";

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
  try {
    var NUM_RE = /^(0|[1-9]|1[0-4])$/;
    var nodes = document.querySelectorAll('div, span, li, td, a, button, p, b, strong, i');
    var seen = new Map();
    var results = [];
    var scanned = 0;
    for (var i = 0; i < nodes.length; i++) {
      if (scanned > 80000) break;
      scanned++;
      var el = nodes[i];
      if (!isLeaf(el)) continue;
      var text = (el.textContent || '').trim();
      if (text.length > 2 || !NUM_RE.test(text)) continue;
      if (!isVisible(el)) continue;
      var n = parseInt(text, 10);
      var tAnchor = findTimeNear(el);
      if (!tAnchor) continue;
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
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ROUNDS', rounds: results }));
  } catch (err) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: String(err && err.message || err) }));
  }
  true;
})();
`;

export function BackgroundCollector() {
  const webRef = useRef<WebView>(null);
  const [enabled, setEnabled] = useState(true);
  const [site, setSite] = useState<SourceType>("tipminer");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reloadCounter = useRef(0);
  const pageReady = useRef(false);

  // Restore preferences
  useEffect(() => {
    (async () => {
      try {
        const s = (await AsyncStorage.getItem(STORAGE_SITE)) as SourceType | null;
        const e = await AsyncStorage.getItem(STORAGE_ENABLED);
        if (s && SITES[s]) setSite(s);
        if (e === "0") setEnabled(false);
      } catch {}
    })();
  }, []);

  // Listen for changes from settings screen via simple polling
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const s = (await AsyncStorage.getItem(STORAGE_SITE)) as SourceType | null;
        const e = await AsyncStorage.getItem(STORAGE_ENABLED);
        if (s && SITES[s] && s !== site) setSite(s);
        const newEnabled = e !== "0";
        if (newEnabled !== enabled) setEnabled(newEnabled);
      } catch {}
    }, 5000);
    return () => clearInterval(id);
  }, [site, enabled]);

  // Resume on app foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && enabled && pageReady.current) {
        webRef.current?.injectJavaScript(INJECTED_SCRAPER);
      }
    });
    return () => sub.remove();
  }, [enabled]);

  // Setup auto-collection interval
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (!enabled || Platform.OS === "web") return;

    intervalRef.current = setInterval(() => {
      if (!pageReady.current) return;
      reloadCounter.current += 1;
      // Recarrega a página a cada ~3 min (18 ciclos de 10s)
      if (reloadCounter.current >= 18) {
        reloadCounter.current = 0;
        pageReady.current = false;
        webRef.current?.reload();
      } else {
        webRef.current?.injectJavaScript(INJECTED_SCRAPER);
      }
    }, 10000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, site]);

  const onMessage = async (event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type !== "ROUNDS") return;
      const rounds = (data.rounds || []).slice(0, 60); // limit to recent 60
      if (rounds.length === 0) return;
      await postBulkRounds(site, rounds);
    } catch (e) {
      // silencioso
    }
  };

  if (Platform.OS === "web" || !enabled) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        top: -1000,
        left: -1000,
        opacity: 0,
        overflow: "hidden",
      }}
    >
      <WebView
        ref={webRef}
        source={{ uri: SITES[site] }}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        userAgent="Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
        cacheEnabled
        onMessage={onMessage}
        onLoadEnd={() => {
          pageReady.current = true;
          // delay 3s para a página renderizar histórico, depois coleta
          setTimeout(() => {
            webRef.current?.injectJavaScript(INJECTED_SCRAPER);
          }, 3000);
        }}
        onError={() => { pageReady.current = false; }}
        startInLoadingState={false}
        style={{ width: 1, height: 1 }}
      />
    </View>
  );
}

/* Helpers used by settings screen ----------------------------------- */

export async function setCollectorSite(s: SourceType) {
  await AsyncStorage.setItem(STORAGE_SITE, s);
}
export async function setCollectorEnabled(v: boolean) {
  await AsyncStorage.setItem(STORAGE_ENABLED, v ? "1" : "0");
}
export async function getCollectorPrefs(): Promise<{ enabled: boolean; site: SourceType }> {
  const s = ((await AsyncStorage.getItem(STORAGE_SITE)) as SourceType) || "tipminer";
  const e = (await AsyncStorage.getItem(STORAGE_ENABLED)) !== "0";
  return { enabled: e, site: s };
}
