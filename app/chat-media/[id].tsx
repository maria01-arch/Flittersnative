import { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, Linking } from 'react-native';
import Text from '@/components/AppText';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import { supabase } from '@/lib/supabase';
import { openFile, fileSizeText } from '@/lib/chatFiles';
import ImageViewer from '@/components/ImageViewer';

type Tab = 'media' | 'links' | 'docs';
const URL_RE = /https?:\/\/[^\s]+/gi;

// Everything shared in one chat, in three tabs.
export default function ChatMedia() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams();
  const [tab, setTab] = useState<Tab>('media');
  const [rows, setRows] = useState<any[] | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('messages').select('id,content,image_url,video_url,file_url,file_name,file_size,created_at,is_sticker,is_voice,view_once')
      .eq('conversation_id', String(id)).order('created_at', { ascending: false }).limit(500)
      .then(({ data }) => setRows(data || []));
  }, [id]);

  const media = (rows || []).filter((m) => (m.image_url || m.video_url) && !m.view_once && !m.is_sticker);
  const links = (rows || []).flatMap((m) => (String(m.content || '').match(URL_RE) || []).map((u) => ({ key: m.id + u, url: u, at: m.created_at })));
  const docs = (rows || []).filter((m) => m.file_url);
  const data: any[] = tab === 'media' ? media : tab === 'links' ? links : docs;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.top, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18 }}>Media, Links, Docs</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={styles.tabs}>
        {(['media', 'links', 'docs'] as Tab[]).map((t) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={[styles.tab, { borderBottomColor: tab === t ? colors.primary : 'transparent' }]}>
            <Text style={{ color: tab === t ? colors.text : colors.subtext, fontWeight: '700', textTransform: 'capitalize' }}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {!rows ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : data.length === 0 ? (
        <View style={styles.center}><Text style={{ color: colors.subtext }}>Nothing here yet.</Text></View>
      ) : tab === 'media' ? (
        <FlatList key="grid" data={data} numColumns={3} keyExtractor={(m) => m.id} contentContainerStyle={{ padding: 2 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={{ width: '33.333%', aspectRatio: 1, padding: 1 }} onPress={() => (item.image_url ? setViewing(item.image_url) : Linking.openURL(item.video_url).catch(() => {}))}>
              <Image source={{ uri: item.image_url || item.video_url }} style={{ flex: 1, backgroundColor: colors.card }} contentFit="cover" />
              {item.video_url ? <View style={styles.play}><Ionicons name="play" size={16} color="#fff" /></View> : null}
            </TouchableOpacity>
          )} />
      ) : tab === 'links' ? (
        <FlatList key="links" data={data} keyExtractor={(l) => l.key}
          renderItem={({ item }) => (
            <TouchableOpacity style={[styles.line, { borderBottomColor: colors.border }]} onPress={() => Linking.openURL(item.url).catch(() => {})}>
              <Ionicons name="link-outline" size={22} color={colors.primary} />
              <Text style={{ color: colors.primary, flex: 1 }} numberOfLines={2}>{item.url}</Text>
            </TouchableOpacity>
          )} />
      ) : (
        <FlatList key="docs" data={data} keyExtractor={(m) => m.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={[styles.line, { borderBottomColor: colors.border }]} onPress={() => openFile(item.file_url, item.file_name)}>
              <Ionicons name="document-text-outline" size={26} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '600' }} numberOfLines={1}>{item.file_name || 'File'}</Text>
                <Text style={{ color: colors.subtext, fontSize: 12 }}>{fileSizeText(item.file_size)}</Text>
              </View>
            </TouchableOpacity>
          )} />
      )}
      <ImageViewer uri={viewing} onClose={() => setViewing(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 54, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  tabs: { flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  play: { position: 'absolute', right: 6, bottom: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
});
