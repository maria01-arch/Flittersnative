import { useEffect, useState } from 'react';
import { Alert, AlertButton, Modal, View, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import Text from '@/components/AppText';
import { useTheme } from '@/lib/ThemeContext';
import { cleanMessage } from '@/lib/friendlyError';

// The app's own pop-up. Importing this file replaces the plain Android
// Alert.alert with it, so EVERY existing pop-up (confirmations, errors,
// "Delete?" questions) now looks like the app, with no per-screen changes.
// It is a centred card that follows the light/dark theme; it is not the
// bottom sheet used for menus.
type Req = { title: string; message?: string; buttons: AlertButton[]; cancelable: boolean };

let enqueue: ((r: Req) => void) | null = null;
const pending: Req[] = [];

(Alert as any).alert = (title: string, message?: string, buttons?: AlertButton[], options?: { cancelable?: boolean }) => {
  const req: Req = { title, message: cleanMessage(message), buttons: buttons && buttons.length ? buttons : [{ text: 'OK' }], cancelable: options?.cancelable !== false };
  if (enqueue) enqueue(req);
  else pending.push(req);
};

export default function DialogHost() {
  const { colors } = useTheme();
  const [queue, setQueue] = useState<Req[]>([]);

  useEffect(() => {
    enqueue = (r) => setQueue((q) => [...q, r]);
    if (pending.length) setQueue(pending.splice(0));
    return () => {
      enqueue = null;
    };
  }, []);

  const current = queue[0];
  const close = () => setQueue((q) => q.slice(1));
  const press = (b: AlertButton) => {
    close();
    // Run the action after the card has gone, so a follow-up pop-up can show.
    setTimeout(() => b.onPress?.(), 0);
  };
  const cancelBtn = current?.buttons.find((b) => b.style === 'cancel');
  const dismiss = () => {
    if (!current || (!current.cancelable && !cancelBtn)) return;
    close();
    if (cancelBtn) setTimeout(() => cancelBtn.onPress?.(), 0);
  };

  const stacked = (current?.buttons.length || 0) > 2;

  return (
    <Modal visible={!!current} transparent animationType="fade" onRequestClose={dismiss} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={dismiss}>
        <Pressable style={[styles.card, { backgroundColor: colors.card }]} onPress={() => {}}>
          {!!current?.title && <Text style={[styles.title, { color: colors.text }]}>{current.title}</Text>}
          {!!current?.message && <Text style={[styles.message, { color: colors.subtext }]}>{current.message}</Text>}
          <View style={[styles.buttons, stacked && { flexDirection: 'column' }]}>
            {current?.buttons.map((b, i) => {
              const destructive = b.style === 'destructive';
              const isCancel = b.style === 'cancel';
              return (
                <TouchableOpacity
                  key={i}
                  onPress={() => press(b)}
                  activeOpacity={0.8}
                  style={[
                    styles.btn,
                    stacked ? { width: '100%' } : { flex: 1 },
                    { backgroundColor: destructive ? 'rgba(239,68,68,0.14)' : isCancel ? colors.inputBg : colors.primary },
                  ]}
                >
                  <Text style={{ fontWeight: '800', color: destructive ? '#EF4444' : isCancel ? colors.text : '#fff' }}>{b.text}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { width: '100%', maxWidth: 360, borderRadius: 22, padding: 22 },
  title: { fontSize: 18, fontWeight: '900', marginBottom: 6 },
  message: { fontSize: 14, lineHeight: 21, marginBottom: 6 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
});
