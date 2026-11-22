import { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import Text from '@/components/AppText';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import { giftInventory, fmtCoins, type GiftTop } from '@/lib/coins';

// A person's gift collection: every kind of gift they have received, most valuable first.
export default function GiftInventory() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams();
  const [data, setData] = useState<{ count: number; items: (GiftTop & { last_at: string })[] } | null>(null);

  useEffect(() => { if (id) giftInventory(String(id)).then(setData).catch(() => setData({ count: 0, items: [] })); }, [id]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.top, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18 }}>Gift collection</Text>
        <View style={{ width: 24 }} />
      </View>
      {!data ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : data.items.length === 0 ? (
        <View style={styles.center}><Text style={{ color: colors.subtext }}>No gifts yet.</Text></View>
      ) : (
        <FlatList
          data={data.items}
          numColumns={3}
          keyExtractor={(g) => g.name + g.emoji}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          columnWrapperStyle={{ gap: 10 }}
          ListHeaderComponent={<Text style={{ color: colors.subtext, fontWeight: '600', marginBottom: 12, marginHorizontal: 4 }}>{data.count} gift{data.count === 1 ? '' : 's'} received · {data.items.length} kind{data.items.length === 1 ? '' : 's'}</Text>}
          renderItem={({ item }) => (
            <View style={[styles.cell, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.count, { backgroundColor: colors.primary }]}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>×{item.n}</Text></View>
              <Text style={{ fontSize: 40 }}>{item.emoji}</Text>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13, marginTop: 6 }} numberOfLines={1}>{item.name}</Text>
              <Text style={{ color: colors.subtext, fontSize: 11.5, marginTop: 2 }}>🪙 {fmtCoins(item.cost)}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 54, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cell: { flex: 1 / 3, maxWidth: '32%', alignItems: 'center', borderWidth: 1, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 6, marginBottom: 10 },
  count: { position: 'absolute', top: 6, right: 6, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
});
