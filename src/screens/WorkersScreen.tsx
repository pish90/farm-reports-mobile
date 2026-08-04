import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
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
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateField from '../components/shared/DateField';
import YearSelector from '../components/shared/YearSelector';
import {
  createEmployee,
  getEmployeeLedger,
  getEmployeeSummary,
  getEmployees,
  recordEmployeePayment,
  updateEmployee,
} from '../services/employeeService';
import {
  getCasualLabourerLedger,
  getCasualLabourerSummary,
  recordPayment,
} from '../services/casualLabourerService';
import { getPayroll, saveEmployeePayrollEntry } from '../services/payrollService';
import { useAuth } from '../store/AuthContext';
import {
  AttendanceStackParamList,
  CasualLabourerSummaryDto,
  EmployeeDto,
  EmployeeLedgerDto,
  EmployeeLedgerMonthDto,
  EmployeeSummaryDto,
} from '../types';

const TODAY = new Date().toISOString().slice(0, 10);
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// LS numbers carry a trailing farm letter (e.g. LS2032B) for the database/master
// registry, but the client doesn't want that letter shown in the app.
function displayLs(lsNumber: string): string {
  return /^LS\d+[A-Za-z]$/.test(lsNumber) ? lsNumber.slice(0, -1) : lsNumber;
}

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
          {displayLs(employee.lsNumber)}
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
  const [gender, setGender]     = useState<'Male' | 'Female' | 'Other' | ''>('');
  const [dob, setDob]           = useState('');
  const [startDate, setStart]   = useState('');
  const [dailyRate, setRate]     = useState('');
  const [photoUri, setPhotoUri]             = useState<string | null>(null);
  const [photoBase64, setPhotoBase64]       = useState<string | null>(null);
  const [photoMimeType, setPhotoMimeType]   = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setType('SALARIED'); setFirst(''); setLast(''); setPhone('');
    setNatId(''); setGender(''); setDob(''); setStart(''); setRate('');
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
        gender: gender || null,
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

              <Text style={addS.label}>Gender</Text>
              <View style={addS.genderRow}>
                {(['Male', 'Female', 'Other'] as const).map(g => (
                  <TouchableOpacity
                    key={g}
                    style={[addS.genderBtn, gender === g && addS.genderBtnActive]}
                    onPress={() => setGender(gender === g ? '' : g)}
                  >
                    <Text style={[addS.genderBtnText, gender === g && addS.genderBtnTextActive]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={addS.label}>Date of Birth</Text>
              <DateField value={dob} onChange={setDob} placeholder="Select date of birth" style={addS.input} allowFuture={false} />

              <Text style={addS.label}>Start Date</Text>
              <DateField value={startDate} onChange={setStart} placeholder={TODAY} style={addS.input} />

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
  genderRow:         { flexDirection: 'row', gap: 8, marginBottom: 14 },
  genderBtn:         { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center', backgroundColor: '#fafafa' },
  genderBtnActive:   { borderColor: '#2d6a4f', backgroundColor: '#e8f5ef' },
  genderBtnText:     { fontSize: 14, fontWeight: '600', color: '#888' },
  genderBtnTextActive: { color: '#2d6a4f' },
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
  const isActive   = employee?.status === 'ACTIVE';
  const accentColor = isSalaried ? '#2d6a4f' : '#7c3aed';

  const [summary,      setSummary]      = useState<EmployeeSummaryDto | CasualLabourerSummaryDto | null>(null);
  const [loadingSum,   setLoadingSum]   = useState(false);

  // Status toggle
  const [togglingStatus, setTogglingStatus] = useState(false);

  // Edit profile details
  const [isEditing,  setIsEditing]  = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [efFirst,    setEfFirst]    = useState('');
  const [efLast,     setEfLast]     = useState('');
  const [efPhone,    setEfPhone]    = useState('');
  const [efNatId,    setEfNatId]    = useState('');
  const [efGender,   setEfGender]   = useState<'Male' | 'Female' | 'Other' | ''>('');
  const [efDob,      setEfDob]      = useState('');
  const [efStart,    setEfStart]    = useState('');
  const [efJobTitle, setEfJobTitle] = useState('');
  const [efRate,     setEfRate]     = useState('');

  const now = new Date();

  // Annual ledger
  const [ledgerYear, setLedgerYear] = useState(now.getFullYear());
  const [ledger, setLedger] = useState<EmployeeLedgerDto | null>(null);
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Ledger row inline edit
  const [editingMonth, setEditingMonth] = useState<number | null>(null);
  const [rowEarned, setRowEarned] = useState('');
  const [rowPaid, setRowPaid] = useState('');
  const [savingRow, setSavingRow] = useState(false);

  useEffect(() => {
    if (!visible || !employee) return;
    loadData();
  }, [visible, employee?.id]);

  useEffect(() => {
    if (!visible) {
      setIsEditing(false);
      setEditingMonth(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !employee) return;
    loadLedger();
  }, [visible, employee?.id, ledgerYear]);

  async function loadLedger() {
    if (!employee) return;
    setLoadingLedger(true);
    try {
      setLedger(isSalaried
        ? await getEmployeeLedger(farmId, employee.id, ledgerYear)
        : await getCasualLabourerLedger(farmId, employee.id, ledgerYear));
    } catch {
      setLedger(null);
    } finally {
      setLoadingLedger(false);
    }
  }

  function lastDayOfMonthCapped(year: number, month: number): string {
    const today = new Date();
    if (year === today.getFullYear() && month === today.getMonth() + 1) return TODAY;
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }

  function startEditRow(m: EmployeeLedgerMonthDto) {
    setEditingMonth(m.month);
    setRowEarned(String(m.earned));
    setRowPaid(String(m.paid));
  }

  function cancelEditRow() {
    setEditingMonth(null);
  }

  async function handleSaveRow() {
    if (!employee || editingMonth == null || !ledger) return;
    const monthData = ledger.months.find(mm => mm.month === editingMonth);
    if (!monthData) return;
    setSavingRow(true);
    try {
      const newEarned = parseFloat(rowEarned.replace(/,/g, '')) || 0;
      const newPaid = parseFloat(rowPaid.replace(/,/g, '')) || 0;

      if (isSalaried) {
        const existingRows = await getPayroll(farmId, ledgerYear, editingMonth);
        const existing = existingRows.find(r => r.employeeId === employee.id);
        const newRemaining = (existing?.amountRemaining ?? 0) - (existing?.grossSalary ?? 0) + newEarned;
        await saveEmployeePayrollEntry(farmId, ledgerYear, editingMonth, employee.id, {
          employeeId: employee.id,
          salaryRate: existing?.salaryRate ?? null,
          daysWorked: existing?.daysWorked ?? null,
          grossSalary: newEarned,
          loans: existing?.loans ?? 0,
          amountPaid: existing?.amountPaid ?? 0,
          amountRemaining: newRemaining,
          notes: existing?.notes ?? null,
        });
      }

      const delta = newPaid - monthData.paid;
      if (delta > 0) {
        const paymentDate = lastDayOfMonthCapped(ledgerYear, editingMonth);
        if (isSalaried) {
          await recordEmployeePayment(farmId, employee.id, { paymentDate, amount: delta, note: 'Ledger adjustment' });
        } else {
          await recordPayment(farmId, employee.id, { paymentDate, amount: delta, note: 'Ledger adjustment' });
        }
      } else if (delta < 0) {
        Alert.alert(
          'Cannot Reduce Paid Amount',
          'Paid amounts can only be increased from here. To reduce a recorded payment, use the web console.',
        );
      }

      setEditingMonth(null);
      await loadLedger();
      await loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to save.');
    } finally {
      setSavingRow(false);
    }
  }

  function requireActive(action: () => void) {
    if (!isActive) {
      Alert.alert('Employee is Inactive', 'Set this employee to Active before editing their details or recording payments.');
      return;
    }
    action();
  }

  function startEdit() {
    if (!employee) return;
    setEfFirst(employee.firstName ?? '');
    setEfLast(employee.lastName ?? '');
    setEfPhone(employee.phone ?? '');
    setEfNatId(employee.nationalId ?? '');
    setEfGender((employee.gender as 'Male' | 'Female' | 'Other' | null) ?? '');
    setEfDob(employee.dateOfBirth ?? '');
    setEfStart(employee.startDate ?? '');
    setEfJobTitle(employee.jobTitle ?? '');
    setEfRate(employee.defaultDailyRate != null ? String(employee.defaultDailyRate) : '');
    setIsEditing(true);
  }

  async function handleSaveEdit() {
    if (!employee) return;
    const first = efFirst.trim();
    if (!first) { Alert.alert('First name required'); return; }
    setEditSaving(true);
    try {
      await updateEmployee(farmId, employee.id, {
        firstName: first,
        lastName: efLast.trim() || null,
        phone: efPhone.trim() || null,
        employmentType: employee.employmentType,
        jobTitle: efJobTitle.trim() || null,
        nationalId: efNatId.trim() || null,
        gender: efGender || null,
        dateOfBirth: efDob.trim() || null,
        startDate: efStart.trim() || null,
        defaultDailyRate: employee.employmentType === 'CASUAL' && efRate ? parseFloat(efRate) : null,
        status: employee.status,
      });
      setIsEditing(false);
      onRefresh();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to update employee.');
    } finally {
      setEditSaving(false);
    }
  }

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
        gender: employee.gender,
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
          {isEditing
            ? (
              <TouchableOpacity onPress={handleSaveEdit} disabled={editSaving} hitSlop={8} style={{ width: 44, alignItems: 'flex-end' }}>
                {editSaving ? <ActivityIndicator size="small" color="#2d6a4f" /> : <Text style={detS.headerAction}>Save</Text>}
              </TouchableOpacity>
            )
            : <View style={{ width: 44 }} />}
        </View>

        <ScrollView contentContainerStyle={detS.scroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          {/* Profile — tap avatar/name to edit */}
          <TouchableOpacity
            style={detS.profile}
            activeOpacity={isEditing ? 1 : 0.7}
            disabled={isEditing}
            onPress={() => requireActive(startEdit)}
          >
            <View style={{ position: 'relative' }}>
              <View style={[detS.avatarWrap, { backgroundColor: isSalaried ? '#e8f5ef' : '#f3e8ff' }]}>
                {photoUri
                  ? <Image source={{ uri: photoUri }} style={detS.avatar} />
                  : <Text style={[detS.initials, { color: accentColor }]}>
                      {employee.fullName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                    </Text>}
              </View>
              {!isEditing && (
                <View style={[detS.editBadge, { backgroundColor: accentColor }]}>
                  <Feather name="edit-2" size={12} color="#fff" />
                </View>
              )}
            </View>
            <Text style={detS.name}>{employee.fullName}</Text>
            <View style={detS.badgeRow}>
              <View style={[detS.badge, { backgroundColor: isSalaried ? '#e8f5ef' : '#f3e8ff' }]}>
                <Text style={[detS.badgeText, { color: accentColor }]}>{displayLs(employee.lsNumber)}</Text>
              </View>
              <View style={[detS.badge, { backgroundColor: '#f3f3f3' }]}>
                <Text style={[detS.badgeText, { color: '#888' }]}>{isSalaried ? 'Salaried' : 'Casual'}</Text>
              </View>
            </View>
          </TouchableOpacity>

          {!isActive && (
            <View style={detS.inactiveBanner}>
              <Feather name="lock" size={14} color="#b45309" />
              <Text style={detS.inactiveBannerText}>
                This employee is inactive. Set them Active to edit details, monthly pay, or payments.
              </Text>
            </View>
          )}

          {/* Profile details */}
          <View style={detS.infoCard}>
            {isEditing ? (
              <>
                <Text style={detS.fieldLabel}>First Name *</Text>
                <TextInput style={detS.fieldInput} value={efFirst} onChangeText={setEfFirst} placeholder="First name" placeholderTextColor="#bbb" maxLength={100} />
                <Text style={detS.fieldLabel}>Last Name</Text>
                <TextInput style={detS.fieldInput} value={efLast} onChangeText={setEfLast} placeholder="Last name" placeholderTextColor="#bbb" maxLength={100} />
                <Text style={detS.fieldLabel}>Phone</Text>
                <TextInput style={detS.fieldInput} value={efPhone} onChangeText={setEfPhone} placeholder="+254…" placeholderTextColor="#bbb" keyboardType="phone-pad" maxLength={20} />
                <Text style={detS.fieldLabel}>National ID</Text>
                <TextInput style={detS.fieldInput} value={efNatId} onChangeText={setEfNatId} placeholder="e.g. 12345678" placeholderTextColor="#bbb" maxLength={20} />
                <Text style={detS.fieldLabel}>Gender</Text>
                <View style={detS.genderRow}>
                  {(['Male', 'Female', 'Other'] as const).map(g => (
                    <TouchableOpacity
                      key={g}
                      style={[detS.genderBtn, efGender === g && detS.genderBtnActive]}
                      onPress={() => setEfGender(efGender === g ? '' : g)}
                    >
                      <Text style={[detS.genderBtnText, efGender === g && detS.genderBtnTextActive]}>{g}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={detS.fieldLabel}>Date of Birth</Text>
                <DateField value={efDob} onChange={setEfDob} placeholder="Select date of birth" style={detS.fieldInput} accentColor={accentColor} allowFuture={false} />
                <Text style={detS.fieldLabel}>Start Date</Text>
                <DateField value={efStart} onChange={setEfStart} placeholder={TODAY} style={detS.fieldInput} accentColor={accentColor} />
                <Text style={detS.fieldLabel}>Job Title</Text>
                <TextInput style={detS.fieldInput} value={efJobTitle} onChangeText={setEfJobTitle} placeholder="e.g. Herdsman" placeholderTextColor="#bbb" maxLength={100} />
                {!isSalaried && (
                  <>
                    <Text style={detS.fieldLabel}>Default Daily Rate (Ksh)</Text>
                    <TextInput style={detS.fieldInput} value={efRate} onChangeText={setEfRate} keyboardType="numeric" placeholder="150" placeholderTextColor="#bbb" maxLength={10} />
                  </>
                )}
                <TouchableOpacity style={detS.cancelSmBtn} onPress={() => setIsEditing(false)}>
                  <Text style={detS.cancelSmText}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {employee.phone ? <InfoRow label="Phone" value={employee.phone} /> : null}
                {employee.nationalId ? <InfoRow label="National ID" value={employee.nationalId} /> : null}
                {employee.gender ? <InfoRow label="Gender" value={employee.gender} /> : null}
                {employee.dateOfBirth ? <InfoRow label="Date of Birth" value={`${employee.dateOfBirth}${employee.age ? `  (Age ${employee.age})` : ''}`} /> : null}
                {employee.startDate ? <InfoRow label="Start Date" value={employee.startDate} /> : null}
                {employee.jobTitle ? <InfoRow label="Job Title" value={employee.jobTitle} /> : null}
                {!employee.phone && !employee.nationalId && !employee.dateOfBirth && !employee.startDate && (
                  <Text style={detS.noInfo}>No profile details recorded.</Text>
                )}
              </>
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

          {/* Summary cards — leading spacer keeps these aligned with the ledger table's columns below */}
          <View style={detS.cards}>
            <View style={{ flex: 1 }} />
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

          {/* Annual Ledger — tap a month to edit; casual Earned is read-only (computed from work sessions) */}
          <View style={detS.section}>
            <View style={detS.sectionHeader}>
              <Text style={detS.sectionTitle}>Annual Ledger</Text>
              {loadingLedger && <ActivityIndicator size="small" color={accentColor} />}
            </View>
            <YearSelector year={ledgerYear} onChange={setLedgerYear} />

            {!loadingLedger && ledger && (
              <View style={detS.ledgerTable}>
                <View style={detS.ledgerHeaderRow}>
                  <Text style={[detS.ledgerCell, detS.ledgerMonthCell, detS.ledgerHeaderText]}>Month</Text>
                  <Text style={[detS.ledgerCell, detS.ledgerHeaderText]}>Earned</Text>
                  <Text style={[detS.ledgerCell, detS.ledgerHeaderText]}>Paid</Text>
                  <Text style={[detS.ledgerCell, detS.ledgerHeaderText]}>Balance</Text>
                </View>
                {ledger.months.map(m => (
                  editingMonth === m.month ? (
                    <View key={m.month} style={detS.ledgerEditRow}>
                      <Text style={[detS.ledgerCell, detS.ledgerMonthCell]}>{MONTH_ABBR[m.month - 1]}</Text>
                      <TextInput
                        style={detS.ledgerEditInput}
                        value={rowEarned}
                        onChangeText={setRowEarned}
                        keyboardType="numeric"
                        editable={isSalaried}
                        selectTextOnFocus
                      />
                      <TextInput
                        style={detS.ledgerEditInput}
                        value={rowPaid}
                        onChangeText={setRowPaid}
                        keyboardType="numeric"
                        selectTextOnFocus
                      />
                      <View style={detS.ledgerEditActions}>
                        <TouchableOpacity onPress={cancelEditRow} hitSlop={6} disabled={savingRow}>
                          <Feather name="x" size={16} color="#888" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleSaveRow} hitSlop={6} disabled={savingRow}>
                          {savingRow
                            ? <ActivityIndicator size="small" color={accentColor} />
                            : <Feather name="check" size={16} color={accentColor} />}
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      key={m.month}
                      style={detS.ledgerRow}
                      activeOpacity={0.6}
                      onPress={() => requireActive(() => startEditRow(m))}
                    >
                      <Text style={[detS.ledgerCell, detS.ledgerMonthCell]}>{MONTH_ABBR[m.month - 1]}</Text>
                      <Text style={detS.ledgerCell}>{Number(m.earned).toLocaleString()}</Text>
                      <Text style={detS.ledgerCell}>{Number(m.paid).toLocaleString()}</Text>
                      <Text style={[detS.ledgerCell, { fontWeight: '700' }]}>{Number(m.balance).toLocaleString()}</Text>
                    </TouchableOpacity>
                  )
                ))}
              </View>
            )}

            {!loadingLedger && !ledger && (
              <Text style={detS.noInfo}>No ledger data available.</Text>
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
  headerAction:{ fontSize: 15, fontWeight: '700', color: '#2d6a4f' },
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

  genderRow:           { flexDirection: 'row', gap: 8, marginBottom: 14 },
  genderBtn:           { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center', backgroundColor: '#fafafa' },
  genderBtnActive:     { borderColor: '#2d6a4f', backgroundColor: '#e8f5ef' },
  genderBtnText:       { fontSize: 14, fontWeight: '600', color: '#888' },
  genderBtnTextActive: { color: '#2d6a4f' },

  inactiveBanner:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fffbeb', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#fde68a' },
  inactiveBannerText: { flex: 1, fontSize: 12, color: '#92400e', fontWeight: '500' },

  statusRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#eee' },
  statusLabel:   { fontSize: 14, color: '#333', fontWeight: '500' },
  toggleBtn:     { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#555' },
  toggleBtnText: { fontSize: 13, color: '#fff', fontWeight: '600' },

  cards:       { flexDirection: 'row', gap: 8, marginBottom: 14 },
  card:        { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
  cardLabel:   { fontSize: 10, fontWeight: '600', color: '#555', marginBottom: 3, textAlign: 'center' },
  cardValue:   { fontSize: 13, fontWeight: '800', color: '#1a1a1a', textAlign: 'center' },

  editBadge: { position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },

  section:       { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#eee' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle:  { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },

  fieldLabel:    { fontSize: 12, fontWeight: '600', color: '#555', marginBottom: 4 },
  fieldInput:    { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#1a1a1a', backgroundColor: '#fff', marginBottom: 10 },
  cancelSmBtn:   { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  cancelSmText:  { fontSize: 14, color: '#555', fontWeight: '600' },

  ledgerTable:      { borderWidth: 1, borderColor: '#eee', borderRadius: 8, overflow: 'hidden', marginTop: 4 },
  ledgerHeaderRow:  { flexDirection: 'row', backgroundColor: '#f9f9f9', paddingVertical: 8, paddingHorizontal: 10 },
  ledgerRow:        { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#f0f0f0' },
  ledgerCell:       { flex: 1, fontSize: 12, color: '#1a1a1a', textAlign: 'right' },
  ledgerMonthCell:  { textAlign: 'left', fontWeight: '600' },
  ledgerHeaderText: { fontWeight: '700', color: '#555', fontSize: 11 },
  ledgerEditRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#f0f0f0', backgroundColor: '#fafffb' },
  ledgerEditInput:    { flex: 1, fontSize: 12, borderWidth: 1, borderColor: '#ddd', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, marginHorizontal: 2, textAlign: 'right', color: '#1a1a1a' },
  ledgerEditActions:  { flexDirection: 'row', gap: 8, marginLeft: 6 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WorkersScreen() {
  const { user }  = useAuth();
  const route     = useRoute();
  const navigation = useNavigation<NativeStackNavigationProp<AttendanceStackParamList>>();
  const routeParams = route.params as { farmId?: number } | undefined;
  const farmId    = routeParams?.farmId ?? user?.farmId!;

  const [employees,  setEmployees]  = useState<EmployeeDto[]>([]);
  const [isLoaded,   setIsLoaded]   = useState(false);
  const [loadError,  setLoadError]  = useState<string | null>(null);
  const [search,     setSearch]     = useState('');

  const [showAdd,    setShowAdd]    = useState(false);
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
                jobTitle: employee.jobTitle,
                nationalId: employee.nationalId,
                gender: employee.gender,
                dateOfBirth: employee.dateOfBirth,
                startDate: employee.startDate,
                defaultDailyRate: employee.defaultDailyRate,
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
        {!routeParams?.farmId && casualCount > 0 && (
          <TouchableOpacity style={styles.reportBtn} onPress={() => navigation.navigate('CasualHome')} activeOpacity={0.8}>
            <Feather name="calendar" size={14} color="#2d6a4f" />
            <Text style={styles.reportBtnText}>Work Sessions</Text>
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
