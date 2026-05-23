import { Audio } from "expo-av";
import { Platform } from "react-native";

type SoundKey = "alert" | "hit" | "loss";

const ASSETS: Record<SoundKey, any> = {
  alert: require("../assets/sounds/alert.wav"),
  hit: require("../assets/sounds/hit.wav"),
  loss: require("../assets/sounds/loss.wav"),
};

let _initialized = false;
let _enabled = true;

export function setSoundEnabled(v: boolean) {
  _enabled = v;
}

export function isSoundEnabled() {
  return _enabled;
}

async function ensureInit() {
  if (_initialized) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      interruptionModeIOS: 1, // DoNotMix
      interruptionModeAndroid: 1,
    });
  } catch {
    // ignore
  }
  _initialized = true;
}

export async function playSound(key: SoundKey) {
  if (!_enabled) return;
  try {
    await ensureInit();
    const { sound } = await Audio.Sound.createAsync(ASSETS[key], { shouldPlay: true, volume: 0.7 });
    sound.setOnPlaybackStatusUpdate((status) => {
      // libera memória ao terminar
      // @ts-ignore
      if (status?.didJustFinish) {
        sound.unloadAsync().catch(() => {});
      }
    });
  } catch (e) {
    // Em web sem permissão de áudio pode falhar silenciosamente
    if (Platform.OS === "web") {
      // tenta via HTMLAudioElement como fallback
      try {
        const map: Record<SoundKey, string> = {
          alert: "/assets/assets/sounds/alert.wav",
          hit: "/assets/assets/sounds/hit.wav",
          loss: "/assets/assets/sounds/loss.wav",
        };
        // @ts-ignore
        const a = new (global as any).Audio(map[key]);
        a.volume = 0.7;
        a.play().catch(() => {});
      } catch {
        // ignore
      }
    }
  }
}
