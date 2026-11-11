import { useEffect, useState } from 'react';
import { TouchableOpacity, StyleSheet, Alert } from 'react-native';
import Text from '@/components/AppText';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { notifyOnce } from '@/lib/postActions';
import { sendFollowRequest, cancelFollowRequest } from '@/lib/followRequests';

// A small glass "Follow" pill for dark video screens. It disappears once you
// follow the person (or if it is you). Private profiles get "Requested".
type Status = 'none' | 'requested' | 'following';
const known = new Map<string, { status: Status; isPrivate: boolean }>();

export default function FollowButton({ userId }: { userId?: string | null }) {
  const { session } = useAuth();
  const me = session?.user?.id;
  const cached = userId ? known.get(userId) : undefined;
  const [status, setStatus] = useState<Status | null>(cached ? cached.status : null);
  const [isPrivate, setIsPrivate] = useState(cached ? cached.isPrivate : false);

  useEffect(() => {
    if (!me || !userId || me === userId) return;
    const c = known.get(userId);
    if (c) {
      setStatus(c.status);
      setIsPrivate(c.isPrivate);
      return;
    }
    let alive = true;
    (async () => {
      const { data: f } = await supabase.from('follows').select('follower_id').eq('follower_id', me).eq('following_id', userId).limit(1);
      if (!alive) return;
      if (f && f.length) {
        known.set(userId, { status: 'following', isPrivate: false });
        setStatus('following');
        return;
      }
      const [{ data: req }, { data: prof }] = await Promise.all([
        supabase.from('follow_requests').select('requester_id').eq('requester_id', me).eq('target_id', userId).limit(1),
        supabase.from('profiles').select('is_private').eq('id', userId).maybeSingle(),
      ]);
      if (!alive) return;
      const st: Status = req && req.length ? 'requested' : 'none';
      known.set(userId, { status: st, isPrivate: !!prof?.is_private });
      setStatus(st);
      setIsPrivate(!!prof?.is_private);
    })();
    return () => {
      alive = false;
    };
  }, [me, userId]);

  if (!me || !userId || me === userId || status === null || status === 'following') return null;

  const press = async () => {
    if (status === 'requested') {
      setStatus('none');
      known.set(userId, { status: 'none', isPrivate });
      await cancelFollowRequest(me, userId);
      return;
    }
    if (isPrivate) {
      setStatus('requested');
      known.set(userId, { status: 'requested', isPrivate });
      const { error: reqErr } = await sendFollowRequest(me, userId);
      if (reqErr && (reqErr as any).code !== '23505') {
        setStatus('none');
        known.set(userId, { status: 'none', isPrivate });
        Alert.alert("Couldn't send request", reqErr.message || 'Try again.');
      }
      return;
    }
    setStatus('following');
    known.set(userId, { status: 'following', isPrivate });
    const { error } = await supabase.from('follows').insert({ follower_id: me, following_id: userId });
    if (error) {
      setStatus('none');
      known.set(userId, { status: 'none', isPrivate });
      if ((error as any).code !== '23505') Alert.alert("Couldn't follow", error.message || 'Try again.');
      return;
    }
    await notifyOnce({ userId, actorId: me, type: 'follow' });
  };

  return (
    <TouchableOpacity onPress={press} activeOpacity={0.8} style={[styles.pill, status === 'requested' && styles.pillQuiet]} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
      <Text style={styles.text}>{status === 'requested' ? 'Requested' : 'Follow'}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: { height: 26, paddingHorizontal: 12, borderRadius: 13, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' },
  pillQuiet: { backgroundColor: 'rgba(255,255,255,0.08)' },
  text: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
