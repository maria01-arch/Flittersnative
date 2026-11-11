import { useEffect, useState } from 'react';
import { Modal, View, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import Text from '@/components/AppText';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/ThemeContext';
import { addStickerToMyPack, findPackIdByUrl } from '@/lib/stickerActions';
import StickerMedia from './StickerMedia';

const VIDEO_EXT = /\.(webm|mp4|mov|m4v)($|[?#])/i;

type PackData = { id: string; name: string; owner_id: string; ownerName: string; stickers: { id: string; media_url: string }[] };

async function loadPack(packId: string): Promise<PackData | null> {
  const { data: pack } = await supabase.from('sticker_packs').select('id,name,owner_id').eq('id', packId).maybeSingle();
  if (!pack) return null;
  const [{ data: items }, { data: owner }] = await Promise.all([
    supabase.from('stickers').select('id,media_url').eq('pack_id', packId).order('created_at', { ascending: true }),
    supabase.from('profiles').select('display_name,username').eq('id', pack.owner_id).maybeSingle(),
  ]);
  return { ...pack, ownerName: owner?.display_name || owner?.username || 'Someone', stickers: items || [] } as PackData;
}

// The card shown in a chat when someone sends a sticker pack: the pack's name,
// who made it, a small preview of its stickers and a "View pack" button.
export default function StickerPackCard({ packId, currentUserId, isMine, onLongPress }: { packId: string; currentUserId?: string; isMine?: boolean; onLongPress?: () => void }) {
  const { colors } = useTheme();
  const [pack, setPack] = useState<PackData | null | undefined>(undefined);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadPack(packId).then((p) => !cancelled && setPack(p)).catch(() => !cancelled && setPack(null));
    return () => {
      cancelled = true;
    };
  }, [packId]);

  if (pack === undefined) {
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, height: 150, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (pack === null) {
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 16 }]}>
        <Text style={{ color: colors.subtext }}>This sticker pack isn't available anymore.</Text>
      </View>
    );
  }
  const many = pack.stickers.length > 9;
  const preview = many ? pack.stickers.slice(0, 8) : pack.stickers.slice(0, 9);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} onLongPress={onLongPress} delayLongPress={220} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.head}>
          <View style={[styles.badge, { backgroundColor: colors.primary + '26' }]}>
            <Ionicons name="albums" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{pack.name}</Text>
            <Text style={{ color: colors.subtext, fontSize: 12 }} numberOfLines={1}>
              by {pack.ownerName} · {pack.stickers.length} {pack.stickers.length === 1 ? 'sticker' : 'stickers'}
            </Text>
          </View>
        </View>
        <View style={styles.grid}>
          {preview.map((s) => (
            <View key={s.id} style={[styles.tile, { backgroundColor: colors.inputBg }]}>
              {VIDEO_EXT.test(s.media_url) ? (
                <Ionicons name="film-outline" size={22} color={colors.faint} />
              ) : (
                <Image source={{ uri: s.media_url }} style={{ width: '82%', height: '82%' }} contentFit="contain" />
              )}
            </View>
          ))}
          {many && (
            <View style={[styles.tile, { backgroundColor: colors.inputBg }]}>
              <Text style={{ color: colors.subtext, fontWeight: '800' }}>+{pack.stickers.length - 8}</Text>
            </View>
          )}
        </View>
        <View style={[styles.btn, { backgroundColor: colors.primary }]}>
          <Text style={styles.btnText}>View pack</Text>
        </View>
      </Pressable>
      <StickerPackSheet visible={open} packId={packId} me={currentUserId} onClose={() => setOpen(false)} />
    </>
  );
}

// The full pack: every sticker, and a Save button on each (one at a time).
export function StickerPackSheet({ visible, packId, stickerUrl, me, onClose }: { visible: boolean; packId?: string | null; stickerUrl?: string | null; me?: string; onClose: () => void }) {
  const { colors } = useTheme();
  const [pack, setPack] = useState<PackData | null | undefined>(undefined);
  const [saved, setSaved] = useState<Record<string, 'saving' | 'done' | 'limit'>>({});

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setPack(undefined);
    setSaved({});
    (async () => {
      const id = packId || (stickerUrl ? await findPackIdByUrl(stickerUrl) : null);
      const p = id ? await loadPack(id) : null;
      if (!cancelled) setPack(p);
    })().catch(() => !cancelled && setPack(null));
    return () => {
      cancelled = true;
    };
  }, [visible, packId, stickerUrl]);

  const save = async (s: { id: string; media_url: string }) => {
    if (!me || saved[s.id] === 'saving') return;
    setSaved((m) => ({ ...m, [s.id]: 'saving' }));
    const r = await addStickerToMyPack(me, s.media_url);
    setSaved((m) => {
      const n = { ...m };
      if (r.status === 'added' || r.status === 'exists') n[s.id] = 'done';
      else if (r.status === 'limit') n[s.id] = 'limit';
      else delete n[s.id];
      return n;
    });
  };

  const mine = !!pack && pack.owner_id === me;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View style={styles.sheetHead}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetTitle, { color: colors.text }]} numberOfLines={1}>{pack ? pack.name : 'Sticker pack'}</Text>
              {!!pack && <Text style={{ color: colors.subtext, fontSize: 12 }}>by {pack.ownerName} · {pack.stickers.length} stickers</Text>}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={colors.subtext} />
            </TouchableOpacity>
          </View>
          {pack === undefined ? (
            <ActivityIndicator style={{ marginVertical: 40 }} color={colors.primary} />
          ) : pack === null ? (
            <Text style={{ color: colors.subtext, textAlign: 'center', margin: 30 }}>This pack isn't available.</Text>
          ) : (
            <>
              {!mine && <Text style={{ color: colors.faint, fontSize: 12, paddingHorizontal: 16, paddingBottom: 8 }}>Tap a sticker to save it to your stickers. Free accounts: 20 a day. Verified: unlimited.</Text>}
              <ScrollView contentContainerStyle={styles.sheetGrid}>
                {pack.stickers.slice(0, 80).map((s) => {
                  const st = saved[s.id];
                  return (
                    <TouchableOpacity key={s.id} disabled={mine} activeOpacity={0.8} onPress={() => save(s)} style={[styles.sheetTile, { backgroundColor: colors.inputBg }]}>
                      <StickerMedia url={s.media_url} size={72} />
                      {!mine && (
                        <View style={[styles.saveDot, { backgroundColor: st === 'done' ? '#22C55E' : st === 'limit' ? '#EF4444' : colors.primary }]}>
                          {st === 'saving' ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name={st === 'done' ? 'checkmark' : st === 'limit' ? 'close' : 'add'} size={14} color="#fff" />}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {Object.values(saved).includes('limit') && <Text style={{ color: '#EF4444', textAlign: 'center', paddingBottom: 12 }}>Daily limit reached (free accounts). Verified members save unlimited.</Text>}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: { width: 250, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth * 2, padding: 12, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  badge: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 6 },
  tile: { width: '31.5%', aspectRatio: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  btn: { marginTop: 12, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '78%', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 14, paddingBottom: 20 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10, gap: 10 },
  sheetTitle: { fontSize: 18, fontWeight: '800' },
  sheetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 14, paddingBottom: 10 },
  sheetTile: { width: 78, height: 78, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveDot: { position: 'absolute', right: 3, bottom: 3, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
