import "react-native-gesture-handler";
import { Drawer } from "expo-router/drawer";
import { StatusBar } from "expo-status-bar";
import { Text, View, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { DrawerContentScrollView, DrawerItemList } from "@react-navigation/drawer";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { FloatingPrediction } from "../src/components/FloatingPrediction";

function CustomDrawerContent(props: any) {
  return (
    <DrawerContentScrollView {...props} style={{ backgroundColor: "#0c0c0c" }}>
      <View style={styles.drawerHeader}>
        <Text style={styles.drawerTitle}>Coletor Blaze</Text>
        <Text style={styles.drawerSub}>Double · v1</Text>
      </View>
      <DrawerItemList {...props} />
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
      <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800", lineHeight: 22 }}>⋮</Text>
    </TouchableOpacity>
  );
}

const Item = ({ emoji, color }: { emoji: string; color: string }) => (
  <Text style={{ fontSize: 18, color }}>{emoji}</Text>
);

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <View style={{ flex: 1 }}>
          <Drawer
            drawerContent={(props) => <CustomDrawerContent {...props} />}
            screenOptions={({ navigation }) => ({
              headerStyle: { backgroundColor: "#0c0c0c" },
              headerTintColor: "#fff",
              headerTitleStyle: { fontWeight: "700" },
              headerLeft: () => <HeaderMenuButton navigation={navigation} />,
              drawerStyle: { backgroundColor: "#0c0c0c", width: 260 },
              drawerActiveTintColor: "#FF1F1F",
              drawerInactiveTintColor: "#bbb",
              drawerActiveBackgroundColor: "#22090a",
              drawerLabelStyle: { fontSize: 14, fontWeight: "700" },
              swipeEnabled: true,
            })}
          >
            <Drawer.Screen
              name="index"
              options={{
                title: "Captura",
                drawerLabel: "📡  Captura",
                headerTitle: "Coletor de Rodadas",
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
                drawerLabel: "📊  Análise & Previsão",
                headerTitle: "Análise",
                drawerIcon: ({ color }) => <Item emoji="📊" color={color} />,
              }}
            />
            <Drawer.Screen
              name="rules"
              options={{
                title: "Regras",
                drawerLabel: "🎯  Regras",
                headerTitle: "Regras",
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
          <FloatingPrediction />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  drawerHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#1f1f1f",
    marginBottom: 8,
  },
  drawerTitle: { color: "#FF1F1F", fontSize: 20, fontWeight: "900" },
  drawerSub: { color: "#888", fontSize: 12, marginTop: 2, fontWeight: "600" },
});
