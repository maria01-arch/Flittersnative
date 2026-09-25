import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Image, Modal, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';

const COUNTRIES = [
  'United States', 'United Kingdom', 'Canada', 'Nigeria', 'Ghana', 'Kenya', 'South Africa',
  'India', 'Pakistan', 'Bangladesh', 'Philippines', 'Indonesia', 'Malaysia', 'Singapore',
  'Australia', 'New Zealand', 'Germany', 'France', 'Spain', 'Italy', 'Netherlands',
  'Belgium', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Ireland', 'Poland', 'Portugal',
  'Brazil', 'Mexico', 'Argentina', 'Colombia', 'Chile', 'Peru', 'Egypt', 'Morocco',
  'Saudi Arabia', 'United Arab Emirates', 'Turkey', 'Other',
];

export default function SignupScreen() {
  const { colors } = useTheme();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [dob, setDob] = useState('');
  const [country, setCountry] = useState('');
  const [countryModalOpen, setCountryModalOpen] = useState(false);
  const [contactMethod, setContactMethod] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [newUserId, setNewUserId] = useState<string | null>(null);

  const validateStep = (): string => {
    if (step === 1) {
      if (!displayName.trim()) return 'Please enter your name';
      if (username.trim().length < 3) return 'Username must be at least 3 characters';
    }
    if (step === 2) {
      if (!dob.trim()) return 'Please enter your date of birth';
      const age = (Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      if (isNaN(age) || age < 13) return 'You must be at least 13 years old';
      if (!country) return 'Please select your country';
    }
    if (step === 3) {
      if (contactMethod === 'email') {
        if (!/^\S+@\S+\.\S+$/.test(email.trim())) return 'Please enter a valid email';
      } else {
        if (phone.trim().length < 7) return 'Please enter a valid phone number';
      }
    }
    if (step === 4) {
      if (password.length < 6) return 'Password must be at least 6 characters';
      if (password !== confirmPassword) return 'Passwords do not match';
    }
    if (step === 6) {
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
    if (step === 6) {
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
      if (contactMethod === 'email') {
        const { data, error: signErr } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: signupData },
        });
        if (signErr) throw signErr;
        if (data.session) {
          if (data.user?.id) await uploadAvatarIfNeeded(data.user.id);
          setLoading(false);
          return;
        }
        setNewUserId(data.user?.id || null);
        setPendingEmail(email.trim());
        setLoading(false);
        setStep(7);
      } else {
        const placeholderEmail = `${phone.replace(/\D/g, '')}@phone.flitters.placeholder`;
        const { data, error: signErr } = await supabase.auth.signUp({
          email: placeholderEmail,
          password,
          options: { data: { ...signupData, phone: phone.trim() } },
        });
        if (signErr) throw signErr;
        if (data.user?.id) await uploadAvatarIfNeeded(data.user.id);
        setLoading(false);
      }
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
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
          {step > 1 && step < 7 ? (
            <TouchableOpacity onPress={handleBack}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => router.back()}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          )}
          <View style={styles.progressRow}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
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
              style={[styles.input, { borderColor: colors.border, color: colors.text }]}
              placeholder="Username"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              value={username}
              onChangeText={setUsername}
            />
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
            <Text style={[styles.stepTitle, { color: colors.text }]}>How can we reach you?</Text>
            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tabBtn, contactMethod === 'email' && { backgroundColor: colors.primary }, { borderColor: colors.border }]}
                onPress={() => setContactMethod('email')}
              >
                <Text style={{ color: contactMethod === 'email' ? '#fff' : colors.text, fontWeight: '600' }}>Email</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, contactMethod === 'phone' && { backgroundColor: colors.primary }, { borderColor: colors.border }]}
                onPress={() => setContactMethod('phone')}
              >
                <Text style={{ color: contactMethod === 'phone' ? '#fff' : colors.text, fontWeight: '600' }}>Phone</Text>
              </TouchableOpacity>
            </View>
            {contactMethod === 'email' ? (
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.text }]}
                placeholder="Email address"
                placeholderTextColor={colors.faint}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
            ) : (
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.text }]}
                placeholder="Phone number"
                placeholderTextColor={colors.faint}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />
            )}
          </View>
        )}

        {step === 4 && (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: colors.text }]}>Create a password</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text }]}
              placeholder="Password"
              placeholderTextColor={colors.faint}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text }]}
              placeholder="Confirm password"
              placeholderTextColor={colors.faint}
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
          </View>
        )}

        {step === 5 && (
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

        {step === 6 && (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: colors.text }]}>Almost there</Text>
            <TouchableOpacity style={styles.policyRow} onPress={() => setAcceptedPolicy(!acceptedPolicy)}>
              <Ionicons name={acceptedPolicy ? 'checkbox' : 'square-outline'} size={22} color={acceptedPolicy ? colors.primary : colors.faint} />
              <Text style={[styles.policyText, { color: colors.text }]}>I agree to the Terms of Service and Privacy Policy</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 7 && (
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
          onPress={step === 7 ? handleVerifyOtp : handleNext}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.nextBtnText}>{step === 6 ? 'Create Account' : step === 7 ? 'Verify' : 'Continue'}</Text>}
        </TouchableOpacity>

        {step === 5 && (
          <TouchableOpacity onPress={() => setStep(6)}>
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
  selectInput: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tabRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  tabBtn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
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
