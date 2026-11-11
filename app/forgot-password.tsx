import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { View, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { spacing } from '@/lib/theme';
import { useTheme } from '@/lib/ThemeContext';
import { setAddingAccountMode } from '@/lib/accounts';

// Reset a forgotten password inside the app, in three steps:
//   1. type your email  -> we email a code
//   2. type the code    -> proves the email is yours
//   3. type a new password
// No links and no website needed. (The email template in Supabase has to
// show the code: {{ .Token }}.)
type Step = 'email' | 'code' | 'password';

export default function ForgotPasswordScreen() {
  const { colors } = useTheme();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const verified = useRef(false); // the code worked, so a session exists
  const finished = useRef(false); // the new password was saved

  // Checking the code signs the person in behind the scenes. Keep the root
  // layout from jumping to the feed until the new password is saved; and if
  // they back out half way, sign them out again.
  useEffect(() => {
    setAddingAccountMode(true);
    return () => {
      setAddingAccountMode(false);
      if (verified.current && !finished.current) supabase.auth.signOut().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const friendly = (msg?: string) => {
    const m = (msg || '').toLowerCase();
    if (m.includes('rate') || m.includes('seconds') || m.includes('too many')) return 'Too many tries. Please wait a minute and try again.';
    if (m.includes('expired') || m.includes('invalid')) return 'That code is wrong or has expired. Check it, or ask for a new one.';
    if (m.includes('same') && m.includes('password')) return 'Please choose a password you have not used before.';
    if (m.includes('network') || m.includes('fetch')) return 'No connection. Check your internet and try again.';
    return msg || 'Something went wrong';
  };

  const sendCode = async () => {
    setError('');
    setInfo('');
    const e = email.trim().toLowerCase();
    if (!e || !e.includes('@')) {
      setError('Enter the email you signed up with');
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(e);
      if (err) throw err;
      setEmail(e);
      setStep('code');
      setCooldown(60);
      setInfo('If an account uses this email, we sent a code to it. It can take a minute.');
    } catch (err: any) {
      setError(friendly(err?.message));
    }
    setLoading(false);
  };

  const resend = async () => {
    if (cooldown > 0 || loading) return;
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email);
      if (err) throw err;
      setCooldown(60);
      setInfo('A new code is on its way.');
    } catch (err: any) {
      setError(friendly(err?.message));
    }
    setLoading(false);
  };

  const checkCode = async () => {
    setError('');
    setInfo('');
    const t = code.replace(/\s/g, '');
    if (t.length < 6) {
      setError('Enter the code from the email');
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.verifyOtp({ email, token: t, type: 'recovery' });
      if (err) throw err;
      verified.current = true;
      setStep('password');
    } catch (err: any) {
      setError(friendly(err?.message));
    }
    setLoading(false);
  };

  const savePassword = async () => {
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      finished.current = true;
      setAddingAccountMode(false);
      router.replace('/(tabs)');
      return;
    } catch (err: any) {
      setError(friendly(err?.message));
    }
    setLoading(false);
  };

  const title = step === 'email' ? 'Forgot your password?' : step === 'code' ? 'Check your email' : 'Choose a new password';
  const sub =
    step === 'email'
      ? 'Enter your email and we will send you a code.'
      : step === 'code'
        ? `Type the code we sent to ${email}.`
        : 'Pick a password you have not used before.';

  const onMain = step === 'email' ? sendCode : step === 'code' ? checkCode : savePassword;
  const mainLabel = step === 'email' ? 'Send code' : step === 'code' ? 'Continue' : 'Save password';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.back} onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>

        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.sub, { color: colors.subtext }]}>{sub}</Text>

        {step === 'email' && (
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text }]}
            placeholder="Email"
            placeholderTextColor={colors.faint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={sendCode}
            returnKeyType="send"
          />
        )}

        {step === 'code' && (
          <>
            <TextInput
              style={[styles.input, styles.codeInput, { borderColor: colors.border, color: colors.text }]}
              placeholder="Code"
              placeholderTextColor={colors.faint}
              keyboardType="number-pad"
              maxLength={10}
              value={code}
              onChangeText={setCode}
              onSubmitEditing={checkCode}
              autoFocus
            />
            <TouchableOpacity onPress={resend} disabled={cooldown > 0 || loading} style={styles.resend}>
              <Text style={{ color: cooldown > 0 ? colors.faint : colors.primary, fontWeight: '600' }}>
                {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'password' && (
          <>
            <View style={[styles.passwordRow, { borderColor: colors.border }]}>
              <TextInput
                style={[styles.passwordInput, { color: colors.text }]}
                placeholder="New password"
                placeholderTextColor={colors.faint}
                autoCapitalize="none"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                autoFocus
              />
              <TouchableOpacity onPress={() => setShowPassword((v) => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.faint} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text }]}
              placeholder="Confirm new password"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              secureTextEntry={!showPassword}
              value={confirm}
              onChangeText={setConfirm}
              onSubmitEditing={savePassword}
            />
          </>
        )}

        {info ? <Text style={[styles.info, { color: colors.subtext }]}>{info}</Text> : null}
        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }]} onPress={onMain} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{mainLabel}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  back: { position: 'absolute', top: 48, left: 16, zIndex: 2 },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  sub: { fontSize: 15, textAlign: 'center', marginBottom: 28, lineHeight: 21 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 12 },
  codeInput: { textAlign: 'center', fontSize: 22, letterSpacing: 6, fontWeight: '700' },
  passwordRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, marginBottom: 12 },
  passwordInput: { flex: 1, paddingVertical: 14, fontSize: 16 },
  resend: { alignSelf: 'center', paddingVertical: 8, marginBottom: 8 },
  button: { borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  info: { textAlign: 'center', marginBottom: 12, fontSize: 13, lineHeight: 18 },
  error: { marginBottom: 12, textAlign: 'center' },
});
