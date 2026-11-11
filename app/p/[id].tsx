import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

// The website shares posts as xchord.space/p/<id> (and a comment as
// xchord.space/p/<id>?c=<commentId>); the app's own screens live at /post/<id>
// and /comment/<id>. This hop makes those links land on the right screen.
export default function SharedPostLink() {
  const { id, c } = useLocalSearchParams<{ id: string; c?: string }>();
  useEffect(() => {
    if (!id) return;
    if (c) router.replace({ pathname: '/comment/[id]', params: { id: String(c), postId: String(id) } });
    else router.replace({ pathname: '/post/[id]', params: { id: String(id) } });
  }, [id, c]);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator />
    </View>
  );
}
