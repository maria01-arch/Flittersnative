import { TextStyle, StyleProp } from 'react-native';
import Text from '@/components/AppText';
import { router } from 'expo-router';
import { usePreferences } from '@/lib/PreferencesContext';
import { openLink } from '@/lib/openLink';
import { openFlittersLink } from '@/lib/flittersLinks';

// Links, #hashtags and @mentions. A hashtag opens that tag's posts; a mention
// opens that person's profile. "#" / "@" only count at the start of a word, so
// "a@b.com" and "page#2" aren't treated as tags.
const TOKEN_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+|(?<![\w])#[A-Za-z0-9_]{1,50}|(?<![\w])@[A-Za-z0-9_]{2,30})/gi;

export default function LinkifiedText({
  text,
  style,
  linkColor,
  numberOfLines,
  onTextLayout,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  linkColor: string;
  numberOfLines?: number;
  onTextLayout?: (e: any) => void;
}) {
  const { browserEngine } = usePreferences();
  const parts = (text || '').split(TOKEN_REGEX);

  return (
    <Text style={style} numberOfLines={numberOfLines} onTextLayout={onTextLayout}>
      {parts.map((part, i) => {
        if (!part) return null;
        if (/^(https?:\/\/|www\.)/i.test(part)) {
          const url = part.startsWith('http') ? part : `https://${part}`;
          return (
            <Text key={i} style={{ color: linkColor, textDecorationLine: 'underline' }} onPress={() => { if (!openFlittersLink(url)) openLink(url, browserEngine); }}>
              {part}
            </Text>
          );
        }
        if (/^#[A-Za-z0-9_]+$/.test(part)) {
          return (
            <Text key={i} style={{ color: linkColor, fontWeight: '600' }} onPress={() => router.push({ pathname: '/hashtag/[tag]', params: { tag: part.slice(1) } })}>
              {part}
            </Text>
          );
        }
        if (/^@[A-Za-z0-9_]+$/.test(part)) {
          // @flittersai is the AI assistant, not a profile.
          if (part.toLowerCase() === '@flittersai' || part.toLowerCase() === '@all') return <Text key={i} style={{ color: linkColor, fontWeight: '600' }}>{part}</Text>;
          return (
            <Text key={i} style={{ color: linkColor, fontWeight: '600' }} onPress={() => router.push({ pathname: '/u/[username]', params: { username: part.slice(1) } })}>
              {part}
            </Text>
          );
        }
        return part;
      })}
    </Text>
  );
}
