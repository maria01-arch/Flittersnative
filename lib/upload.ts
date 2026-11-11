import { SITE_URL } from '@/lib/siteConfig';
import { supabase } from './supabase';
import { Image as RNImage } from 'react-native';
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
    result = await FileSystem.uploadAsync(SITE_URL + '/api/upload/image', uri, {
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

// Phone photos are 3000–4000px wide and 3–6MB. A feed shows them about 400px
// wide, so every viewer was downloading ~10x more picture than the screen can
// even display — the biggest single source of data use in the app. Every
// image is now shrunk on the phone BEFORE upload (profile pictures 512px,
// everything else 1280px, JPEG quality 72), which typically lands at
// 100–250KB. Animated GIFs are left alone (re-saving would freeze them).
// If shrinking fails for any reason the original is uploaded instead, so a
// post can never be blocked by this step.
const IMAGE_MAX_SIDE = 1280;
const AVATAR_MAX_SIDE = 512;
const IMAGE_QUALITY = 0.72;

function imageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => RNImage.getSize(uri, (width, height) => resolve({ width, height }), reject));
}

export async function shrinkImage(uri: string, maxSide: number): Promise<string> {
  try {
    const { width, height } = await imageSize(uri);
    const resize = Math.max(width, height) > maxSide ? (width >= height ? { width: maxSide } : { height: maxSide }) : null;
    const mod: any = await import('expo-image-manipulator');
    const format = mod.SaveFormat?.JPEG ?? 'jpeg';
    if (mod.ImageManipulator?.manipulate) {
      const ctx = mod.ImageManipulator.manipulate(uri);
      if (resize) ctx.resize(resize);
      const rendered = await ctx.renderAsync();
      const saved = await rendered.saveAsync({ compress: IMAGE_QUALITY, format });
      return saved.uri;
    }
    if (mod.manipulateAsync) {
      const out = await mod.manipulateAsync(uri, resize ? [{ resize }] : [], { compress: IMAGE_QUALITY, format });
      return out.uri;
    }
  } catch (err) {
    console.warn('[Upload] could not shrink image, uploading the original:', err);
  }
  return uri;
}

export async function uploadImage(uri: string, folder: string): Promise<string | null> {
  const filename = uri.split('/').pop() || `${Date.now()}.jpg`;
  let ext = (filename.split('.').pop() || 'jpg').toLowerCase();
  let sendUri = uri;
  if (ext !== 'gif') {
    sendUri = await shrinkImage(uri, folder.startsWith('avatars') ? AVATAR_MAX_SIDE : IMAGE_MAX_SIDE);
    if (sendUri !== uri) ext = 'jpg';
  }
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  return uploadFile(sendUri, path, MIME_BY_EXT[ext] || 'image/jpeg');
}

// Voice notes always come out of expo-audio as .m4a (see RecordingPresets.HIGH_QUALITY).
export async function uploadVoiceNote(uri: string, waveform?: string): Promise<string | null> {
  const path = `voice/${Date.now()}_${Math.random().toString(36).slice(2)}.m4a`;
  const url = await uploadFile(uri, path, 'audio/mp4');
  // The waveform rides on the address (?wf=...) — the file is served the
  // same either way, and old/web voice notes simply have none.
  return url && waveform ? `${url}?wf=${waveform}` : url;
}

const VIDEO_MIME_BY_EXT: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  '3gp': 'video/3gpp',
  webm: 'video/webm',
};

// ---------------------------------------------------------------------
// Videos: chunked upload, same protocol as the webapp.
//
// The old way sent the whole video in ONE request to /api/upload/image,
// but the hosting platform rejects any single request over ~4.5 MB — so any
// real video failed. Now the file is cut into 3 MB pieces. Each piece goes
// to /api/upload/video-chunk, then /api/upload/video-finish stitches them
// together and returns the public URL.
//
// Reading one piece of a big file without loading the whole thing into
// memory: the new expo-file-system File/FileHandle API is tried first, and
// the older base64 range-read is the fallback. Either way the size of what
// was read is checked, so a wrong read fails loudly instead of uploading a
// corrupted video.
// ---------------------------------------------------------------------
const API_BASE = SITE_URL;
const CHUNK_SIZE = 3 * 1024 * 1024; // multiple of 3 so base64 pieces line up
const CHUNK_RETRIES = 3;

async function readChunkBytes(uri: string, position: number, length: number): Promise<{ b64?: string; bytes?: Uint8Array }> {
  try {
    const fsNew: any = await import('expo-file-system');
    if (fsNew?.File) {
      const handle = new fsNew.File(uri).open();
      try {
        handle.offset = position;
        const bytes: Uint8Array = handle.readBytes(length);
        if (bytes && bytes.length === length) return { bytes };
      } finally {
        try {
          handle.close();
        } catch {}
      }
    }
  } catch (err) {
    console.warn('[Upload] new file API read failed, falling back:', err);
  }
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64, position, length });
  // base64 length for N bytes is 4 * ceil(N / 3), minus padding — allow that.
  const expected = Math.ceil(length / 3) * 4;
  if (!b64 || b64.length > expected + 4 || b64.length < expected - 4) {
    throw new Error('This phone could not read the video in pieces.');
  }
  return { b64 };
}

async function sendChunk(uri: string, uploadId: string, index: number, position: number, length: number, token: string) {
  const tmp = `${FileSystem.cacheDirectory}chunk_${uploadId}_${index}.part`;
  try {
    const piece = await readChunkBytes(uri, position, length);
    if (piece.bytes) {
      const fsNew: any = await import('expo-file-system');
      const f = new fsNew.File(tmp);
      if (!f.exists) f.create();
      f.write(piece.bytes);
    } else {
      await FileSystem.writeAsStringAsync(tmp, piece.b64 as string, { encoding: FileSystem.EncodingType.Base64 });
    }
    const res = await FileSystem.uploadAsync(`${API_BASE}/api/upload/video-chunk`, tmp, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'chunk',
      mimeType: 'application/octet-stream',
      parameters: { uploadId, index: String(index) },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status < 200 || res.status >= 300) throw new Error(`Part ${index + 1} failed (${res.status})`);
  } finally {
    FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {});
  }
}

export async function uploadVideo(uri: string, folder: string, onProgress?: (fraction: number) => void): Promise<string | null> {
  const filename = uri.split('/').pop() || `${Date.now()}.mp4`;
  const ext = (filename.split('.').pop() || 'mp4').toLowerCase();
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const contentType = VIDEO_MIME_BY_EXT[ext] || 'video/mp4';

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    console.error('[Upload] no auth session — user is not logged in?');
    return null;
  }

  try {
    const info: any = await FileSystem.getInfoAsync(uri);
    const size: number = info?.size || 0;
    if (!size) throw new Error('Could not read the video file.');

    const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`.replace(/[^a-zA-Z0-9_-]/g, '');
    const totalChunks = Math.max(1, Math.ceil(size / CHUNK_SIZE));

    for (let i = 0; i < totalChunks; i++) {
      const position = i * CHUNK_SIZE;
      const length = Math.min(CHUNK_SIZE, size - position);
      let lastErr: any;
      for (let attempt = 1; attempt <= CHUNK_RETRIES; attempt++) {
        try {
          await sendChunk(uri, uploadId, i, position, length, token);
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          console.warn(`[Upload] chunk ${i + 1}/${totalChunks} attempt ${attempt} failed:`, err);
          await new Promise((r) => setTimeout(r, 600 * attempt));
        }
      }
      if (lastErr) throw lastErr;
      onProgress?.((i + 1) / (totalChunks + 1));
    }

    const finishRes = await fetch(`${API_BASE}/api/upload/video-finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ uploadId, totalChunks, path, contentType }),
    });
    const finishJson = await finishRes.json().catch(() => ({}));
    if (!finishRes.ok || !finishJson.publicUrl) throw new Error(finishJson.error || `Could not finish the video upload (${finishRes.status})`);
    onProgress?.(1);
    return finishJson.publicUrl as string;
  } catch (err) {
    console.error('[Upload] video upload failed:', err);
    return null;
  }
}

// Stickers reuse the same 'avatars' R2 bucket under a stickers/ prefix —
// matches the webapp, which stores its own user-uploaded stickers the same
// way (see SphereApp.js StickerTray). userId is folded into the path so
// two people's stickers never collide.
const STICKER_MIME_BY_EXT: Record<string, string> = { ...MIME_BY_EXT, ...VIDEO_MIME_BY_EXT };

export async function uploadSticker(uri: string, userId: string): Promise<string | null> {
  const filename = uri.split('/').pop() || `${Date.now()}.jpg`;
  const ext = (filename.split('.').pop() || 'jpg').toLowerCase();
  const path = `stickers/${userId}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  return uploadFile(uri, path, STICKER_MIME_BY_EXT[ext] || 'image/jpeg');
}
