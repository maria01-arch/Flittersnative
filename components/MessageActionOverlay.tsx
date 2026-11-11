import { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Modal, View, TouchableOpacity, StyleSheet, Pressable, FlatList, Platform, useWindowDimensions } from 'react-native';
import Text from '@/components/AppText';
import { BlurView } from 'expo-blur';
import { useBlurTarget, blurTargetSupported } from '@/lib/blurTarget';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EMOJI_CATEGORIES } from '@/lib/emojiData';
import Emoji from '@/components/Emoji';
import { useTheme } from '@/lib/ThemeContext';

export type MenuAction = { key: string; label: string; icon: any; danger?: boolean; onPress: () => void };
export type MenuRect = { x: number; y: number; w: number; h: number };

const DEFAULT_QUICK = ['❤️', '😂', '😮', '😢', '🙏', '👍'];
const RECENT_KEY = 'recent_reactions';
const ALL_EMOJIS: string[] = EMOJI_CATEGORIES.flatMap((c: any) => c.emojis.map((e: any) => (typeof e === 'string' ? e : e.emoji || e.char || String(e))));

const EMOJI_H = 56;
const ROW_H = 46;
const GAP = 10;
const MENU_W = 230;
const EMOJI_W = 316;
const EDGE = 12;

// The long-press menu. The chat behind is covered (blurred on iPhone, strongly
// dimmed on Android), and ONLY the pressed message, the emoji row and the menu
// stay clear. It pops in with a small spring. `children` is a copy of the
// message drawn exactly where the real one is.
export default function MessageActionOverlay({
  visible,
  rect,
  isMine,
  actions,
  onReact,
  onClose,
  children,
}: {
  visible: boolean;
  rect: MenuRect | null;
  isMine: boolean;
  actions: MenuAction[];
  onReact: (emoji: string) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const { colors, isDark } = useTheme();
  const blurTarget = useBlurTarget();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const t = useRef(new Animated.Value(0)).current;
  const [show, setShow] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (visible) {
      setShow(true);
      t.setValue(0);
      Animated.spring(t, { toValue: 1, useNativeDriver: true, friction: 8, tension: 90 }).start();
      AsyncStorage.getItem(RECENT_KEY)
        .then((raw) => setRecent(raw ? JSON.parse(raw) : []))
        .catch(() => {});
    } else if (show) {
      Animated.timing(t, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => setShow(false));
    }
  }, [visible]);

  const quick = [...recent, ...DEFAULT_QUICK.filter((d) => !recent.includes(d))].slice(0, 6);
  const react = (emoji: string) => {
    const next = [emoji, ...recent.filter((x) => x !== emoji)].slice(0, 6);
    setRecent(next);
    AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
    setPickerOpen(false);
    onReact(emoji);
  };

  if (!show || !rect) return null;

  // ---- Where everything goes. The message stays where it was if there is room;
  // otherwise the whole stack slides just enough to fit on the screen.
  const menuH = actions.length * ROW_H + 12;
  const topMin = insets.top + 8;
  const bottomMax = H - insets.bottom - 8;
  const avail = bottomMax - topMin;
  let bubbleH = rect.h;
  const maxBubbleH = avail - EMOJI_H - menuH - GAP * 2;
  const clipped = bubbleH > maxBubbleH;
  if (clipped) bubbleH = Math.max(80, maxBubbleH);
  const stackH = EMOJI_H + GAP + bubbleH + GAP + menuH;
  let top = rect.y - EMOJI_H - GAP;
  top = Math.max(topMin, Math.min(top, bottomMax - stackH));
  const emojiTop = top;
  const bubbleTop = top + EMOJI_H + GAP;
  const menuTop = bubbleTop + bubbleH + GAP;
  const delta = rect.y - bubbleTop; // how far the message has to travel from where it was

  const clampX = (x: number, w: number) => Math.max(EDGE, Math.min(x, W - w - EDGE));
  const emojiLeft = clampX(isMine ? rect.x + rect.w - EMOJI_W : rect.x, EMOJI_W);
  const menuLeft = clampX(isMine ? rect.x + rect.w - MENU_W : rect.x, MENU_W);

  // Android blurs the chat behind through a shared "blur target" (see
  // lib/blurTarget.tsx). Without it (or on Android 11 and older) the chat is
  // covered by a strong dim instead, so it can't be read either way.
  const androidBlur = Platform.OS === 'android' && blurTargetSupported && !!blurTarget?.current && Number(Platform.Version) >= 31;
  // How the Android blur works (read from expo-blur's own code): the blur radius is
  // intensity / blurReductionFactor, and the colour laid over it ("tint") has an
  // opacity of intensity x a fixed number: dark 0.69, light-ish 0.44. So
  // intensity 14.5 gives a 10% dark overlay and 11.4 gives a 5% light overlay, and
  // the factor 0.46 / 0.48 keeps the blur radius at about 48 either way.
  const glassCard = androidBlur ? (isDark ? 'rgba(18,24,38,0.80)' : 'rgba(255,255,255,0.82)') : colors.card;
  const glassEdge = androidBlur ? { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.9)' } : null;
  const veil = androidBlur ? 'rgba(0,0,0,0)' : isDark ? 'rgba(8,11,18,0.94)' : 'rgba(18,22,31,0.82)';
  const popScale = t.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] });
  const shadow = { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 12 };

  return (
    <>
      <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
        <View style={{ flex: 1 }}>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: t }]} pointerEvents="none">
            {Platform.OS === 'ios' ? <BlurView intensity={85} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} /> : null}
            {androidBlur ? (
              <BlurView
                blurTarget={blurTarget as any}
                blurMethod="dimezisBlurViewSdk31Plus"
                intensity={isDark ? 14.5 : 11.4}
                blurReductionFactor={isDark ? 0.3 : 0.24}
                tint={isDark ? 'dark' : 'default'}
                style={StyleSheet.absoluteFill}
              />
            ) : null}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: Platform.OS === 'ios' ? (isDark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.18)') : veil }]} />
          </Animated.View>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

          {/* Emoji row */}
          <Animated.View
            style={[
              styles.emojiBar,
              shadow,
              glassEdge, androidBlur ? { elevation: 0 } : null, { backgroundColor: glassCard, left: emojiLeft, top: emojiTop, width: EMOJI_W, opacity: t, transform: [{ scale: popScale }] },
            ]}
          >
            {quick.map((e) => (
              <TouchableOpacity key={e} onPress={() => react(e)} style={styles.emojiBtn}>
                <Emoji emoji={e} size={34} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setPickerOpen(true)} style={[styles.emojiBtn, { backgroundColor: colors.inputBg, borderRadius: 18 }]}>
              <Ionicons name="add" size={22} color={colors.text} />
            </TouchableOpacity>
          </Animated.View>

          {/* The pressed message, copied exactly where it was */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: rect.x,
              top: bubbleTop,
              width: rect.w,
              maxHeight: clipped ? bubbleH : undefined,
              overflow: clipped ? 'hidden' : 'visible',
              transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [delta, 0] }) }, { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }],
            }}
          >
            {children}
          </Animated.View>

          {/* Actions */}
          <Animated.View
            style={[
              styles.menu,
              shadow,
              glassEdge, androidBlur ? { elevation: 0 } : null, { backgroundColor: glassCard, left: menuLeft, top: menuTop, width: MENU_W, opacity: t, transform: [{ scale: popScale }] },
            ]}
          >
            {actions.map((a) => (
              <TouchableOpacity key={a.key} style={styles.row} onPress={a.onPress}>
                <Ionicons name={a.icon} size={20} color={a.danger ? '#EF4444' : colors.text} />
                <Text style={[styles.rowText, { color: a.danger ? '#EF4444' : colors.text }]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </Animated.View>
        </View>
      </Modal>

      <Modal visible={pickerOpen} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={[styles.pickerSheet, { backgroundColor: colors.card, height: '55%' }]} onPress={() => {}}>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, textAlign: 'center', marginBottom: 8 }}>Pick a reaction</Text>
            <FlatList
              data={ALL_EMOJIS}
              keyExtractor={(e, i) => e + i}
              numColumns={8}
              initialNumToRender={64}
              windowSize={7}
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => react(item)} style={{ width: '12.5%', alignItems: 'center', paddingVertical: 6 }}>
                  <Emoji emoji={item} size={34} />
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  emojiBar: { position: 'absolute', height: EMOJI_H, borderRadius: EMOJI_H / 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 8 },
  emojiBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  emojiText: { fontSize: 25 },
  menu: { position: 'absolute', borderRadius: 16, paddingVertical: 6, overflow: 'visible' },
  row: { height: ROW_H, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18 },
  rowText: { fontSize: 15.5 },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  pickerSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 16, paddingBottom: 30 },
});
