import { forwardRef } from 'react';
import { TextInput, TextInputProps, StyleSheet } from 'react-native';

// A TextInput that accepts images pasted from the keyboard (Gboard clipboard
// tab / image suggestions) — the input bar stops saying it "doesn't support
// images". Uses the native expo-paste-input package. If that package is not
// in the installed app (Expo Go, or a build made before it was added) this
// is just a normal TextInput, so nothing breaks.
let Wrapper: any = null;
try {
  // The JS package can be installed while the phone's app was built WITHOUT its
  // native part — using it then crashes the screen ("Can't find ViewManager").
  // So the native side is checked first.
  const core = require('expo-modules-core');
  const native = core?.requireOptionalNativeModule ? core.requireOptionalNativeModule('ExpoPasteInput') : null;
  if (native) {
    const mod = require('expo-paste-input');
    Wrapper = mod?.TextInputWrapper || mod?.PasteInputWrapper || null;
  }
} catch {
  Wrapper = null;
}

type Props = TextInputProps & { onPasteImage?: (uri: string) => void };

const PasteTextInput = forwardRef<TextInput, Props>(function PasteTextInput({ onPasteImage, style, ...rest }, ref) {
  if (!Wrapper || !onPasteImage) return <TextInput ref={ref} style={style} {...rest} />;
  // The wrapper takes the row space (flex); the input just fills it.
  const flat: any = StyleSheet.flatten(style) || {};
  const { flex, flexGrow, flexShrink, flexBasis, ...inner } = flat;
  const outer: any = {};
  if (flex !== undefined) outer.flex = flex;
  if (flexGrow !== undefined) outer.flexGrow = flexGrow;
  if (flexShrink !== undefined) outer.flexShrink = flexShrink;
  if (flexBasis !== undefined) outer.flexBasis = flexBasis;
  return (
    <Wrapper
      style={outer}
      onPaste={(event: any) => {
        try {
          if (event?.type === 'images' && event.uris?.length) onPasteImage(event.uris[0]);
        } catch {}
      }}
    >
      <TextInput ref={ref} style={inner} {...rest} />
    </Wrapper>
  );
});

export default PasteTextInput;
