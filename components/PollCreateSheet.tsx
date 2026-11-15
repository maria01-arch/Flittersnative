import { useEffect, useState } from 'react';
import { Modal, View, TextInput, TouchableOpacity, StyleSheet, ScrollView, Switch, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { createPoll } from '@/lib/polls';

const MAX_OPTIONS = 10;

// "New poll": a question, 2 to 10 answers, and whether people can pick more than one.
export default function PollCreateSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (pollId: string, question: string) => void | Promise<void> }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [showCounts, setShowCounts] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setQuestion('');
      setOptions(['', '']);
      setMultiple(false);
      setShowCounts(false);
      setBusy(false);
    }
  }, [visible]);

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const canCreate = question.trim().length > 0 && filled.length >= 2 && !busy;

  const create = async () => {
    if (!canCreate) return;
    setBusy(true);
    const r = await createPoll(question, filled, multiple, showCounts);
    if (!r.id) {
      setBusy(false);
      return Alert.alert("Couldn't create the poll", 'Check your connection and try again.');
    }
    await onCreated(r.id, question.trim());
    setBusy(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.top, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>New poll</Text>
          <TouchableOpacity onPress={create} disabled={!canCreate} style={[styles.createBtn, { backgroundColor: colors.primary, opacity: canCreate ? 1 : 0.4 }]}>
            {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>Send</Text>}
          </TouchableOpacity>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 30 }}>
          <Text style={[styles.label, { color: colors.subtext }]}>Question</Text>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]}
            placeholder="Ask something..."
            placeholderTextColor={colors.faint}
            value={question}
            onChangeText={setQuestion}
            maxLength={200}
            multiline
          />
          <Text style={[styles.label, { color: colors.subtext, marginTop: 18 }]}>Answers</Text>
          {options.map((o, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <TextInput
                style={[styles.input, { flex: 1, color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]}
                placeholder={`Answer ${i + 1}`}
                placeholderTextColor={colors.faint}
                value={o}
                onChangeText={(t) => setOptions((prev) => prev.map((x, k) => (k === i ? t : x)))}
                maxLength={80}
              />
              {options.length > 2 && (
                <TouchableOpacity onPress={() => setOptions((prev) => prev.filter((_, k) => k !== i))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="remove-circle-outline" size={24} color={colors.subtext} />
                </TouchableOpacity>
              )}
            </View>
          ))}
          {options.length < MAX_OPTIONS && (
            <TouchableOpacity onPress={() => setOptions((prev) => [...prev, ''])} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 }}>
              <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: '700' }}>Add an answer</Text>
            </TouchableOpacity>
          )}
          <View style={[styles.row, { borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>Allow more than one answer</Text>
              <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>{multiple ? 'People can pick several answers.' : 'People can pick only one answer.'}</Text>
            </View>
            <Switch value={multiple} onValueChange={setMultiple} trackColor={{ true: colors.primary }} />
          </View>
          <View style={[styles.row, { borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>Show vote counts</Text>
              <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>{showCounts ? 'Each answer shows how many votes it has (e.g. 12).' : 'Each answer shows a percentage (e.g. 40%).'}</Text>
            </View>
            <Switch value={showCounts} onValueChange={setShowCounts} trackColor={{ true: colors.primary }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  createBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 18, minWidth: 64, alignItems: 'center' },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 16, paddingTop: 16 },
});
