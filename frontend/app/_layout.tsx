import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

const TabIcon = ({ emoji, color }: { emoji: string; color: string }) => (
  <Text style={{ fontSize: 22, color }}>{emoji}</Text>
);

export default function RootLayout() {
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
            tabBarIcon: ({ color }) => <TabIcon emoji="📡" color={color} />,
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: "Histórico",
            headerTitle: "Histórico de Rodadas",
            tabBarIcon: ({ color }) => <TabIcon emoji="🕐" color={color} />,
          }}
        />
        <Tabs.Screen
          name="stats"
          options={{
            title: "Análise",
            headerTitle: "Análise & Previsão",
            tabBarIcon: ({ color }) => <TabIcon emoji="📊" color={color} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "Ajustes",
            headerTitle: "Ajustes",
            tabBarIcon: ({ color }) => <TabIcon emoji="⚙️" color={color} />,
          }}
        />
      </Tabs>
    </SafeAreaProvider>
  );
}
