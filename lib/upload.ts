import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system/legacy';

// Shared by uploadImage and uploadVoiceNote — same endpoint handles both,
// it just writes whatever bytes+path it's given to R2 (see the webapp's
// /api/upload/image route, which is content-type agnostic despite the name).
//
// This used to read the local file with fetch(uri).blob() and send it via
// FormData. That turned out to be unreliable in this RN environment — the
// voice note investigation found fetch() reading back something like the
// literal text "File not found" instead of actual file bytes, and the
// exact same failure mode is now confirmed for freshly-posted images too
// ("[PostCard] image failed to load ... unknown image format" — a
// corrupted/wrong-format upload, not a network issue). React Native's own
// console even warns that `Response.blob()` is running on a limited
// polyfill. So both paths now go through expo-file-system's uploadAsync(),
// which hands the local URI straight to native code — the real bytes are
// read and streamed into the multipart request by the OS, never passing
// through a JS Blob at all.
async function uploadFile(uri: string, path: string, mimeType: string): Promise<string | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    console.error('[Upload] no auth session — user is not logged in?');
    return null;
  }

  let info: FileSystem.FileInfo;
  try {
    info = await FileSystem.getInfoAsync(uri);
  } catch (err) {
    console.error('[Upload] could not stat local file at', uri, err);
    return null;
  }
  if (!info.exists || !info.size) {
    console.error('[Upload] local file missing or empty at', uri, info);
    return null;
  }

  let result: FileSystem.FileSystemUploadResult;
  try {
    result = await FileSystem.uploadAsync('https://xchord.space/api/upload/image', uri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      mimeType,
      parameters: { path },
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    console.error('[Upload] FileSystem.uploadAsync threw:', err);
    return null;
  }

  if (result.status < 200 || result.status >= 300) {
    console.error('[Upload] upload rejected, status:', result.status, result.body);
    return null;
  }

  let json: any;
  try {
    json = JSON.parse(result.body);
  } catch {
    console.error('[Upload] response was not JSON:', result.body);
    return null;
  }
  if (!json?.publicUrl) {
    console.error('[Upload] response had no publicUrl field:', result.body);
    return null;
  }

  // Diagnostic: immediately re-fetch the headers of the file we just
  // uploaded, so any future report includes real server-side facts
  // (status/type/size) instead of guessing.
  try {
    const head = await fetch(json.publicUrl, { method: 'HEAD' });
    console.error(
      `[Upload] verify — local file was ${info.size} bytes (${mimeType}) → server reports status ${head.status}, content-type "${head.headers.get('content-type')}", content-length ${head.headers.get('content-length')} at ${json.publicUrl}`
    );
  } catch (err) {
    console.error('[Upload] verify HEAD request failed for', json.publicUrl, err);
  }

  return json.publicUrl;
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
};

export async function uploadImage(uri: string, folder: string): Promise<string | null> {
  const filename = uri.split('/').pop() || `${Date.now()}.jpg`;
  const ext = (filename.split('.').pop() || 'jpg').toLowerCase();
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  return uploadFile(uri, path, MIME_BY_EXT[ext] || 'image/jpeg');
}

// Voice notes always come out of expo-audio as .m4a (see RecordingPresets.HIGH_QUALITY).
export async function uploadVoiceNote(uri: string): Promise<string | null> {
  const path = `voice/${Date.now()}_${Math.random().toString(36).slice(2)}.m4a`;
  return uploadFile(uri, path, 'audio/mp4');
}

const VIDEO_MIME_BY_EXT: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  '3gp': 'video/3gpp',
  webm: 'video/webm',
};

export async function uploadVideo(uri: string, folder: string): Promise<string | null> {
  const filename = uri.split('/').pop() || `${Date.now()}.mp4`;
  const ext = (filename.split('.').pop() || 'mp4').toLowerCase();
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  return uploadFile(uri, path, VIDEO_MIME_BY_EXT[ext] || 'video/mp4');
}
