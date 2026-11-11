import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

const BARS = 40;

// Turns the loudness readings taken while recording into BARS characters
// (0-9 then a-z, i.e. 36 levels each) that ride along on the voice note's
// web address as ?wf=... — so every phone can draw the real waveform later
// without a new database column, and the webapp just ignores the extra
// part of the address.
export function encodeWaveform(samples: number[]): string | undefined {
  if (samples.length < 3) return undefined;
  const out: string[] = [];
  for (let i = 0; i < BARS; i++) {
    const from = Math.floor((i * samples.length) / BARS);
    const to = Math.max(from + 1, Math.floor(((i + 1) * samples.length) / BARS));
    let peak = 0;
    for (let k = from; k < to && k < samples.length; k++) peak = Math.max(peak, samples[k]);
    out.push(Math.round(Math.min(1, peak) * 35).toString(36));
  }
  return out.join('');
}

// Tap-to-record voice notes for DMs + group chat. Mirrors the web app's
// recorder: tap to start, tap to stop, explicit cancel button.
// Metering is on, so while recording `levels` holds the last 40 loudness
// readings (0..1) for the live waveform, and stop() returns the encoded
// waveform of the whole recording.
export function useVoiceRecorder() {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const state = useAudioRecorderState(recorder, 100);
  const seconds = Math.round((state.durationMillis || 0) / 1000);
  const samples = useRef<number[]>([]);
  const [levels, setLevels] = useState<number[]>([]);

  // One reading per poll while recording. Metering is in decibels
  // (-160 silence … 0 max); anything quieter than -55 is treated as silence.
  useEffect(() => {
    if (!state.isRecording) return;
    const db = typeof state.metering === 'number' ? state.metering : -160;
    const level = Math.max(0, Math.min(1, (db + 55) / 55));
    samples.current.push(level);
    setLevels((prev) => [...prev.slice(-(BARS - 1)), level]);
  }, [state.durationMillis]);

  const start = useCallback(async () => {
    const current = await AudioModule.getRecordingPermissionsAsync();
    const granted = current.granted || (await AudioModule.requestRecordingPermissionsAsync()).granted;
    if (!granted) return false;
    samples.current = [];
    setLevels([]);
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    return true;
  }, [recorder]);

  const stop = useCallback(async () => {
    if (!recorder.isRecording) return null;
    const finalSeconds = Math.max(1, Math.round(recorder.currentTime || 0));
    await recorder.stop();
    // The audio session stays in "recording" mode after stop() — which can
    // silently prevent playback. Reset it right away so voice notes play.
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    const uri = recorder.uri;
    return uri ? { uri, duration: finalSeconds, waveform: encodeWaveform(samples.current) } : null;
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

  return { recording: state.isRecording, seconds, levels, start, stop, cancel };
}
