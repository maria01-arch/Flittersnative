import { useCallback, useState } from 'react';
import { View, FlatList, Image, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import Text from '@/components/AppText';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import { useOnline } from '@/lib/useOnline';
import { spacing } from '@/lib/theme';
import { postTime } from '@/lib/timeAgo';
import { getSavedPosts, unsavePost, SavedPost } from '@/lib/savedPosts';
import LinkifiedText from '@/components/LinkifiedText';
import Avatar from '@/components/Avatar';
import VerifiedBadge from '@/components/VerifiedBadge';
import { fetchSavedAds, setAdSave, SavedAd } from '@/lib/adEngagement';
import { openLink } from '@/lib/openLink';
import { usePreferences } from '@/lib/PreferencesContext';

// Posts you saved to read offline. Everything on this page is read from the
// phone itself, so it opens with no connection.
export default function SavedPostsScreen() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const online = useOnline();
  const uid = session?.user?.id;
  const [items, setItems] = useState<SavedPost[]>([]);
  const [ready, setReady] = useState(false);
  const { browserEngine } = usePreferences();
  const [savedAds, setSavedAds] = useState<SavedAd[]>([]);

  const load = useCallback(() => {
    if (!uid) return;
    getSavedPosts(uid).then((l) => {
      setItems(l);
      setReady(true);
    });
    if (online) fetchSavedAds(uid).then(setSavedAds);
  }, [uid, online]);
  useFocusEffect(load);

  const unsaveAd = async (adId: string) => {
    if (!uid) return;
    setSavedAds((l) => l.filter((x) => x.ad?.id !== adId));
    if (!(await setAdSave(adId, uid, false))) load();
  };
  const openAd = (url?: string | null) => {
    if (!url) return;
    openLink(/^https?:\/\//i.test(url) ? url : `https://${url}`, browserEngine);
  };

  const remove = (id: string) => {
    if (!uid) return;
    Alert.alert('Remove from saved?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await unsavePost(uid, id);
          load();
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: SavedPost }) => {
    const p = item.post;
    const a = p.author || {};
    const img = p.localImage || p.localThumb || (online ? p.image_url || p.thumbnail_url : null);
    return (
      <TouchableOpacity
        activeOpacity={online ? 0.7 : 1}
        onPress={() => online && router.push(`/post/${p.id}`)}
        style={[styles.row, { borderBottomColor: colors.border }]}
      >
        <Avatar uri={p.localAvatar || (online ? a.avatar_url : null)} size={44} />
        <View style={{ flex: 1 }}>
          <View style={styles.head}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{a.display_name || 'Someone'}</Text>
            <VerifiedBadge verified={a.verified} isAuthentic={a.is_authentic} plan={a.verified_plan} size={13} />
            <Text style={{ color: colors.subtext, flexShrink: 1 }} numberOfLines={1}>@{a.username || 'unknown'} · {postTime(p.created_at)}</Text>
          </View>
          {!!p.content && <LinkifiedText text={p.content} style={{ color: colors.text, fontSize: 15, lineHeight: 21, marginTop: 4 }} linkColor={colors.primary} />}
          {!!img && <Image source={{ uri: img }} style={[styles.image, { backgroundColor: colors.border }]} resizeMode="cover" />}
          {!!p.video_url && <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 6 }}>Video post — the video itself isn't saved offline.</Text>}
          <Text style={{ color: colors.faint, fontSize: 12, marginTop: 6 }}>Saved · {postTime(new Date(item.savedAt).toISOString())}</Text>
        </View>
        <TouchableOpacity onPress={() => remove(String(p.id))} hitSlop={10}>
          <Ionicons name="bookmark" size={20} color={colors.primary} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {!online && (
        <View style={[styles.offline, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.subtext} />
          <Text style={{ color: colors.subtext, fontSize: 13 }}>You're offline — your saved posts still open here</Text>
        </View>
      )}
      <FlatList
        data={items}
        keyExtractor={(i) => String(i.post.id)}
        renderItem={renderItem}
        ListHeaderComponent={
          savedAds.length ? (
            <View>
              <Text style={{ color: colors.subtext, fontSize: 12, fontWeight: '800', letterSpacing: 0.5, paddingHorizontal: spacing.lg, paddingTop: 14 }}>SAVED ADS</Text>
              {savedAds.map((r) => r.ad && (
                <TouchableOpacity key={r.ad.id} activeOpacity={r.ad.link_url ? 0.7 : 1} onPress={() => openAd(r.ad!.link_url)} style={[styles.row, { borderBottomColor: colors.border }]}>
                  <Avatar uri={r.ad.advertiser_avatar_url} size={44} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.head}>
                      <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{r.ad.advertiser_name || 'Advertiser'}</Text>
                      <Text style={{ color: '#F7B731', fontSize: 10, fontWeight: '800' }}>SPONSORED</Text>
                    </View>
                    {!!r.ad.content && <Text style={{ color: colors.text, fontSize: 15, lineHeight: 21, marginTop: 4 }} numberOfLines={4}>{r.ad.content}</Text>}
                    {!!r.ad.image_url && <Image source={{ uri: r.ad.image_url }} style={[styles.image, { backgroundColor: colors.border }]} resizeMode="cover" />}
                  </View>
                  <TouchableOpacity onPress={() => unsaveAd(r.ad!.id)} hitSlop={10}>
                    <Ionicons name="bookmark" size={20} color={colors.primary} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
              {items.length ? <Text style={{ color: colors.subtext, fontSize: 12, fontWeight: '800', letterSpacing: 0.5, paddingHorizontal: spacing.lg, paddingTop: 14 }}>SAVED POSTS</Text> : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          ready && !savedAds.length ? (
            <View style={{ alignItems: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 8 }}>
              <Ionicons name="bookmark-outline" size={52} color={colors.faint} />
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>Nothing saved yet</Text>
              <Text style={{ color: colors.subtext, textAlign: 'center' }}>Tap the bookmark under a post to keep it here and read it without a connection.</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: spacing.lg, paddingVertical: 14, borderBottomWidth: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  image: { width: '100%', height: 200, borderRadius: 12, marginTop: 8 },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: spacing.lg, marginBottom: 4, padding: 10, borderRadius: 12, borderWidth: 1 },
});
