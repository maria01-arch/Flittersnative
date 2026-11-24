// Deletes expired moments for good: first the picture/video file in R2, then the database row.
// Runs by itself every 30 minutes (see 12_purge_moments_r2.sql). Deploy with "Verify JWT" OFF —
// it protects itself with a secret header instead.
//
// Secrets to add under Edge Functions > Secrets:
//   R2_ACCOUNT_ID         Cloudflare account id (R2 > Overview, right side)
//   R2_ACCESS_KEY_ID      from R2 > Manage API tokens (Object Read & Write, this bucket)
//   R2_SECRET_ACCESS_KEY  shown once when the token is created
//   R2_BUCKET             the bucket name
//   PURGE_SECRET          any long random text you make up (the SQL job sends the same text)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are already provided by Supabase.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';

const FOLDER = /^(posts|moments|stories|reels|messages|avatars)\//;   // never touch anything outside the upload folders

Deno.serve(async (req) => {
  const secret = Deno.env.get('PURGE_SECRET');
  if (!secret || req.headers.get('x-purge-secret') !== secret) return new Response('forbidden', { status: 403 });

  const acct = Deno.env.get('R2_ACCOUNT_ID'), key = Deno.env.get('R2_ACCESS_KEY_ID'), sec = Deno.env.get('R2_SECRET_ACCESS_KEY'), bucket = Deno.env.get('R2_BUCKET');
  if (!acct || !key || !sec || !bucket) return new Response('R2 secrets missing', { status: 500 });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const r2 = new AwsClient({ accessKeyId: key, secretAccessKey: sec, service: 's3', region: 'auto' });

  // 1) moments that ended more than an hour ago leave the database (their files are put on the trash list by a trigger)
  const { data: gone, error: e1 } = await db.rpc('purge_expired_moments');
  if (e1) return new Response('Run 19_media_trash.sql first: ' + e1.message, { status: 500 });

  // 2) delete the files on the trash list from R2 (moments deleted by hand or with an account end up here too)
  const { data: rows, error } = await db.from('media_trash').select('id,url,tries').lt('tries', 10).order('id').limit(200);
  if (error) return new Response(error.message, { status: 500 });

  let files = 0, kept = 0;
  const done: number[] = [];
  for (const m of rows || []) {
    let path = '';
    try { path = decodeURIComponent(new URL(m.url).pathname.replace(/^\/+/, '')); } catch {}
    if (!path || !FOLDER.test(path)) { done.push(m.id); continue; }      // not one of our R2 files (old host, odd link): nothing to delete
    const url = `https://${acct}.r2.cloudflarestorage.com/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
    try {
      const res = await r2.fetch(url, { method: 'DELETE' });
      if (res.ok || res.status === 404) { files++; done.push(m.id); }
      else { kept++; console.warn('R2 delete failed', res.status, path); await db.from('media_trash').update({ tries: (m.tries || 0) + 1 }).eq('id', m.id); }
    } catch (e) { kept++; console.warn('R2 delete error', String(e)); await db.from('media_trash').update({ tries: (m.tries || 0) + 1 }).eq('id', m.id); }
  }
  if (done.length) await db.from('media_trash').delete().in('id', done);
  return Response.json({ expired_moments_removed: gone ?? 0, checked_files: rows?.length ?? 0, files_removed: files, will_retry: kept });
});
