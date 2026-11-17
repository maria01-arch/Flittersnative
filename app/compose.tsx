import { useEffect, useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Image, ScrollView, Alert, Modal, FlatList } from 'react-native';
import Text from '@/components/AppText';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { uploadImage, uploadVideo } from '@/lib/upload';
import { checkVideoLimits, getVideoLimitSeconds, canTrimToFit } from '@/lib/videoLimits';
import { coownerLimit, isVerifiedUser, notifyMentions } from '@/lib/postActions';
import { cleanSearchText } from '@/lib/searchText';
import Avatar from '@/components/Avatar';
import ImageEditor from '@/components/ImageEditor';
import ComposeVideoPreview from '@/components/ComposeVideoPreview';
import VideoTrimmer from '@/components/VideoTrimmer';
import { spacing } from '@/lib/theme';
import { emitPostBus, getMyProfileCache, setMyProfileCache, setFailedDraft, takeFailedDraft } from '@/lib/postBus';
import LinkPreviewCard from '@/components/LinkPreviewCard';
import { getFirstUrl } from '@/lib/linkPreview';
import { useTheme } from '@/lib/ThemeContext';
import SchedulePicker from '@/components/SchedulePicker';
import { schedulePost, whenText } from '@/lib/scheduled';

const MAX_LENGTH = 300;

type Segment = { key: string; text: string; imageUri: string | null; videoUri: string | null; linkUrl: string | null; noLink?: boolean };

// What is saved: the typed text, plus the link that was pulled out into a preview card.
const fullText = (s: Segment) => [s.text.trim(), s.linkUrl].filter(Boolean).join('\n');

const emptySegment = (): Segment => ({ key: Crypto.randomUUID(), text: '', imageUri: null, videoUri: null, linkUrl: null });

// The link card under the text box, with a cross to throw it away.
function ComposeLink({ url, onRemove }: { url: string; onRemove: () => void }) {
  const { colors } = useTheme();
  const [ok, setOk] = useState<boolean | null>(null);
  return (
    <View style={{ marginHorizontal: spacing.lg, marginTop: 4 }}>
      {ok === false ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, paddingRight: 40, marginTop: 8 }}>
          <Ionicons name="link" size={16} color={colors.subtext} />
          <Text style={{ color: colors.primary, marginLeft: 8, flexShrink: 1 }} numberOfLines={1}>{url}</Text>
        </View>
      ) : (
        <LinkPreviewCard url={url} onResult={setOk} />
      )}
      <TouchableOpacity
        onPress={onRemove}
        hitSlop={8}
        style={{ position: 'absolute', top: 14, right: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name="close" size={16} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

export default function ComposeScreen() {
  const { session } = useAuth();
  const { colors } = useTheme();
  // Set when this screen was opened from "Reply with reel" on a reel comment.
  const rp = useLocalSearchParams<{ replyReelId?: string; replyCommentId?: string; replyName?: string; replyText?: string }>();
  const replyReelId = rp.replyReelId ? String(rp.replyReelId) : '';
  const replyCommentId = rp.replyCommentId ? String(rp.replyCommentId) : '';
  const [segments, setSegments] = useState<Segment[]>([emptySegment()]);
  const [posting, setPosting] = useState(false);
  // Scheduling is a Professional-mode tool.
  const [isPro, setIsPro] = useState(false);
  const [scheduleAt, setScheduleAt] = useState<Date | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => {
    const me = session?.user?.id;
    if (!me) return;
    supabase.from('profiles').select('is_professional').eq('id', me).maybeSingle().then(({ data }) => setIsPro(!!(data as any)?.is_professional));
  }, [session?.user?.id]);

  // A post that failed to upload in the background comes back here, so
  // nothing typed is lost. Also keeps my profile handy for the instant preview.
  useEffect(() => {
    const draft = takeFailedDraft();
    if (draft && draft.length) setSegments(draft);
    const me = session?.user?.id;
    if (me && getMyProfileCache()?.id !== me) {
      supabase
        .from('profiles')
        .select('id,display_name,username,avatar_url,verified,is_authentic,verified_plan,who_can_repost,who_can_comment')
        .eq('id', me)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setMyProfileCache(data);
        });
    }
  }, [session?.user?.id]);

  // ---- Co-owners: people added as owners of the post. Regular accounts can
  // add up to 3, verified accounts up to 8. People who switched off "Allow
  // co-owning posts" don't appear in the search at all.
  const [coowners, setCoowners] = useState<any[]>([]);
  const [coOpen, setCoOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [coQuery, setCoQuery] = useState('');
  const [coResults, setCoResults] = useState<any[]>([]);
  const [meVerified, setMeVerified] = useState(false);
  useEffect(() => {
    isVerifiedUser(session?.user?.id).then(setMeVerified);
  }, [session?.user?.id]);
  const maxCoowners = coownerLimit(meVerified);
  const searchCo = async (text: string) => {
    setCoQuery(text);
    const clean = cleanSearchText(text);
    if (clean.length < 2) return setCoResults([]);
    const { data } = await supabase
      .from('profiles')
      .select('id,display_name,username,avatar_url')
      .or(`display_name.ilike.%${clean}%,username.ilike.%${clean}%`)
      .or('allow_coowners.is.null,allow_coowners.eq.true')
      .neq('id', session?.user?.id)
      .limit(15);
    setCoResults(data || []);
  };
  const addCo = (u: any) => {
    if (coowners.some((c) => c.id === u.id)) return;
    if (coowners.length >= maxCoowners) {
      Alert.alert('Co-owner limit', meVerified ? `You can add up to ${maxCoowners} co-owners.` : `You can add up to ${maxCoowners} co-owners. Verified accounts can add up to 8.`);
      return;
    }
    setCoowners((prev) => [...prev, u]);
  };
  const [videoProgress, setVideoProgress] = useState<number | null>(null);

  const [trimmer, setTrimmer] = useState<{ key: string; uri: string; duration: number | null; max: number } | null>(null);

  const updateSegment = (key: string, patch: Partial<Segment>) => {
    setSegments((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  };

  const pickMedia = async (key: string) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (asset.type === 'video') {
      const limit = await getVideoLimitSeconds(session?.user?.id);
      if (canTrimToFit(asset, limit)) {
        // Too long: let them cut it down to size instead of refusing it.
        setTrimmer({ key, uri: asset.uri, duration: (asset.duration as number) / 1000, max: limit });
        return;
      }
      const issue = checkVideoLimits(asset, limit);
      if (issue) {
        Alert.alert("Video too long", issue);
        return;
      }
      updateSegment(key, { videoUri: asset.uri, imageUri: null });
    } else {
      updateSegment(key, { imageUri: asset.uri, videoUri: null });
    }
  };

  const addThreadSegment = () => setSegments((prev) => [...prev, emptySegment()]);
  const removeSegment = (key: string) => setSegments((prev) => (prev.length > 1 ? prev.filter((s) => s.key !== key) : prev));

  // A link typed or pasted turns into a preview card a moment later, and the
  // raw link leaves the text box (it is added back when posting).
  const looksLikeUrl = (u: string | null) => !!u && /^https?:\/\/[^\s/]+\.[a-z]{2,}/i.test(u);
  useEffect(() => {
    const todo = segments.filter((sg) => !sg.linkUrl && !sg.noLink && looksLikeUrl(getFirstUrl(sg.text)));
    if (!todo.length) return;
    const endsWithSpace = todo.some((sg) => /\s$/.test(sg.text));
    const t = setTimeout(() => {
      setSegments((prev) =>
        prev.map((sg) => {
          if (sg.linkUrl || sg.noLink) return sg;
          const u = getFirstUrl(sg.text);
          if (!u || !looksLikeUrl(u)) return sg;
          const text = sg.text.replace(u, '').replace(/[ \t]{2,}/g, ' ').trim();
          return { ...sg, linkUrl: u, text };
        })
      );
    }, endsWithSpace ? 150 : 900);
    return () => clearTimeout(t);
  }, [segments]);

  const hasAnyContent = segments.some((s) => s.text.trim() || s.linkUrl || s.imageUri || s.videoUri);

  // Upload the pictures/videos now, then hand the whole post to the server to
  // publish at the chosen time. The composer stays open until it is saved.
  const submitScheduled = async () => {
    if (!scheduleAt || !session?.user?.id) return;
    if (scheduleAt.getTime() < Date.now() + 2.5 * 60 * 1000) {
      Alert.alert('Time has passed', 'Pick a new time a few minutes from now.');
      setPickerOpen(true);
      return;
    }
    setPosting(true);
    const items: { content: string; image_url: string | null; video_url: string | null; thumbnail_url: string | null }[] = [];
    try {
      for (const seg of segments) {
        if (!seg.text.trim() && !seg.linkUrl && !seg.imageUri && !seg.videoUri) continue;
        let imageUrl: string | null = null;
        let videoUrl: string | null = null;
        let thumbUrl: string | null = null;
        if (seg.imageUri) {
          imageUrl = await uploadImage(seg.imageUri, `posts/${session.user.id}`);
          if (!imageUrl) throw new Error('The image failed to upload — check your connection and try again.');
        }
        if (seg.videoUri) {
          setVideoProgress(0);
          videoUrl = await uploadVideo(seg.videoUri, `posts/${session.user.id}`, setVideoProgress);
          setVideoProgress(null);
          if (!videoUrl) throw new Error('The video failed to upload — check your connection and try again.');
          try {
            const frame = await VideoThumbnails.getThumbnailAsync(seg.videoUri, { time: 1000 });
            thumbUrl = await uploadImage(frame.uri, `posts/${session.user.id}`);
          } catch {}
        }
        items.push({ content: fullText(seg), image_url: imageUrl, video_url: videoUrl, thumbnail_url: thumbUrl });
      }
    } catch (e: any) {
      setVideoProgress(null);
      setPosting(false);
      Alert.alert("Couldn't schedule", e?.message || 'Upload failed.');
      return;
    }
    const r = await schedulePost(items, coowners.map((c) => c.id), scheduleAt);
    setPosting(false);
    if (!r.ok) {
      Alert.alert("Couldn't schedule", r.error);
      return;
    }
    Alert.alert('Scheduled', `Your post will go live ${whenText(scheduleAt)}. You can change or cancel it in Creator dashboard → Scheduled posts.`);
    router.back();
  };

  const submit = async () => {
    if (!hasAnyContent || !session?.user?.id) return;
    if (scheduleAt) return submitScheduled();
    if (replyCommentId && !segments.some((x) => x.videoUri)) {
      Alert.alert('Add a video', 'A reply reel needs a video. Tap the picture icon to choose one.');
      return;
    }
    setPosting(true);

    // Show the post in the feed right now and leave the composer; the upload
    // carries on in the background. If it fails, the feed removes the post
    // and the text comes back here (see lib/postBus.ts).
    const meId = session.user.id;
    const tempId = `tmp-${Crypto.randomUUID()}`;
    const snapshot = segments.map((x) => ({ ...x }));
    const first = segments.find((x) => x.text.trim() || x.linkUrl || x.imageUri || x.videoUri);
    const failPost = (message: string) => {
      emitPostBus({ type: 'fail', tempId });
      setFailedDraft(snapshot);
      Alert.alert("Couldn't post", message);
    };
    if (first) {
      emitPostBus({
        type: 'add',
        item: {
          id: tempId,
          feedKey: tempId,
          pending: true,
          user_id: meId,
          content: fullText(first),
          image_url: first.imageUri,
          video_url: first.videoUri,
          thumbnail_url: null,
          created_at: new Date().toISOString(),
          sortTime: new Date().toISOString(),
          author: getMyProfileCache() || { id: meId, display_name: 'You', username: '', avatar_url: null },
          likes_count: 0,
          reposts_count: 0,
          comments_count: 0,
          liked_by_me: false,
          reposted_by_me: false,
        },
      });
    }
    router.back();

    const threadId = segments.length > 1 ? Crypto.randomUUID() : null;
    const rows: any[] = [];
    // A video posted to the feed is also a reel — people browsing Reels
    // shouldn't miss content just because it was uploaded from the
    // composer instead of a dedicated "create reel" flow (which this app
    // doesn't have). Collected alongside the post rows below, then
    // written to `reels` right after the posts succeed.
    const reelRows: any[] = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg.text.trim() && !seg.linkUrl && !seg.imageUri && !seg.videoUri) continue;
      let imageUrl: string | null = null;
      let videoUrl: string | null = null;
      let thumbUrl: string | null = null;
      if (seg.imageUri) imageUrl = await uploadImage(seg.imageUri, `posts/${session.user.id}`);
      if (seg.videoUri) {
        setVideoProgress(0);
        videoUrl = await uploadVideo(seg.videoUri, `posts/${session.user.id}`, setVideoProgress);
        setVideoProgress(null);
        // A still frame, saved with the post: link previews (WhatsApp etc.) show it
        // instead of the app logo. Best-effort — the post goes up without it.
        if (videoUrl) {
          try {
            const frame = await VideoThumbnails.getThumbnailAsync(seg.videoUri, { time: 1000 });
            thumbUrl = await uploadImage(frame.uri, `posts/${session.user.id}`);
          } catch (err) {
            console.warn('[compose] video thumbnail failed:', err);
          }
        }
      }

      if (seg.imageUri && !imageUrl) {
        setPosting(false);
        failPost('The image failed to upload — check your connection and try again.');
        return;
      }
      if (seg.videoUri && !videoUrl) {
        setPosting(false);
        failPost('The video failed to upload — check your connection and try again. Larger videos need a stronger connection.');
        return;
      }

      rows.push({
        user_id: session.user.id,
        content: fullText(seg),
        image_url: imageUrl,
        video_url: videoUrl,
        thumbnail_url: thumbUrl,
        thread_id: threadId,
        thread_order: threadId ? i : null,
      });
      if (videoUrl) {
        const rr: any = { user_id: session.user.id, video_url: videoUrl, caption: fullText(seg), thumbnail_url: thumbUrl };
        if (replyCommentId && reelRows.length === 0) {
          rr.reply_to_comment_id = replyCommentId;
          rr.reply_to_reel_id = replyReelId;
          rr.reply_to_name = rp.replyName ? String(rp.replyName) : null;
          rr.reply_to_text = rp.replyText ? String(rp.replyText) : null;
        }
        reelRows.push(rr);
      }
    }

    let { data: inserted, error } = await supabase.from('posts').insert(rows).select('id,thread_order,created_at');
    // The thumbnail_url column may not exist yet (SQL not run): post without it.
    if (error && /thumbnail_url/i.test(error.message || '')) {
      rows.forEach((r) => delete r.thumbnail_url);
      ({ data: inserted, error } = await supabase.from('posts').insert(rows).select('id,thread_order,created_at'));
    }
    if (error) {
      setPosting(false);
      console.error('[compose] post insert failed:', error.message, error);
      failPost(error.message);
      return;
    }
    if (inserted?.[0]?.id && rows[0]) {
      emitPostBus({
        type: 'confirm',
        tempId,
        patch: {
          id: inserted[0].id,
          created_at: inserted[0].created_at || new Date().toISOString(),
          image_url: rows[0].image_url,
          video_url: rows[0].video_url,
          thumbnail_url: rows[0].thumbnail_url ?? null,
        },
      });
    }
    if (reelRows.length) {
      // Best-effort: the post itself already succeeded, so a failure
      // here shouldn't be reported as the whole post having failed —
      // worst case, that video just doesn't additionally show up in
      // Reels, which isn't worth blocking or re-alerting over.
      let { error: reelErr } = await supabase.from('reels').insert(reelRows);
      if (reelErr && /thumbnail_url/i.test(reelErr.message || '')) {
        reelRows.forEach((r) => delete r.thumbnail_url);
        ({ error: reelErr } = await supabase.from('reels').insert(reelRows));
      }
      // The reply columns may not exist yet (SQL not run): post the reel without the link.
      if (reelErr && /reply_to/i.test(reelErr.message || '')) {
        reelRows.forEach((r) => { delete r.reply_to_comment_id; delete r.reply_to_reel_id; delete r.reply_to_name; delete r.reply_to_text; });
        ({ error: reelErr } = await supabase.from('reels').insert(reelRows));
      }
      if (reelErr) console.error('[compose] reel mirror insert failed:', reelErr.message, reelErr);
    }
    // The first post of a thread (or the single post) carries the co-owners
    // and the @mentions.
    const firstId = inserted?.[0]?.id;
    if (firstId) {
      const me = session.user.id;
      if (coowners.length) {
        const { error: coErr } = await supabase.from('post_coowners').insert(coowners.map((c) => ({ post_id: firstId, user_id: me === c.id ? me : c.id })));
        if (coErr) {
          console.warn('[compose] co-owners failed:', coErr.message);
          Alert.alert('Posted', "Your post is up, but co-owners couldn't be added: " + coErr.message);
        } else {
          const { error: nErr } = await supabase.from('notifications').insert(coowners.map((c) => ({ user_id: c.id, actor_id: me, type: 'coown', post_id: firstId })));
          if (nErr) console.warn('[compose] co-owner notification failed:', nErr.message);
        }
      }
      await notifyMentions(rows.map((r) => r.content || ''), firstId, me, coowners.map((c) => c.id));
    }
    setPosting(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.cancel, { color: colors.subtext }]}>Cancel</Text>
        </TouchableOpacity>
        {isPro && !replyCommentId ? (
          <TouchableOpacity onPress={() => setPickerOpen(true)} hitSlop={10} disabled={posting} style={{ marginLeft: 'auto', marginRight: 14 }}>
            <Ionicons name={scheduleAt ? 'time' : 'time-outline'} size={26} color={scheduleAt ? colors.primary : colors.subtext} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[styles.postButton, { backgroundColor: colors.primary }, !hasAnyContent && styles.postButtonDisabled]}
          onPress={submit}
          disabled={!hasAnyContent || posting}
        >
          {posting ? (
            videoProgress !== null ? <Text style={styles.postButtonText}>{Math.round(videoProgress * 100)}%</Text> : <ActivityIndicator color="#fff" size="small" />
          ) : <Text style={styles.postButtonText}>{scheduleAt ? 'Schedule' : segments.length > 1 ? 'Post thread' : 'Post'}</Text>}
        </TouchableOpacity>
      </View>
      {scheduleAt ? (
        <TouchableOpacity onPress={() => setPickerOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.inputBg }}>
          <Ionicons name="time" size={16} color={colors.primary} />
          <Text style={{ color: colors.text, fontWeight: '600', flex: 1 }}>Will post {whenText(scheduleAt)}</Text>
          <TouchableOpacity onPress={() => setScheduleAt(null)} hitSlop={10}><Ionicons name="close" size={18} color={colors.faint} /></TouchableOpacity>
        </TouchableOpacity>
      ) : null}
      <SchedulePicker visible={pickerOpen} initial={scheduleAt} onCancel={() => setPickerOpen(false)} onConfirm={(d) => { setScheduleAt(d); setPickerOpen(false); }} />

      <ScrollView keyboardShouldPersistTaps="handled">
        {!!replyCommentId && (
          <View style={{ marginHorizontal: 16, marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: colors.card || colors.border, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="videocam" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>Replying with a reel{rp.replyName ? ` to @${rp.replyName}` : ''}</Text>
              {!!rp.replyText && <Text numberOfLines={2} style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>{String(rp.replyText)}</Text>}
            </View>
          </View>
        )}
        {segments.map((seg, i) => (
          <View key={seg.key} style={[styles.segment, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
            {segments.length > 1 && (
              <View style={styles.segmentHeader}>
                <Text style={{ color: colors.subtext, fontSize: 12, fontWeight: '600' }}>
                  {i === 0 ? 'Post 1 of the thread' : `Post ${i + 1}`}
                </Text>
                {i > 0 && (
                  <TouchableOpacity onPress={() => removeSegment(seg.key)}>
                    <Ionicons name="close" size={18} color={colors.faint} />
                  </TouchableOpacity>
                )}
              </View>
            )}
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder={i === 0 ? "What's happening?" : 'Add another post...'}
              placeholderTextColor={colors.faint}
              multiline
              autoFocus={i === 0}
              value={seg.text}
              maxLength={Math.max(1, MAX_LENGTH - (seg.linkUrl ? seg.linkUrl.length + 1 : 0))}
              onChangeText={(t) => updateSegment(seg.key, { text: t })}
            />
            <Text style={[styles.counter, { color: seg.text.length + (seg.linkUrl ? seg.linkUrl.length + 1 : 0) >= MAX_LENGTH ? colors.danger : colors.faint }]}>
              {seg.text.length + (seg.linkUrl ? seg.linkUrl.length + 1 : 0)}/{MAX_LENGTH}
            </Text>

            {!!seg.linkUrl && !seg.imageUri && !seg.videoUri && (
              <ComposeLink url={seg.linkUrl} onRemove={() => updateSegment(seg.key, { linkUrl: null, noLink: true })} />
            )}

            {seg.imageUri && (
              <View style={styles.previewWrap}>
                <Image source={{ uri: seg.imageUri }} style={[styles.preview, { backgroundColor: colors.border }]} />
                <TouchableOpacity style={[styles.removeMedia, { right: 44 }]} onPress={() => setEditingKey(seg.key)}>
                  <Ionicons name="create" size={26} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.removeMedia} onPress={() => updateSegment(seg.key, { imageUri: null })}>
                  <Ionicons name="close-circle" size={26} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
            {seg.videoUri && (
              <View style={styles.previewWrap}>
                <ComposeVideoPreview uri={seg.videoUri} />
                <TouchableOpacity
                  style={[styles.removeMedia, { right: 44 }]}
                  onPress={async () => setTrimmer({ key: seg.key, uri: seg.videoUri as string, duration: null, max: await getVideoLimitSeconds(session?.user?.id) })}
                >
                  <Ionicons name="cut" size={26} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.removeMedia} onPress={() => updateSegment(seg.key, { videoUri: null })}>
                  <Ionicons name="close-circle" size={26} color="#fff" />
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity style={styles.mediaButton} onPress={() => pickMedia(seg.key)}>
              <Ionicons name="image-outline" size={22} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Photo or video</Text>
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity style={styles.addThreadButton} onPress={() => { setCoQuery(''); setCoResults([]); setCoOpen(true); }}>
          <View style={[styles.addThreadIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name="people" size={16} color="#fff" />
          </View>
          <Text style={[styles.addThreadText, { color: colors.text }]}>
            {coowners.length ? `Co-owners: ${coowners.map((c) => c.display_name).join(', ')}` : 'Add co-owners'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.addThreadButton} onPress={addThreadSegment}>
          <View style={[styles.addThreadIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name="add" size={20} color="#fff" />
          </View>
          <Text style={[styles.addThreadText, { color: colors.text }]}>Add to thread</Text>
        </TouchableOpacity>
      </ScrollView>
      <VideoTrimmer
        visible={!!trimmer}
        uri={trimmer?.uri || null}
        durationSeconds={trimmer?.duration}
        maxSeconds={trimmer?.max || 20}
        onCancel={() => setTrimmer(null)}
        onDone={(newUri) => {
          if (trimmer) updateSegment(trimmer.key, { videoUri: newUri, imageUri: null });
          setTrimmer(null);
        }}
      />
      <ImageEditor
        visible={!!editingKey}
        uri={segments.find((s) => s.key === editingKey)?.imageUri || null}
        onCancel={() => setEditingKey(null)}
        onDone={(u) => {
          if (editingKey) updateSegment(editingKey, { imageUri: u });
          setEditingKey(null);
        }}
      />
      <Modal visible={coOpen} animationType="slide" onRequestClose={() => setCoOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: 56 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: 10 }}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>Co-owners ({coowners.length}/{maxCoowners})</Text>
            <TouchableOpacity onPress={() => setCoOpen(false)}>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 16 }}>Done</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ color: colors.subtext, fontSize: 12, paddingHorizontal: spacing.lg, marginBottom: 8 }}>
            Co-owners share the post: it appears on their profile too, with both names. People who turned off co-owning don't show up here.
          </Text>
          <TextInput
            style={{ marginHorizontal: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, color: colors.text, backgroundColor: colors.inputBg }}
            value={coQuery}
            onChangeText={searchCo}
            placeholder="Search by name or @username"
            placeholderTextColor={colors.faint}
            autoCapitalize="none"
          />
          {coowners.length > 0 && (
            <ScrollView horizontal style={{ maxHeight: 44, marginTop: 10 }} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 8 }} showsHorizontalScrollIndicator={false}>
              {coowners.map((c) => (
                <TouchableOpacity key={c.id} onPress={() => setCoowners((prev) => prev.filter((x) => x.id !== c.id))} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.inputBg, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 }}>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>{c.display_name}</Text>
                  <Ionicons name="close" size={14} color={colors.faint} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <FlatList
            data={coResults}
            keyExtractor={(u) => u.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const added = coowners.some((c) => c.id === item.id);
              return (
                <TouchableOpacity onPress={() => addCo(item)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.lg, paddingVertical: 10 }}>
                  <Avatar uri={item.avatar_url} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>{item.display_name}</Text>
                    <Text style={{ color: colors.subtext, fontSize: 12 }}>@{item.username}</Text>
                  </View>
                  <Text style={{ color: added ? colors.subtext : colors.primary, fontWeight: '700' }}>{added ? 'Added' : 'Add'}</Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 50 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: 12 },
  cancel: { fontSize: 16 },
  postButton: { borderRadius: 20, paddingVertical: 8, paddingHorizontal: 20 },
  postButtonDisabled: { opacity: 0.5 },
  postButtonText: { color: '#fff', fontWeight: '700' },
  segment: { paddingTop: spacing.md },
  segmentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, marginBottom: 4 },
  input: { fontSize: 18, paddingHorizontal: spacing.lg, minHeight: 70, textAlignVertical: 'top' },
  counter: { textAlign: 'right', paddingHorizontal: spacing.lg, fontSize: 12, marginTop: 2 },
  previewWrap: { marginHorizontal: spacing.lg, marginTop: 8, position: 'relative' },
  preview: { width: '100%', height: 220, borderRadius: 12 },
  videoPreview: { justifyContent: 'center', alignItems: 'center' },
  removeMedia: { position: 'absolute', top: 8, right: 8 },
  mediaButton: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing.lg },
  addThreadButton: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  addThreadIcon: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  addThreadText: { fontSize: 14, fontWeight: '600' },
});
