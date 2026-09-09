import { Text, Linking, TextStyle, StyleProp } from 'react-native';

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
  const parts = (text || '').split(URL_REGEX);

  return (
    <Text style={style}>
      {parts.map((part, i) => {
        if (URL_REGEX.test(part)) {
          URL_REGEX.lastIndex = 0;
          const url = part.startsWith('http') ? part : `https://${part}`;
          return (
            <Text
              key={i}
              style={{ color: linkColor, textDecorationLine: 'underline' }}
              onPress={() => Linking.openURL(url).catch(() => {})}
            >
              {part}
            </Text>
          );
        }
        return part;
      })}
    </Text>
  );
}
