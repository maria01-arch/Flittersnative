import { useCallback, useEffect, useRef, useState } from 'react';
import { View, FlatList, ActivityIndicator, Dimensions, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import ReelItem from '@/components/ReelItem';
import { Alert } from 'react-native';

const { height: SCREEN_H } = Dimensions.get('window');

export default function ReelsScreen() {
  const { session } = useAuth();
  const [reels, setReels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [tabFocused, setTabFocused] = useState(false);
  const mounted = useRef(true);

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
      .select('*,author:profiles(id,display_name,username,avatar_url),reel_likes(user_id)')
      .order('created_at', { ascending: false })
      .limit(30);
    if (!mounted.current) return;
    setReels(
      (data || []).map((r: any) => ({
        ...r,
        likes_count: r.reel_likes?.length || 0,
        liked_by_me: r.reel_likes?.some((l: any) => l.user_id === session?.user?.id) || false,
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
    <View style={styles.container}>
      <FlatList
        data={reels}
        keyExtractor={(item) => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={SCREEN_H}
        decelerationRate="fast"
        renderItem={({ item, index }) => <ReelItem reel={item} active={tabFocused && index === activeIndex} isMine={item.user_id === session?.user?.id} onLike={toggleLike} onDelete={deleteReel} />}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
});
