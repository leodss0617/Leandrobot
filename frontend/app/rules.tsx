import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  Modal,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "expo-router";
import {
  Rule,
  RuleCondition,
  RuleCondType,
  RuleAction,
  ColorType,
  COLOR_HEX,
  COLOR_LABEL,
  listRules,
  createRule,
  updateRule,
  deleteRule,
  evaluateRules,
  RuleMatch,
} from "../src/api";

const COND_LABEL: Record<RuleCondType, string> = {
  streak: "Sequência de cor",
  after_color: "Última cor saiu",
  gap_white: "Branco sem cair há",
  last_n_pattern: "Padrão das últimas N",
};

const COLORS: ColorType[] = ["red", "black", "white"];

const PRESETS: { name: string; conditions: RuleCondition[]; action: RuleAction }[] = [
  {
    name: "3 pretos → vermelho",
    conditions: [{ type: "streak", color: "black", op: ">=", value: 3 }],
    action: { color: "red", gales: 1, note: "Quebra de sequência" },
  },
  {
    name: "3 vermelhos → preto",
    conditions: [{ type: "streak", color: "red", op: ">=", value: 3 }],
    action: { color: "black", gales: 1, note: "Quebra de sequência" },
  },
  {
    name: "Após branco → vermelho",
    conditions: [{ type: "after_color", color: "white" }],
    action: { color: "red", gales: 1, note: "Pós-branco" },
  },
  {
    name: "Branco há 20+ rodadas → apostar branco",
    conditions: [{ type: "gap_white", op: ">=", value: 20 }],
    action: { color: "white", gales: 0, note: "Branco atrasado" },
  },
  {
    name: "5 pretos seguidos → vermelho com 2 gales",
    conditions: [{ type: "streak", color: "black", op: ">=", value: 5 }],
    action: { color: "red", gales: 2, note: "Sequência extrema" },
  },
];

export default function RulesScreen() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [match, setMatch] = useState<RuleMatch | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listRules();
      setRules(r);
    } catch {
      setRules([]);
    }
    try {
      const m = await evaluateRules();
      setMatch(m);
    } catch {
      setMatch(null);
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const togglEnabled = async (r: Rule) => {
    try {
      await updateRule(r.id, {
        name: r.name,
        enabled: !r.enabled,
        conditions: r.conditions,
        action: r.action,
        priority: r.priority,
      });
      await load();
    } catch (e: any) {
      Alert.alert("Erro", e?.message || "Falha");
    }
  };

  const doDelete = (r: Rule) => {
    Alert.alert("Apagar regra", `Apagar "${r.name}"?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Apagar",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteRule(r.id);
            await load();
          } catch (e: any) {
            Alert.alert("Erro", e?.message || "Falha");
          }
        },
      },
    ]);
  };

  const addPreset = async (preset: typeof PRESETS[0]) => {
    try {
      await createRule({
        name: preset.name,
        enabled: true,
        conditions: preset.conditions,
        action: preset.action,
        priority: 0,
      });
      await load();
    } catch (e: any) {
      Alert.alert("Erro", e?.message || "Falha");
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF1F1F" />}
      testID="rules-screen"
    >
      {/* Status da avaliação */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🎯 Avaliação contra histórico atual</Text>
        {match?.matched && match.rule ? (
          <View style={styles.matchBox}>
            <Text style={styles.matchTitle}>✅ Regra ATIVA: {match.rule.name}</Text>
            <View style={styles.matchAction}>
              <View
                style={[
                  styles.actionBall,
                  { backgroundColor: COLOR_HEX[match.rule.action.color], borderColor: match.rule.action.color === "white" ? "#888" : "#000" },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.matchText}>
                  Apostar em <Text style={styles.bold}>{COLOR_LABEL[match.rule.action.color]}</Text>
                  {match.rule.action.gales > 0 ? ` · Até G${match.rule.action.gales}` : " · Sem gale"}
                </Text>
                {match.rule.action.note ? <Text style={styles.matchNote}>{match.rule.action.note}</Text> : null}
              </View>
            </View>
          </View>
        ) : (
          <Text style={styles.emptyHint}>{match?.reason || "Nenhuma regra casou."}</Text>
        )}
      </View>

      {/* Botões topo */}
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => setCreating(true)} testID="new-rule-btn">
          <Text style={styles.primaryBtnText}>+ Nova regra</Text>
        </TouchableOpacity>
      </View>

      {/* Presets */}
      {rules.length === 0 && !loading && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📋 Regras prontas (toque para adicionar)</Text>
          {PRESETS.map((p, idx) => (
            <TouchableOpacity key={idx} style={styles.presetRow} onPress={() => addPreset(p)} testID={`preset-${idx}`}>
              <Text style={styles.presetText}>+ {p.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Lista de regras */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#FF1F1F" /></View>
      ) : rules.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 40 }}>🎯</Text>
          <Text style={styles.emptyTitle}>Nenhuma regra cadastrada</Text>
          <Text style={styles.emptyText}>Use os presets acima ou crie uma nova.</Text>
        </View>
      ) : (
        rules.map((r) => (
          <RuleRow key={r.id} rule={r} onToggle={() => togglEnabled(r)} onEdit={() => setEditing(r)} onDelete={() => doDelete(r)} />
        ))
      )}

      <Modal visible={creating || !!editing} animationType="slide" onRequestClose={() => { setCreating(false); setEditing(null); }}>
        <RuleEditor
          initial={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={async () => { setCreating(false); setEditing(null); await load(); }}
        />
      </Modal>
    </ScrollView>
  );
}

function RuleRow({ rule, onToggle, onEdit, onDelete }: { rule: Rule; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
  return (
    <View style={[styles.card, !rule.enabled && { opacity: 0.5 }]} testID={`rule-${rule.id}`}>
      <View style={styles.ruleHeader}>
        <Text style={styles.ruleName} numberOfLines={2}>{rule.name}</Text>
        <View style={styles.ruleActions}>
          <TouchableOpacity onPress={onToggle} style={[styles.smallBtn, { backgroundColor: rule.enabled ? "#0d3320" : "#3a1010" }]}>
            <Text style={{ color: rule.enabled ? "#86efac" : "#fca5a5", fontSize: 11, fontWeight: "700" }}>
              {rule.enabled ? "ON" : "OFF"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onEdit} style={[styles.smallBtn, { backgroundColor: "#1a1a1a" }]}>
            <Text style={{ color: "#bbb", fontSize: 11, fontWeight: "700" }}>EDIT</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} style={[styles.smallBtn, { backgroundColor: "#3a1010" }]}>
            <Text style={{ color: "#fca5a5", fontSize: 11, fontWeight: "700" }}>×</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.ruleSub}>SE:</Text>
      {rule.conditions.map((c, idx) => (
        <Text key={idx} style={styles.ruleCondText}>
          • {condToText(c)}
        </Text>
      ))}
      <Text style={[styles.ruleSub, { marginTop: 6 }]}>ENTÃO:</Text>
      <View style={styles.actionInline}>
        <View
          style={[
            styles.actionBallSm,
            { backgroundColor: COLOR_HEX[rule.action.color], borderColor: rule.action.color === "white" ? "#888" : "#000" },
          ]}
        />
        <Text style={styles.ruleActionText}>
          Apostar {COLOR_LABEL[rule.action.color]}
          {rule.action.gales > 0 ? ` · até G${rule.action.gales}` : ""}
        </Text>
      </View>
    </View>
  );
}

function condToText(c: RuleCondition): string {
  if (c.type === "streak") {
    return `${c.value}+ ${COLOR_LABEL[c.color || "red"]} seguidos`;
  }
  if (c.type === "after_color") {
    return `Última cor foi ${COLOR_LABEL[c.color || "red"]}`;
  }
  if (c.type === "gap_white") {
    return `Branco não cai há ${c.op || ">="}${c.value} rodadas`;
  }
  if (c.type === "last_n_pattern") {
    return `Padrão recente: ${(c.pattern || []).map((p) => COLOR_LABEL[p]).join(", ")}`;
  }
  return "?";
}

function RuleEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: Rule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [conditions, setConditions] = useState<RuleCondition[]>(
    initial?.conditions || [{ type: "streak", color: "black", op: ">=", value: 3 }],
  );
  const [action, setAction] = useState<RuleAction>(
    initial?.action || { color: "red", gales: 1, note: "" },
  );
  const [saving, setSaving] = useState(false);

  const setCond = (i: number, c: RuleCondition) => {
    setConditions((arr) => arr.map((x, idx) => (idx === i ? c : x)));
  };
  const addCond = () => setConditions((arr) => [...arr, { type: "streak", color: "red", op: ">=", value: 3 }]);
  const rmCond = (i: number) => setConditions((arr) => arr.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!name.trim()) { Alert.alert("Nome obrigatório"); return; }
    setSaving(true);
    try {
      const body = { name: name.trim(), enabled, conditions, action, priority: 0 };
      if (initial) await updateRule(initial.id, body);
      else await createRule(body);
      onSaved();
    } catch (e: any) {
      Alert.alert("Erro", e?.message || "Falha");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#0c0c0c" }} contentContainerStyle={{ padding: 16, paddingTop: 48 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 16 }}>
        <TouchableOpacity onPress={onClose}><Text style={{ color: "#FF1F1F", fontSize: 16 }}>← Cancelar</Text></TouchableOpacity>
        <TouchableOpacity onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#FF1F1F" /> : <Text style={{ color: "#86efac", fontSize: 16, fontWeight: "700" }}>Salvar</Text>}
        </TouchableOpacity>
      </View>

      <Text style={styles.editLabel}>Nome da regra</Text>
      <TextInput style={styles.editInput} value={name} onChangeText={setName} placeholder="Ex: 3 pretos → vermelho" placeholderTextColor="#666" />

      <Text style={[styles.editLabel, { marginTop: 16 }]}>Condições (todas devem ser verdadeiras)</Text>
      {conditions.map((c, i) => (
        <View key={i} style={styles.condCard}>
          <View style={styles.condHeader}>
            <Text style={styles.condTitle}>Condição {i + 1}</Text>
            {conditions.length > 1 && (
              <TouchableOpacity onPress={() => rmCond(i)}>
                <Text style={{ color: "#fca5a5", fontWeight: "700" }}>Remover</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.subLabel}>Tipo</Text>
          <View style={styles.chipRow}>
            {(Object.keys(COND_LABEL) as RuleCondType[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.chip, c.type === t && styles.chipActive]}
                onPress={() => setCond(i, { ...c, type: t })}
              >
                <Text style={[styles.chipText, c.type === t && styles.chipTextActive]}>{COND_LABEL[t]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {(c.type === "streak" || c.type === "after_color") && (
            <>
              <Text style={styles.subLabel}>Cor</Text>
              <View style={styles.chipRow}>
                {COLORS.map((cc) => (
                  <TouchableOpacity
                    key={cc}
                    style={[styles.chip, c.color === cc && styles.chipActive]}
                    onPress={() => setCond(i, { ...c, color: cc })}
                  >
                    <Text style={[styles.chipText, c.color === cc && styles.chipTextActive]}>{COLOR_LABEL[cc]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
          {(c.type === "streak" || c.type === "gap_white") && (
            <>
              <Text style={styles.subLabel}>Operador / valor</Text>
              <View style={[styles.chipRow, { marginBottom: 8 }]}>
                {([">=", "==", "<="] as const).map((op) => (
                  <TouchableOpacity
                    key={op}
                    style={[styles.chip, c.op === op && styles.chipActive]}
                    onPress={() => setCond(i, { ...c, op })}
                  >
                    <Text style={[styles.chipText, c.op === op && styles.chipTextActive]}>{op}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.editInput}
                value={String(c.value ?? "")}
                onChangeText={(v) => setCond(i, { ...c, value: parseInt(v) || 0 })}
                keyboardType="number-pad"
                placeholder="Ex: 3"
                placeholderTextColor="#666"
              />
            </>
          )}
        </View>
      ))}
      <TouchableOpacity style={styles.addCondBtn} onPress={addCond}>
        <Text style={styles.addCondText}>+ Adicionar condição</Text>
      </TouchableOpacity>

      <Text style={[styles.editLabel, { marginTop: 16 }]}>Ação (entrar em…)</Text>
      <View style={styles.condCard}>
        <Text style={styles.subLabel}>Cor da entrada</Text>
        <View style={styles.chipRow}>
          {COLORS.map((cc) => (
            <TouchableOpacity
              key={cc}
              style={[styles.chip, action.color === cc && styles.chipActive]}
              onPress={() => setAction({ ...action, color: cc })}
            >
              <Text style={[styles.chipText, action.color === cc && styles.chipTextActive]}>{COLOR_LABEL[cc]}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.subLabel}>Gales (0-4)</Text>
        <View style={styles.chipRow}>
          {[0, 1, 2, 3, 4].map((g) => (
            <TouchableOpacity
              key={g}
              style={[styles.chip, action.gales === g && styles.chipActive]}
              onPress={() => setAction({ ...action, gales: g })}
            >
              <Text style={[styles.chipText, action.gales === g && styles.chipTextActive]}>G{g}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.subLabel}>Anotação (opcional)</Text>
        <TextInput
          style={styles.editInput}
          value={action.note || ""}
          onChangeText={(v) => setAction({ ...action, note: v })}
          placeholder="Ex: Quebra de sequência"
          placeholderTextColor="#666"
        />
      </View>

      <View style={[styles.chipRow, { marginTop: 12 }]}>
        <TouchableOpacity
          style={[styles.chip, enabled && styles.chipActive]}
          onPress={() => setEnabled(true)}
        >
          <Text style={[styles.chipText, enabled && styles.chipTextActive]}>Ativada</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, !enabled && styles.chipActive]}
          onPress={() => setEnabled(false)}
        >
          <Text style={[styles.chipText, !enabled && styles.chipTextActive]}>Desativada</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0c0c0c" },
  card: { backgroundColor: "#141414", padding: 14, borderRadius: 14, marginBottom: 12, borderWidth: 1, borderColor: "#1f1f1f" },
  cardTitle: { color: "#fff", fontWeight: "800", fontSize: 14, marginBottom: 8 },
  emptyHint: { color: "#9a9a9a", fontSize: 13, padding: 4 },
  bold: { fontWeight: "800", color: "#fff" },
  matchBox: { backgroundColor: "#0d3320", borderColor: "#1f7a47", borderWidth: 1, padding: 12, borderRadius: 10 },
  matchTitle: { color: "#86efac", fontWeight: "800", fontSize: 13, marginBottom: 8 },
  matchAction: { flexDirection: "row", alignItems: "center", gap: 12 },
  actionBall: { width: 36, height: 36, borderRadius: 18, borderWidth: 1 },
  actionBallSm: { width: 18, height: 18, borderRadius: 9, borderWidth: 1 },
  matchText: { color: "#fff", fontSize: 14 },
  matchNote: { color: "#bbb", fontSize: 12, marginTop: 2, fontStyle: "italic" },
  actionsRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  primaryBtn: { flex: 1, backgroundColor: "#E11D2A", paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  presetRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#1f1f1f" },
  presetText: { color: "#7fc4dd", fontSize: 13, fontWeight: "600" },
  center: { padding: 30, alignItems: "center" },
  emptyTitle: { color: "#fff", fontWeight: "800", fontSize: 16, marginTop: 8 },
  emptyText: { color: "#9a9a9a", fontSize: 12, textAlign: "center", marginTop: 4 },
  ruleHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: 8 },
  ruleName: { color: "#fff", fontWeight: "800", fontSize: 14, flex: 1 },
  ruleActions: { flexDirection: "row", gap: 6 },
  smallBtn: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6 },
  ruleSub: { color: "#7a7a7a", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  ruleCondText: { color: "#bbb", fontSize: 12, marginTop: 2 },
  actionInline: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  ruleActionText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  editLabel: { color: "#9a9a9a", fontSize: 12, fontWeight: "700", marginBottom: 6 },
  editInput: { backgroundColor: "#1a1a1a", borderWidth: 1, borderColor: "#2a2a2a", color: "#fff", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, fontSize: 15 },
  condCard: { backgroundColor: "#141414", padding: 12, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: "#1f1f1f" },
  condHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  condTitle: { color: "#fff", fontWeight: "700", fontSize: 12 },
  subLabel: { color: "#9a9a9a", fontSize: 11, fontWeight: "700", marginTop: 6, marginBottom: 4 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: "#1a1a1a", borderWidth: 1, borderColor: "#2a2a2a" },
  chipActive: { backgroundColor: "#22090a", borderColor: "#FF1F1F" },
  chipText: { color: "#9a9a9a", fontWeight: "700", fontSize: 11 },
  chipTextActive: { color: "#FF1F1F" },
  addCondBtn: { paddingVertical: 10, borderRadius: 10, alignItems: "center", borderWidth: 1, borderColor: "#2a2a2a", borderStyle: "dashed" },
  addCondText: { color: "#7fc4dd", fontWeight: "700", fontSize: 13 },
});
