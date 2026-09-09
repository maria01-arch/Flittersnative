import { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Dimensions, Pressable } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { usePreferences } from '@/lib/PreferencesContext';

const { height: SCREEN_H } = Dimensions.get('window');

export default function ReelItem({
  reel,
  active,
  isMine,
  onLike,
  onDelete,
}: {
  reel: any;
  active: boolean;
  isMine?: boolean;
  onLike: (reel: any) => void;
  onDelete?: (reel: any) => void;
}) {
  const { autoplayVideos } = usePreferences();
  const [userPaused, setUserPaused] = useState(false);
  const player = useVideoPlayer(reel.video_url, (p) => {
    p.loop = true;
  });

  useEffect(() => {
    try {
      const shouldPlay = active && !userPaused && autoplayVideos;
      if (shouldPlay) player.play();
      else player.pause();
    } catch {}
  }, [active, userPaused, autoplayVideos, player]);

  useEffect(() => {
    if (!active) setUserPaused(false);
  }, [active]);

  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {}
    };
  }, [player]);

  const togglePlay = () => setUserPaused((p) => !p);

  return (
    <View style={styles.container}>
      <Pressable style={StyleSheet.absoluteFill} onPress={togglePlay}>
        <VideoView player={player} style={styles.video} contentFit="cover" nativeControls={false} />
        {(userPaused || !autoplayVideos) && (
          // paused indicator also shows when autoplay is off, so the user knows to tap
          <View style={styles.pausedOverlay}>
            <Ionicons name="play" size={56} color="rgba(255,255,255,0.9)" />
          </View>
        )}
      </Pressable>
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.bottomInfo}>
          <TouchableOpacity style={styles.authorRow} onPress={() => reel.author?.id && router.push(`/user/${reel.author.id}`)}>
            <Image
              source={{ uri: reel.author?.avatar_url || 'https://placehold.co/80x80/6C5CE7/fff?text=' + (reel.author?.display_name?.[0] || '?') }}
              style={styles.avatar}
            />
            <Text style={styles.authorName}>{reel.author?.display_name}</Text>
          </TouchableOpacity>
          {!!reel.caption && <Text style={styles.caption} numberOfLines={2}>{reel.caption}</Text>}
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => onLike(reel)}>
            <Ionicons name={reel.liked_by_me ? 'heart' : 'heart-outline'} size={30} color={reel.liked_by_me ? '#F91880' : '#fff'} />
            <Text style={styles.actionText}>{reel.likes_count || 0}</Text>
          </TouchableOpacity>
          {isMine && (
            <TouchableOpacity style={styles.actionBtn} onPress={() => onDelete && onDelete(reel)}>
              <Ionicons name="trash-outline" size={28} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', height: SCREEN_H, backgroundColor: '#000' },
  video: { width: '100%', height: '100%' },
  pausedOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'flex-end', padding: 16, paddingBottom: 110 },
  bottomInfo: { flex: 1, paddingRight: 60 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: '#fff' },
  authorName: { color: '#fff', fontWeight: '700', fontSize: 15 },
  caption: { color: '#fff', fontSize: 14, marginTop: 8, lineHeight: 19 },
  actions: { alignItems: 'center', gap: 22 },
  actionBtn: { alignItems: 'center', gap: 4 },
  actionText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
