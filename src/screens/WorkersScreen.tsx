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
import { getCasualAttendance } from '../db/reportRepository';
import { getDb } from '../db/database';
import {
  addCasualLabourer,
  deactivateCasualLabourer,
  deletePayment,
  downloadAndShareMonthlyExcel,
  getCasualLabourerSummary,
  getCasualLabourers,
  recordPayment,
} from '../services/casualLabourerService';
import { WorkerDto, addWorker, deactivateWorker, getWorkers } from '../services/workerService';
import { useAuth } from '../store/AuthContext';
import { CasualLabourerDto, CasualLabourerPaymentDto, CasualLabourerSummaryDto } from '../types';

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
      <Text style={rowStyles.rate}>Ksh {labourer.defaultDailyRate}/day</Text>
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
  onAdd: (p: { name: string; phone: string | null; defaultDailyRate: number; photoBase64: string | null; photoMimeType: string | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName]   = useState('');
  const [phone, setPhone] = useState('');
  const [rate, setRate]   = useState('');
  const [photoUri, setPhotoUri]         = useState<string | null>(null);
  const [photoBase64, setPhotoBase64]   = useState<string | null>(null);
  const [photoMimeType, setPhotoMimeType] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() { setName(''); setPhone(''); setRate(''); setPhotoUri(null); setPhotoBase64(null); setPhotoMimeType(null); }

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
    const parsedRate  = parseFloat(rate);
    if (!trimmedName || isNaN(parsedRate) || parsedRate <= 0) return;
    setSaving(true);
    try { await onAdd({ name: trimmedName, phone: phone.trim() || null, defaultDailyRate: parsedRate, photoBase64, photoMimeType }); reset(); }
    finally { setSaving(false); }
  }

  const canSave = name.trim().length > 0 && parseFloat(rate) > 0 && !saving;

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
              <Text style={casualModalStyles.label}>Default daily rate</Text>
              <TextInput style={casualModalStyles.input} placeholder="130" placeholderTextColor="#bbb" value={rate} onChangeText={setRate} keyboardType="numeric" maxLength={8} />
              <Text style={casualModalStyles.hint}>You can override this on any day.</Text>
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

// ─── Export month picker modal ────────────────────────────────────────────────

function ExportModal({ visible, farmId, onClose }: { visible: boolean; farmId: number; onClose: () => void }) {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState(false);

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  async function handleExport() {
    setLoading(true);
    try {
      await downloadAndShareMonthlyExcel(farmId, year, month);
    } catch (e: any) {
      Alert.alert('Export failed', e.message ?? 'Could not generate the report. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={exportStyles.overlay}>
        <View style={exportStyles.sheet} elevation={10}>
          <Text style={exportStyles.title}>Export Casual Labour Report</Text>

          <Text style={exportStyles.label}>Year</Text>
          <View style={exportStyles.stepper}>
            <TouchableOpacity onPress={() => setYear(y => y - 1)} hitSlop={8} style={exportStyles.stepBtn}>
              <Feather name="minus" size={18} color="#2d6a4f" />
            </TouchableOpacity>
            <Text style={exportStyles.stepVal}>{year}</Text>
            <TouchableOpacity onPress={() => setYear(y => y + 1)} hitSlop={8} style={exportStyles.stepBtn}>
              <Feather name="plus" size={18} color="#2d6a4f" />
            </TouchableOpacity>
          </View>

          <Text style={exportStyles.label}>Month</Text>
          <View style={exportStyles.monthGrid}>
            {MONTHS.map((m, i) => (
              <TouchableOpacity
                key={m}
                style={[exportStyles.monthBtn, month === i + 1 && exportStyles.monthBtnActive]}
                onPress={() => setMonth(i + 1)}
              >
                <Text style={[exportStyles.monthText, month === i + 1 && exportStyles.monthTextActive]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={exportStyles.actions}>
            <TouchableOpacity style={exportStyles.cancelBtn} onPress={onClose}>
              <Text style={exportStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={exportStyles.exportBtn} onPress={handleExport} disabled={loading}>
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <><Feather name="download" size={16} color="#fff" style={{ marginRight: 6 }} /><Text style={exportStyles.exportText}>Export</Text></>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const exportStyles = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  title:       { fontSize: 17, fontWeight: '700', color: '#1a1a1a', marginBottom: 20 },
  label:       { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 8 },
  stepper:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 20 },
  stepBtn:     { padding: 8, borderRadius: 8, backgroundColor: '#f0f0f0' },
  stepVal:     { fontSize: 20, fontWeight: '700', color: '#1a1a1a', minWidth: 60, textAlign: 'center' },
  monthGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  monthBtn:    { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fafafa' },
  monthBtnActive: { backgroundColor: '#2d6a4f', borderColor: '#2d6a4f' },
  monthText:   { fontSize: 13, color: '#555', fontWeight: '500' },
  monthTextActive: { color: '#fff' },
  actions:     { flexDirection: 'row', gap: 12 },
  cancelBtn:   { flex: 1, paddingVertical: 13, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  cancelText:  { fontSize: 15, color: '#555', fontWeight: '600' },
  exportBtn:   { flex: 2, flexDirection: 'row', paddingVertical: 13, borderRadius: 10, backgroundColor: '#2d6a4f', alignItems: 'center', justifyContent: 'center' },
  exportText:  { fontSize: 15, color: '#fff', fontWeight: '700' },
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
      // Compute this-month earnings from local SQLite
      const localReport = await getDb().getFirstAsync<{ id: number }>(
        'SELECT id FROM local_reports WHERE farm_id = ? AND year = ? AND month = ?',
        [farmId, year, month],
      );
      if (localReport) {
        const casual = await getCasualAttendance(localReport.id);
        const mine = casual.filter(ca => ca.casual_labourer_id === labourer.id && ca.present === 1);
        const earned = mine.reduce((sum, ca) => sum + (ca.rate_override ?? labourer.defaultDailyRate), 0);
        setMonthEarned(earned);
      } else {
        setMonthEarned(0);
      }
      // Fetch all-time summary from server
      const s = await getCasualLabourerSummary(farmId, labourer.id);
      setSummary(s);
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

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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

        <ScrollView contentContainerStyle={detailStyles.scroll} keyboardShouldPersistTaps="handled">
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
            <Text style={detailStyles.defaultRate}>Default rate: Ksh {labourer.defaultDailyRate}/day</Text>
          </View>

          {/* Summary cards */}
          <View style={detailStyles.cards}>
            <View style={[detailStyles.card, detailStyles.cardGreen]}>
              <Text style={detailStyles.cardLabel}>{months[month - 1]} Earnings</Text>
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

  const [showAddWorker,  setShowAddWorker]  = useState(false);
  const [showAddCasual,  setShowAddCasual]  = useState(false);
  const [showExport,     setShowExport]     = useState(false);
  const [detailLabourer, setDetailLabourer] = useState<CasualLabourerDto | null>(null);

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

  const handleAddCasual = useCallback(async (p: { name: string; phone: string | null; defaultDailyRate: number; photoBase64: string | null; photoMimeType: string | null }) => {
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
          <TouchableOpacity style={styles.exportBtn} onPress={() => setShowExport(true)} activeOpacity={0.8}>
            <Feather name="download" size={14} color="#2d6a4f" />
            <Text style={styles.exportBtnText}>Export</Text>
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
      <ExportModal visible={showExport} farmId={farmId} onClose={() => setShowExport(false)} />
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
