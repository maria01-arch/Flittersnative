import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';
import { LEGAL_DOCS, Block, ListItem } from '@/lib/legalContent';

const PURPLE = '#A855F7';
const RED = '#FF4757';

function renderListItem(item: string | ListItem, i: number, color: string) {
  if (typeof item === 'string') {
    return (
      <Text key={i} style={[styles.liText, { color }]}>
        {'\u2022  '}
        {item}
      </Text>
    );
  }
  return (
    <Text key={i} style={[styles.liText, { color }]}>
      {'\u2022  '}
      {item.bold ? <Text style={styles.bold}>{item.bold} </Text> : null}
      {item.text}
    </Text>
  );
}

export default function LegalDocScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const { colors } = useTheme();
  const content = LEGAL_DOCS[doc as string];

  if (!content) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.subtext }}>That document doesn't exist.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: colors.text }]} numberOfLines={1}>
          {content.title}
        </Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.h1, { color: colors.text }]}>{content.title}</Text>
        <Text style={[styles.updated, { color: colors.faint }]}>{content.updated}</Text>

        {content.blocks.map((block: Block, i: number) => {
          if (block.type === 'h2') {
            return (
              <Text key={i} style={[styles.h2, { color: PURPLE }]}>
                {block.text}
              </Text>
            );
          }
          if (block.type === 'p') {
            return (
              <Text key={i} style={[styles.p, { color: colors.subtext }]}>
                {block.text}
              </Text>
            );
          }
          if (block.type === 'ul') {
            return (
              <View key={i} style={styles.ul}>
                {block.items.map((item, j) => renderListItem(item, j, colors.subtext))}
              </View>
            );
          }
          if (block.type === 'highlight') {
            const tone = block.tone === 'red' ? RED : PURPLE;
            return (
              <View key={i} style={[styles.highlight, { backgroundColor: tone + '14', borderColor: tone + '40' }]}>
                <Text style={[styles.highlightText, { color: block.tone === 'red' ? colors.text : tone }]}>{block.text}</Text>
              </View>
            );
          }
          return null;
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: spacing.lg,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  topBarTitle: { fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center', marginHorizontal: 8 },
  body: { maxWidth: 680, width: '100%', alignSelf: 'center', padding: spacing.lg, paddingBottom: 60 },
  h1: { fontSize: 26, fontWeight: '800', marginBottom: 6 },
  updated: { fontSize: 12, marginBottom: 28 },
  h2: { fontSize: 17, fontWeight: '700', marginTop: 26, marginBottom: 10 },
  p: { fontSize: 14.5, lineHeight: 22, marginBottom: 10 },
  ul: { marginBottom: 10 },
  liText: { fontSize: 14.5, lineHeight: 22, marginBottom: 6 },
  bold: { fontWeight: '700' },
  highlight: { marginTop: 32, padding: 16, borderRadius: 14, borderWidth: 1 },
  highlightText: { fontSize: 13, lineHeight: 20 },
});
