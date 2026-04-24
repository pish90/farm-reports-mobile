import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { adminService } from '../services/adminService';
import { authService } from '../services/authService';
import { useAuth } from '../store/AuthContext';

// ── Reusable password modal ───────────────────────────────────────────────────

interface PasswordModalProps {
  visible: boolean;
  title: string;
  fields: { key: string; label: string; placeholder: string }[];
  onSubmit: (values: Record<string, string>) => Promise<void>;
  onClose: () => void;
}

function PasswordModal({ visible, title, fields, onSubmit, onClose }: PasswordModalProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showFields, setShowFields] = useState<Record<string, boolean>>({});

  function reset() {
    setValues({});
    setSaving(false);
    setShowFields({});
  }

  async function handleSubmit() {
    for (const f of fields) {
      if (!values[f.key]?.trim()) {
        Alert.alert('Missing field', `${f.label} is required.`);
        return;
      }
    }
    setSaving(true);
    try {
      await onSubmit(values);
      reset();
      onClose();
    } catch (e: any) {
      setSaving(false);
      const msg = e?.response?.data?.error ?? e?.message ?? 'Something went wrong.';
      Alert.alert('Error', msg);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior="padding" style={styles.kvWrap} pointerEvents="box-none">
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>{title}</Text>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {fields.map((f) => (
              <View key={f.key}>
                <Text style={styles.label}>{f.label}</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    value={values[f.key] ?? ''}
                    onChangeText={(v) => setValues(prev => ({ ...prev, [f.key]: v }))}
                    placeholder={f.placeholder}
                    placeholderTextColor="#bbb"
                    secureTextEntry={!showFields[f.key] && f.key !== 'email'}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {f.key !== 'email' && (
                    <TouchableOpacity
                      style={styles.eyeBtn}
                      onPress={() => setShowFields(prev => ({ ...prev, [f.key]: !prev[f.key] }))}
                      hitSlop={8}
                    >
                      <Feather name={showFields[f.key] ? 'eye-off' : 'eye'} size={18} color="#aaa" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
            <View style={{ height: 8 }} />
          </ScrollView>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { reset(); onClose(); }}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={saving}
            >
              <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Settings row ──────────────────────────────────────────────────────────────

function SettingsRow({
  icon, label, subtitle, onPress, destructive = false,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  subtitle?: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.rowIcon, destructive && { backgroundColor: '#FFEDED' }]}>
        <Feather name={icon} size={18} color={destructive ? '#e53e3e' : '#2d6a4f'} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, destructive && { color: '#e53e3e' }]}>{label}</Text>
        {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      <Feather name="chevron-right" size={16} color="#ccc" />
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showResetPassword,  setShowResetPassword]  = useState(false);

  async function handleChangePassword(values: Record<string, string>) {
    await authService.changePassword(values.currentPassword, values.newPassword);
    Alert.alert('Success', 'Your password has been updated.');
  }

  async function handleResetPassword(values: Record<string, string>) {
    await adminService.resetUserPassword(values.email, values.newPassword);
    Alert.alert('Success', `Password reset for ${values.email}.`);
  }

  function confirmLogout() {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Account info */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>
            {user?.userName?.charAt(0)?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <View>
          <Text style={styles.profileName}>{user?.userName}</Text>
          <Text style={styles.profileMeta}>{user?.farmName} · {user?.role}</Text>
        </View>
      </View>

      {/* Account section */}
      <Text style={styles.sectionHeader}>Account</Text>
      <View style={styles.section}>
        <SettingsRow
          icon="lock"
          label="Change My Password"
          subtitle="Update your own login password"
          onPress={() => setShowChangePassword(true)}
        />
      </View>

      {/* Admin section */}
      {isAdmin && (
        <>
          <Text style={styles.sectionHeader}>Admin</Text>
          <View style={styles.section}>
            <SettingsRow
              icon="key"
              label="Reset a User's Password"
              subtitle="Reset password for any user by email"
              onPress={() => setShowResetPassword(true)}
            />
          </View>
        </>
      )}

      {/* Sign out */}
      <Text style={styles.sectionHeader}>Session</Text>
      <View style={styles.section}>
        <SettingsRow
          icon="log-out"
          label="Log Out"
          onPress={confirmLogout}
          destructive
        />
      </View>

      {/* Change own password */}
      <PasswordModal
        visible={showChangePassword}
        title="Change My Password"
        fields={[
          { key: 'currentPassword', label: 'Current Password', placeholder: 'Enter current password' },
          { key: 'newPassword',     label: 'New Password',     placeholder: 'Min. 6 characters' },
        ]}
        onSubmit={handleChangePassword}
        onClose={() => setShowChangePassword(false)}
      />

      {/* Admin: reset user password */}
      <PasswordModal
        visible={showResetPassword}
        title="Reset User Password"
        fields={[
          { key: 'email',       label: 'User Email',    placeholder: 'user@example.com' },
          { key: 'newPassword', label: 'New Password',  placeholder: 'Min. 6 characters' },
        ]}
        onSubmit={handleResetPassword}
        onClose={() => setShowResetPassword(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f9' },
  content:   { padding: 16, paddingBottom: 48 },

  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fff', borderRadius: 12,
    padding: 16, marginBottom: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#2d6a4f', alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 22, fontWeight: '700', color: '#fff' },
  profileName:   { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  profileMeta:   { fontSize: 13, color: '#888', marginTop: 2 },

  sectionHeader: {
    fontSize: 12, fontWeight: '600', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 8, marginTop: 4,
  },
  section: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  rowIcon: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: '#EDF7F1', alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  rowText:     { flex: 1 },
  rowLabel:    { fontSize: 15, fontWeight: '500', color: '#1a1a1a' },
  rowSubtitle: { fontSize: 12, color: '#aaa', marginTop: 2 },

  // Modal styles
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  kvWrap:   { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingBottom: 32, maxHeight: '80%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#e0e0e0',
    alignSelf: 'center', marginTop: 12, marginBottom: 16,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', textAlign: 'center', marginBottom: 16 },
  label:      { fontSize: 13, fontWeight: '600', color: '#555', marginTop: 12, marginBottom: 5 },
  inputRow:   { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
    color: '#1a1a1a', backgroundColor: '#fafafa',
  },
  eyeBtn: { position: 'absolute', right: 12 },

  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: {
    flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingVertical: 13, alignItems: 'center',
  },
  cancelText: { fontSize: 15, fontWeight: '600', color: '#666' },
  saveBtn: {
    flex: 1, backgroundColor: '#2d6a4f', borderRadius: 10,
    paddingVertical: 13, alignItems: 'center',
  },
  saveText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
