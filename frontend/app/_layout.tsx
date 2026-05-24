import "react-native-gesture-handler";
import { useEffect } from "react";
import { Drawer } from "expo-router/drawer";
import { StatusBar } from "expo-status-bar";
import { Text, View, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DrawerContentScrollView, DrawerItemList } from "@react-navigation/drawer";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { LinearGradient } from "expo-linear-gradient";
import { FloatingPrediction } from "../src/components/FloatingPrediction";
import { BackgroundCollector } from "../src/components/BackgroundCollector";
import { bootstrapBotService } from "../src/services/botService";

function CustomDrawerContent(props: any) {
  return (
    <DrawerContentScrollView {...props} style={{ backgroundColor: "#0a0a0c" }} contentContainerStyle={{ paddingTop: 0 }}>
      <LinearGradient
        colors={["#1a0a0c", "#0a0a0c"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.drawerHeader}
      >
        <View style={styles.brandRow}>
          <View style={styles.brandIcon}>
            <Text style={{ fontSize: 22 }}>🤖</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.drawerTitle}>BOT LEANDRO</Text>
            <Text style={styles.drawerSub}>Double · Pedras Pagadoras</Text>
          </View>
        </View>
        <View style={styles.statusDot}>
          <View style={styles.dot} />
          <Text style={styles.statusText}>Sistema ativo</Text>
        </View>
      </LinearGradient>
      <View style={{ paddingTop: 8 }}>
        <DrawerItemList {...props} />
      </View>
      <View style={styles.drawerFoot}>
        <Text style={styles.footText}>v1.0 · Apostas com responsabilidade</Text>
      </View>
    </DrawerContentScrollView>
  );
}

function HeaderMenuButton({ navigation }: any) {
  return (
    <TouchableOpacity
      onPress={() => navigation.toggleDrawer()}
      style={{ paddingHorizontal: 14, paddingVertical: 6 }}
      testID="header-menu-btn"
    >
      <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800", lineHeight: 22 }}>☰</Text>
    </TouchableOpacity>
  );
}

const Item = ({ emoji, color }: { emoji: string; color: string }) => (
  <Text style={{ fontSize: 18, color }}>{emoji}</Text>
);

export default function RootLayout() {
  useEffect(() => {
    // Reativa o serviço em background caso usuário já tenha habilitado
    bootstrapBotService();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <View style={{ flex: 1, backgroundColor: "#0a0a0c" }}>
          <Drawer
            drawerContent={(props) => <CustomDrawerContent {...props} />}
            screenOptions={({ navigation }) => ({
              headerStyle: { backgroundColor: "#0a0a0c" },
              headerTintColor: "#fff",
              headerTitleStyle: { fontWeight: "800", fontSize: 17, letterSpacing: 0.3 },
              headerLeft: () => <HeaderMenuButton navigation={navigation} />,
              headerShadowVisible: false,
              drawerStyle: { backgroundColor: "#0a0a0c", width: 280 },
              drawerActiveTintColor: "#FF1F1F",
              drawerInactiveTintColor: "#c9c9c9",
              drawerActiveBackgroundColor: "rgba(225,29,42,0.12)",
              drawerLabelStyle: { fontSize: 14, fontWeight: "700", marginLeft: -10 },
              drawerItemStyle: {
                borderRadius: 12,
                marginHorizontal: 10,
                marginVertical: 2,
                paddingHorizontal: 6,
              },
              swipeEnabled: true,
            })}
          >
            <Drawer.Screen
              name="bot"
              options={{
                title: "Bot",
                drawerLabel: "🤖  Bot · Previsão",
                headerTitle: "Bot · Previsões + Gales",
                drawerIcon: ({ color }) => <Item emoji="🤖" color={color} />,
              }}
            />
            <Drawer.Screen
              name="index"
              options={{
                title: "Captura",
                drawerLabel: "📡  Captura ao vivo",
                headerTitle: "Captura de Rodadas",
                drawerIcon: ({ color }) => <Item emoji="📡" color={color} />,
              }}
            />
            <Drawer.Screen
              name="history"
              options={{
                title: "Histórico",
                drawerLabel: "🕐  Histórico",
                headerTitle: "Histórico",
                drawerIcon: ({ color }) => <Item emoji="🕐" color={color} />,
              }}
            />
            <Drawer.Screen
              name="stats"
              options={{
                title: "Análise",
                drawerLabel: "📊  Análise",
                headerTitle: "Análise & Previsão",
                drawerIcon: ({ color }) => <Item emoji="📊" color={color} />,
              }}
            />
            <Drawer.Screen
              name="rules"
              options={{
                title: "Regras",
                drawerLabel: "🎯  Regras",
                headerTitle: "Regras das Pedras",
                drawerIcon: ({ color }) => <Item emoji="🎯" color={color} />,
              }}
            />
            <Drawer.Screen
              name="calculator"
              options={{
                title: "Calculadora",
                drawerLabel: "🎲  Calculadora",
                headerTitle: "Calculadora",
                drawerIcon: ({ color }) => <Item emoji="🎲" color={color} />,
              }}
            />
            <Drawer.Screen
              name="simulator"
              options={{
                title: "Simulador",
                drawerLabel: "🧪  Simulador",
                headerTitle: "Simulador",
                drawerIcon: ({ color }) => <Item emoji="🧪" color={color} />,
              }}
            />
            <Drawer.Screen
              name="settings"
              options={{
                title: "Ajustes",
                drawerLabel: "⚙️  Ajustes",
                headerTitle: "Ajustes",
                drawerIcon: ({ color }) => <Item emoji="⚙️" color={color} />,
              }}
            />
          </Drawer>
          <BackgroundCollector />
          <FloatingPrediction />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  drawerHeader: {
    paddingTop: 28,
    paddingHorizontal: 20,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
    marginBottom: 4,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  brandIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(225,29,42,0.18)",
    borderWidth: 1,
    borderColor: "rgba(225,29,42,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  drawerTitle: { color: "#fff", fontSize: 17, fontWeight: "900", letterSpacing: 1.2 },
  drawerSub: { color: "#9a9a9a", fontSize: 11, marginTop: 2, fontWeight: "600", letterSpacing: 0.3 },
  statusDot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(31,122,71,0.18)",
    borderRadius: 8,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(31,122,71,0.45)",
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#1fdc8a" },
  statusText: { color: "#86efac", fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  drawerFoot: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
    marginTop: 14,
  },
  footText: { color: "#5a5a5a", fontSize: 10, textAlign: "center", fontStyle: "italic" },
});
