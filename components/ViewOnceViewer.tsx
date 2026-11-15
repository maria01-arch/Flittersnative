import { useScreenSecure } from '@/lib/screenSecure';
import { Modal, View, Image, TouchableOpacity, StyleSheet } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function ViewOnceVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls />;
}

// Full-screen look at a "view once" picture or video. Closing it is final: the
// message then shows "Opened" and can't be opened again.
export default function ViewOnceViewer({ message, onClose }: { message: any | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const isVideo = !!message?.video_url;
  useScreenSecure(!!message, 'flitters-view-once');
  return (
    <Modal visible={!!message} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        {!!message && (isVideo ? <ViewOnceVideo url={message.video_url} /> : <Image source={{ uri: message.image_url }} style={StyleSheet.absoluteFill} resizeMode="contain" />)}
        <View style={[styles.top, { paddingTop: insets.top + 10 }]}>
          <View style={styles.pill}>
            <Ionicons name="flame" size={14} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>View once</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
        {!!message?.content && (
          <View style={[styles.caption, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={{ color: '#fff', fontSize: 16, textAlign: 'center' }}>{message.content}</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10, backgroundColor: 'rgba(0,0,0,0.35)' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  caption: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 14, backgroundColor: 'rgba(0,0,0,0.45)' },
});
