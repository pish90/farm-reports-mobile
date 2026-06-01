import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../store/AuthContext';

const RULES = [
  { key: 'length',    label: 'At least 8 characters',          test: (p: string) => p.length >= 8 },
  { key: 'uppercase', label: 'One uppercase letter (A–Z)',      test: (p: string) => /[A-Z]/.test(p) },
  { key: 'lowercase', label: 'One lowercase letter (a–z)',      test: (p: string) => /[a-z]/.test(p) },
  { key: 'number',    label: 'One number (0–9)',                test: (p: string) => /\d/.test(p) },
  { key: 'symbol',    label: 'One symbol (@$!%*?&._#^)',        test: (p: string) => /[@$!%*?&._#^]/.test(p) },
];

export default function ChangePasswordScreen() {
  const { changePassword, logout } = useAuth();

  const [current,  setCurrent]  = useState('');
  const [next,     setNext]     = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showCur,  setShowCur]  = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showCon,  setShowCon]  = useState(false);
  const [error,    setError]    = useState('');
  const [saving,   setSaving]   = useState(false);

  const rulesPassed = RULES.every(r => r.test(next));
  const passwordsMatch = next === confirm && confirm.length > 0;
  const canSubmit = current.length > 0 && rulesPassed && passwordsMatch;

  async function handleSubmit() {
    setError('');
    setSaving(true);
    try {
      await changePassword(current, next);
    } catch (e: any) {
      setSaving(false);
      const msg = e?.response?.data?.error ?? e?.response?.data?.message ?? e?.message ?? 'Something went wrong.';
      setError(msg);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <View style={styles.iconWrap}>
          <Feather name="lock" size={32} color="#2d6a4f" />
        </View>
        <Text style={styles.title}>Set Your Password</Text>
        <Text style={styles.subtitle}>
          For security, you must set a new password before continuing.
        </Text>

        {/* Current password */}
        <Text style={styles.label}>Current Password</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={current}
            onChangeText={setCurrent}
            placeholder="Enter current password"
            placeholderTextColor="#bbb"
            secureTextEntry={!showCur}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.eye} onPress={() => setShowCur(v => !v)} hitSlop={8}>
            <Feather name={showCur ? 'eye-off' : 'eye'} size={18} color="#aaa" />
          </TouchableOpacity>
        </View>

        {/* New password */}
        <Text style={styles.label}>New Password</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={next}
            onChangeText={setNext}
            placeholder="Enter new password"
            placeholderTextColor="#bbb"
            secureTextEntry={!showNext}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.eye} onPress={() => setShowNext(v => !v)} hitSlop={8}>
            <Feather name={showNext ? 'eye-off' : 'eye'} size={18} color="#aaa" />
          </TouchableOpacity>
        </View>

        {/* Live rule checklist */}
        {next.length > 0 && (
          <View style={styles.rules}>
            {RULES.map(r => {
              const passed = r.test(next);
              return (
                <View key={r.key} style={styles.ruleRow}>
                  <Feather
                    name={passed ? 'check-circle' : 'circle'}
                    size={14}
                    color={passed ? '#2d6a4f' : '#ccc'}
                  />
                  <Text style={[styles.ruleText, passed && styles.ruleTextPassed]}>
                    {r.label}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Confirm password */}
        <Text style={styles.label}>Confirm New Password</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[
              styles.input,
              confirm.length > 0 && !passwordsMatch && styles.inputError,
            ]}
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Re-enter new password"
            placeholderTextColor="#bbb"
            secureTextEntry={!showCon}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.eye} onPress={() => setShowCon(v => !v)} hitSlop={8}>
            <Feather name={showCon ? 'eye-off' : 'eye'} size={18} color="#aaa" />
          </TouchableOpacity>
        </View>
        {confirm.length > 0 && !passwordsMatch && (
          <Text style={styles.fieldError}>Passwords do not match</Text>
        )}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.button, (!canSubmit || saving) && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit || saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Set Password</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { padding: 24, paddingTop: 60 },

  iconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#EDF7F1', alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginBottom: 20,
  },
  title: {
    fontSize: 24, fontWeight: '700', color: '#1a1a1a',
    textAlign: 'center', marginBottom: 8,
  },
  subtitle: {
    fontSize: 14, color: '#666', textAlign: 'center',
    marginBottom: 32, lineHeight: 20,
  },

  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6, marginTop: 16 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
    color: '#1a1a1a', backgroundColor: '#fafafa',
  },
  inputError: { borderColor: '#e53e3e' },
  eye: { position: 'absolute', right: 12 },
  fieldError: { color: '#e53e3e', fontSize: 13, marginTop: 4 },

  rules: {
    backgroundColor: '#f8fffe', borderRadius: 8,
    padding: 12, marginTop: 10, gap: 6,
  },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleText: { fontSize: 13, color: '#aaa' },
  ruleTextPassed: { color: '#2d6a4f' },

  errorBox: {
    backgroundColor: '#fff5f5', borderRadius: 8,
    padding: 12, marginTop: 16,
  },
  errorText: { color: '#c53030', fontSize: 14, textAlign: 'center' },

  button: {
    backgroundColor: '#2d6a4f', padding: 16, borderRadius: 10,
    alignItems: 'center', marginTop: 24,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  logoutBtn: { alignItems: 'center', marginTop: 16, padding: 8 },
  logoutText: { color: '#aaa', fontSize: 14 },
});
