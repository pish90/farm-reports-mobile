import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useFocusEffect } from '@react-navigation/native';
import MonthYearSelector from '../components/shared/MonthYearSelector';
import { adminService } from '../services/adminService';
import {
  deleteEmployeePayment,
  getEmployeeSummary,
  recordEmployeePayment,
} from '../services/employeeService';
import { getPayroll, savePayroll } from '../services/payrollService';
import { useAuth } from '../store/AuthContext';
import {
  EmployeeSummaryDto,
  FarmLiveStatus,
  PayrollEntryRequest,
  PayrollRecord,
} from '../types';

const TODAY = new Date().toISOString().slice(0, 10);

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function fmt(n: number | null): string {
  return n != null ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
}

function parseNum(s: string): number | null {
  const v = parseFloat(s.replace(/,/g, ''));
  return isNaN(v) ? null : v;
}

export default function PayrollScreen() {
  const { user } = useAuth();
  const now = new Date();
  const isWorker = user?.role === 'WORKER';
  const isAdmin  = user?.role === 'ADMIN';

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [farms, setFarms] = useState<FarmLiveStatus[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState<number | null>(user?.farmId ?? null);

  const [entries, setEntries] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const [editing, setEditing] = useState<PayrollRecord | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<PayrollRecord>>({});
  const [baseRemaining, setBaseRemaining] = useState<number>(0);

  // Payment section state
  const [summary, setSummary] = useState<EmployeeSummaryDto | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [payDate, setPayDate]   = useState(TODAY);
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote]   = useState('');
  const [payLoading, setPayLoading] = useState(false);

  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    adminService.getFarmLiveStatus(year, month).then(list => {
      setFarms(list);
      if (list.length > 0 && selectedFarmId === null) {
        setSelectedFarmId(list[0].farmId);
      }
    }).catch(() => {});
  }, [isAdmin, year, month]);

  const activeFarmId = selectedFarmId ?? user?.farmId ?? null;

  const load = useCallback(async () => {
    if (!activeFarmId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getPayroll(activeFarmId, year, month);
      setEntries(data);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? 'Failed to load payroll');
    } finally {
      setLoading(false);
    }
  }, [activeFarmId, year, month]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [load]);

  async function openEdit(record: PayrollRecord) {
    if (isWorker) return;
    setEditing(record);
    setEditDraft({ ...record });
    // carry-forward = what was seeded from prior month before this month's salary is added
    setBaseRemaining(record.amountRemaining ?? 0);
    setSummary(null);
    setShowAddPayment(false);
    setPayDate(TODAY); setPayAmount(''); setPayNote('');
    if (activeFarmId) {
      setLoadingSummary(true);
      try {
        const s = await getEmployeeSummary(activeFarmId, record.employeeId);
        setSummary(s);
      } catch {
        // offline — leave null
      } finally {
        setLoadingSummary(false);
      }
    }
  }

  function closeEdit() {
    setEditing(null);
    setEditDraft({});
    setSummary(null);
    setShowAddPayment(false);
  }

  function commitEdit() {
    if (!editing) return;
    setEntries(prev =>
      prev.map(r => r.id === editing.id ? { ...r, ...editDraft } as PayrollRecord : r),
    );
    closeEdit();
  }

  async function handleSaveAll() {
    if (!activeFarmId) return;
    setSaveState('saving');
    const payload: PayrollEntryRequest[] = entries.map(r => ({
      employeeId: r.employeeId,
      salaryRate: r.salaryRate,
      daysWorked: r.daysWorked,
      grossSalary: r.grossSalary,
      loans: r.loans,
      amountPaid: r.amountPaid,
      amountRemaining: r.amountRemaining,
      notes: r.notes,
    }));
    try {
      await savePayroll(activeFarmId, year, month, payload);
      setSaveState('saved');
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaveState('idle'), 2000);
    } catch {
      setSaveState('error');
    }
  }

  function setDraftField(field: keyof PayrollRecord, raw: string) {
    const numericFields: Array<keyof PayrollRecord> = [
      'salaryRate', 'daysWorked', 'grossSalary', 'loans', 'amountPaid', 'amountRemaining',
    ];
    setEditDraft(prev => {
      const updated = { ...prev, [field]: numericFields.includes(field) ? (raw === '' ? null : parseNum(raw)) : (raw === '' ? null : raw) };
      // Auto-recalculate Amount Remaining = carry-forward + Monthly Salary − Amount Paid
      if (field === 'grossSalary' || field === 'amountPaid') {
        const salary = field === 'grossSalary' ? parseNum(raw) : (prev.grossSalary ?? 0);
        const paid   = field === 'amountPaid'  ? parseNum(raw) : (prev.amountPaid  ?? 0);
        updated.amountRemaining = baseRemaining + (salary ?? 0) - (paid ?? 0);
      }
      return updated;
    });
  }

  async function handleAddPayment() {
    if (!activeFarmId || !editing) return;
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0 || !payDate) return;
    setPayLoading(true);
    try {
      await recordEmployeePayment(activeFarmId, editing.employeeId, {
        paymentDate: payDate,
        amount: amt,
        note: payNote.trim() || null,
      });
      setPayDate(TODAY); setPayAmount(''); setPayNote('');
      setShowAddPayment(false);
      const s = await getEmployeeSummary(activeFarmId, editing.employeeId);
      setSummary(s);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to record payment.');
    } finally {
      setPayLoading(false);
    }
  }

  async function handleDeletePayment(payId: number, amount: number, date: string) {
    if (!activeFarmId || !editing) return;
    Alert.alert('Delete Payment', `Remove payment of Ksh ${amount} on ${date}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deleteEmployeePayment(activeFarmId, editing.employeeId, payId);
            const s = await getEmployeeSummary(activeFarmId, editing.employeeId);
            setSummary(s);
          } catch (e: any) {
            Alert.alert('Error', e.message ?? 'Failed to delete payment.');
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <MonthYearSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
      {isAdmin && farms.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.farmBar} contentContainerStyle={styles.farmBarContent}>
          {farms.map(f => (
            <TouchableOpacity
              key={f.farmId}
              style={[styles.farmChip, f.farmId === selectedFarmId && styles.farmChipActive]}
              onPress={() => setSelectedFarmId(f.farmId)}
            >
              <Text style={[styles.farmChipText, f.farmId === selectedFarmId && styles.farmChipTextActive]}>
                {f.farmName}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={styles.toolbar}>
        <View style={{ flex: 1 }} />
        {saveState === 'saving' && (
          <>
            <ActivityIndicator size="small" color="#2d6a4f" style={{ marginRight: 4 }} />
            <Text style={styles.saveText}>Saving…</Text>
          </>
        )}
        {saveState === 'saved' && (
          <>
            <Feather name="check-circle" size={14} color="#2d6a4f" style={{ marginRight: 4 }} />
            <Text style={[styles.saveText, { color: '#2d6a4f' }]}>Saved</Text>
          </>
        )}
        {saveState === 'error' && (
          <>
            <Feather name="alert-circle" size={14} color="#e53e3e" style={{ marginRight: 4 }} />
            <Text style={[styles.saveText, { color: '#e53e3e' }]}>Save failed</Text>
          </>
        )}
        {!isWorker && entries.length > 0 && (
          <TouchableOpacity
            style={[styles.saveAllBtn, saveState === 'saving' && { opacity: 0.6 }]}
            onPress={handleSaveAll}
            disabled={saveState === 'saving'}
            hitSlop={6}
          >
            <Text style={styles.saveAllBtnText}>Save All</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2d6a4f" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Feather name="alert-triangle" size={32} color="#e53e3e" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {entries.length === 0 ? (
            <Text style={styles.emptyText}>No salaried employees found.</Text>
          ) : (
            entries.map(record => (
              <TouchableOpacity
                key={record.id}
                style={styles.card}
                onPress={() => openEdit(record)}
                activeOpacity={isWorker ? 1 : 0.75}
              >
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.employeeName}>{record.employeeName}</Text>
                    {(record.lsNumber || record.employeeCode) && (
                      <Text style={styles.employeeCode}>
                        {record.lsNumber ? record.lsNumber : record.employeeCode}
                        {record.lsNumber && record.employeeCode ? `  ·  ${record.employeeCode}` : ''}
                      </Text>
                    )}
                  </View>
                  {!isWorker && <Feather name="edit-2" size={14} color="#aaa" />}
                </View>

                <View style={styles.gridRow}>
                  <View style={styles.gridCell}>
                    <Text style={styles.label}>Days Worked</Text>
                    <Text style={styles.value}>{fmt(record.daysWorked)}</Text>
                  </View>
                  <View style={styles.gridCell}>
                    <Text style={styles.label}>Salary Rate</Text>
                    <Text style={styles.value}>{fmt(record.salaryRate)}</Text>
                  </View>
                  <View style={styles.gridCell}>
                    <Text style={styles.label}>Monthly Salary</Text>
                    <Text style={styles.value}>{fmt(record.grossSalary)}</Text>
                  </View>
                  <View style={styles.gridCell}>
                    <Text style={styles.label}>Loans</Text>
                    <Text style={styles.value}>{fmt(record.loans)}</Text>
                  </View>
                </View>

                <View style={[styles.gridRow, { marginTop: 8 }]}>
                  <View style={styles.gridCell}>
                    <Text style={styles.label}>Amount Paid</Text>
                    <Text style={styles.value}>{fmt(record.amountPaid)}</Text>
                  </View>
                  <View style={styles.gridCell}>
                    <Text style={styles.label}>Remaining</Text>
                    <Text style={[styles.value, record.amountRemaining != null && record.amountRemaining > 0 ? styles.valueAlert : null]}>
                      {fmt(record.amountRemaining)}
                    </Text>
                  </View>
                  <View style={[styles.gridCell, { flex: 2 }]}>
                    <Text style={styles.label}>Notes</Text>
                    <Text style={[styles.value, { fontSize: 13, fontWeight: '400', color: record.notes ? '#1a1a1a' : '#bbb' }]} numberOfLines={2}>
                      {record.notes ?? '—'}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Edit modal — pageSheet for room to show payment history */}
      <Modal visible={!!editing} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeEdit}>
        <SafeAreaView style={styles.modalRoot}>
          {/* Modal header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={closeEdit} hitSlop={8}>
              <Feather name="x" size={22} color="#333" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginHorizontal: 12 }}>
              <Text style={styles.sheetTitle} numberOfLines={1}>{editDraft.employeeName}</Text>
              {(editDraft.lsNumber || editDraft.employeeCode) && (
                <Text style={styles.sheetSubtitle}>
                  {editDraft.lsNumber ?? editDraft.employeeCode}
                </Text>
              )}
            </View>
            <TouchableOpacity style={styles.doneBtn} onPress={commitEdit}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ScrollView
              contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Summary chips */}
              <View style={styles.summaryRow}>
                {[
                  { label: 'All-time Earned', value: summary?.allTimeEarned, color: '#D8F3DC' },
                  { label: 'Total Paid',       value: summary?.allTimePaid,   color: '#DBEAFE' },
                  { label: 'Outstanding',      value: summary?.outstanding,   color: '#EDE9FE' },
                ].map(({ label, value, color }) => (
                  <View key={label} style={[styles.summaryChip, { backgroundColor: color }]}>
                    <Text style={styles.summaryChipLabel}>{label}</Text>
                    <Text style={styles.summaryChipValue}>
                      {loadingSummary ? '…' : `Ksh ${Number(value ?? 0).toLocaleString()}`}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Payroll entry fields */}
              <Text style={styles.sectionHeading}>Monthly Entry</Text>
              <View style={styles.inputRow}>
                <View style={styles.inputHalf}>
                  <Text style={styles.inputLabel}>Days Worked</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editDraft.daysWorked != null ? String(editDraft.daysWorked) : ''}
                    onChangeText={t => setDraftField('daysWorked', t)}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#bbb"
                  />
                </View>
                <View style={styles.inputHalf}>
                  <Text style={styles.inputLabel}>Salary Rate</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editDraft.salaryRate != null ? String(editDraft.salaryRate) : ''}
                    onChangeText={t => setDraftField('salaryRate', t)}
                    keyboardType="numeric"
                    placeholder="0.00"
                    placeholderTextColor="#bbb"
                  />
                </View>
              </View>

              <View style={styles.inputRow}>
                <View style={styles.inputHalf}>
                  <Text style={styles.inputLabel}>Monthly Salary</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editDraft.grossSalary != null ? String(editDraft.grossSalary) : ''}
                    onChangeText={t => setDraftField('grossSalary', t)}
                    keyboardType="numeric"
                    placeholder="0.00"
                    placeholderTextColor="#bbb"
                  />
                </View>
                <View style={styles.inputHalf}>
                  <Text style={styles.inputLabel}>Loans</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editDraft.loans != null ? String(editDraft.loans) : ''}
                    onChangeText={t => setDraftField('loans', t)}
                    keyboardType="numeric"
                    placeholder="0.00"
                    placeholderTextColor="#bbb"
                  />
                </View>
              </View>

              <View style={styles.inputRow}>
                <View style={styles.inputHalf}>
                  <Text style={styles.inputLabel}>Amount Paid</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editDraft.amountPaid != null ? String(editDraft.amountPaid) : ''}
                    onChangeText={t => setDraftField('amountPaid', t)}
                    keyboardType="numeric"
                    placeholder="0.00"
                    placeholderTextColor="#bbb"
                  />
                </View>
                <View style={styles.inputHalf}>
                  <Text style={styles.inputLabel}>Amount Remaining</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editDraft.amountRemaining != null ? String(editDraft.amountRemaining) : ''}
                    onChangeText={t => setDraftField('amountRemaining', t)}
                    keyboardType="numeric"
                    placeholder="0.00"
                    placeholderTextColor="#bbb"
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Notes</Text>
              <TextInput
                style={[styles.textInput, { minHeight: 72, textAlignVertical: 'top' }]}
                value={editDraft.notes ?? ''}
                onChangeText={t => setDraftField('notes', t)}
                placeholder="Optional notes…"
                placeholderTextColor="#bbb"
                multiline
                maxLength={500}
              />

              {/* Payments section */}
              <View style={styles.paySection}>
                <View style={styles.paySectionHeader}>
                  <Text style={styles.sectionHeading}>Payment History</Text>
                  <TouchableOpacity
                    style={styles.addPayBtn}
                    onPress={() => setShowAddPayment(s => !s)}
                  >
                    <Feather name="plus" size={14} color="#fff" />
                    <Text style={styles.addPayBtnText}>Add</Text>
                  </TouchableOpacity>
                </View>

                {showAddPayment && (
                  <View style={styles.addPayForm}>
                    <Text style={styles.payFieldLabel}>Date (YYYY-MM-DD)</Text>
                    <TextInput style={styles.payFieldInput} value={payDate} onChangeText={setPayDate} placeholder={TODAY} placeholderTextColor="#bbb" maxLength={10} />
                    <Text style={styles.payFieldLabel}>Amount (Ksh)</Text>
                    <TextInput style={styles.payFieldInput} value={payAmount} onChangeText={setPayAmount} keyboardType="numeric" placeholder="0" placeholderTextColor="#bbb" maxLength={10} />
                    <Text style={styles.payFieldLabel}>Note (optional)</Text>
                    <TextInput style={styles.payFieldInput} value={payNote} onChangeText={setPayNote} placeholder="Advance, week 1…" placeholderTextColor="#bbb" maxLength={200} />
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                      <TouchableOpacity style={styles.payCancelBtn} onPress={() => setShowAddPayment(false)}>
                        <Text style={styles.payCancelText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.paySaveBtn, (!(parseFloat(payAmount) > 0) || !payDate || payLoading) && { opacity: 0.5 }]}
                        onPress={handleAddPayment}
                        disabled={!(parseFloat(payAmount) > 0) || !payDate || payLoading}
                      >
                        {payLoading
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Text style={styles.paySaveText}>Save</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {loadingSummary ? (
                  <ActivityIndicator size="small" color="#2d6a4f" style={{ marginVertical: 12 }} />
                ) : !summary || summary.payments.length === 0 ? (
                  <Text style={styles.payEmptyText}>No payments recorded yet.</Text>
                ) : (
                  summary.payments.map(p => (
                    <View key={p.id} style={styles.payRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.payDate}>{p.paymentDate}</Text>
                        {p.note ? <Text style={styles.payNote}>{p.note}</Text> : null}
                      </View>
                      <Text style={styles.payAmt}>Ksh {Number(p.amount).toLocaleString()}</Text>
                      <TouchableOpacity onPress={() => handleDeletePayment(p.id, p.amount, p.paymentDate)} hitSlop={8} style={{ marginLeft: 8 }}>
                        <Feather name="trash-2" size={16} color="#e53e3e" />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f9' },
  scroll: { padding: 12 },

  farmBar: { height: 52, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' },
  farmBarContent: { paddingHorizontal: 12, alignItems: 'center', gap: 8, flexDirection: 'row' },
  farmChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: '#e8e8e8', borderWidth: 1, borderColor: '#ddd' },
  farmChipActive: { backgroundColor: '#2d6a4f', borderColor: '#2d6a4f' },
  farmChipText: { fontSize: 13, fontWeight: '600', color: '#333' },
  farmChipTextActive: { color: '#fff' },

  toolbar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee',
  },
  saveText: { fontSize: 12, color: '#888' },
  saveAllBtn: {
    marginLeft: 12, backgroundColor: '#2d6a4f', borderRadius: 10,
    paddingVertical: 7, paddingHorizontal: 16,
  },
  saveAllBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: 200 },
  errorText: { marginTop: 12, color: '#e53e3e', textAlign: 'center', fontSize: 14 },
  emptyText: { color: '#999', fontSize: 14, textAlign: 'center', marginTop: 40 },
  retryBtn: {
    marginTop: 16, backgroundColor: '#2d6a4f', borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 24,
  },
  retryBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  card: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 12,
    padding: 12, borderWidth: 1, borderColor: '#eee',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  employeeName: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  employeeCode: { fontSize: 12, color: '#888', marginTop: 1 },

  gridRow: { flexDirection: 'row', flexWrap: 'wrap' },
  gridCell: { flex: 1, minWidth: '25%', paddingRight: 4 },
  label: { fontSize: 11, color: '#aaa', fontWeight: '500', marginBottom: 2 },
  value: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  valueAlert: { color: '#e53e3e' },

  // Page-sheet modal
  modalRoot:   { flex: 1, backgroundColor: '#f5f7f9' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' },
  sheetTitle:    { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  sheetSubtitle: { fontSize: 12, color: '#2d6a4f', fontWeight: '600', marginTop: 1 },
  doneBtn: { backgroundColor: '#2d6a4f', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  doneBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  summaryRow:  { flexDirection: 'row', gap: 8, marginBottom: 16 },
  summaryChip: { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
  summaryChipLabel: { fontSize: 9, fontWeight: '600', color: '#555', textAlign: 'center', marginBottom: 3 },
  summaryChipValue: { fontSize: 13, fontWeight: '800', color: '#1a1a1a', textAlign: 'center' },

  sectionHeading: { fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 10 },

  inputRow: { flexDirection: 'row', gap: 10 },
  inputHalf: { flex: 1 },
  inputLabel: { fontSize: 11, color: '#aaa', fontWeight: '500', marginBottom: 2 },
  textInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    padding: 10, fontSize: 15, color: '#1a1a1a',
    backgroundColor: '#fafafa', marginBottom: 14,
  },

  paySection:       { marginTop: 8, backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#eee' },
  paySectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  addPayBtn:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#2d6a4f' },
  addPayBtnText:    { fontSize: 13, color: '#fff', fontWeight: '600' },

  addPayForm:      { backgroundColor: '#f0f9f4', borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#c8e6c9' },
  payFieldLabel:   { fontSize: 12, fontWeight: '600', color: '#555', marginBottom: 4 },
  payFieldInput:   { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#1a1a1a', backgroundColor: '#fff', marginBottom: 10 },
  payCancelBtn:    { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  payCancelText:   { fontSize: 14, color: '#555', fontWeight: '600' },
  paySaveBtn:      { flex: 2, paddingVertical: 10, borderRadius: 8, backgroundColor: '#2d6a4f', alignItems: 'center' },
  paySaveText:     { fontSize: 14, color: '#fff', fontWeight: '700' },

  payRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0f0' },
  payDate:     { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  payNote:     { fontSize: 12, color: '#888', marginTop: 1 },
  payAmt:      { fontSize: 15, fontWeight: '700', color: '#2d6a4f' },
  payEmptyText:{ fontSize: 13, color: '#bbb', textAlign: 'center', paddingVertical: 12 },
});
