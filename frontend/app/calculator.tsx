import { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Keyboard,
  Platform,
  KeyboardAvoidingView,
} from "react-native";

export default function CalculatorScreen() {
  const [banca, setBanca] = useState("100");
  const [stakePct, setStakePct] = useState("3"); // % da banca por aposta
  const [gales, setGales] = useState("2");
  const [payout, setPayout] = useState("2"); // 2x para cor, 14x para branco
  const [riskAlvo, setRiskAlvo] = useState("10"); // % de risco máximo da banca por ciclo

  const result = useMemo(() => {
    const b = parseFloat(banca) || 0;
    const sp = parseFloat(stakePct) || 0;
    const g = Math.max(0, Math.floor(parseFloat(gales) || 0));
    const pay = parseFloat(payout) || 2;

    // Stake inicial G0
    const baseStake = (b * sp) / 100;
    // Sequência de stakes: G0, G1, G2... cada uma cobre perda anterior + lucro pretendido
    // Fórmula martingale clássica para payout p: stake_{n+1} = (stake_n * (1 + p)) / (p - 1)
    // Aqui simplifico: cada gale multiplica o anterior por (1 + 1/(p-1)) que para p=2 dá *2.
    const stakes: number[] = [];
    let stake = baseStake;
    stakes.push(stake);
    for (let i = 1; i <= g; i++) {
      // Para cobrir perdas anteriores + voltar ao lucro de baseStake
      const prevTotal = stakes.reduce((s, x) => s + x, 0);
      stake = (prevTotal + baseStake) / (pay - 1);
      stakes.push(stake);
    }
    const totalRisco = stakes.reduce((s, x) => s + x, 0);
    const riskoPct = b ? (totalRisco / b) * 100 : 0;
    const lucroSeAcertar = baseStake * (pay - 1);
    const alvo = parseFloat(riskAlvo) || 10;
    const dentroDoLimite = riskoPct <= alvo;

    return { stakes, baseStake, totalRisco, riskoPct, lucroSeAcertar, dentroDoLimite, alvo };
  }, [banca, stakePct, gales, payout, riskAlvo]);

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#0c0c0c" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: 16 }}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
        testID="calculator-screen"
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🎲 Gestão de banca (Martingale)</Text>
          <Text style={styles.help}>
            Calcule o tamanho da entrada inicial, a sequência de gales para cobrir perdas e o risco total do ciclo.
          </Text>
        </View>

        <View style={styles.card}>
          <Field label="Banca total (R$)" value={banca} onChangeText={setBanca} keyboardType="decimal-pad" testID="calc-banca" />
          <Field label="Stake inicial (% da banca)" value={stakePct} onChangeText={setStakePct} keyboardType="decimal-pad" testID="calc-stake" />
          <Field label="Gales (0-4 recomendado)" value={gales} onChangeText={setGales} keyboardType="number-pad" testID="calc-gales" />
          <Field
            label="Payout (2 = cor, 14 = branco)"
            value={payout}
            onChangeText={setPayout}
            keyboardType="decimal-pad"
            testID="calc-payout"
          />
          <Field
            label="Risco máximo aceitável (% da banca)"
            value={riskAlvo}
            onChangeText={setRiskAlvo}
            keyboardType="decimal-pad"
            testID="calc-risk"
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>📋 Sequência de entradas</Text>
          {result.stakes.map((s, i) => (
            <View key={i} style={styles.stakeRow}>
              <Text style={styles.stakeLabel}>{i === 0 ? "Entrada G0" : `Gale G${i}`}</Text>
              <Text style={styles.stakeValue}>R$ {fmt(s)}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <SummaryRow label="Total em risco (todos os gales)" value={`R$ ${fmt(result.totalRisco)}`} />
          <SummaryRow
            label="% da banca em risco"
            value={`${result.riskoPct.toFixed(1)}%`}
            highlight={result.dentroDoLimite ? "#86efac" : "#fca5a5"}
          />
          <SummaryRow
            label="Lucro líquido se acertar"
            value={`R$ ${fmt(result.lucroSeAcertar)}`}
            highlight="#FFD700"
          />
          {!result.dentroDoLimite && (
            <Text style={styles.warn}>
              ⚠️ Risco ({result.riskoPct.toFixed(1)}%) está acima do seu limite ({result.alvo}%). Considere
              reduzir o stake inicial ou diminuir o número de gales.
            </Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>💡 Dicas</Text>
          <Text style={styles.tip}>• Cor (vermelho/preto): payout 2x, risco moderado, gales 1-3 mais comuns.</Text>
          <Text style={styles.tip}>• Branco: payout 14x, risco alto, geralmente sem gale.</Text>
          <Text style={styles.tip}>• Limite recomendado: nunca arriscar mais de 10-15% da banca por ciclo.</Text>
          <Text style={[styles.tip, { color: "#ffb84a" }]}>
            ⚠️ Esta calculadora é apenas educacional. Apostar envolve risco real.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType = "default",
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  keyboardType?: "default" | "decimal-pad" | "number-pad";
  testID?: string;
}) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholderTextColor="#666"
        testID={testID}
      />
    </View>
  );
}

function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <View style={styles.sumRow}>
      <Text style={styles.sumLabel}>{label}</Text>
      <Text style={[styles.sumValue, highlight ? { color: highlight } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0c0c0c" },
  card: {
    backgroundColor: "#141414",
    padding: 14,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#1f1f1f",
  },
  cardTitle: { color: "#fff", fontWeight: "800", fontSize: 15, marginBottom: 8 },
  help: { color: "#bbb", fontSize: 12, lineHeight: 18 },
  fieldRow: { marginBottom: 10 },
  fieldLabel: { color: "#9a9a9a", fontSize: 12, fontWeight: "700", marginBottom: 6 },
  input: {
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    color: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    fontSize: 16,
  },
  stakeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1f1f1f",
  },
  stakeLabel: { color: "#ccc", fontWeight: "600", fontSize: 13 },
  stakeValue: { color: "#fff", fontWeight: "800", fontSize: 14 },
  divider: { height: 1, backgroundColor: "#1f1f1f", marginVertical: 10 },
  sumRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  sumLabel: { color: "#9a9a9a", fontSize: 13, flex: 1 },
  sumValue: { color: "#fff", fontWeight: "800", fontSize: 14 },
  warn: { color: "#fca5a5", fontSize: 12, marginTop: 8, lineHeight: 18 },
  tip: { color: "#bbb", fontSize: 12, lineHeight: 18, marginBottom: 4 },
});
