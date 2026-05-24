/**
 * Bot Service - Foreground / Background polling + local notifications.
 *
 * Como funciona:
 * - Quando ativado, registramos uma tarefa de "background fetch" (Android
 *   usa WorkManager por baixo — sobrevive a reboot automaticamente).
 * - O JS faz polling do backend a cada ~15min em background. No foreground,
 *   a UI usa polling rápido de 5s.
 * - Comparamos o estado anterior salvo em AsyncStorage com o atual e
 *   disparamos notificações locais quando há HIT, LOSS ou novo PENDING.
 * - Notificações também aparecem para Alerta de Branco (white-alert).
 *
 * Para uso real com EAS Build (apk/aab):
 *   eas build --profile preview --platform android
 */

import * as BackgroundFetch from "expo-background-fetch";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import {
  getActivePrediction,
  getWhiteAlert,
  ActivePrediction,
  WhiteAlert,
} from "../api";

export const BOT_TASK = "BOT_BACKGROUND_TASK_V1";
const LAST_STATE_KEY = "@bot_last_state_v1";
const SERVICE_ENABLED_KEY = "@bot_service_enabled";
const LAST_WHITE_ALERT_KEY = "@bot_last_white_alert";

type LastState = {
  predId?: string | null;
  status?: string | null;
  currentGale?: number | null;
};

/* ------------------------------------------------------------------ */
/*                      NOTIFICATIONS                                  */
/* ------------------------------------------------------------------ */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function ensurePermissionsAndChannel(): Promise<boolean> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("bot-main", {
        name: "Bot Leandro",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#E11D2A",
        sound: "default",
        enableVibrate: true,
        showBadge: false,
      });
      await Notifications.setNotificationChannelAsync("bot-ongoing", {
        name: "Bot em execução",
        importance: Notifications.AndroidImportance.LOW,
        sound: null,
        enableVibrate: false,
        showBadge: false,
      });
    }
    return finalStatus === "granted";
  } catch (e) {
    console.warn("ensurePermissionsAndChannel", e);
    return false;
  }
}

async function notifyHit(p: ActivePrediction) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "✅ GREEN! Bot acertou",
      body: `${labelColor(p.predicted_color)} · ${p.hit_at_gale === 0 ? "Direto" : `G${p.hit_at_gale}`}`,
      sound: "default",
      data: { type: "hit", id: p.id },
    },
    trigger: null,
  });
}

async function notifyLoss(p: ActivePrediction) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "❌ RED · Bot perdeu",
      body: `${labelColor(p.predicted_color)} · perdeu após G${p.max_gales}`,
      sound: "default",
      data: { type: "loss", id: p.id },
    },
    trigger: null,
  });
}

async function notifyNewPending(p: ActivePrediction) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "🎯 Nova previsão",
      body: `Aposta: ${labelColor(p.predicted_color)} · até G${p.max_gales}${p.rule_name ? ` · ${p.rule_name}` : ""}`,
      sound: "default",
      data: { type: "pending", id: p.id },
    },
    trigger: null,
  });
}

async function notifyGaleAdvance(p: ActivePrediction) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `⚠️ Subiu para G${p.current_gale}`,
      body: `${labelColor(p.predicted_color)} · ainda aguardando confirmação`,
      sound: "default",
      data: { type: "gale", id: p.id },
    },
    trigger: null,
  });
}

async function notifyWhiteAlert(a: WhiteAlert) {
  if (!a.active) return;
  const target = a.suggested_target;
  const time = target?.time_str;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "⚪ ALERTA DE BRANCO",
      body: `${a.rule_name || "Padrão detectado"}${time ? ` · alvo: ${time}` : ""}`,
      sound: "default",
      data: { type: "white-alert" },
    },
    trigger: null,
  });
}

function labelColor(c: string) {
  if (c === "red") return "🔴 Vermelho";
  if (c === "black") return "⚫ Preto";
  return "⚪ Branco";
}

/* ------------------------------------------------------------------ */
/*                BACKGROUND TASK DEFINITION                           */
/* ------------------------------------------------------------------ */

TaskManager.defineTask(BOT_TASK, async () => {
  try {
    await tickAndNotify();
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (e) {
    console.warn("[BOT_TASK]", e);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function tickAndNotify() {
  let active: ActivePrediction | null = null;
  let alert: WhiteAlert | null = null;
  try { active = await getActivePrediction(); } catch { active = null; }
  try { alert = await getWhiteAlert(); } catch { alert = null; }

  // --- Active prediction transitions ---
  const prevRaw = await AsyncStorage.getItem(LAST_STATE_KEY);
  const prev: LastState = prevRaw ? JSON.parse(prevRaw) : {};

  if (active) {
    const sameId = prev.predId === active.id;
    const prevStatus = sameId ? prev.status : null;
    const prevGale = sameId ? prev.currentGale ?? 0 : 0;

    if (!sameId && active.status === "pending") {
      await notifyNewPending(active);
    } else if (sameId && active.status === "pending" && (active.current_gale ?? 0) > prevGale) {
      await notifyGaleAdvance(active);
    } else if (sameId && active.status === "hit" && prevStatus !== "hit") {
      await notifyHit(active);
    } else if (sameId && active.status === "loss" && prevStatus !== "loss") {
      await notifyLoss(active);
    } else if (!sameId && active.status === "hit") {
      await notifyHit(active);
    } else if (!sameId && active.status === "loss") {
      await notifyLoss(active);
    }

    await AsyncStorage.setItem(LAST_STATE_KEY, JSON.stringify({
      predId: active.id,
      status: active.status,
      currentGale: active.current_gale,
    } as LastState));
  } else {
    if (prev.predId) {
      await AsyncStorage.setItem(LAST_STATE_KEY, JSON.stringify({}));
    }
  }

  // --- White alert (notify only once per trigger round) ---
  if (alert?.active && alert.trigger_round_id) {
    const lastId = await AsyncStorage.getItem(LAST_WHITE_ALERT_KEY);
    if (lastId !== alert.trigger_round_id) {
      await notifyWhiteAlert(alert);
      await AsyncStorage.setItem(LAST_WHITE_ALERT_KEY, alert.trigger_round_id);
    }
  }
}

/* ------------------------------------------------------------------ */
/*              SERVICE LIFECYCLE (start / stop)                       */
/* ------------------------------------------------------------------ */

export async function startBotService(): Promise<boolean> {
  const granted = await ensurePermissionsAndChannel();
  if (!granted) return false;

  try {
    const registered = await TaskManager.isTaskRegisteredAsync(BOT_TASK);
    if (!registered) {
      await BackgroundFetch.registerTaskAsync(BOT_TASK, {
        minimumInterval: 60 * 15, // 15 min (Android: WorkManager)
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
    await AsyncStorage.setItem(SERVICE_ENABLED_KEY, "1");

    // Run an immediate tick so the user sees something
    tickAndNotify().catch(() => {});

    // Persistent (ongoing) notification while service is on
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: "bot-ongoing",
        content: {
          title: "🤖 Bot Leandro está rodando",
          body: "Monitorando rodadas em background. Toque para abrir.",
          sticky: Platform.OS === "android",
          autoDismiss: false,
          sound: false,
          ...(Platform.OS === "android" ? { channelId: "bot-ongoing" as any } : {}),
        } as any,
        trigger: null,
      });
    } catch {}

    return true;
  } catch (e) {
    console.warn("startBotService", e);
    return false;
  }
}

export async function stopBotService(): Promise<void> {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(BOT_TASK);
    if (registered) {
      await BackgroundFetch.unregisterTaskAsync(BOT_TASK);
    }
  } catch (e) {
    console.warn("stopBotService", e);
  }
  await AsyncStorage.setItem(SERVICE_ENABLED_KEY, "0");
  try {
    await Notifications.dismissNotificationAsync("bot-ongoing");
  } catch {}
}

export async function isBotServiceEnabled(): Promise<boolean> {
  const v = await AsyncStorage.getItem(SERVICE_ENABLED_KEY);
  if (v !== "1") return false;
  try {
    return await TaskManager.isTaskRegisteredAsync(BOT_TASK);
  } catch {
    return false;
  }
}

/**
 * Called from `_layout.tsx` on app startup. If the user previously enabled the
 * service, make sure it is registered (Android may have unregistered it).
 */
export async function bootstrapBotService(): Promise<void> {
  try {
    const v = await AsyncStorage.getItem(SERVICE_ENABLED_KEY);
    if (v === "1") {
      await ensurePermissionsAndChannel();
      const registered = await TaskManager.isTaskRegisteredAsync(BOT_TASK);
      if (!registered) {
        await BackgroundFetch.registerTaskAsync(BOT_TASK, {
          minimumInterval: 60 * 15,
          stopOnTerminate: false,
          startOnBoot: true,
        });
      }
      tickAndNotify().catch(() => {});
    }
  } catch (e) {
    console.warn("bootstrapBotService", e);
  }
}
