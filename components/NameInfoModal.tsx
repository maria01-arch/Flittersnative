import { Modal, View, TouchableOpacity, StyleSheet, Pressable, ScrollView } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import VerifiedBadge from './VerifiedBadge';

// Opens when you tap someone's name on their profile: full name, when the
// account was made, what each badge on it means, and a way to get verified.
export default function NameInfoModal({ visible, profile, onClose }: { visible: boolean; profile: any; onClose: () => void }) {
  const { colors } = useTheme();
  const premium = profile?.verified_plan === 'premium';
  const joined = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  // Each badge on this account, drawn the way it appears next to the name.
  const badges: { key: string; badge: any; title: string; text: string }[] = [];
  if (profile?.is_authentic && !premium) {
    badges.push({ key: 'blue', badge: <VerifiedBadge isAuthentic plan={null} size={18} />, title: 'Verified', text: 'This account is verified on Flitters.' });
  }
  if (profile?.is_authentic && premium) {
    badges.push({ key: 'gold', badge: <VerifiedBadge isAuthentic plan="premium" size={18} />, title: 'Verified Premium', text: 'This account is verified and is using Flitters premium services.' });
  }
  if (profile?.verified) {
    badges.push({ key: 'affiliated', badge: <VerifiedBadge verified size={18} />, title: 'Affiliated', text: 'This account is affiliated with Flitters.' });
  }

  const getVerified = () => {
    onClose();
    router.push('/get-verified');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: colors.card }]} onPress={() => {}}>
          <TouchableOpacity style={styles.close} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color={colors.subtext} />
          </TouchableOpacity>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4 }}>
            <Text style={[styles.label, { color: colors.subtext }]}>Full name</Text>
            <Text style={[styles.name, { color: colors.text }]}>{profile?.display_name || 'No name set'}</Text>
            {!!profile?.username && <Text style={{ color: colors.subtext, marginTop: 2 }}>@{profile.username}</Text>}

            {!!joined && (
              <>
                <Text style={[styles.label, { color: colors.subtext, marginTop: 16 }]}>Account created</Text>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{joined}</Text>
              </>
            )}

            <Text style={[styles.label, { color: colors.subtext, marginTop: 16 }]}>Badges</Text>
            {badges.length === 0 ? (
              <Text style={{ color: colors.subtext, lineHeight: 20 }}>This account has no badge.</Text>
            ) : (
              badges.map((b) => (
                <View key={b.key} style={styles.badgeRow}>
                  <View style={styles.badgeIcon}>{b.badge}</View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>{b.title}</Text>
                    <Text style={{ color: colors.subtext, lineHeight: 19 }}>{b.text}</Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={getVerified}>
            <Text style={styles.btnText}>Get verified</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, maxHeight: '80%', borderRadius: 20, padding: 20 },
  close: { position: 'absolute', top: 12, right: 12, zIndex: 2 },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  name: { fontSize: 20, fontWeight: '800' },
  badgeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 10 },
  badgeIcon: { width: 30, alignItems: 'center', paddingTop: 2 },
  btn: { marginTop: 16, borderRadius: 24, paddingVertical: 13, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
