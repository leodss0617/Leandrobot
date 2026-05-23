// Background collector: registra uma task com expo-task-manager + expo-background-fetch
// para continuar coletando rodadas mesmo com o app em segundo plano.
//
// IMPORTANTE: este modulo SÓ funciona em Custom Dev Build (EAS Build).
// No Expo Go, expo-task-manager/expo-background-fetch nao estao disponiveis.
//
// Limites:
//   - Android: minimo ~15 min de intervalo (WorkManager). Para polling mais
//     frequente em background, e necessaria a notificacao foreground service
//     que mantem o JS thread vivo (declarada no app.json + AndroidManifest).
//   - iOS: minimo ~15 min (BGAppRefreshTask). Sem garantias de execucao.

import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { collectOnce } from "./blazeCollector";

export const BLAZE_COLLECTOR_TASK = "blaze-collector-task";
export const PERSISTENT_NOTIFICATION_ID = "blaze-collector-persistent";
export const NOTIFICATION_CHANNEL_ID = "blaze-collector-channel";

// ---------- Define a task (precisa estar no topo do modulo p/ registro) ----------
if (!TaskManager.isTaskDefined(BLAZE_COLLECTOR_TASK)) {
  TaskManager.defineTask(BLAZE_COLLECTOR_TASK, async () => {
    try {
      const res = await collectOnce(8000);
      if (res.ok) {
        // Atualiza a notificacao persistente com o ultimo resultado
        await updatePersistentNotification(
          `✓ Coletando · ${res.inserted} nova(s), ${res.duplicates} repetida(s)`,
        );
        return BackgroundFetch.BackgroundFetchResult.NewData;
      }
      await updatePersistentNotification(
        `⚠ ${res.blocked ? "API bloqueada" : "Sem dados"} · ${res.error || ""}`.slice(0, 80),
      );
      return BackgroundFetch.BackgroundFetchResult.NoData;
    } catch (e: any) {
      await updatePersistentNotification(`Erro: ${e?.message || e}`.slice(0, 80));
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}

// ---------- Setup do canal de notificacao Android (foreground service look) ----------
export async function setupNotificationChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
    name: "Coletor de Rodadas",
    importance: Notifications.AndroidImportance.LOW,
    enableVibrate: false,
    sound: null,
    showBadge: false,
    bypassDnd: false,
    description: "Mantém o coletor de rodadas Blaze ativo em segundo plano",
  });
}

// ---------- Notificacao persistente (ongoing) que mantem o servico vivo ----------
export async function showPersistentNotification(initialText: string = "🔴 Coletor ATIVO") {
  await setupNotificationChannel();
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: PERSISTENT_NOTIFICATION_ID,
      content: {
        title: "Coletor Blaze",
        body: initialText,
        sticky: true, // Android: ongoing notification
        autoDismiss: false,
        priority: Notifications.AndroidNotificationPriority.LOW,
        // iOS nao tem foreground service equivalente; a notificacao
        // serve apenas como indicador visual.
        ...(Platform.OS === "android" && { channelId: NOTIFICATION_CHANNEL_ID }),
      },
      trigger: null, // dispara imediatamente
    });
  } catch (e) {
    console.warn("showPersistentNotification falhou:", e);
  }
}

export async function updatePersistentNotification(text: string) {
  try {
    // Reagenda a mesma notificacao com texto atualizado
    await Notifications.scheduleNotificationAsync({
      identifier: PERSISTENT_NOTIFICATION_ID,
      content: {
        title: "Coletor Blaze",
        body: text,
        sticky: true,
        autoDismiss: false,
        priority: Notifications.AndroidNotificationPriority.LOW,
        ...(Platform.OS === "android" && { channelId: NOTIFICATION_CHANNEL_ID }),
      },
      trigger: null,
    });
  } catch (_e) {
    // silencioso
  }
}

export async function dismissPersistentNotification() {
  try {
    await Notifications.dismissNotificationAsync(PERSISTENT_NOTIFICATION_ID);
  } catch {}
}

// ---------- Permissoes ----------
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === "granted") return true;
    const { status } = await Notifications.requestPermissionsAsync({
      android: {},
      ios: {
        allowAlert: true,
        allowBadge: false,
        allowSound: false,
        provideAppNotificationSettings: false,
      },
    });
    return status === "granted";
  } catch (e) {
    console.warn("requestNotificationPermissions falhou:", e);
    return false;
  }
}

// ---------- Background fetch (registro/cancelamento) ----------
export async function isBackgroundFetchRegistered(): Promise<boolean> {
  try {
    return await TaskManager.isTaskRegisteredAsync(BLAZE_COLLECTOR_TASK);
  } catch {
    return false;
  }
}

export async function registerBackgroundFetch(): Promise<{
  ok: boolean;
  status: BackgroundFetch.BackgroundFetchStatus | null;
  error?: string;
}> {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied
    ) {
      return {
        ok: false,
        status,
        error: status === BackgroundFetch.BackgroundFetchStatus.Restricted
          ? "Background fetch restrito pelo sistema"
          : "Background fetch negado pelo usuario",
      };
    }
    await BackgroundFetch.registerTaskAsync(BLAZE_COLLECTOR_TASK, {
      // Android: minimo real ~15 min (WorkManager).
      // iOS: BGAppRefreshTask, intervalo decidido pelo sistema (~15 min+).
      minimumInterval: 60, // segundos (Android segue WorkManager minimo)
      stopOnTerminate: false,
      startOnBoot: true,
    });
    return { ok: true, status };
  } catch (e: any) {
    return { ok: false, status: null, error: e?.message || String(e) };
  }
}

export async function unregisterBackgroundFetch(): Promise<boolean> {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(BLAZE_COLLECTOR_TASK);
    if (registered) {
      await BackgroundFetch.unregisterTaskAsync(BLAZE_COLLECTOR_TASK);
    }
    return true;
  } catch (e) {
    console.warn("unregisterBackgroundFetch falhou:", e);
    return false;
  }
}
