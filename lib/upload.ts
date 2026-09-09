import { supabase } from './supabase';

export async function uploadImage(uri: string, folder: string): Promise<string | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return null;

  const filename = uri.split('/').pop() || `${Date.now()}.jpg`;
  const ext = (filename.split('.').pop() || 'jpg').toLowerCase();
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  // Convert the local file into a real Blob first — RN's fetch/FormData
  // no longer accepts the old {uri,name,type} shorthand object.
  const fileRes = await fetch(uri);
  const blob = await fileRes.blob();

  const form = new FormData();
  form.append('file', blob, filename);
  form.append('path', path);

  const res = await fetch('https://xchord.space/api/upload/image', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const json = await res.json();
  if (!res.ok) {
    console.log('Upload failed', json);
    return null;
  }
  return json.publicUrl;
}
