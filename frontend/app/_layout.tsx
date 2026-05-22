import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { View, ActivityIndicator } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  // Preload the Ionicons font to avoid "Font file for ionicons is empty" on Expo Go.
  const [loaded] = useFonts({
    ...Ionicons.font,
  });

  if (!loaded) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0c0c0c", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#FF1F1F" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: "#0c0c0c" },
          headerTintColor: "#fff",
          headerTitleStyle: { fontWeight: "700" },
          tabBarStyle: {
            backgroundColor: "#0c0c0c",
            borderTopColor: "#1a1a1a",
            borderTopWidth: 1,
            height: 64,
            paddingBottom: 8,
            paddingTop: 6,
          },
          tabBarActiveTintColor: "#FF1F1F",
          tabBarInactiveTintColor: "#6e6e6e",
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Captura",
            headerTitle: "Coletor de Rodadas",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="radio" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: "Histórico",
            headerTitle: "Histórico de Rodadas",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="time" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="stats"
          options={{
            title: "Análise",
            headerTitle: "Análise & Previsão",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="analytics" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "Ajustes",
            headerTitle: "Ajustes",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="settings" color={color} size={size} />
            ),
          }}
        />
      </Tabs>
    </SafeAreaProvider>
  );
}
