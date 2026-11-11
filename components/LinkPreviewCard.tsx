import { useEffect, useState } from 'react';
import { View, Image, StyleSheet, Pressable } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import { usePreferences } from '@/lib/PreferencesContext';
import { openLink } from '@/lib/openLink';
import { supabase } from '@/lib/supabase';
import { parseFlittersLink, openFlittersLink, FlittersLink } from '@/lib/flittersLinks';
import { SITE_URL } from '@/lib/siteConfig';
import Avatar from './Avatar';
import VerifiedBadge from './VerifiedBadge';

type PreviewData = { url?: string; domain?: string; title?: string; description?: string; image?: string };

// ---------- outside links (same scraper endpoint as the webapp) ----------
// Remembered for the session, and one request per link even when several
// bubbles show it at once. Gives up after 6 seconds.
const cache = new Map<string, PreviewData | null>();
const inflight = new Map<string, Promise<PreviewData | null>>();

function fetchExternal(url: string): Promise<PreviewData | null> {
  if (cache.has(url)) return Promise.resolve(cache.get(url)!);
  const running = inflight.get(url);
  if (running) return running;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort(), 6000);
  const p = fetch(SITE_URL + '/api/link-preview?url=' + encodeURIComponent(url), ctrl ? { signal: ctrl.signal } : undefined)
    .then((r) => r.json())
    .then((json) => (json.error || (!json.title && !json.image) ? null : (json as PreviewData)))
    .catch(() => null)
    .then((d) => {
      clearTimeout(timer);
      cache.set(url, d);
      inflight.delete(url);
      return d;
    });
  inflight.set(url, p);
  return p;
}

// ---------- links inside Flitters: read straight from the database ----------
type FData =
  | { kind: 'post'; author: any; text: string; image?: string | null; video?: boolean }
  | { kind: 'comment'; author: any; text: string; image?: string | null }
  | { kind: 'group'; name: string; avatar?: string | null; color?: string | null; description?: string | null; tag: string; members: number }
  | { kind: 'user'; name: string; username: string; avatar?: string | null; bio?: string | null; profile: any };

const fCache = new Map<string, FData | null>();
const fInflight = new Map<string, Promise<FData | null>>();
const AUTHOR = 'id,display_name,username,avatar_url,verified,is_authentic,verified_plan';

async function loadFlitters(l: FlittersLink): Promise<FData | null> {
  try {
    if (l.kind === 'post') {
      const { data } = await supabase.from('posts').select(`id,content,image_url,video_url,author:profiles(${AUTHOR})`).eq('id', l.id).maybeSingle();
      if (!data) return null;
      return { kind: 'post', author: (data as any).author, text: (data as any).content || '', image: (data as any).image_url, video: !!(data as any).video_url };
    }
    if (l.kind === 'comment') {
      const { data } = await supabase.from('comments').select(`id,content,image_url,author:profiles!comments_user_id_fkey(${AUTHOR})`).eq('id', l.commentId).maybeSingle();
      if (!data) return null;
      return { kind: 'comment', author: (data as any).author, text: (data as any).content || '', image: (data as any).image_url };
    }
    if (l.kind === 'group') {
      const { data: g } = await supabase.from('groups').select('id,name,avatar_url,cover_color,description,tag').eq('tag', l.tag).maybeSingle();
      if (!g) return null;
      const { count } = await supabase.from('group_members').select('*', { count: 'exact', head: true }).eq('group_id', g.id);
      return { kind: 'group', name: g.name, avatar: g.avatar_url, color: g.cover_color, description: g.description, tag: g.tag, members: count || 0 };
    }
    const q = supabase.from('profiles').select('id,display_name,username,avatar_url,bio,verified,is_authentic,verified_plan');
    const { data: u } = await (l.id ? q.eq('id', l.id) : q.eq('username', String(l.username).toLowerCase())).maybeSingle();
    if (!u) return null;
    return { kind: 'user', name: u.display_name, username: u.username, avatar: u.avatar_url, bio: u.bio, profile: u };
  } catch {
    return null;
  }
}

function useFlitters(url: string, link: FlittersLink | null) {
  const [data, setData] = useState<FData | null | undefined>(() => (fCache.has(url) ? fCache.get(url) : undefined));
  useEffect(() => {
    if (!link) return;
    if (fCache.has(url)) {
      setData(fCache.get(url));
      return;
    }
    let cancelled = false;
    let p = fInflight.get(url);
    if (!p) {
      p = loadFlitters(link).then((d) => {
        fCache.set(url, d);
        fInflight.delete(url);
        return d;
      });
      fInflight.set(url, p);
    }
    p.then((d) => !cancelled && setData(d));
    return () => {
      cancelled = true;
    };
  }, [url]);
  return data;
}

function FlittersCard({ url, link, onDark, onResult }: { url: string; link: FlittersLink; onDark?: boolean; onResult?: (ok: boolean) => void }) {
  const { colors } = useTheme();
  const { showLinkPreviews, browserEngine } = usePreferences();
  const d = useFlitters(url, link);
  useEffect(() => {
    if (d !== undefined) onResult?.(d !== null);
  }, [d]);
  const bg = onDark ? 'rgba(255,255,255,0.14)' : colors.card;
  const border = onDark ? 'rgba(255,255,255,0.25)' : colors.border;
  const text = onDark ? '#fff' : colors.text;
  const sub = onDark ? 'rgba(255,255,255,0.75)' : colors.subtext;

  // While loading: a quiet grey card, so the message doesn't jump when it fills in.
  if (d === undefined) return <View style={[styles.card, { backgroundColor: bg, borderColor: border, height: 64 }]} />;
  if (d === null) return null; // deleted / private: just the plain link
  const open = () => {
    if (!openFlittersLink(url)) openLink(url, browserEngine);
  };

  if (d.kind === 'group') {
    return (
      <Pressable onPress={open} style={[styles.card, { backgroundColor: bg, borderColor: border, flexDirection: 'row', padding: 10, gap: 10, alignItems: 'center' }]}>
        {d.avatar ? (
          <Image source={{ uri: d.avatar }} style={styles.groupAvatar} />
        ) : (
          <View style={[styles.groupAvatar, { backgroundColor: d.color || colors.primary, alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 20 }}>{d.name?.[0]?.toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ color: text, fontWeight: '800', fontSize: 14 }} numberOfLines={1}>{d.name}</Text>
          {!!d.description && <Text style={{ color: sub, fontSize: 12, marginTop: 2 }} numberOfLines={2}>{d.description}</Text>}
          <Text style={{ color: sub, fontSize: 11, marginTop: 3 }}>Group · {d.members} {d.members === 1 ? 'member' : 'members'}</Text>
        </View>
      </Pressable>
    );
  }
  if (d.kind === 'user') {
    return (
      <Pressable onPress={open} style={[styles.card, { backgroundColor: bg, borderColor: border, flexDirection: 'row', padding: 10, gap: 10, alignItems: 'center' }]}>
        <Avatar uri={d.avatar} size={46} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={{ color: text, fontWeight: '800', fontSize: 14, flexShrink: 1 }} numberOfLines={1}>{d.name}</Text>
            <VerifiedBadge verified={d.profile?.verified} isAuthentic={d.profile?.is_authentic} plan={d.profile?.verified_plan} size={12} />
          </View>
          <Text style={{ color: sub, fontSize: 12 }}>@{d.username}</Text>
          {!!d.bio && <Text style={{ color: sub, fontSize: 12, marginTop: 2 }} numberOfLines={2}>{d.bio}</Text>}
        </View>
      </Pressable>
    );
  }
  // post or comment: the author, the text, and the picture if it has one.
  const a = d.author || {};
  return (
    <Pressable onPress={open} style={[styles.card, { backgroundColor: bg, borderColor: border }]}>
      <View style={{ padding: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Avatar uri={a.avatar_url} size={24} />
          <Text style={{ color: text, fontWeight: '700', fontSize: 13, flexShrink: 1 }} numberOfLines={1}>{a.display_name || 'Someone'}</Text>
          <VerifiedBadge verified={a.verified} isAuthentic={a.is_authentic} plan={a.verified_plan} size={11} />
          <Text style={{ color: sub, fontSize: 12 }} numberOfLines={1}>@{a.username || 'unknown'}</Text>
        </View>
        <Text style={{ color: sub, fontSize: 11, marginTop: 6 }}>{d.kind === 'comment' ? 'Comment' : 'Post'}</Text>
        {!!d.text && <Text style={{ color: text, fontSize: 13, marginTop: 3, lineHeight: 18 }} numberOfLines={4}>{d.text}</Text>}
      </View>
      {d.kind === 'post' && d.video && !d.image ? (
        <View style={[styles.image, { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', height: 110 }]}>
          <Ionicons name="play-circle" size={40} color="#fff" />
        </View>
      ) : d.image ? (
        <Image source={{ uri: d.image }} style={styles.image} resizeMode="cover" />
      ) : null}
    </Pressable>
  );
}

// onResult(true) once a card is really showing, onResult(false) if there is none
// (bad link, no data, deleted post) — callers use it to hide the raw link text.
export default function LinkPreviewCard({ url, onDark, onResult }: { url: string; onDark?: boolean; onResult?: (ok: boolean) => void }) {
  const { colors } = useTheme();
  const { showLinkPreviews, browserEngine } = usePreferences();
  const link = parseFlittersLink(url);
  const [data, setData] = useState<PreviewData | null>(() => (link ? null : cache.get(url) || null));
  const [done, setDone] = useState(() => !link && cache.has(url));

  useEffect(() => {
    if (!url || !showLinkPreviews || link) return;
    let cancelled = false;
    fetchExternal(url).then((d) => {
      if (cancelled) return;
      setData(d);
      setDone(true);
    });
    return () => {
      cancelled = true;
    };
  }, [url, showLinkPreviews]);

  useEffect(() => {
    if (!link && done) onResult?.(!!data);
  }, [done, data]);

  if (!url || !showLinkPreviews) return null;
  if (link) return <FlittersCard url={url} link={link} onDark={onDark} onResult={onResult} />;
  if (!data) return null;

  const bg = onDark ? 'rgba(255,255,255,0.14)' : colors.card;
  const border = onDark ? 'rgba(255,255,255,0.25)' : colors.border;
  return (
    <Pressable onPress={() => openLink(data.url || url, browserEngine)} style={[styles.card, { backgroundColor: bg, borderColor: border }]}>
      {data.image ? <Image source={{ uri: data.image }} style={styles.image} resizeMode="cover" /> : null}
      <View style={styles.body}>
        {data.title ? <Text style={[styles.title, { color: onDark ? '#fff' : colors.text }]} numberOfLines={1}>{data.title}</Text> : null}
        {data.description ? <Text style={[styles.description, { color: onDark ? 'rgba(255,255,255,0.75)' : colors.subtext }]} numberOfLines={2}>{data.description}</Text> : null}
        {data.domain ? <Text style={[styles.domain, { color: onDark ? 'rgba(255,255,255,0.6)' : colors.faint }]}>{data.domain}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 8, borderRadius: 12, overflow: 'hidden', borderWidth: 1 },
  image: { width: '100%', height: 160 },
  groupAvatar: { width: 54, height: 54, borderRadius: 14 },
  body: { padding: 10 },
  title: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  description: { fontSize: 12, marginBottom: 3 },
  domain: { fontSize: 11 },
});
