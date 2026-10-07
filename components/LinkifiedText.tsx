import { Text, TextStyle, StyleProp } from 'react-native';
import { usePreferences } from '@/lib/PreferencesContext';
import { openLink } from '@/lib/openLink';

const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

export default function LinkifiedText({
  text,
  style,
  linkColor,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  linkColor: string;
}) {
  const { browserEngine } = usePreferences();
  const parts = (text || '').split(URL_REGEX);

  return (
    <Text style={style}>
      {parts.map((part, i) => {
        if (URL_REGEX.test(part)) {
          URL_REGEX.lastIndex = 0;
          const url = part.startsWith('http') ? part : `https://${part}`;
          return (
            <Text key={i} style={{ color: linkColor, textDecorationLine: 'underline' }} onPress={() => openLink(url, browserEngine)}>
              {part}
            </Text>
          );
        }
        return part;
      })}
    </Text>
  );
}
