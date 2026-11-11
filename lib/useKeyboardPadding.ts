import { useEffect } from 'react';
import { Keyboard } from 'react-native';
import { useAnimatedKeyboard, useAnimatedReaction, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

// Android: the bottom padding of a chat = keyboard height while it is up
// (smoothly animated), or the phone's navigation-bar height when it is down.
//
// The animated keyboard value is shared by the whole app, and it can keep an
// OLD height after you leave a chat with the keyboard open — the next chat
// then opened with an empty gap where the keyboard should be.
//
// So a height is only trusted after THIS screen has seen a keyboard really
// open (the keyboard starts opening, or the system says one is showing). Until
// then, and again as soon as the keyboard closes, the height counts as zero.
export function useKeyboardPadding(bottomInset: number) {
  const kb = useAnimatedKeyboard();
  // 1 = ignore the shared height (no keyboard really showing)
  const ignore = useSharedValue(Keyboard.isVisible() ? 0 : 1);

  // Keyboard states: 1 = opening, 2 = open, 3 = closing, 4 = closed.
  useAnimatedReaction(
    () => kb.state.value,
    (state) => {
      if (state === 1) ignore.value = 0;
      else if (state === 4) ignore.value = 1;
    }
  );

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      ignore.value = 0;
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      ignore.value = 1;
    });
    // Safety net while the chat is open: if the system says there is no
    // keyboard but a height is still being applied, drop it.
    const timer = setInterval(() => {
      if (!Keyboard.isVisible() && ignore.value === 0 && kb.state.value !== 1) ignore.value = 1;
    }, 700);
    return () => {
      clearInterval(timer);
      show.remove();
      hide.remove();
      // Leaving the chat: close the keyboard so nothing is left open behind.
      Keyboard.dismiss();
    };
  }, []);

  return useAnimatedStyle(() => ({
    paddingBottom: Math.max(ignore.value ? 0 : kb.height.value, bottomInset),
  }));
}
