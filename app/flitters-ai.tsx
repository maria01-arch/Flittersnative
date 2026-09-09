import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, Image, Modal, KeyboardAvoidingView, Platform, Animated } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';

type ChatMsg = { role: 'user' | 'assistant'; content: string; image?: string; loading?: boolean };

function XChordLogo({ size = 34 }: { size?: number }) {
  return (
    <View style={[logoStyles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[logoStyles.x, { fontSize: size * 0.55 }]}>X</Text>
    </View>
  );
}

const logoStyles = StyleSheet.create({
  circle: {
    backgroundColor: '#6C5CE7',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#F91880',
  },
  x: { color: '#fff', fontWeight: '900', fontStyle: 'italic' },
});

function SkeletonBubble({ color }: { color: string }) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 500, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <View style={styles.bubbleRow}>
      <Animated.View style={[styles.skeletonBubble, { backgroundColor: color, opacity }]}>
        <View style={[styles.skeletonLine, { width: 120 }]} />
        <View style={[styles.skeletonLine, { width: 80, marginTop: 6 }]} />
      </Animated.View>
    </View>
  );
}

export default function FlittersAIScreen() {
  const { colors } = useTheme();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  const [generatingImage, setGeneratingImage] = useState(false);
  const listRef = useRef<FlatList>(null);
  const revealInterval = useRef<any>(null);

  const revealReply = (fullText: string) => {
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
    let i = 0;
    const step = Math.max(1, Math.floor(fullText.length / 120));
    revealInterval.current = setInterval(() => {
      i += step;
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: 'assistant', content: fullText.slice(0, i) };
        return copy;
      });
      listRef.current?.scrollToEnd({ animated: false });
      if (i >= fullText.length) {
        clearInterval(revealInterval.current);
      }
    }, 20);
  };

  useEffect(() => {
    return () => {
      if (revealInterval.current) clearInterval(revealInterval.current);
    };
  }, []);

  const sendMessage = async () => {
    if (!text.trim() || sending) return;
    const userMsg: ChatMsg = { role: 'user', content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setText('');
    setSending(true);
    try {
      const res = await fetch('https://xchord.space/api/flittersai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, deepThink: false }),
      });
      const replyText = await res.text();
      setSending(false);
      revealReply(replyText);
    } catch (e) {
      setSending(false);
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }]);
    }
  };

  const generateImage = async () => {
    if (!imagePrompt.trim() || generatingImage) return;
    setGeneratingImage(true);
    const prompt = imagePrompt.trim();
    setImageModalOpen(false);
    setImagePrompt('');
    try {
      const res = await fetch('https://xchord.space/api/flittersai-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (data.image) {
        setMessages((prev) => [...prev, { role: 'assistant', content: '', image: data.image }]);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.error || 'Image generation failed.' }]);
      }
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Something went wrong generating the image.' }]);
    }
    setGeneratingImage(false);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.topBarCenter}>
          <XChordLogo size={26} />
          <Text style={[styles.topBarTitle, { color: colors.text }]}>xChord AI</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(_, i) => i.toString()}
        contentContainerStyle={{ padding: spacing.lg }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }: any) => (
          <View style={[styles.bubbleRow, item.role === 'user' ? styles.myRow : styles.theirRow]}>
            <View style={[styles.bubble, item.role === 'user' ? { backgroundColor: colors.primary } : { backgroundColor: colors.bubbleTheirs }]}>
              {item.image ? (
                <Image source={{ uri: item.image }} style={styles.generatedImage} />
              ) : (
                <Text style={item.role === 'user' ? styles.myText : [styles.theirText, { color: colors.text }]}>{item.content}</Text>
              )}
            </View>
          </View>
        )}
        ListFooterComponent={sending ? <SkeletonBubble color={colors.bubbleTheirs} /> : (generatingImage ? <SkeletonBubble color={colors.bubbleTheirs} /> : null)}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <XChordLogo size={56} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Ask xChord AI anything</Text>
            <Text style={[styles.emptySubtitle, { color: colors.subtext }]}>Get help writing posts, brainstorming ideas, or generating an image with the 🎨 button</Text>
          </View>
        }
      />

      <View style={[styles.inputBar, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={() => setImageModalOpen(true)} style={styles.imageBtn}>
          <Text style={{ fontSize: 22 }}>🎨</Text>
        </TouchableOpacity>
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]}
          placeholder="Message xChord AI..."
          placeholderTextColor={colors.faint}
          value={text}
          onChangeText={setText}
          multiline
        />
        <TouchableOpacity onPress={sendMessage} disabled={!text.trim() || sending}>
          <Ionicons name="send" size={22} color={text.trim() && !sending ? colors.primary : colors.faint} />
        </TouchableOpacity>
      </View>

      <Modal visible={imageModalOpen} transparent animationType="fade" onRequestClose={() => setImageModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Generate an image</Text>
            <TextInput
              style={[styles.modalInput, { borderColor: colors.border, color: colors.text }]}
              placeholder="Describe what you want to see..."
              placeholderTextColor={colors.faint}
              value={imagePrompt}
              onChangeText={setImagePrompt}
              multiline
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setImageModalOpen(false)} style={styles.modalCancelBtn}>
                <Text style={{ color: colors.subtext, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={generateImage} disabled={!imagePrompt.trim()} style={[styles.modalGenerateBtn, { backgroundColor: colors.primary }]}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Generate</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingHorizontal: spacing.lg, paddingBottom: 12, borderBottomWidth: 1 },
  topBarCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topBarTitle: { fontSize: 16, fontWeight: '700' },
  bubbleRow: { marginVertical: 4 },
  myRow: { alignItems: 'flex-end' },
  theirRow: { alignItems: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  myText: { color: '#fff', fontSize: 15 },
  theirText: { fontSize: 15, lineHeight: 21 },
  generatedImage: { width: 240, height: 240, borderRadius: 12, backgroundColor: '#00000020' },
  skeletonBubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, maxWidth: '60%' },
  skeletonLine: { height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.4)' },
  emptyState: { alignItems: 'center', marginTop: 80, paddingHorizontal: 30, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 8 },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', padding: 10, borderTopWidth: 1, gap: 10 },
  imageBtn: { paddingBottom: 8 },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, maxHeight: 120, minHeight: 38 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.xl },
  modalCard: { borderRadius: 18, padding: spacing.lg },
  modalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  modalInput: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 14 },
  modalCancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  modalGenerateBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 14 },
});
