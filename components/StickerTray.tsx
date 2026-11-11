import { cleanMessage } from '@/lib/friendlyError';
import { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Modal, TextInput, Alert, Pressable } from 'react-native';
import Text from '@/components/AppText';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { uploadSticker, uploadVideo } from '@/lib/upload';
import ActionSheet from './ActionSheet';
import ImageEditor from './ImageEditor';
import StickerVideoTrim from './StickerVideoTrim';
import { useTheme } from '@/lib/ThemeContext';
import { EMOJI_CATEGORIES } from '@/lib/emojiData';
import Emoji from '@/components/Emoji';
import { qualify } from '@/lib/emojiSplit';
import StickerMedia from './StickerMedia';
import ChatPickerSheet from './ChatPickerSheet';
import { forwardTo } from '@/lib/forward';

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
  onBackspace,
  onSend,
  onCancel,
  canSend,
  onSendPack,
}: {
  userId: string;
  onSelectEmoji: (emoji: string) => void;
  onSelectSticker: (url: string) => void;
  onClose: () => void;
  // Emoji tab extras (chat): erase the last emoji, send the message, or go back to the keyboard.
  onBackspace?: () => void;
  onSend?: () => void;
  onCancel?: () => void;
  canSend?: boolean;
  // Inside a chat/group: drops the pack straight into that chat (no people picker).
  onSendPack?: (packId: string, packName: string) => void;
}) {
  const { colors } = useTheme();
  const [mode, setMode] = useState<'emoji' | 'sticker'>('emoji');
  const [activeCat, setActiveCat] = useState(EMOJI_CATEGORIES[0].id);
  const [packId, setPackId] = useState<string | null>(null);
  const [packName, setPackName] = useState('My Stickers');
  const [editMode, setEditMode] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [sendOpen, setSendOpen] = useState(false);
  const [sending, setSending] = useState(false);
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
          setError(cleanMessage("Couldn't load your stickers: " + packErr.message) || "Couldn't load your stickers.");
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
            setError(cleanMessage("Couldn't set up your sticker pack: " + createErr.message) || "Couldn't set up your sticker pack.");
            setLoading(false);
          }
          return;
        }
        pack = created;
      }
      if (cancelled) return;
      setPackId(pack.id);
      setPackName(pack.name || 'My Stickers');
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

  const [menuOpen, setMenuOpen] = useState(false);
  const [cropAsk, setCropAsk] = useState<string | null>(null); // picked photo uri waiting for crop choice
  const [cropUri, setCropUri] = useState<string | null>(null);
  const [video, setVideo] = useState<{ uri: string; duration: number } | null>(null);

  const saveSticker = async (mediaUrl: string) => {
    const { data: inserted, error: insertErr } = await supabase
      .from('stickers')
      .insert({ pack_id: packId, media_url: mediaUrl })
      .select('id,media_url')
      .single();
    if (inserted) setStickers((prev) => [...prev, inserted]);
    else setError(cleanMessage("Couldn't save sticker: " + (insertErr?.message || '')) || "Couldn't save sticker.");
  };

  const uploadPhoto = async (uri: string) => {
    setUploading(true);
    const url = await uploadSticker(uri, userId);
    if (!url) setError('Sticker upload failed — check your connection and try again.');
    else await saveSticker(url);
    setUploading(false);
  };

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (result.canceled || !result.assets?.[0] || !packId) return;
    setCropAsk(result.assets[0].uri);
  };

  const pickVideo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1 });
    if (result.canceled || !result.assets?.[0] || !packId) return;
    const a: any = result.assets[0];
    // expo-image-picker gives duration in milliseconds.
    const secs = a.duration ? (a.duration > 1000 ? a.duration / 1000 : a.duration) : 5;
    if (secs > 60) return setError('Pick a video shorter than 1 minute for a sticker.');
    if (a.fileSize && a.fileSize > 30 * 1024 * 1024) return setError('That video is too big for a sticker (30 MB max).');
    setError(null);
    setVideo({ uri: a.uri, duration: secs });
  };

  const finishVideo = async (start: number, len: number) => {
    const v = video;
    setVideo(null);
    if (!v) return;
    setUploading(true);
    const url = await uploadVideo(v.uri, `messages/${userId}`);
    if (!url) setError('Sticker upload failed — check your connection and try again.');
    else await saveSticker(v.duration <= 5.05 ? url : `${url}#t=${start},${Math.min(start + len, start + 5)}`);
    setUploading(false);
  };

  const deleteSticker = (st: any) => {
    Alert.alert('Delete this sticker?', 'It is removed from your stickers. Chats that already have it are not affected.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { data, error: delErr } = await supabase.from('stickers').delete().eq('id', st.id).select('id');
          if (delErr || !data?.length) {
            Alert.alert("Couldn't delete", delErr?.message || 'The database did not allow it.');
            return;
          }
          setStickers((prev) => prev.filter((x) => x.id !== st.id));
        },
      },
    ]);
  };

  const saveName = async () => {
    const name = nameDraft.trim().slice(0, 30);
    if (!name || !packId) return;
    const { data, error: upErr } = await supabase.from('sticker_packs').update({ name }).eq('id', packId).eq('owner_id', userId).select('id');
    if (upErr || !data?.length) {
      Alert.alert("Couldn't rename", upErr?.message || 'The database did not allow it.');
    } else {
      setPackName(name);
    }
    setRenameOpen(false);
  };

  const sendPack = async (targets: any[]) => {
    if (!packId || !targets.length) return;
    setSending(true);
    const res = await forwardTo(targets, userId, { pack_id: packId, content: `🗂️ Sticker pack: ${packName}` });
    setSending(false);
    setSendOpen(false);
    if (res.failed && !res.sent) Alert.alert("Couldn't send", 'The sticker pack could not be sent. Please try again.');
    else Alert.alert('Sent', res.failed ? `Sent to ${res.sent}, ${res.failed} failed.` : 'Sticker pack sent.');
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
          <ScrollView contentContainerStyle={[styles.emojiGrid, (onBackspace || onSend || onCancel) && { paddingBottom: 120 }]}>
            {cat.emojis.map((e, i) => (
              <TouchableOpacity key={cat.id + i} style={styles.emojiCell} onPress={() => onSelectEmoji(qualify(e))}>
                <Emoji emoji={e} size={34} />
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
              <View style={styles.packHead}>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => { setNameDraft(packName); setRenameOpen(true); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }} numberOfLines={1}>
                    {packName} <Ionicons name="pencil" size={12} color={colors.faint} />
                  </Text>
                  <Text style={{ color: colors.faint, fontSize: 11 }}>{stickers.length} {stickers.length === 1 ? 'sticker' : 'stickers'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.packBtn, { backgroundColor: editMode ? colors.danger + '33' : colors.inputBg }]} onPress={() => setEditMode((v) => !v)} disabled={!stickers.length}>
                  <Ionicons name={editMode ? 'checkmark' : 'trash-outline'} size={16} color={editMode ? colors.danger : colors.subtext} />
                  <Text style={{ color: editMode ? colors.danger : colors.subtext, fontSize: 12, fontWeight: '700' }}>{editMode ? 'Done' : 'Delete'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.packBtn, { backgroundColor: colors.primary + '26' }]} onPress={() => (onSendPack && packId ? onSendPack(packId, packName) : setSendOpen(true))} disabled={!stickers.length}>
                  <Ionicons name="paper-plane-outline" size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Send pack</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={[styles.addTile, { borderColor: colors.border }]} onPress={() => setMenuOpen(true)} disabled={uploading}>
                {uploading ? <ActivityIndicator color={colors.subtext} /> : <Ionicons name="add" size={28} color={colors.faint} />}
              </TouchableOpacity>
              {stickers.map((s) => (
                <TouchableOpacity key={s.id} style={[styles.stickerTile, { backgroundColor: colors.inputBg }]} onPress={() => (editMode ? deleteSticker(s) : onSelectSticker(s.media_url))}>
                  <StickerMedia url={s.media_url} size={68} />
                  {editMode && (
                    <View style={styles.delBadge}>
                      <Ionicons name="close" size={14} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
              {!loading && stickers.length === 0 && (
                <Text style={[styles.hint, { color: colors.faint }]}>Tap + to add a photo sticker or a video sticker (up to 5 seconds).</Text>
              )}
            </>
          )}
        </ScrollView>
      )}
      <ActionSheet
        visible={menuOpen}
        title="Add a sticker"
        onClose={() => setMenuOpen(false)}
        options={[
          { label: 'Photo sticker', icon: 'image-outline', onPress: () => { setMenuOpen(false); setTimeout(pickPhoto, 250); } },
          { label: 'Video sticker (up to 5 s)', icon: 'videocam-outline', onPress: () => { setMenuOpen(false); setTimeout(pickVideo, 250); } },
        ]}
      />
      <ActionSheet
        visible={!!cropAsk}
        title="Crop this sticker?"
        onClose={() => setCropAsk(null)}
        options={[
          { label: 'Crop', icon: 'crop-outline', onPress: () => { const u = cropAsk; setCropAsk(null); setTimeout(() => setCropUri(u), 250); } },
          { label: 'Use as is (keeps transparency)', icon: 'checkmark-outline', onPress: () => { const u = cropAsk; setCropAsk(null); if (u) uploadPhoto(u); } },
        ]}
      />
      <ImageEditor
        visible={!!cropUri}
        uri={cropUri}
        startMode="crop"
        onCancel={() => setCropUri(null)}
        onDone={(u) => { setCropUri(null); uploadPhoto(u); }}
      />
      <Modal visible={renameOpen} transparent animationType="fade" onRequestClose={() => setRenameOpen(false)}>
        <Pressable style={styles.modalBack} onPress={() => setRenameOpen(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card }]} onPress={() => {}}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 10 }}>Name your sticker pack</Text>
            <TextInput
              value={nameDraft}
              onChangeText={setNameDraft}
              maxLength={30}
              autoFocus
              placeholder="My Stickers"
              placeholderTextColor={colors.faint}
              style={{ backgroundColor: colors.inputBg, color: colors.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 16 }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 18, marginTop: 16 }}>
              <TouchableOpacity onPress={() => setRenameOpen(false)}>
                <Text style={{ color: colors.subtext, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveName} disabled={!nameDraft.trim()}>
                <Text style={{ color: nameDraft.trim() ? colors.primary : colors.faint, fontWeight: '800' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <ChatPickerSheet visible={sendOpen} userId={userId} title="Send sticker pack to" busy={sending} onClose={() => setSendOpen(false)} onSend={sendPack} />
      <StickerVideoTrim visible={!!video} uri={video?.uri || null} duration={video?.duration || 5} onCancel={() => setVideo(null)} onDone={finishVideo} />
      {mode === 'emoji' && (onBackspace || onSend || onCancel) ? (
        <View style={styles.floatCol} pointerEvents="box-none">
          {onCancel ? (
            <TouchableOpacity style={[styles.floatBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={onCancel} activeOpacity={0.8}>
              <Ionicons name="keypad-outline" size={22} color={colors.text} />
            </TouchableOpacity>
          ) : null}
          <View style={styles.floatRow}>
            {onBackspace ? (
              <TouchableOpacity style={[styles.floatBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={onBackspace} activeOpacity={0.8}>
                <Ionicons name="backspace-outline" size={24} color={colors.text} />
              </TouchableOpacity>
            ) : null}
            {onSend ? (
              <TouchableOpacity style={[styles.floatBtn, { backgroundColor: canSend ? colors.primary : colors.inputBg, borderColor: canSend ? colors.primary : colors.border }]} onPress={onSend} disabled={!canSend} activeOpacity={0.8}>
                <Ionicons name="send" size={21} color={canSend ? '#fff' : colors.faint} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}
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
  floatCol: { position: 'absolute', right: 14, bottom: 14, alignItems: 'flex-end', gap: 10 },
  floatRow: { flexDirection: 'row', gap: 10 },
  floatBtn: { width: 50, height: 50, borderRadius: 25, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 6 },
  emojiCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  stickerGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 10 },
  addTile: { width: 68, height: 68, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  stickerTile: { width: 68, height: 68, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  packHead: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', marginBottom: 2 },
  packBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12 },
  delBadge: { position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: 10, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center' },
  modalBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 360, borderRadius: 18, padding: 18 },
  hint: { fontSize: 12, marginTop: 10, width: '100%', textAlign: 'center' },
  errorText: { fontSize: 13, width: '100%', textAlign: 'center', marginTop: 20 },
});
