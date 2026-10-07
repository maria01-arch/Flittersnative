import { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';

// Matches the webapp's REPORT_REASONS exactly — same ids, same order
// (child safety listed first, not buried), same labels. That matters
// beyond just consistency: the Child Safety Standards page (About ->
// Child's Policy) specifically says this option is listed first among
// report reasons, so it actually needs to be.
export const REPORT_REASONS = [
  { id: 'child_safety', label: 'Child sexual abuse or exploitation', urgent: true },
  { id: 'nudity_sexual', label: 'Nudity or sexual content' },
  { id: 'violence', label: 'Violence or dangerous behavior' },
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'hate_speech', label: 'Hate speech' },
  { id: 'spam', label: 'Spam or scam' },
  { id: 'other', label: 'Something else' },
];

export default function ReportModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  // Caller wires this to the correct `reports` insert shape — which
  // reported_*_id column to use depends on what's being reported (post,
  // user, message, reel), only the caller knows that.
  onSubmit: (reason: string, details: string) => Promise<void>;
}) {
  const { colors } = useTheme();
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const close = () => {
    onClose();
    // Reset after the close animation has room to finish, not before.
    setTimeout(() => {
      setReason(null);
      setDetails('');
      setDone(false);
      setSubmitting(false);
    }, 300);
  };

  const submit = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(reason, details.trim());
      setDone(true);
    } catch (e: any) {
      Alert.alert("Couldn't submit report", e.message || 'Please try again.');
    }
    setSubmitting(false);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.bg }]} onPress={() => {}}>
          {done ? (
            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
              <Ionicons name="checkmark-circle" size={44} color="#22C55E" />
              <Text style={[styles.title, { color: colors.text, marginTop: 10 }]}>Report submitted</Text>
              <Text style={{ color: colors.subtext, marginTop: 4, textAlign: 'center' }}>Thanks — our team will review this.</Text>
              <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.inputBg, marginTop: 18 }]} onPress={close}>
                <Text style={[styles.submitText, { color: colors.text }]}>Close</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={[styles.title, { color: colors.text }]}>Report</Text>
              <Text style={{ color: colors.faint, fontSize: 13, marginBottom: 14 }}>Why are you reporting this?</Text>
              {REPORT_REASONS.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={[
                    styles.reasonRow,
                    { backgroundColor: reason === r.id ? colors.primary + '1F' : colors.card, borderColor: reason === r.id ? colors.primary : 'transparent' },
                  ]}
                  onPress={() => setReason(r.id)}
                >
                  <Text style={{ color: r.urgent ? '#EF4444' : colors.text, fontWeight: r.urgent ? '700' : '500', fontSize: 14 }}>{r.label}</Text>
                  {reason === r.id && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                </TouchableOpacity>
              ))}
              {reason && (
                <TextInput
                  style={[styles.detailsInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
                  placeholder="Add any extra details (optional)"
                  placeholderTextColor={colors.faint}
                  value={details}
                  onChangeText={setDetails}
                  multiline
                  numberOfLines={3}
                />
              )}
              <TouchableOpacity style={[styles.submitBtn, { backgroundColor: reason ? colors.primary : colors.inputBg }]} disabled={!reason || submitting} onPress={submit}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={[styles.submitText, { color: reason ? '#fff' : colors.faint }]}>Submit Report</Text>}
              </TouchableOpacity>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, paddingBottom: 36 },
  title: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  reasonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 12, padding: 13, marginBottom: 8 },
  detailsInput: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 70, textAlignVertical: 'top', marginTop: 4, marginBottom: 14 },
  submitBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  submitText: { fontWeight: '700', fontSize: 15 },
});
