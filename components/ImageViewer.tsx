import { useState } from 'react';
import { Modal, View, Image, Pressable, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { saveMediaWithAlert } from '@/lib/download';

// Full-screen picture with a Save button (to the phone's gallery) and a close button.
export default function ImageViewer({ uri, onClose }: { uri: string | null | undefined; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving || !uri) return;
    setSaving(true);
    await saveMediaWithAlert(uri, 'image');
    setSaving(false);
  };
  return (
    <Modal visible={!!uri} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {!!uri && <Image source={{ uri }} style={styles.image} resizeMode="contain" />}
      </Pressable>
      <View style={[styles.bar, { top: insets.top + 10 }]} pointerEvents="box-none">
        <TouchableOpacity style={styles.btn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={save} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="download-outline" size={22} color="#fff" />}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  bar: { position: 'absolute', left: 14, right: 14, flexDirection: 'row', justifyContent: 'space-between' },
  btn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
});
