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
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  addCasualLabourer,
  deactivateCasualLabourer,
  deletePayment,
  downloadAndShareMonthlyExcel,
  getCasualLabourerSummary,
  getCasualLabourers,
  getCasualPayroll,
  recordPayment,
} from '../services/casualLabourerService';
import { WorkerDto, addWorker, deactivateWorker, getWorkers } from '../services/workerService';
import { useAuth } from '../store/AuthContext';
import { CasualLabourerDto, CasualLabourerPaymentDto, CasualLabourerSummaryDto, CasualPayrollEntry } from '../types';

// ─── Tab toggle ───────────────────────────────────────────────────────────────

type Tab = 'workers' | 'casual';

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <View style={tabStyles.bar}>
      <TouchableOpacity style={[tabStyles.tab, active === 'workers' && tabStyles.tabActive]} onPress={() => onChange('workers')} activeOpacity={0.75}>
        <Feather name="users" size={14} color={active === 'workers' ? '#2d6a4f' : '#999'} />
        <Text style={[tabStyles.label, active === 'workers' && tabStyles.labelActive]}>Workers</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[tabStyles.tab, active === 'casual' && tabStyles.tabActive]} onPress={() => onChange('casual')} activeOpacity={0.75}>
        <Feather name="user-check" size={14} color={active === 'casual' ? '#2d6a4f' : '#999'} />
        <Text style={[tabStyles.label, active === 'casual' && tabStyles.labelActive]}>Casual</Text>
      </TouchableOpacity>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  bar:        { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e8e8e8' },
  tab:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive:  { borderBottomColor: '#2d6a4f' },
  label:      { fontSize: 14, fontWeight: '600', color: '#999' },
  labelActive:{ color: '#2d6a4f' },
});

// ─── Worker row ───────────────────────────────────────────────────────────────

function WorkerRow({ worker, onDelete }: { worker: WorkerDto; onDelete: (w: WorkerDto) => void }) {
  return (
    <View style={rowStyles.row}>
      <View style={[rowStyles.avatar, { backgroundColor: '#e8f5ef' }]}>
        <Feather name="user" size={16} color="#2d6a4f" />
      </View>
      <Text style={rowStyles.name}>{worker.name}</Text>
      <TouchableOpacity style={rowStyles.deleteBtn} onPress={() => onDelete(worker)} hitSlop={8}>
        <Feather name="trash-2" size={18} color="#e53e3e" />
      </TouchableOpacity>
    </View>
  );
}

// ─── Casual labourer row ──────────────────────────────────────────────────────

function CasualRow({
  labourer, onDelete, onTap,
}: { labourer: CasualLabourerDto; onDelete: (l: CasualLabourerDto) => void; onTap: (l: CasualLabourerDto) => void }) {
  const photoUri = labourer.photoBase64
    ? `data:${labourer.photoMimeType ?? 'image/jpeg'};base64,${labourer.photoBase64}`
    : null;
  return (
    <TouchableOpacity style={rowStyles.row} onPress={() => onTap(labourer)} activeOpacity={0.75}>
      <View style={rowStyles.avatar}>
        {photoUri
          ? <Image source={{ uri: photoUri }} style={rowStyles.photo} />
          : <Feather name="user" size={16} color="#7c3aed" />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={rowStyles.name}>{labourer.name}</Text>
        {labourer.phone ? <Text style={rowStyles.sub}>{labourer.phone}</Text> : null}
      </View>
      <TouchableOpacity style={rowStyles.deleteBtn} onPress={() => onDelete(labourer)} hitSlop={8}>
        <Feather name="trash-2" size={18} color="#e53e3e" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const rowStyles = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e8e8e8' },
  avatar:  { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f3e8ff', alignItems: 'center', justifyContent: 'center', marginRight: 12, overflow: 'hidden' },
  photo:   { width: 36, height: 36, borderRadius: 18 },
  name:    { fontSize: 15, color: '#1a1a1a', fontWeight: '500' },
  sub:     { fontSize: 12, color: '#888', marginTop: 1 },
  rate:    { fontSize: 13, color: '#2d6a4f', fontWeight: '600', marginRight: 12 },
  deleteBtn: { padding: 6 },
});

// ─── Add Worker modal ─────────────────────────────────────────────────────────

function AddWorkerModal({ visible, onAdd, onCancel }: { visible: boolean; onAdd: (name: string) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try { await onAdd(trimmed); setName(''); } finally { setSaving(false); }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { setName(''); onCancel(); }}>
      <View style={modalStyles.overlay}>
        <View style={[modalStyles.sheet]} elevation={10}>
          <Text style={modalStyles.title}>Add Worker</Text>
          <TextInput style={modalStyles.input} placeholder="Full name" placeholderTextColor="#bbb" value={name} onChangeText={setName} autoFocus maxLength={100} returnKeyType="done" onSubmitEditing={handleAdd} />
          <View style={modalStyles.actions}>
            <TouchableOpacity style={modalStyles.cancelBtn} onPress={() => { setName(''); onCancel(); }}>
              <Text style={modalStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[modalStyles.addBtn, (!name.trim() || saving) && modalStyles.addBtnDisabled]} onPress={handleAdd} disabled={!name.trim() || saving}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={modalStyles.addText}>Add</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Add Casual Labourer modal ────────────────────────────────────────────────

function AddCasualLabourerModal({ visible, onAdd, onCancel }: {
  visible: boolean;
  onAdd: (p: { name: string; phone: string | null; photoBase64: string | null; photoMimeType: string | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName]   = useState('');
  const [phone, setPhone] = useState('');
  const [photoUri, setPhotoUri]         = useState<string | null>(null);
  const [photoBase64, setPhotoBase64]   = useState<string | null>(null);
  const [photoMimeType, setPhotoMimeType] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() { setName(''); setPhone(''); setPhotoUri(null); setPhotoBase64(null); setPhotoMimeType(null); }

  async function pickPhoto(source: 'camera' | 'library') {
    let result: ImagePicker.ImagePickerResult;
    if (source === 'camera') {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) { Alert.alert('Permission required', 'Camera access is needed to take a photo.'); return; }
      result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true });
    } else {
      const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!p.granted) { Alert.alert('Permission required', 'Photo library access is needed.'); return; }
      result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true });
    }
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPhotoUri(asset.uri); setPhotoBase64(asset.base64 ?? null);
      setPhotoMimeType(asset.mimeType ?? 'image/jpeg');
    }
  }

  function showPhotoOptions() {
    Alert.alert('Add Photo', 'Choose a source', [
      { text: 'Take photo',          onPress: () => pickPhoto('camera') },
      { text: 'Choose from library', onPress: () => pickPhoto('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setSaving(true);
    try { await onAdd({ name: trimmedName, phone: phone.trim() || null, photoBase64, photoMimeType }); reset(); }
    finally { setSaving(false); }
  }

  const canSave = name.trim().length > 0 && !saving;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { reset(); onCancel(); }}>
      <View style={casualModalStyles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={[casualModalStyles.sheet]} elevation={10}>
              <Text style={casualModalStyles.title}>New labourer</Text>
              <Text style={casualModalStyles.subtitle}>Add a worker with a default daily rate.</Text>
              <View style={casualModalStyles.photoRow}>
                <TouchableOpacity onPress={showPhotoOptions} activeOpacity={0.8} style={casualModalStyles.avatarWrap}>
                  {photoUri ? <Image source={{ uri: photoUri }} style={casualModalStyles.avatar} /> : <Feather name="camera" size={28} color="#aaa" />}
                </TouchableOpacity>
                <TouchableOpacity style={casualModalStyles.photoBtn} onPress={showPhotoOptions} activeOpacity={0.8}>
                  <Feather name="camera" size={16} color="#555" />
                  <Text style={casualModalStyles.photoBtnText}>{photoUri ? 'Change photo' : 'Take photo'}</Text>
                </TouchableOpacity>
              </View>
              <Text style={casualModalStyles.label}>Name</Text>
              <TextInput style={casualModalStyles.input} placeholder="Samuel Kamau" placeholderTextColor="#bbb" value={name} onChangeText={setName} maxLength={100} autoFocus />
              <Text style={casualModalStyles.label}>Phone (optional)</Text>
              <TextInput style={casualModalStyles.input} placeholderTextColor="#bbb" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={20} />
              <View style={casualModalStyles.actions}>
                <TouchableOpacity style={casualModalStyles.cancelBtn} onPress={() => { reset(); onCancel(); }}>
                  <Text style={casualModalStyles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[casualModalStyles.saveBtn, !canSave && casualModalStyles.saveBtnDisabled]} onPress={handleSave} disabled={!canSave}>
                  {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={casualModalStyles.saveText}>Save</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Casual Payroll Report Modal ──────────────────────────────────────────────

const MONTH_NAMES_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_NAMES_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December'];

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
    setLoading(true);
    setError(null);
    try {
      const data = await getCasualPayroll(farmId, year, month);
      setRows(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load payroll data.');
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      await downloadAndShareMonthlyExcel(farmId, year, month);
    } catch (e: any) {
      Alert.alert('Export failed', e.message ?? 'Could not generate the file. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  const totalEarned      = rows.reduce((s, r) => s + Number(r.monthEarnings), 0);
  const totalOutstanding = rows.reduce((s, r) => s + Number(r.outstanding), 0);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={payrollStyles.root}>
        {/* Header */}
        <View style={payrollStyles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Feather name="x" size={22} color="#333" />
          </TouchableOpacity>
          <Text style={payrollStyles.headerTitle}>Casual Labour Report</Text>
          <TouchableOpacity
            style={[payrollStyles.exportBtn, exporting && { opacity: 0.5 }]}
            onPress={handleExport}
            disabled={exporting || loading}
            hitSlop={4}
          >
            {exporting
              ? <ActivityIndicator size="small" color="#2d6a4f" />
              : <><Feather name="download" size={14} color="#2d6a4f" /><Text style={payrollStyles.exportBtnText}>Excel</Text></>}
          </TouchableOpacity>
        </View>

        {/* Month selector */}
        <View style={payrollStyles.monthRow}>
          <TouchableOpacity onPress={() => {
            if (month === 1) { setMonth(12); setYear(y => y - 1); }
            else setMonth(m => m - 1);
          }} style={payrollStyles.arrow} hitSlop={8}>
            <Feather name="chevron-left" size={20} color="#2d6a4f" />
          </TouchableOpacity>
          <Text style={payrollStyles.monthLabel}>{MONTH_NAMES_LONG[month - 1]} {year}</Text>
          <TouchableOpacity onPress={() => {
            if (month === 12) { setMonth(1); setYear(y => y + 1); }
            else setMonth(m => m + 1);
          }} style={payrollStyles.arrow} hitSlop={8}>
            <Feather name="chevron-right" size={20} color="#2d6a4f" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={payrollStyles.centered}>
            <ActivityIndicator size="large" color="#2d6a4f" />
          </View>
        ) : error ? (
          <View style={payrollStyles.centered}>
            <Feather name="alert-triangle" size={32} color="#e53e3e" />
            <Text style={payrollStyles.errorText}>{error}</Text>
            <TouchableOpacity style={payrollStyles.retryBtn} onPress={loadPayroll}>
              <Text style={payrollStyles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Summary strip */}
            <View style={payrollStyles.summaryStrip}>
              <View style={payrollStyles.summaryItem}>
                <Text style={payrollStyles.summaryVal}>{rows.length}</Text>
                <Text style={payrollStyles.summaryLbl}>Labourers</Text>
              </View>
              <View style={payrollStyles.summaryDiv} />
              <View style={payrollStyles.summaryItem}>
                <Text style={[payrollStyles.summaryVal, { color: '#2d6a4f' }]}>
                  Ksh {totalEarned.toLocaleString()}
                </Text>
                <Text style={payrollStyles.summaryLbl}>Month Earnings</Text>
              </View>
              <View style={payrollStyles.summaryDiv} />
              <View style={payrollStyles.summaryItem}>
                <Text style={[payrollStyles.summaryVal, { color: totalOutstanding > 0 ? '#b45309' : '#2d6a4f' }]}>
                  Ksh {totalOutstanding.toLocaleString()}
                </Text>
                <Text style={payrollStyles.summaryLbl}>Outstanding</Text>
              </View>
            </View>

            {/* Column headers */}
            <View style={payrollStyles.colHeader}>
              <Text style={[payrollStyles.colHdr, { flex: 2 }]}>Labourer</Text>
              <Text style={[payrollStyles.colHdr, { width: 60, textAlign: 'center' }]}>Days</Text>
              <Text style={[payrollStyles.colHdr, { width: 90, textAlign: 'right' }]}>Earned</Text>
              <Text style={[payrollStyles.colHdr, { width: 90, textAlign: 'right' }]}>Paid</Text>
              <Text style={[payrollStyles.colHdr, { width: 90, textAlign: 'right' }]}>Balance</Text>
            </View>

            {rows.length === 0 ? (
              <View style={payrollStyles.centered}>
                <Feather name="user-check" size={44} color="#ccc" />
                <Text style={payrollStyles.emptyText}>No casual labourers for this period.</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
                {rows.map(r => {
                  const photoUri = r.photoBase64
                    ? `data:${r.photoMimeType ?? 'image/jpeg'};base64,${r.photoBase64}`
                    : null;
                  const isOwed = Number(r.outstanding) > 0;
                  return (
                    <View key={r.labourerId} style={payrollStyles.row}>
                      {/* Avatar */}
                      <View style={payrollStyles.avatar}>
                        {photoUri
                          ? <Image source={{ uri: photoUri }} style={payrollStyles.avatarImg} />
                          : <Text style={payrollStyles.avatarInitials}>
                              {r.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
                            </Text>}
                      </View>
                      {/* Name */}
                      <View style={{ flex: 2, marginRight: 4 }}>
                        <Text style={payrollStyles.rowName} numberOfLines={1}>{r.name}</Text>
                      </View>
                      {/* Days */}
                      <Text style={[payrollStyles.rowNum, { width: 60, textAlign: 'center' }]}>{r.daysPresent}</Text>
                      {/* Earned */}
                      <Text style={[payrollStyles.rowNum, { width: 90, textAlign: 'right' }]}>
                        {Number(r.monthEarnings).toLocaleString()}
                      </Text>
                      {/* Paid */}
                      <Text style={[payrollStyles.rowNum, { width: 90, textAlign: 'right', color: '#2d6a4f' }]}>
                        {Number(r.allTimePaid).toLocaleString()}
                      </Text>
                      {/* Balance */}
                      <Text style={[payrollStyles.rowNum, { width: 90, textAlign: 'right', fontWeight: '700', color: isOwed ? '#b45309' : '#2d6a4f' }]}>
                        {Number(r.outstanding).toLocaleString()}
                      </Text>
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

const payrollStyles = StyleSheet.create({
  root:         { flex: 1, backgroundColor: '#f5f7f9' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' },
  headerTitle:  { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  exportBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#2d6a4f', backgroundColor: '#e8f5ef' },
  exportBtnText:{ fontSize: 13, fontWeight: '700', color: '#2d6a4f' },

  monthRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee', gap: 16 },
  arrow:        { padding: 4 },
  monthLabel:   { fontSize: 16, fontWeight: '700', color: '#1a1a1a', minWidth: 160, textAlign: 'center' },

  summaryStrip: { flexDirection: 'row', backgroundColor: '#fff', marginVertical: 10, marginHorizontal: 12, borderRadius: 12, paddingVertical: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 },
  summaryItem:  { flex: 1, alignItems: 'center' },
  summaryVal:   { fontSize: 15, fontWeight: '800', color: '#1a1a1a' },
  summaryLbl:   { fontSize: 10, color: '#888', marginTop: 2 },
  summaryDiv:   { width: 1, backgroundColor: '#eee' },

  colHeader:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#eef2f0', marginHorizontal: 12, borderRadius: 8, marginBottom: 4 },
  colHdr:       { fontSize: 10, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.5 },

  row:          { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 1, paddingHorizontal: 10, paddingVertical: 12, borderRadius: 8 },
  avatar:       { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ede9fe', alignItems: 'center', justifyContent: 'center', marginRight: 8, overflow: 'hidden' },
  avatarImg:    { width: 36, height: 36, borderRadius: 18 },
  avatarInitials:{ fontSize: 13, fontWeight: '800', color: '#7c3aed' },
  rowName:      { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  rowRate:      { fontSize: 11, color: '#aaa', marginTop: 1 },
  rowNum:       { fontSize: 13, color: '#1a1a1a' },

  centered:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText:    { marginTop: 12, color: '#e53e3e', textAlign: 'center', fontSize: 14 },
  retryBtn:     { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#2d6a4f', borderRadius: 8 },
  retryText:    { color: '#fff', fontWeight: '600', fontSize: 14 },
  emptyText:    { fontSize: 14, color: '#aaa', marginTop: 14, textAlign: 'center' },
});

// ─── Casual Labourer Detail Modal ─────────────────────────────────────────────

function CasualLabourerDetailModal({
  visible, labourer, farmId, year, month, onClose, onRefresh,
}: {
  visible: boolean;
  labourer: CasualLabourerDto | null;
  farmId: number;
  year: number;
  month: number;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const { user } = useAuth();
  const [summary,       setSummary]       = useState<CasualLabourerSummaryDto | null>(null);
  const [monthEarned,   setMonthEarned]   = useState<number>(0);
  const [loadingSum,    setLoadingSum]    = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);

  // Payment form state
  const todayStr = new Date().toISOString().slice(0, 10);
  const [payDate,   setPayDate]   = useState(todayStr);
  const [payAmount, setPayAmount] = useState('');
  const [payNote,   setPayNote]   = useState('');
  const [payLoading, setPayLoading] = useState(false);

  useEffect(() => {
    if (!visible || !labourer) return;
    loadData();
  }, [visible, labourer?.id]);

  async function loadData() {
    if (!labourer) return;
    setLoadingSum(true);
    setSummary(null);
    try {
      const s = await getCasualLabourerSummary(farmId, labourer.id);
      setSummary(s);
      setMonthEarned(s.allTimeEarned);
    } catch {
      // Offline — show what we have
    } finally {
      setLoadingSum(false);
    }
  }

  async function handleAddPayment() {
    if (!labourer) return;
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0 || !payDate) return;
    setPayLoading(true);
    try {
      await recordPayment(farmId, labourer.id, { paymentDate: payDate, amount: amt, note: payNote.trim() || null });
      setPayDate(todayStr); setPayAmount(''); setPayNote('');
      setShowAddPayment(false);
      await loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to record payment.');
    } finally {
      setPayLoading(false);
    }
  }

  async function handleDeletePayment(payment: CasualLabourerPaymentDto) {
    if (!labourer) return;
    Alert.alert('Delete Payment', `Remove payment of Ksh ${payment.amount} on ${payment.paymentDate}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try { await deletePayment(farmId, labourer.id, payment.id); await loadData(); }
          catch (e: any) { Alert.alert('Error', e.message ?? 'Failed to delete payment.'); }
        },
      },
    ]);
  }

  if (!labourer) return null;

  const photoUri = labourer.photoBase64
    ? `data:${labourer.photoMimeType ?? 'image/jpeg'};base64,${labourer.photoBase64}`
    : null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={detailStyles.root}>
        {/* Header */}
        <View style={detailStyles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Feather name="x" size={22} color="#333" />
          </TouchableOpacity>
          <Text style={detailStyles.headerTitle}>Labourer Details</Text>
          <View style={{ width: 30 }} />
        </View>

        <ScrollView contentContainerStyle={detailStyles.scroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          {/* Profile */}
          <View style={detailStyles.profile}>
            <View style={detailStyles.avatarWrap}>
              {photoUri
                ? <Image source={{ uri: photoUri }} style={detailStyles.avatar} />
                : <View style={detailStyles.avatarPlaceholder}>
                    <Text style={detailStyles.avatarInitials}>
                      {labourer.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                    </Text>
                  </View>}
            </View>
            <Text style={detailStyles.name}>{labourer.name}</Text>
            {labourer.phone ? <Text style={detailStyles.phone}>{labourer.phone}</Text> : null}
          </View>

          {/* Summary cards */}
          <View style={detailStyles.cards}>
            <View style={[detailStyles.card, detailStyles.cardGreen]}>
              <Text style={detailStyles.cardLabel}>All-time Earned</Text>
              <Text style={detailStyles.cardValue}>Ksh {monthEarned.toLocaleString()}</Text>
            </View>
            <View style={[detailStyles.card, detailStyles.cardBlue]}>
              <Text style={detailStyles.cardLabel}>Total Paid</Text>
              <Text style={detailStyles.cardValue}>
                {loadingSum ? '…' : `Ksh ${(summary?.allTimePaid ?? 0).toLocaleString()}`}
              </Text>
            </View>
            <View style={[detailStyles.card, detailStyles.cardPurple]}>
              <Text style={detailStyles.cardLabel}>Outstanding</Text>
              <Text style={[detailStyles.cardValue, { color: (summary?.outstanding ?? 0) > 0 ? '#b45309' : '#2d6a4f' }]}>
                {loadingSum ? '…' : `Ksh ${(summary?.outstanding ?? 0).toLocaleString()}`}
              </Text>
            </View>
          </View>

          {/* Payments section */}
          <View style={detailStyles.section}>
            <View style={detailStyles.sectionHeader}>
              <Text style={detailStyles.sectionTitle}>Payments</Text>
              <TouchableOpacity style={detailStyles.addPayBtn} onPress={() => setShowAddPayment(s => !s)} activeOpacity={0.8}>
                <Feather name="plus" size={14} color="#fff" />
                <Text style={detailStyles.addPayText}>Add</Text>
              </TouchableOpacity>
            </View>

            {/* Add payment form */}
            {showAddPayment && (
              <View style={detailStyles.addPayForm}>
                <Text style={detailStyles.fieldLabel}>Date (YYYY-MM-DD)</Text>
                <TextInput style={detailStyles.fieldInput} value={payDate} onChangeText={setPayDate} placeholder="2026-06-01" placeholderTextColor="#bbb" maxLength={10} />
                <Text style={detailStyles.fieldLabel}>Amount (Ksh)</Text>
                <TextInput style={detailStyles.fieldInput} value={payAmount} onChangeText={setPayAmount} keyboardType="numeric" placeholder="0" placeholderTextColor="#bbb" maxLength={10} />
                <Text style={detailStyles.fieldLabel}>Note (optional)</Text>
                <TextInput style={detailStyles.fieldInput} value={payNote} onChangeText={setPayNote} placeholder="Week 1 wages, Advance…" placeholderTextColor="#bbb" maxLength={200} />
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <TouchableOpacity style={detailStyles.cancelSmBtn} onPress={() => setShowAddPayment(false)}>
                    <Text style={detailStyles.cancelSmText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[detailStyles.savePayBtn, (parseFloat(payAmount) <= 0 || !payDate || payLoading) && { opacity: 0.5 }]}
                    onPress={handleAddPayment}
                    disabled={parseFloat(payAmount) <= 0 || !payDate || payLoading}
                  >
                    {payLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={detailStyles.savePayText}>Save Payment</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {loadingSum ? (
              <ActivityIndicator size="small" color="#7c3aed" style={{ marginVertical: 16 }} />
            ) : summary && summary.payments.length === 0 ? (
              <Text style={detailStyles.emptyPay}>No payments recorded yet.</Text>
            ) : (
              summary?.payments.map(p => (
                <View key={p.id} style={detailStyles.payRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={detailStyles.payDate}>{p.paymentDate}</Text>
                    {p.note ? <Text style={detailStyles.payNote}>{p.note}</Text> : null}
                    {p.paidBy ? <Text style={detailStyles.payBy}>By {p.paidBy}</Text> : null}
                  </View>
                  <Text style={detailStyles.payAmt}>Ksh {Number(p.amount).toLocaleString()}</Text>
                  <TouchableOpacity onPress={() => handleDeletePayment(p)} hitSlop={8} style={{ marginLeft: 8 }}>
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

const detailStyles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#f5f7f9' },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  scroll:      { padding: 16 },

  profile:       { alignItems: 'center', marginBottom: 20 },
  avatarWrap:    { marginBottom: 12 },
  avatar:        { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#ede9fe', alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 32, fontWeight: '800', color: '#7c3aed' },
  name:          { fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
  phone:         { fontSize: 14, color: '#888', marginTop: 4 },
  defaultRate:   { fontSize: 13, color: '#7c3aed', marginTop: 4, fontWeight: '500' },

  cards:       { flexDirection: 'row', gap: 10, marginBottom: 20 },
  card:        { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  cardGreen:   { backgroundColor: '#D8F3DC' },
  cardBlue:    { backgroundColor: '#DBEAFE' },
  cardPurple:  { backgroundColor: '#EDE9FE' },
  cardLabel:   { fontSize: 11, fontWeight: '600', color: '#555', marginBottom: 4, textAlign: 'center' },
  cardValue:   { fontSize: 14, fontWeight: '800', color: '#1a1a1a', textAlign: 'center' },

  section:       { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#eee' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle:  { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  addPayBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#7c3aed', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  addPayText:    { fontSize: 13, color: '#fff', fontWeight: '600' },

  addPayForm:    { backgroundColor: '#faf5ff', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#ede9fe' },
  fieldLabel:    { fontSize: 12, fontWeight: '600', color: '#7c3aed', marginBottom: 4 },
  fieldInput:    { borderWidth: 1, borderColor: '#e0d4ff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#1a1a1a', backgroundColor: '#fff', marginBottom: 10 },
  cancelSmBtn:   { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  cancelSmText:  { fontSize: 14, color: '#555', fontWeight: '600' },
  savePayBtn:    { flex: 2, paddingVertical: 10, borderRadius: 8, backgroundColor: '#7c3aed', alignItems: 'center' },
  savePayText:   { fontSize: 14, color: '#fff', fontWeight: '700' },

  payRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0f0' },
  payDate:   { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  payNote:   { fontSize: 12, color: '#888', marginTop: 1 },
  payBy:     { fontSize: 11, color: '#bbb', marginTop: 1 },
  payAmt:    { fontSize: 15, fontWeight: '700', color: '#7c3aed' },
  emptyPay:  { fontSize: 13, color: '#bbb', textAlign: 'center', paddingVertical: 16 },
});

// ─── Modals shared styles ─────────────────────────────────────────────────────

const modalStyles = StyleSheet.create({
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet:          { width: '100%', backgroundColor: '#fff', borderRadius: 16, padding: 24, zIndex: 10 },
  title:          { fontSize: 17, fontWeight: '700', color: '#1a1a1a', marginBottom: 16 },
  input:          { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1a1a1a', backgroundColor: '#fafafa', marginBottom: 20 },
  actions:        { flexDirection: 'row', gap: 12 },
  cancelBtn:      { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  cancelText:     { fontSize: 15, color: '#555', fontWeight: '600' },
  addBtn:         { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#2d6a4f', alignItems: 'center' },
  addBtnDisabled: { opacity: 0.5 },
  addText:        { fontSize: 15, color: '#fff', fontWeight: '700' },
});

const casualModalStyles = StyleSheet.create({
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:          { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, zIndex: 10 },
  title:          { fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  subtitle:       { fontSize: 13, color: '#888', marginBottom: 20 },
  photoRow:       { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24 },
  avatarWrap:     { width: 72, height: 72, borderRadius: 36, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatar:         { width: 72, height: 72, borderRadius: 36 },
  photoBtn:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fafafa' },
  photoBtnText:   { fontSize: 14, color: '#444', fontWeight: '500' },
  label:          { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  input:          { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1a1a1a', backgroundColor: '#fafafa', marginBottom: 16 },
  hint:           { fontSize: 12, color: '#aaa', marginTop: -10, marginBottom: 24 },
  actions:        { flexDirection: 'row', gap: 12 },
  cancelBtn:      { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  cancelText:     { fontSize: 15, color: '#555', fontWeight: '600' },
  saveBtn:        { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#c0392b', alignItems: 'center' },
  saveBtnDisabled:{ opacity: 0.5 },
  saveText:       { fontSize: 15, color: '#fff', fontWeight: '700' },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WorkersScreen() {
  const { user } = useAuth();
  const route = useRoute();
  const routeParams = route.params as { farmId?: number } | undefined;
  const farmId = routeParams?.farmId ?? user?.farmId!;

  const now = new Date();
  const [activeTab, setActiveTab] = useState<Tab>('workers');
  const [workers,   setWorkers]   = useState<WorkerDto[]>([]);
  const [casuals,   setCasuals]   = useState<CasualLabourerDto[]>([]);
  const [isLoaded,  setIsLoaded]  = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showAddWorker,    setShowAddWorker]    = useState(false);
  const [showAddCasual,    setShowAddCasual]    = useState(false);
  const [showPayrollReport, setShowPayrollReport] = useState(false);
  const [detailLabourer,   setDetailLabourer]   = useState<CasualLabourerDto | null>(null);

  const load = useCallback(async () => {
    if (!farmId) return;
    setIsLoaded(false); setLoadError(null);
    try {
      const [ws, cs] = await Promise.all([getWorkers(farmId), getCasualLabourers(farmId)]);
      setWorkers(ws); setCasuals(cs);
    } catch (e: any) {
      setLoadError(e.message ?? 'Failed to load workers');
    } finally {
      setIsLoaded(true);
    }
  }, [farmId]);

  useEffect(() => { load(); }, [load]);

  const handleAddWorker = useCallback(async (name: string) => {
    if (!farmId) return;
    await addWorker(farmId, name);
    setShowAddWorker(false);
    await load();
  }, [farmId, load]);

  const handleDeleteWorker = useCallback((worker: WorkerDto) => {
    Alert.alert('Remove Worker', `Remove ${worker.name}? Their historical data will be preserved.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await deactivateWorker(farmId, worker.id); await load(); }
        catch { Alert.alert('Error', 'Failed to remove worker.'); }
      }},
    ]);
  }, [farmId, load]);

  const handleAddCasual = useCallback(async (p: { name: string; phone: string | null; photoBase64: string | null; photoMimeType: string | null }) => {
    if (!farmId) return;
    await addCasualLabourer(farmId, p);
    setShowAddCasual(false);
    await load();
  }, [farmId, load]);

  const handleDeleteCasual = useCallback((labourer: CasualLabourerDto) => {
    Alert.alert('Remove Casual Labourer', `Remove ${labourer.name}? Attendance history will be preserved.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await deactivateCasualLabourer(farmId, labourer.id); await load(); }
        catch { Alert.alert('Error', 'Failed to remove labourer.'); }
      }},
    ]);
  }, [farmId, load]);

  return (
    <View style={styles.container}>
      <TabBar active={activeTab} onChange={setActiveTab} />

      {/* Casual tab toolbar: export button */}
      {activeTab === 'casual' && (
        <View style={styles.casualToolbar}>
          <Text style={styles.casualCount}>{casuals.length} labourer{casuals.length !== 1 ? 's' : ''}</Text>
          <TouchableOpacity style={styles.exportBtn} onPress={() => setShowPayrollReport(true)} activeOpacity={0.8}>
            <Feather name="bar-chart-2" size={14} color="#2d6a4f" />
            <Text style={styles.exportBtnText}>Payroll Report</Text>
          </TouchableOpacity>
        </View>
      )}

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
      ) : activeTab === 'workers' ? (
        <FlatList
          data={workers}
          keyExtractor={(w) => String(w.id)}
          renderItem={({ item }) => <WorkerRow worker={item} onDelete={handleDeleteWorker} />}
          ListEmptyComponent={<EmptyState icon="users" text="No workers yet" hint="Tap + to add the first worker" />}
          contentContainerStyle={workers.length === 0 ? styles.emptyContainer : undefined}
        />
      ) : (
        <FlatList
          data={casuals}
          keyExtractor={(l) => String(l.id)}
          renderItem={({ item }) => (
            <CasualRow
              labourer={item}
              onDelete={handleDeleteCasual}
              onTap={(l) => setDetailLabourer(l)}
            />
          )}
          ListEmptyComponent={<EmptyState icon="user-check" text="No casual labourers yet" hint="Tap + to add the first one" />}
          contentContainerStyle={casuals.length === 0 ? styles.emptyContainer : undefined}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => activeTab === 'workers' ? setShowAddWorker(true) : setShowAddCasual(true)}
        activeOpacity={0.85}
      >
        <Feather name="plus" size={28} color="#fff" />
      </TouchableOpacity>

      <AddWorkerModal visible={showAddWorker} onAdd={handleAddWorker} onCancel={() => setShowAddWorker(false)} />
      <AddCasualLabourerModal visible={showAddCasual} onAdd={handleAddCasual} onCancel={() => setShowAddCasual(false)} />
      <CasualPayrollModal visible={showPayrollReport} farmId={farmId} onClose={() => setShowPayrollReport(false)} />
      <CasualLabourerDetailModal
        visible={detailLabourer !== null}
        labourer={detailLabourer}
        farmId={farmId}
        year={now.getFullYear()}
        month={now.getMonth() + 1}
        onClose={() => setDetailLabourer(null)}
        onRefresh={load}
      />
    </View>
  );
}

function EmptyState({ icon, text, hint }: { icon: keyof typeof Feather.glyphMap; text: string; hint: string }) {
  return (
    <View style={styles.empty}>
      <Feather name={icon} size={44} color="#ccc" />
      <Text style={styles.emptyText}>{text}</Text>
      <Text style={styles.emptyHint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#f5f7f9' },
  centered:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText:      { marginTop: 12, color: '#e53e3e', textAlign: 'center', fontSize: 14 },
  retryBtn:       { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#2d6a4f', borderRadius: 8 },
  retryText:      { color: '#fff', fontWeight: '600', fontSize: 14 },
  empty:          { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 64 },
  emptyText:      { fontSize: 16, fontWeight: '600', color: '#aaa', marginTop: 14 },
  emptyHint:      { fontSize: 13, color: '#bbb', marginTop: 4 },
  emptyContainer: { flex: 1 },
  casualToolbar:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0f0' },
  casualCount:    { fontSize: 13, color: '#888' },
  exportBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#2d6a4f', backgroundColor: '#e8f5ef' },
  exportBtnText:  { fontSize: 13, fontWeight: '600', color: '#2d6a4f' },
  fab: {
    position: 'absolute', bottom: 24, right: 24, width: 58, height: 58, borderRadius: 29,
    backgroundColor: '#2d6a4f', alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 5,
  },
});
