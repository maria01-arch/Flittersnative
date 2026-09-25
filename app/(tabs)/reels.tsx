import { useCallback, useEffect, useRef, useState } from 'react';
import { View, FlatList, ActivityIndicator, StyleSheet, LayoutChangeEvent } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import ReelItem from '@/components/ReelItem';
import { Alert } from 'react-native';

export default function ReelsScreen() {
  const { session } = useAuth();
  const [reels, setReels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [tabFocused, setTabFocused] = useState(false);
  const mounted = useRef(true);
  // Measured from the actual container, not Dimensions.get('window') — with
  // edge-to-edge enabled, the window dimension doesn't reliably match what
  // this View is actually laid out at, and that mismatch is exactly what
  // was making reels appear letterboxed/misaligned: FlatList was paging by
  // a height the video wasn't actually filling.
  const [pageHeight, setPageHeight] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && h !== pageHeight) setPageHeight(h);
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      setTabFocused(true);
      return () => setTabFocused(false);
    }, [])
  );

  const load = async () => {
    const { data } = await supabase
      .from('reels')
      .select('*,author:profiles(id,display_name,username,avatar_url,verified,is_authentic),reel_likes(user_id),comments(id)')
      .order('created_at', { ascending: false })
      .limit(30);
    if (!mounted.current) return;
    setReels(
      (data || []).map((r: any) => ({
        ...r,
        likes_count: r.reel_likes?.length || 0,
        liked_by_me: r.reel_likes?.some((l: any) => l.user_id === session?.user?.id) || false,
        comments_count: r.comments?.length || 0,
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggleLike = async (reel: any) => {
    if (!session?.user?.id) return;
    setReels((prev) =>
      prev.map((r) =>
        r.id === reel.id ? { ...r, liked_by_me: !r.liked_by_me, likes_count: r.liked_by_me ? r.likes_count - 1 : r.likes_count + 1 } : r
      )
    );
    if (reel.liked_by_me) {
      await supabase.from('reel_likes').delete().eq('reel_id', reel.id).eq('user_id', session.user.id);
    } else {
      await supabase.from('reel_likes').insert({ reel_id: reel.id, user_id: session.user.id });
    }
  };

  const deleteReel = (reel: any) => {
    Alert.alert('Delete reel', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setReels((prev) => prev.filter((r) => r.id !== reel.id));
          await supabase.from('reels').delete().eq('id', reel.id).eq('user_id', session?.user?.id);
        },
      },
    ]);
  };

  const bumpCommentCount = (reel: any) => {
    setReels((prev) => prev.map((r) => (r.id === reel.id ? { ...r, comments_count: (r.comments_count || 0) + 1 } : r)));
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (!mounted.current) return;
    if (viewableItems.length > 0) setActiveIndex(viewableItems[0].index ?? 0);
  }).current;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <View style={styles.container} onLayout={onLayout}>
      {pageHeight > 0 && (
        <FlatList
          data={reels}
          keyExtractor={(item) => item.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={pageHeight}
          snapToAlignment="start"
          decelerationRate="fast"
          // Without this, a strong fast swipe can carry enough momentum to
          // sail past 2-3 snap points before the list settles — this locks
          // scrolling to exactly one page per gesture, however hard you flick.
          disableIntervalMomentum
          // Matches the measured height exactly, so FlatList's paging math
          // and each item's actual rendered size never disagree.
          getItemLayout={(_, index) => ({ length: pageHeight, offset: pageHeight * index, index })}
          renderItem={({ item, index }) => (
            <ReelItem
              reel={item}
              height={pageHeight}
              active={tabFocused && index === activeIndex}
              isMine={item.user_id === session?.user?.id}
              onLike={toggleLike}
              onDelete={deleteReel}
              onCommentPosted={bumpCommentCount}
            />
          )}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
});
