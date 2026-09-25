import { useCallback } from 'react';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

// Tap-to-record voice notes for DMs + group chat. Mirrors the web app's
// recorder: tap to start, tap to stop, explicit cancel button — not a
// WhatsApp-style press-and-hold, which needs careful drag tracking to feel
// right and is more fragile on a touch surface.
export function useVoiceRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const seconds = Math.round((state.durationMillis || 0) / 1000);

  const start = useCallback(async () => {
    const current = await AudioModule.getRecordingPermissionsAsync();
    const granted = current.granted || (await AudioModule.requestRecordingPermissionsAsync()).granted;
    if (!granted) return false;
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    return true;
  }, [recorder]);

  // Resolves with {uri, duration} once actually stopped — duration is read
  // from the recorder's own live currentTime, not the last polled state,
  // so it isn't off by up to 250ms.
  const stop = useCallback(async () => {
    if (!recorder.isRecording) return null;
    const finalSeconds = Math.max(1, Math.round(recorder.currentTime || 0));
    await recorder.stop();
    // The audio session stays in "recording" mode (allowsRecording: true)
    // after stop() — on both iOS and Android this can silently prevent
    // playback from producing any sound (no error, no crash, just
    // nothing audible) until the session is explicitly switched back.
    // Reset it right away so voice notes — including the one just
    // recorded — actually play.
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    const uri = recorder.uri;
    return uri ? { uri, duration: finalSeconds } : null;
  }, [recorder]);

  const cancel = useCallback(async () => {
    if (recorder.isRecording) {
      try {
        await recorder.stop();
      } catch {
        // already stopped/invalid — nothing to clean up
      }
    }
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
  }, [recorder]);

  return { recording: state.isRecording, seconds, start, stop, cancel };
}

