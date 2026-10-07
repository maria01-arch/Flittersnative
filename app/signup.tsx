import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Image, Modal, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';
import { persistCurrentSession, setAddingAccountMode } from '@/lib/accounts';

const COUNTRIES = [
  'United States', 'United Kingdom', 'Canada', 'Nigeria', 'Ghana', 'Kenya', 'South Africa',
  'India', 'Pakistan', 'Bangladesh', 'Philippines', 'Indonesia', 'Malaysia', 'Singapore',
  'Australia', 'New Zealand', 'Germany', 'France', 'Spain', 'Italy', 'Netherlands',
  'Belgium', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Ireland', 'Poland', 'Portugal',
  'Brazil', 'Mexico', 'Argentina', 'Colombia', 'Chile', 'Peru', 'Egypt', 'Morocco',
  'Saudi Arabia', 'United Arab Emirates', 'Turkey', 'Other',
];

// 6 steps total: name -> birthday/country -> email+password -> photo ->
// terms -> OTP. There used to be a separate "how can we reach you" step
// between birthday and password, offering a choice between email and
// phone signup (ported straight from the webapp's wizard) — removed here
// since native only ever needs email: it's simpler, and phone signup
// never had a real SMS-OTP path anyway (it used a placeholder email
// under the hood on the webapp too).
export default function SignupScreen() {
  const { colors } = useTheme();
  const { addingAccount } = useLocalSearchParams<{ addingAccount?: string }>();
  const isAddingAccount = addingAccount === '1';
  const [step, setStep] = useState(1);

  // Adding-account mode ends when this screen closes (see login.tsx).
  useEffect(() => () => setAddingAccountMode(false), []);

  // When adding an account the root layout deliberately doesn't send a
  // signed-in person home on its own, so signup has to do it itself.
  const finishAddingAccount = () => {
    if (!isAddingAccount) return;
    router.dismissAll();
    router.replace('/(tabs)');
  };
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [dob, setDob] = useState('');
  const [country, setCountry] = useState('');
  const [countryModalOpen, setCountryModalOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  // 'idle' before 3 chars are typed, then 'checking' -> 'available' |
  // 'taken' | 'error'. Checked here instead of only at signup time so
  // someone finds out their username is taken while they're still looking
  // at that field, not after filling out four more steps and hitting a
  // raw database error on Create Account.
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'error'>('idle');

  useEffect(() => {
    const clean = username.trim().toLowerCase();
    if (clean.length < 3) {
      setUsernameStatus('idle');
      return;
    }
    setUsernameStatus('checking');
    const timeout = setTimeout(async () => {
      const { data, error } = await supabase.from('profiles').select('id').eq('username', clean).maybeSingle();
      if (error) {
        setUsernameStatus('error');
        return;
      }
      setUsernameStatus(data ? 'taken' : 'available');
    }, 500); // debounced — no query on every keystroke, just once typing pauses
    return () => clearTimeout(timeout);
  }, [username]);

  const validateStep = (): string => {
    if (step === 1) {
      if (!displayName.trim()) return 'Please enter your name';
      if (username.trim().length < 3) return 'Username must be at least 3 characters';
      if (usernameStatus === 'taken') return 'That username is already taken';
      if (usernameStatus === 'checking') return "Still checking that username — give it a moment";
    }
    if (step === 2) {
      if (!dob.trim()) return 'Please enter your date of birth';
      const age = (Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      if (isNaN(age) || age < 13) return 'You must be at least 13 years old';
      if (!country) return 'Please select your country';
    }
    if (step === 3) {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) return 'Please enter a valid email';
      if (password.length < 6) return 'Password must be at least 6 characters';
      if (password !== confirmPassword) return 'Passwords do not match';
    }
    if (step === 5) {
      if (!acceptedPolicy) return 'Please accept the terms to continue';
    }
    return '';
  };

  const handleNext = () => {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setError('');
    if (step === 5) {
      handleCreateAccount();
    } else {
      setStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    setError('');
    setStep((s) => Math.max(1, s - 1));
  };

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
    if (!result.canceled && result.assets?.[0]) setAvatarUri(result.assets[0].uri);
  };

  const uploadAvatarIfNeeded = async (userId: string) => {
    if (!avatarUri) return;
    try {
      const fileRes = await fetch(avatarUri);
      const arrayBuffer = await fileRes.arrayBuffer();
      const ext = avatarUri.split('.').pop() || 'jpg';
      const path = `${userId}.${ext}`;
      await supabase.storage.from('avatars').upload(path, arrayBuffer, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`, upsert: true });
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      if (data?.publicUrl) {
        await supabase.from('profiles').update({ avatar_url: `${data.publicUrl}?t=${Date.now()}` }).eq('id', userId);
      }
    } catch (e) {
      console.log('avatar upload failed', e);
    }
  };

  const handleCreateAccount = async () => {
    setLoading(true);
    setError('');
    const signupData = {
      display_name: displayName.trim(),
      username: username.trim().toLowerCase().replace(/\s/g, ''),
      date_of_birth: dob.trim(),
      location: country,
    };

    try {
      // Same reasoning as login.tsx's add-account path: whatever's
      // currently signed in has to be saved before this call succeeds and
      // replaces the client's one active session with the new account.
      if (isAddingAccount) await persistCurrentSession();
      const { data, error: signErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: signupData },
      });
      if (signErr) throw signErr;
      if (data.session) {
        if (data.user?.id) await uploadAvatarIfNeeded(data.user.id);
        setLoading(false);
        finishAddingAccount();
        return;
      }
      setPendingEmail(email.trim());
      setLoading(false);
      setStep(6);
    } catch (e: any) {
      // The availability check happened while typing, but someone else
      // could have grabbed the exact same username in the few seconds
      // since — rare, but the database's own uniqueness constraint is
      // still the real backstop, and its raw error text isn't something
      // to show anyone directly.
      const msg = e.message?.toLowerCase().includes('username') ? 'That username was just taken — please go back and pick another.' : e.message || 'Something went wrong';
      setError(msg);
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpCode.trim().length < 6) {
      setError('Please enter the 6-digit code');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data, error: verifyErr } = await supabase.auth.verifyOtp({
        email: pendingEmail,
        token: otpCode.trim(),
        type: 'signup',
      });
      if (verifyErr) throw verifyErr;
      if (data.user?.id) await uploadAvatarIfNeeded(data.user.id);
      finishAddingAccount();
    } catch (e: any) {
      setError(e.message || 'Invalid code, please try again');
    }
    setLoading(false);
  };

  const handleResendOtp = async () => {
    setError('');
    try {
      await supabase.auth.resend({ type: 'signup', email: pendingEmail });
    } catch (e) {}
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          {step > 1 && step < 6 ? (
            <TouchableOpacity onPress={handleBack}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => router.back()}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          )}
          <View style={styles.progressRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <View key={n} style={[styles.progressDot, { backgroundColor: n <= step ? colors.primary : colors.border }]} />
            ))}
          </View>
          <View style={{ width: 24 }} />
        </View>

        {step === 1 && (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: colors.text }]}>What's your name?</Text>
            <Text style={[styles.stepSubtitle, { color: colors.subtext }]}>This is how you'll appear on Flitters</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text }]}
              placeholder="Display name"
              placeholderTextColor={colors.faint}
              value={displayName}
              onChangeText={setDisplayName}
            />
            <TextInput
              style={[
                styles.input,
                { borderColor: colors.border, color: colors.text },
                usernameStatus === 'taken' && { borderColor: '#EF4444' },
                usernameStatus === 'available' && { borderColor: '#22C55E' },
              ]}
              placeholder="Username"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              value={username}
              onChangeText={setUsername}
            />
            {usernameStatus === 'checking' && (
              <View style={styles.usernameStatusRow}>
                <ActivityIndicator size="small" color={colors.faint} />
                <Text style={[styles.usernameStatusText, { color: colors.faint }]}>Checking availability...</Text>
              </View>
            )}
            {usernameStatus === 'taken' && (
              <View style={styles.usernameStatusRow}>
                <Ionicons name="close-circle" size={16} color="#EF4444" />
                <Text style={[styles.usernameStatusText, { color: '#EF4444' }]}>Username not available</Text>
              </View>
            )}
            {usernameStatus === 'available' && (
              <View style={styles.usernameStatusRow}>
                <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                <Text style={[styles.usernameStatusText, { color: '#22C55E' }]}>Username available</Text>
              </View>
            )}
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: colors.text }]}>When were you born?</Text>
            <Text style={[styles.stepSubtitle, { color: colors.subtext }]}>Your date of birth won't be shown publicly</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text }]}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.faint}
              value={dob}
              onChangeText={setDob}
              keyboardType="numbers-and-punctuation"
            />
            <TouchableOpacity style={[styles.input, styles.selectInput, { borderColor: colors.border }]} onPress={() => setCountryModalOpen(true)}>
              <Text style={{ color: country ? colors.text : colors.faint, fontSize: 15 }}>{country || 'Select your country'}</Text>
              <Ionicons name="chevron-down" size={18} color={colors.faint} />
            </TouchableOpacity>
          </View>
        )}

        {step === 3 && (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: colors.text }]}>Your email and password</Text>
            <Text style={[styles.stepSubtitle, { color: colors.subtext }]}>We'll send a code to this email to verify it's you</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text }]}
              placeholder="Email address"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text }]}
              placeholder="Password"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              secureTextEntry
              value={password}
              // Passwords are strictly lowercase — auto-lowercasing here
              // (rather than just validating after the fact) means what's
              // on screen always matches what actually gets submitted, so
              // there's never a mismatch between what someone thinks they
              // typed and what their password actually is.
              onChangeText={(t) => setPassword(t.toLowerCase())}
            />
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text }]}
              placeholder="Confirm password"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              secureTextEntry
              value={confirmPassword}
              onChangeText={(t) => setConfirmPassword(t.toLowerCase())}
            />
          </View>
        )}

        {step === 4 && (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: colors.text }]}>Add a profile photo</Text>
            <Text style={[styles.stepSubtitle, { color: colors.subtext }]}>Optional — you can always add one later</Text>
            <TouchableOpacity style={styles.avatarPicker} onPress={pickAvatar}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarPreview} />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: colors.bubbleTheirs }]}>
                  <Ionicons name="camera" size={32} color={colors.faint} />
                </View>
              )}
            </TouchableOpacity>
          </View>
        )}

        {step === 5 && (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: colors.text }]}>Almost there</Text>
            <TouchableOpacity style={styles.policyRow} onPress={() => setAcceptedPolicy(!acceptedPolicy)}>
              <Ionicons name={acceptedPolicy ? 'checkbox' : 'square-outline'} size={22} color={acceptedPolicy ? colors.primary : colors.faint} />
              <Text style={[styles.policyText, { color: colors.text }]}>I agree to the Terms of Service and Privacy Policy</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 6 && (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: colors.text }]}>Check your email</Text>
            <Text style={[styles.stepSubtitle, { color: colors.subtext }]}>We sent a 6-digit code to {pendingEmail}</Text>
            <TextInput
              style={[styles.input, styles.otpInput, { borderColor: colors.border, color: colors.text }]}
              placeholder="000000"
              placeholderTextColor={colors.faint}
              keyboardType="number-pad"
              maxLength={6}
              value={otpCode}
              onChangeText={setOtpCode}
            />
            <TouchableOpacity onPress={handleResendOtp}>
              <Text style={{ color: colors.primary, textAlign: 'center', marginTop: 10, fontWeight: '600' }}>Resend code</Text>
            </TouchableOpacity>
          </View>
        )}

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: colors.primary }]}
          onPress={step === 6 ? handleVerifyOtp : handleNext}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.nextBtnText}>{step === 5 ? 'Create Account' : step === 6 ? 'Verify' : 'Continue'}</Text>}
        </TouchableOpacity>

        {step === 4 && (
          <TouchableOpacity onPress={() => setStep(5)}>
            <Text style={{ color: colors.subtext, textAlign: 'center', marginTop: 12 }}>Skip for now</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <Modal visible={countryModalOpen} transparent animationType="slide" onRequestClose={() => setCountryModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.countryModal, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Select Country</Text>
            <FlatList
              data={COUNTRIES}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.countryRow, { borderBottomColor: colors.border }]}
                  onPress={() => {
                    setCountry(item);
                    setCountryModalOpen(false);
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: 15 }}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, padding: spacing.lg, paddingTop: 50, paddingBottom: 40 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  progressRow: { flexDirection: 'row', gap: 6 },
  progressDot: { width: 20, height: 4, borderRadius: 2 },
  stepContent: { marginBottom: 20 },
  stepTitle: { fontSize: 24, fontWeight: '800', marginBottom: 6 },
  stepSubtitle: { fontSize: 14, marginBottom: 20 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 12 },
  usernameStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -6, marginBottom: 12, paddingLeft: 4 },
  usernameStatusText: { fontSize: 13, fontWeight: '600' },
  selectInput: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  avatarPicker: { alignSelf: 'center', marginTop: 10 },
  avatarPreview: { width: 120, height: 120, borderRadius: 60 },
  avatarPlaceholder: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center' },
  policyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 10 },
  policyText: { flex: 1, fontSize: 14, lineHeight: 20 },
  otpInput: { textAlign: 'center', fontSize: 24, letterSpacing: 8 },
  errorText: { color: '#EF4444', textAlign: 'center', marginBottom: 12 },
  nextBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  countryModal: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', padding: spacing.lg },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  countryRow: { paddingVertical: 14, borderBottomWidth: 1 },
});
