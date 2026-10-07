import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { uploadSticker } from '@/lib/upload';
import { useTheme } from '@/lib/ThemeContext';
import { EMOJI_CATEGORIES } from '@/lib/emojiData';
import StickerMedia from './StickerMedia';

// Shared by DM (conversation/[id].tsx) and group chat (groups/[id].tsx).
// Mirrors the webapp's tray: emoji first (universal default), your own
// sticker pack second. Packs themselves aren't managed here — like the
// webapp, everyone gets a single auto-created "My Stickers" pack the first
// time they open this; browsing other people's packs isn't part of this
// first pass.
export default function StickerTray({
  userId,
  onSelectEmoji,
  onSelectSticker,
  onClose,
}: {
  userId: string;
  onSelectEmoji: (emoji: string) => void;
  onSelectSticker: (url: string) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [mode, setMode] = useState<'emoji' | 'sticker'>('emoji');
  const [activeCat, setActiveCat] = useState(EMOJI_CATEGORIES[0].id);
  const [packId, setPackId] = useState<string | null>(null);
  const [stickers, setStickers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      let { data: packs, error: packErr } = await supabase
        .from('sticker_packs')
        .select('id,name')
        .eq('owner_id', userId)
        .order('created_at', { ascending: true });
      if (packErr) {
        if (!cancelled) {
          setError("Couldn't load your stickers: " + packErr.message);
          setLoading(false);
        }
        return;
      }
      let pack = packs?.[0];
      if (!pack) {
        const { data: created, error: createErr } = await supabase
          .from('sticker_packs')
          .insert({ owner_id: userId, name: 'My Stickers' })
          .select('id,name')
          .single();
        if (createErr) {
          if (!cancelled) {
            setError("Couldn't set up your sticker pack: " + createErr.message);
            setLoading(false);
          }
          return;
        }
        pack = created;
      }
      if (cancelled) return;
      setPackId(pack.id);
      const { data: stickerRows } = await supabase
        .from('stickers')
        .select('id,media_url')
        .eq('pack_id', pack.id)
        .order('created_at', { ascending: true });
      if (!cancelled) {
        setStickers(stickerRows || []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const addSticker = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (result.canceled || !result.assets?.[0] || !packId) return;
    setUploading(true);
    const url = await uploadSticker(result.assets[0].uri, userId);
    if (!url) {
      setError('Sticker upload failed — check your connection and try again.');
      setUploading(false);
      return;
    }
    const { data: inserted, error: insertErr } = await supabase
      .from('stickers')
      .insert({ pack_id: packId, media_url: url })
      .select('id,media_url')
      .single();
    if (inserted) setStickers((prev) => [...prev, inserted]);
    else setError("Couldn't save sticker: " + (insertErr?.message || 'unknown error'));
    setUploading(false);
  };

  const cat = EMOJI_CATEGORIES.find((c) => c.id === activeCat) || EMOJI_CATEGORIES[0];

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
      <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.tab, { backgroundColor: mode === 'emoji' ? colors.primary + '33' : 'transparent' }]}
          onPress={() => setMode('emoji')}
        >
          <Ionicons name="happy-outline" size={15} color={mode === 'emoji' ? colors.primary : colors.subtext} />
          <Text style={[styles.tabText, { color: mode === 'emoji' ? colors.primary : colors.subtext }]}>Emoji</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, { backgroundColor: mode === 'sticker' ? colors.primary + '33' : 'transparent' }]}
          onPress={() => setMode('sticker')}
        >
          <Text style={{ fontSize: 14 }}>🖼️</Text>
          <Text style={[styles.tabText, { color: mode === 'sticker' ? colors.primary : colors.subtext }]}>Stickers</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Ionicons name="close" size={18} color={colors.subtext} />
        </TouchableOpacity>
      </View>

      {mode === 'emoji' ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.catRow, { borderBottomColor: colors.border }]}>
            {EMOJI_CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[styles.catBtn, activeCat === c.id && { backgroundColor: colors.primary + '33' }]}
                onPress={() => setActiveCat(c.id)}
              >
                <Text style={{ fontSize: 16 }}>{c.icon}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <ScrollView contentContainerStyle={styles.emojiGrid}>
            {cat.emojis.map((e, i) => (
              <TouchableOpacity key={cat.id + i} style={styles.emojiCell} onPress={() => onSelectEmoji(e)}>
                <Text style={{ fontSize: 24 }}>{e}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      ) : (
        <ScrollView contentContainerStyle={styles.stickerGrid}>
          {error ? (
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
          ) : loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
          ) : (
            <>
              <TouchableOpacity style={[styles.addTile, { borderColor: colors.border }]} onPress={addSticker} disabled={uploading}>
                {uploading ? <ActivityIndicator color={colors.subtext} /> : <Ionicons name="add" size={28} color={colors.faint} />}
              </TouchableOpacity>
              {stickers.map((s) => (
                <TouchableOpacity key={s.id} style={[styles.stickerTile, { backgroundColor: colors.inputBg }]} onPress={() => onSelectSticker(s.media_url)}>
                  <StickerMedia url={s.media_url} size={68} />
                </TouchableOpacity>
              ))}
              {!loading && stickers.length === 0 && (
                <Text style={[styles.hint, { color: colors.faint }]}>Tap + to add your first sticker from your photos.</Text>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 280, borderTopWidth: 1 },
  tabRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, gap: 8, borderBottomWidth: 1 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  tabText: { fontSize: 12, fontWeight: '700' },
  closeBtn: { marginLeft: 'auto', padding: 4 },
  catRow: { flexGrow: 0, paddingHorizontal: 6, paddingVertical: 6, borderBottomWidth: 1 },
  catBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginHorizontal: 2 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 6 },
  emojiCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  stickerGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 10 },
  addTile: { width: 68, height: 68, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  stickerTile: { width: 68, height: 68, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  hint: { fontSize: 12, marginTop: 10, width: '100%', textAlign: 'center' },
  errorText: { fontSize: 13, width: '100%', textAlign: 'center', marginTop: 20 },
});
