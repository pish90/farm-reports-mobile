import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRoute } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  createEmployee,
  deleteEmployeePayment,
  getEmployeeSummary,
  getEmployees,
  recordEmployeePayment,
  updateEmployee,
} from '../services/employeeService';
import {
  deletePayment,
  downloadAndShareMonthlyExcel,
  getCasualLabourerSummary,
  getCasualPayroll,
  recordPayment,
} from '../services/casualLabourerService';
import { useAuth } from '../store/AuthContext';
import {
  CasualLabourerPaymentDto,
  CasualLabourerSummaryDto,
  CasualPayrollEntry,
  EmployeeDto,
  EmployeePaymentDto,
  EmployeeSummaryDto,
} from '../types';

const TODAY = new Date().toISOString().slice(0, 10);

// ─── Employee row ─────────────────────────────────────────────────────────────

function EmployeeRow({
  employee,
  onTap,
  onDelete,
}: {
  employee: EmployeeDto;
  onTap: (e: EmployeeDto) => void;
  onDelete: (e: EmployeeDto) => void;
}) {
  const isSalaried = employee.employmentType === 'SALARIED';
  const photoUri = employee.photoBase64
    ? `data:${employee.photoMimeType ?? 'image/jpeg'};base64,${employee.photoBase64}`
    : null;

  return (
    <TouchableOpacity style={rowS.row} onPress={() => onTap(employee)} activeOpacity={0.75}>
      <View style={[rowS.avatar, { backgroundColor: isSalaried ? '#e8f5ef' : '#f3e8ff' }]}>
        {photoUri
          ? <Image source={{ uri: photoUri }} style={rowS.photo} />
          : <Feather name="user" size={16} color={isSalaried ? '#2d6a4f' : '#7c3aed'} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={rowS.name}>{employee.fullName}</Text>
        <Text style={[rowS.ls, { color: isSalaried ? '#2d6a4f' : '#7c3aed' }]}>
          {employee.lsNumber}
          {employee.employmentType === 'CASUAL' ? '  ·  Casual' : ''}
        </Text>
      </View>
      {employee.status === 'INACTIVE' && (
        <View style={rowS.inactiveBadge}><Text style={rowS.inactiveBadgeText}>Inactive</Text></View>
      )}
      <TouchableOpacity style={rowS.deleteBtn} onPress={() => onDelete(employee)} hitSlop={8}>
        <Feather name="trash-2" size={18} color="#e53e3e" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const rowS = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e8e8e8' },
  avatar:  { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 12, overflow: 'hidden' },
  photo:   { width: 36, height: 36, borderRadius: 18 },
  name:    { fontSize: 15, color: '#1a1a1a', fontWeight: '500' },
  ls:      { fontSize: 11, fontWeight: '600', marginTop: 1 },
  inactiveBadge: { backgroundColor: '#f3f3f3', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginRight: 8 },
  inactiveBadgeText: { fontSize: 10, color: '#999', fontWeight: '600' },
  deleteBtn: { padding: 6 },
});

// ─── Add Employee Modal ───────────────────────────────────────────────────────

function AddEmployeeModal({
  visible,
  onSave,
  onCancel,
}: {
  visible: boolean;
  onSave: (req: import('../types').EmployeeRequest) => Promise<void>;
  onCancel: () => void;
}) {
  const [type, setType]         = useState<'SALARIED' | 'CASUAL'>('SALARIED');
  const [firstName, setFirst]   = useState('');
  const [lastName, setLast]     = useState('');
  const [phone, setPhone]       = useState('');
  const [nationalId, setNatId]  = useState('');
  const [dob, setDob]           = useState('');
  const [startDate, setStart]   = useState('');
  const [dailyRate, setRate]     = useState('');
  const [photoUri, setPhotoUri]             = useState<string | null>(null);
  const [photoBase64, setPhotoBase64]       = useState<string | null>(null);
  const [photoMimeType, setPhotoMimeType]   = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setType('SALARIED'); setFirst(''); setLast(''); setPhone('');
    setNatId(''); setDob(''); setStart(''); setRate('');
    setPhotoUri(null); setPhotoBase64(null); setPhotoMimeType(null);
  }

  useEffect(() => {
    if (visible) {
      // default start date to today for casual entries
      setStart(TODAY);
    }
  }, [visible]);

  async function pickPhoto() {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    Alert.alert('Add Photo', 'Choose source', [
      {
        text: 'Take Photo', onPress: async () => {
          if (!p.granted) { Alert.alert('Permission required', 'Camera access needed.'); return; }
          const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true });
          if (!r.canceled && r.assets[0]) applyAsset(r.assets[0]);
        },
      },
      {
        text: 'Choose from Library', onPress: async () => {
          const q = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!q.granted) { Alert.alert('Permission required', 'Photo library access needed.'); return; }
          const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true });
          if (!r.canceled && r.assets[0]) applyAsset(r.assets[0]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function applyAsset(asset: ImagePicker.ImagePickerAsset) {
    setPhotoUri(asset.uri);
    setPhotoBase64(asset.base64 ?? null);
    setPhotoMimeType(asset.mimeType ?? 'image/jpeg');
  }

  async function handleSave() {
    const first = firstName.trim();
    if (!first) return;
    setSaving(true);
    try {
      await onSave({
        firstName: first,
        lastName: lastName.trim() || null,
        phone: phone.trim() || null,
        employmentType: type,
        nationalId: nationalId.trim() || null,
        dateOfBirth: dob.trim() || null,
        startDate: startDate.trim() || null,
        defaultDailyRate: type === 'CASUAL' && dailyRate ? parseFloat(dailyRate) : null,
        photoBase64,
        photoMimeType,
        status: 'ACTIVE',
      });
      reset();
    } finally {
      setSaving(false);
    }
  }

  const canSave = firstName.trim().length > 0 && !saving;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { reset(); onCancel(); }}>
      <View style={addS.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={addS.sheet}>
              <Text style={addS.title}>Add Employee</Text>

              {/* Type selector */}
              <View style={addS.typeRow}>
                <TouchableOpacity
                  style={[addS.typeBtn, type === 'SALARIED' && addS.typeBtnActive]}
                  onPress={() => setType('SALARIED')}
                >
                  <Text style={[addS.typeBtnText, type === 'SALARIED' && addS.typeBtnTextActive]}>Salaried</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[addS.typeBtn, type === 'CASUAL' && addS.typeBtnActiveCasual]}
                  onPress={() => setType('CASUAL')}
                >
                  <Text style={[addS.typeBtnText, type === 'CASUAL' && addS.typeBtnTextActiveCasual]}>Casual</Text>
                </TouchableOpacity>
              </View>

              {/* Photo */}
              <TouchableOpacity style={addS.photoWrap} onPress={pickPhoto} activeOpacity={0.8}>
                {photoUri
                  ? <Image source={{ uri: photoUri }} style={addS.photo} />
                  : <View style={addS.photoPlaceholder}>
                      <Feather name="camera" size={24} color="#aaa" />
                      <Text style={addS.photoHint}>Add photo</Text>
                    </View>}
              </TouchableOpacity>

              <Text style={addS.label}>First Name *</Text>
              <TextInput style={addS.input} value={firstName} onChangeText={setFirst} placeholder="Samuel" placeholderTextColor="#bbb" autoFocus maxLength={100} />

              <Text style={addS.label}>Last Name</Text>
              <TextInput style={addS.input} value={lastName} onChangeText={setLast} placeholder="Kamau" placeholderTextColor="#bbb" maxLength={100} />

              <Text style={addS.label}>Phone</Text>
              <TextInput style={addS.input} value={phone} onChangeText={setPhone} placeholder="+254…" placeholderTextColor="#bbb" keyboardType="phone-pad" maxLength={20} />

              <Text style={addS.label}>National ID</Text>
              <TextInput style={addS.input} value={nationalId} onChangeText={setNatId} placeholder="e.g. 12345678" placeholderTextColor="#bbb" maxLength={20} />

              <Text style={addS.label}>Date of Birth (YYYY-MM-DD)</Text>
              <TextInput style={addS.input} value={dob} onChangeText={setDob} placeholder="e.g. 1990-05-15" placeholderTextColor="#bbb" maxLength={10} />

              <Text style={addS.label}>Start Date (YYYY-MM-DD)</Text>
              <TextInput style={addS.input} value={startDate} onChangeText={setStart} placeholder={TODAY} placeholderTextColor="#bbb" maxLength={10} />

              {type === 'CASUAL' && (
                <>
                  <Text style={addS.label}>Default Daily Rate (Ksh)</Text>
                  <TextInput style={addS.input} value={dailyRate} onChangeText={setRate} placeholder="150" placeholderTextColor="#bbb" keyboardType="numeric" maxLength={10} />
                </>
              )}

              <View style={addS.actions}>
                <TouchableOpacity style={addS.cancelBtn} onPress={() => { reset(); onCancel(); }}>
                  <Text style={addS.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[addS.saveBtn, !canSave && addS.saveBtnDisabled]}
                  onPress={handleSave}
                  disabled={!canSave}
                >
                  {saving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={addS.saveText}>Save</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const addS = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:    { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, elevation: 10 },
  title:    { fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginBottom: 16 },

  typeRow:  { flexDirection: 'row', gap: 10, marginBottom: 18 },
  typeBtn:  { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center', backgroundColor: '#fafafa' },
  typeBtnActive:      { borderColor: '#2d6a4f', backgroundColor: '#e8f5ef' },
  typeBtnActiveCasual:{ borderColor: '#7c3aed', backgroundColor: '#f3e8ff' },
  typeBtnText:        { fontSize: 14, fontWeight: '600', color: '#888' },
  typeBtnTextActive:  { color: '#2d6a4f' },
  typeBtnTextActiveCasual: { color: '#7c3aed' },

  photoWrap:        { alignSelf: 'center', marginBottom: 18 },
  photo:            { width: 80, height: 80, borderRadius: 40 },
  photoPlaceholder: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e0e0e0', borderStyle: 'dashed' },
  photoHint:        { fontSize: 10, color: '#aaa', marginTop: 4 },

  label:   { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 5 },
  input:   { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1a1a1a', backgroundColor: '#fafafa', marginBottom: 14 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn:      { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  cancelText:     { fontSize: 15, color: '#555', fontWeight: '600' },
  saveBtn:        { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#2d6a4f', alignItems: 'center' },
  saveBtnDisabled:{ opacity: 0.4 },
  saveText:       { fontSize: 15, color: '#fff', fontWeight: '700' },
});

// ─── Employee Detail Modal ────────────────────────────────────────────────────

function EmployeeDetailModal({
  visible,
  employee,
  farmId,
  onClose,
  onRefresh,
}: {
  visible: boolean;
  employee: EmployeeDto | null;
  farmId: number;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const isSalaried = employee?.employmentType === 'SALARIED';
  const accentColor = isSalaried ? '#2d6a4f' : '#7c3aed';

  const [summary,      setSummary]      = useState<EmployeeSummaryDto | CasualLabourerSummaryDto | null>(null);
  const [loadingSum,   setLoadingSum]   = useState(false);
  const [showAddPay,   setShowAddPay]   = useState(false);
  const [payDate,      setPayDate]      = useState(TODAY);
  const [payAmount,    setPayAmount]    = useState('');
  const [payNote,      setPayNote]      = useState('');
  const [payLoading,   setPayLoading]   = useState(false);

  // Status toggle
  const [togglingStatus, setTogglingStatus] = useState(false);

  useEffect(() => {
    if (!visible || !employee) return;
    loadData();
  }, [visible, employee?.id]);

  async function loadData() {
    if (!employee) return;
    setLoadingSum(true);
    setSummary(null);
    try {
      if (isSalaried) {
        const s = await getEmployeeSummary(farmId, employee.id);
        setSummary(s);
      } else {
        const s = await getCasualLabourerSummary(farmId, employee.id);
        setSummary(s);
      }
    } catch {
      // offline — show zeros
    } finally {
      setLoadingSum(false);
    }
  }

  async function handleAddPayment() {
    if (!employee) return;
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0 || !payDate) return;
    setPayLoading(true);
    try {
      if (isSalaried) {
        await recordEmployeePayment(farmId, employee.id, { paymentDate: payDate, amount: amt, note: payNote.trim() || null });
      } else {
        await recordPayment(farmId, employee.id, { paymentDate: payDate, amount: amt, note: payNote.trim() || null });
      }
      setPayDate(TODAY); setPayAmount(''); setPayNote('');
      setShowAddPay(false);
      await loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to record payment.');
    } finally {
      setPayLoading(false);
    }
  }

  async function handleDeletePayment(payId: number, amount: number, date: string) {
    if (!employee) return;
    Alert.alert('Delete Payment', `Remove payment of Ksh ${amount} on ${date}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            if (isSalaried) {
              await deleteEmployeePayment(farmId, employee.id, payId);
            } else {
              await deletePayment(farmId, employee.id, payId);
            }
            await loadData();
          } catch (e: any) {
            Alert.alert('Error', e.message ?? 'Failed to delete payment.');
          }
        },
      },
    ]);
  }

  async function handleToggleStatus() {
    if (!employee) return;
    const newStatus = employee.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setTogglingStatus(true);
    try {
      await updateEmployee(farmId, employee.id, {
        firstName: employee.firstName,
        lastName: employee.lastName,
        phone: employee.phone,
        employmentType: employee.employmentType,
        jobTitle: employee.jobTitle,
        nationalId: employee.nationalId,
        dateOfBirth: employee.dateOfBirth,
        startDate: employee.startDate,
        defaultDailyRate: employee.defaultDailyRate,
        status: newStatus,
      });
      onRefresh();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to update status.');
    } finally {
      setTogglingStatus(false);
    }
  }

  if (!employee) return null;

  const photoUri = employee.photoBase64
    ? `data:${employee.photoMimeType ?? 'image/jpeg'};base64,${employee.photoBase64}`
    : null;

  const payments = summary?.payments ?? [];
  const earned   = summary?.allTimeEarned ?? 0;
  const paid     = summary?.allTimePaid ?? 0;
  const outstanding = summary?.outstanding ?? 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={detS.root}>
        {/* Header */}
        <View style={detS.header}>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Feather name="x" size={22} color="#333" />
          </TouchableOpacity>
          <Text style={detS.headerTitle}>Employee Details</Text>
          <View style={{ width: 30 }} />
        </View>

        <ScrollView contentContainerStyle={detS.scroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          {/* Profile */}
          <View style={detS.profile}>
            <View style={[detS.avatarWrap, { backgroundColor: isSalaried ? '#e8f5ef' : '#f3e8ff' }]}>
              {photoUri
                ? <Image source={{ uri: photoUri }} style={detS.avatar} />
                : <Text style={[detS.initials, { color: accentColor }]}>
                    {employee.fullName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                  </Text>}
            </View>
            <Text style={detS.name}>{employee.fullName}</Text>
            <View style={detS.badgeRow}>
              <View style={[detS.badge, { backgroundColor: isSalaried ? '#e8f5ef' : '#f3e8ff' }]}>
                <Text style={[detS.badgeText, { color: accentColor }]}>{employee.lsNumber}</Text>
              </View>
              <View style={[detS.badge, { backgroundColor: '#f3f3f3' }]}>
                <Text style={[detS.badgeText, { color: '#888' }]}>{isSalaried ? 'Salaried' : 'Casual'}</Text>
              </View>
            </View>
          </View>

          {/* Profile details */}
          <View style={detS.infoCard}>
            {employee.phone ? <InfoRow label="Phone" value={employee.phone} /> : null}
            {employee.nationalId ? <InfoRow label="National ID" value={employee.nationalId} /> : null}
            {employee.dateOfBirth ? <InfoRow label="Date of Birth" value={`${employee.dateOfBirth}${employee.age ? `  (Age ${employee.age})` : ''}`} /> : null}
            {employee.startDate ? <InfoRow label="Start Date" value={employee.startDate} /> : null}
            {employee.jobTitle ? <InfoRow label="Job Title" value={employee.jobTitle} /> : null}
            {!employee.phone && !employee.nationalId && !employee.dateOfBirth && !employee.startDate && (
              <Text style={detS.noInfo}>No profile details recorded.</Text>
            )}
          </View>

          {/* Status toggle */}
          <View style={detS.statusRow}>
            <Text style={detS.statusLabel}>Status: <Text style={{ color: employee.status === 'ACTIVE' ? '#2d6a4f' : '#e53e3e', fontWeight: '700' }}>{employee.status}</Text></Text>
            <TouchableOpacity
              style={[detS.toggleBtn, togglingStatus && { opacity: 0.5 }]}
              onPress={handleToggleStatus}
              disabled={togglingStatus}
            >
              {togglingStatus
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={detS.toggleBtnText}>
                    {employee.status === 'ACTIVE' ? 'Set Inactive' : 'Set Active'}
                  </Text>}
            </TouchableOpacity>
          </View>

          {/* Summary cards */}
          <View style={detS.cards}>
            {[
              { label: 'All-time Earned', value: earned, color: '#D8F3DC' },
              { label: 'Total Paid',      value: paid,     color: '#DBEAFE' },
              { label: 'Outstanding',     value: outstanding, color: '#EDE9FE' },
            ].map(({ label, value, color }) => (
              <View key={label} style={[detS.card, { backgroundColor: color }]}>
                <Text style={detS.cardLabel}>{label}</Text>
                <Text style={detS.cardValue}>
                  {loadingSum ? '…' : `Ksh ${Number(value).toLocaleString()}`}
                </Text>
              </View>
            ))}
          </View>

          {/* Payments section */}
          <View style={detS.section}>
            <View style={detS.sectionHeader}>
              <Text style={detS.sectionTitle}>Payments</Text>
              <TouchableOpacity
                style={[detS.addPayBtn, { backgroundColor: accentColor }]}
                onPress={() => setShowAddPay(s => !s)}
              >
                <Feather name="plus" size={14} color="#fff" />
                <Text style={detS.addPayText}>Add</Text>
              </TouchableOpacity>
            </View>

            {showAddPay && (
              <View style={detS.addPayForm}>
                <Text style={detS.fieldLabel}>Date (YYYY-MM-DD)</Text>
                <TextInput style={detS.fieldInput} value={payDate} onChangeText={setPayDate} placeholder="2026-06-01" placeholderTextColor="#bbb" maxLength={10} />
                <Text style={detS.fieldLabel}>Amount (Ksh)</Text>
                <TextInput style={detS.fieldInput} value={payAmount} onChangeText={setPayAmount} keyboardType="numeric" placeholder="0" placeholderTextColor="#bbb" maxLength={10} />
                <Text style={detS.fieldLabel}>Note (optional)</Text>
                <TextInput style={detS.fieldInput} value={payNote} onChangeText={setPayNote} placeholder="Week 1 wages, Advance…" placeholderTextColor="#bbb" maxLength={200} />
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <TouchableOpacity style={detS.cancelSmBtn} onPress={() => setShowAddPay(false)}>
                    <Text style={detS.cancelSmText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[detS.savePayBtn, { backgroundColor: accentColor }, (parseFloat(payAmount) <= 0 || !payDate || payLoading) && { opacity: 0.5 }]}
                    onPress={handleAddPayment}
                    disabled={parseFloat(payAmount) <= 0 || !payDate || payLoading}
                  >
                    {payLoading
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={detS.savePayText}>Save Payment</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {loadingSum ? (
              <ActivityIndicator size="small" color={accentColor} style={{ marginVertical: 16 }} />
            ) : payments.length === 0 ? (
              <Text style={detS.emptyPay}>No payments recorded yet.</Text>
            ) : (
              payments.map((p: any) => (
                <View key={p.id} style={detS.payRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={detS.payDate}>{p.paymentDate}</Text>
                    {p.note ? <Text style={detS.payNote}>{p.note}</Text> : null}
                    {p.paidBy ? <Text style={detS.payBy}>By {p.paidBy}</Text> : null}
                  </View>
                  <Text style={[detS.payAmt, { color: accentColor }]}>Ksh {Number(p.amount).toLocaleString()}</Text>
                  <TouchableOpacity onPress={() => handleDeletePayment(p.id, p.amount, p.paymentDate)} hitSlop={8} style={{ marginLeft: 8 }}>
                    <Feather name="trash-2" size={16} color="#e53e3e" />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={detS.infoRow}>
      <Text style={detS.infoLabel}>{label}</Text>
      <Text style={detS.infoValue}>{value}</Text>
    </View>
  );
}

const detS = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#f5f7f9' },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  scroll:      { padding: 16, paddingBottom: 40 },

  profile:        { alignItems: 'center', marginBottom: 16 },
  avatarWrap:     { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 12, overflow: 'hidden' },
  avatar:         { width: 88, height: 88, borderRadius: 44 },
  initials:       { fontSize: 28, fontWeight: '800' },
  name:           { fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginBottom: 8 },
  badgeRow:       { flexDirection: 'row', gap: 8 },
  badge:          { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText:      { fontSize: 12, fontWeight: '700' },

  infoCard:  { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#eee' },
  infoRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f5f5f5' },
  infoLabel: { fontSize: 13, color: '#888', fontWeight: '500' },
  infoValue: { fontSize: 13, color: '#1a1a1a', fontWeight: '500', textAlign: 'right', flex: 1, marginLeft: 12 },
  noInfo:    { fontSize: 13, color: '#bbb', textAlign: 'center', paddingVertical: 8 },

  statusRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#eee' },
  statusLabel:   { fontSize: 14, color: '#333', fontWeight: '500' },
  toggleBtn:     { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#555' },
  toggleBtnText: { fontSize: 13, color: '#fff', fontWeight: '600' },

  cards:       { flexDirection: 'row', gap: 8, marginBottom: 14 },
  card:        { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
  cardLabel:   { fontSize: 10, fontWeight: '600', color: '#555', marginBottom: 3, textAlign: 'center' },
  cardValue:   { fontSize: 13, fontWeight: '800', color: '#1a1a1a', textAlign: 'center' },

  section:       { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#eee' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle:  { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  addPayBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  addPayText:    { fontSize: 13, color: '#fff', fontWeight: '600' },

  addPayForm:    { backgroundColor: '#f9f9ff', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#ede9fe' },
  fieldLabel:    { fontSize: 12, fontWeight: '600', color: '#555', marginBottom: 4 },
  fieldInput:    { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#1a1a1a', backgroundColor: '#fff', marginBottom: 10 },
  cancelSmBtn:   { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  cancelSmText:  { fontSize: 14, color: '#555', fontWeight: '600' },
  savePayBtn:    { flex: 2, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  savePayText:   { fontSize: 14, color: '#fff', fontWeight: '700' },

  payRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0f0' },
  payDate:   { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  payNote:   { fontSize: 12, color: '#888', marginTop: 1 },
  payBy:     { fontSize: 11, color: '#bbb', marginTop: 1 },
  payAmt:    { fontSize: 15, fontWeight: '700' },
  emptyPay:  { fontSize: 13, color: '#bbb', textAlign: 'center', paddingVertical: 16 },
});

// ─── Casual Payroll Report Modal ──────────────────────────────────────────────

const MONTH_NAMES_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function CasualPayrollModal({ visible, farmId, onClose }: { visible: boolean; farmId: number; onClose: () => void }) {
  const now = new Date();
  const [year,    setYear]    = useState(now.getFullYear());
  const [month,   setMonth]   = useState(now.getMonth() + 1);
  const [rows,    setRows]    = useState<CasualPayrollEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    loadPayroll();
  }, [visible, year, month, farmId]);

  async function loadPayroll() {
    setLoading(true); setError(null);
    try { setRows(await getCasualPayroll(farmId, year, month)); }
    catch (e: any) { setError(e.message ?? 'Failed to load.'); }
    finally { setLoading(false); }
  }

  async function handleExport() {
    setExporting(true);
    try { await downloadAndShareMonthlyExcel(farmId, year, month); }
    catch (e: any) { Alert.alert('Export failed', e.message ?? 'Could not generate file.'); }
    finally { setExporting(false); }
  }

  const totalEarned      = rows.reduce((s, r) => s + Number(r.monthEarnings), 0);
  const totalOutstanding = rows.reduce((s, r) => s + Number(r.outstanding), 0);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={prS.root}>
        <View style={prS.header}>
          <TouchableOpacity onPress={onClose} hitSlop={8}><Feather name="x" size={22} color="#333" /></TouchableOpacity>
          <Text style={prS.headerTitle}>Casual Labour Report</Text>
          <TouchableOpacity style={[prS.exportBtn, exporting && { opacity: 0.5 }]} onPress={handleExport} disabled={exporting || loading} hitSlop={4}>
            {exporting
              ? <ActivityIndicator size="small" color="#2d6a4f" />
              : <><Feather name="download" size={14} color="#2d6a4f" /><Text style={prS.exportBtnText}>Excel</Text></>}
          </TouchableOpacity>
        </View>

        <View style={prS.monthRow}>
          <TouchableOpacity onPress={() => { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); }} hitSlop={8}>
            <Feather name="chevron-left" size={20} color="#2d6a4f" />
          </TouchableOpacity>
          <Text style={prS.monthLabel}>{MONTH_NAMES_LONG[month - 1]} {year}</Text>
          <TouchableOpacity onPress={() => { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); }} hitSlop={8}>
            <Feather name="chevron-right" size={20} color="#2d6a4f" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={prS.centered}><ActivityIndicator size="large" color="#2d6a4f" /></View>
        ) : error ? (
          <View style={prS.centered}>
            <Feather name="alert-triangle" size={32} color="#e53e3e" />
            <Text style={prS.errorText}>{error}</Text>
            <TouchableOpacity style={prS.retryBtn} onPress={loadPayroll}><Text style={prS.retryText}>Retry</Text></TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={prS.summaryStrip}>
              {[
                { val: rows.length,     lbl: 'Labourers',      color: '#1a1a1a' },
                { val: `Ksh ${totalEarned.toLocaleString()}`,      lbl: 'Month Earnings', color: '#2d6a4f' },
                { val: `Ksh ${totalOutstanding.toLocaleString()}`, lbl: 'Outstanding',    color: totalOutstanding > 0 ? '#b45309' : '#2d6a4f' },
              ].map(({ val, lbl, color }, i) => (
                <View key={lbl} style={{ flex: 1 }}>
                  {i > 0 && <View style={{ position: 'absolute', left: 0, top: 4, bottom: 4, width: 1, backgroundColor: '#eee' }} />}
                  <View style={prS.summaryItem}>
                    <Text style={[prS.summaryVal, { color }]}>{String(val)}</Text>
                    <Text style={prS.summaryLbl}>{lbl}</Text>
                  </View>
                </View>
              ))}
            </View>

            {rows.length === 0 ? (
              <View style={prS.centered}><Feather name="user-check" size={44} color="#ccc" /><Text style={prS.emptyText}>No casual labourers for this period.</Text></View>
            ) : (
              <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
                <View style={prS.colHeader}>
                  {['Labourer','Days','Earned','Paid','Balance'].map((h, i) => (
                    <Text key={h} style={[prS.colHdr, i === 0 ? { flex: 2 } : { width: 75, textAlign: i === 1 ? 'center' : 'right' }]}>{h}</Text>
                  ))}
                </View>
                {rows.map(r => {
                  const photoUri = r.photoBase64 ? `data:${r.photoMimeType ?? 'image/jpeg'};base64,${r.photoBase64}` : null;
                  return (
                    <View key={r.labourerId} style={prS.row}>
                      <View style={prS.avatar}>
                        {photoUri
                          ? <Image source={{ uri: photoUri }} style={prS.avatarImg} />
                          : <Text style={prS.avatarInitials}>{r.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}</Text>}
                      </View>
                      <View style={{ flex: 2, marginRight: 4 }}>
                        <Text style={prS.rowName} numberOfLines={1}>{r.name}</Text>
                      </View>
                      <Text style={[prS.rowNum, { width: 75, textAlign: 'center' }]}>{r.daysPresent}</Text>
                      <Text style={[prS.rowNum, { width: 75, textAlign: 'right' }]}>{Number(r.monthEarnings).toLocaleString()}</Text>
                      <Text style={[prS.rowNum, { width: 75, textAlign: 'right', color: '#2d6a4f' }]}>{Number(r.allTimePaid).toLocaleString()}</Text>
                      <Text style={[prS.rowNum, { width: 75, textAlign: 'right', fontWeight: '700', color: Number(r.outstanding) > 0 ? '#b45309' : '#2d6a4f' }]}>{Number(r.outstanding).toLocaleString()}</Text>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const prS = StyleSheet.create({
  root:         { flex: 1, backgroundColor: '#f5f7f9' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' },
  headerTitle:  { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  exportBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#2d6a4f', backgroundColor: '#e8f5ef' },
  exportBtnText:{ fontSize: 13, fontWeight: '700', color: '#2d6a4f' },
  monthRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee', gap: 16 },
  monthLabel:   { fontSize: 16, fontWeight: '700', color: '#1a1a1a', minWidth: 160, textAlign: 'center' },
  summaryStrip: { flexDirection: 'row', backgroundColor: '#fff', marginVertical: 10, marginHorizontal: 12, borderRadius: 12, paddingVertical: 14, elevation: 2 },
  summaryItem:  { alignItems: 'center' },
  summaryVal:   { fontSize: 15, fontWeight: '800' },
  summaryLbl:   { fontSize: 10, color: '#888', marginTop: 2 },
  colHeader:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#eef2f0', marginHorizontal: 12, borderRadius: 8, marginBottom: 4 },
  colHdr:       { fontSize: 10, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.5 },
  row:          { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 1, paddingHorizontal: 10, paddingVertical: 12, borderRadius: 8 },
  avatar:       { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ede9fe', alignItems: 'center', justifyContent: 'center', marginRight: 8, overflow: 'hidden' },
  avatarImg:    { width: 36, height: 36, borderRadius: 18 },
  avatarInitials:{ fontSize: 13, fontWeight: '800', color: '#7c3aed' },
  rowName:      { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  rowNum:       { fontSize: 13, color: '#1a1a1a' },
  centered:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText:    { marginTop: 12, color: '#e53e3e', textAlign: 'center', fontSize: 14 },
  retryBtn:     { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#2d6a4f', borderRadius: 8 },
  retryText:    { color: '#fff', fontWeight: '600', fontSize: 14 },
  emptyText:    { fontSize: 14, color: '#aaa', marginTop: 14, textAlign: 'center' },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WorkersScreen() {
  const { user }  = useAuth();
  const route     = useRoute();
  const routeParams = route.params as { farmId?: number } | undefined;
  const farmId    = routeParams?.farmId ?? user?.farmId!;

  const [employees,  setEmployees]  = useState<EmployeeDto[]>([]);
  const [isLoaded,   setIsLoaded]   = useState(false);
  const [loadError,  setLoadError]  = useState<string | null>(null);
  const [search,     setSearch]     = useState('');

  const [showAdd,    setShowAdd]    = useState(false);
  const [showPayrollReport, setShowPayrollReport] = useState(false);
  const [detailEmployee,    setDetailEmployee]    = useState<EmployeeDto | null>(null);

  const load = useCallback(async () => {
    if (!farmId) return;
    setIsLoaded(false); setLoadError(null);
    try {
      setEmployees(await getEmployees(farmId));
    } catch (e: any) {
      setLoadError(e.message ?? 'Failed to load employees');
    } finally {
      setIsLoaded(true);
    }
  }, [farmId]);

  useEffect(() => { load(); }, [load]);

  const filtered = employees.filter(e => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      e.fullName.toLowerCase().includes(q) ||
      e.lsNumber.toLowerCase().includes(q) ||
      (e.nationalId ?? '').toLowerCase().includes(q)
    );
  });

  const handleAdd = useCallback(async (req: import('../types').EmployeeRequest) => {
    if (!farmId) return;
    await createEmployee(farmId, req);
    setShowAdd(false);
    await load();
  }, [farmId, load]);

  const handleDelete = useCallback((employee: EmployeeDto) => {
    Alert.alert(
      'Archive Employee',
      `Archive ${employee.fullName}? Their historical data will be preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive', style: 'destructive',
          onPress: async () => {
            try {
              await updateEmployee(farmId, employee.id, {
                firstName: employee.firstName,
                lastName: employee.lastName,
                phone: employee.phone,
                employmentType: employee.employmentType,
                status: 'INACTIVE',
              });
              await load();
            } catch { Alert.alert('Error', 'Failed to archive employee.'); }
          },
        },
      ],
    );
  }, [farmId, load]);

  const casualCount = employees.filter(e => e.employmentType === 'CASUAL').length;

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchWrap}>
        <Feather name="search" size={15} color="#aaa" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or LS number…"
          placeholderTextColor="#bbb"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
            <Feather name="x" size={15} color="#aaa" />
          </TouchableOpacity>
        )}
      </View>

      {/* Toolbar */}
      <View style={styles.toolbar}>
        <Text style={styles.count}>{employees.length} employee{employees.length !== 1 ? 's' : ''}</Text>
        {casualCount > 0 && (
          <TouchableOpacity style={styles.reportBtn} onPress={() => setShowPayrollReport(true)} activeOpacity={0.8}>
            <Feather name="bar-chart-2" size={14} color="#2d6a4f" />
            <Text style={styles.reportBtnText}>Casual Report</Text>
          </TouchableOpacity>
        )}
      </View>

      {loadError ? (
        <View style={styles.centered}>
          <Feather name="alert-triangle" size={32} color="#e53e3e" />
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : !isLoaded ? (
        <View style={styles.centered}><ActivityIndicator size="large" color="#2d6a4f" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(e) => String(e.id)}
          renderItem={({ item }) => (
            <EmployeeRow
              employee={item}
              onTap={emp => setDetailEmployee(emp)}
              onDelete={handleDelete}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="users" size={44} color="#ccc" />
              <Text style={styles.emptyText}>{search ? 'No matching employees' : 'No employees yet'}</Text>
              {!search && <Text style={styles.emptyHint}>Tap + to add the first employee</Text>}
            </View>
          }
          contentContainerStyle={filtered.length === 0 ? { flex: 1 } : undefined}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)} activeOpacity={0.85}>
        <Feather name="user-plus" size={24} color="#fff" />
      </TouchableOpacity>

      <AddEmployeeModal visible={showAdd} onSave={handleAdd} onCancel={() => setShowAdd(false)} />

      <EmployeeDetailModal
        visible={detailEmployee !== null}
        employee={detailEmployee}
        farmId={farmId}
        onClose={() => setDetailEmployee(null)}
        onRefresh={load}
      />

      <CasualPayrollModal visible={showPayrollReport} farmId={farmId} onClose={() => setShowPayrollReport(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f9' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    margin: 12, marginBottom: 0,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#eee',
  },
  searchInput: { flex: 1, fontSize: 15, color: '#1a1a1a' },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0f0', marginTop: 8 },
  count:   { fontSize: 13, color: '#888' },
  reportBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#2d6a4f', backgroundColor: '#e8f5ef' },
  reportBtnText:  { fontSize: 13, fontWeight: '600', color: '#2d6a4f' },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { marginTop: 12, color: '#e53e3e', textAlign: 'center', fontSize: 14 },
  retryBtn:  { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#2d6a4f', borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  empty:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 64 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#aaa', marginTop: 14 },
  emptyHint: { fontSize: 13, color: '#bbb', marginTop: 4 },
  fab: {
    position: 'absolute', bottom: 24, right: 24, width: 58, height: 58, borderRadius: 29,
    backgroundColor: '#2d6a4f', alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 5,
  },
});
