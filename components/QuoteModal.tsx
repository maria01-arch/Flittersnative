import { useEffect, useState } from 'react';
import { Modal, View, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView } from 'react-native';
import Text from '@/components/AppText';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';
import QuotedPost from './QuotedPost';

const MAX = 280;

// "Quote" half of the repost menu: add your own words above the original
// post. onSubmit does the actual saving; this only collects the text.
export default function QuoteModal({
  visible,
  post,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  post: any;
  onClose: () => void;
  onSubmit: (text: string) => Promise<void>;
}) {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible) {
      setText('');
      setSending(false);
    }
  }, [visible]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await onSubmit(text.trim());
    } catch {
      // The screen that owns the repost already showed the reason; keep
      // the box open with the text intact so nothing typed is lost.
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} disabled={sending}>
            <Text style={{ color: colors.subtext, fontSize: 16 }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>Quote</Text>
          <TouchableOpacity onPress={send} disabled={!text.trim() || sending} style={[styles.postBtn, { backgroundColor: colors.primary, opacity: text.trim() && !sending ? 1 : 0.4 }]}>
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Post</Text>}
          </TouchableOpacity>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg }}>
          <TextInput
            style={[styles.input, { color: colors.text }]}
            value={text}
            onChangeText={setText}
            placeholder="Add your comment…"
            placeholderTextColor={colors.faint}
            multiline
            maxLength={MAX}
            autoFocus
          />
          <Text style={{ color: colors.faint, fontSize: 12, textAlign: 'right', marginBottom: 6 }}>
            {text.length}/{MAX}
          </Text>
          {post ? <QuotedPost post={post} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 56, paddingHorizontal: spacing.lg, paddingBottom: 12, borderBottomWidth: 1 },
  postBtn: { borderRadius: 16, paddingVertical: 6, paddingHorizontal: 16, minWidth: 60, alignItems: 'center' },
  input: { fontSize: 17, minHeight: 90, textAlignVertical: 'top' },
});
