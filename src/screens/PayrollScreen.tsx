import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useFocusEffect } from '@react-navigation/native';
import MonthYearSelector from '../components/shared/MonthYearSelector';
import { getPayroll, savePayroll } from '../services/payrollService';
import { useAuth } from '../store/AuthContext';
import { PayrollEntryRequest, PayrollRecord } from '../types';

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

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [entries, setEntries] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const [editing, setEditing] = useState<PayrollRecord | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<PayrollRecord>>({});

  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!user?.farmId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getPayroll(user.farmId, year, month);
      setEntries(data);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? 'Failed to load payroll');
    } finally {
      setLoading(false);
    }
  }, [user?.farmId, year, month]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [load]);

  function openEdit(record: PayrollRecord) {
    if (isWorker) return;
    setEditing(record);
    setEditDraft({ ...record });
  }

  function closeEdit() {
    setEditing(null);
    setEditDraft({});
  }

  function commitEdit() {
    if (!editing) return;
    setEntries(prev =>
      prev.map(r => r.id === editing.id ? { ...r, ...editDraft } as PayrollRecord : r),
    );
    closeEdit();
  }

  async function handleSaveAll() {
    if (!user?.farmId) return;
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
      await savePayroll(user.farmId, year, month, payload);
      setSaveState('saved');
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaveState('idle'), 2000);
    } catch (e: any) {
      setSaveState('error');
    }
  }

  function setDraftField(field: keyof PayrollRecord, raw: string) {
    const numericFields: Array<keyof PayrollRecord> = [
      'salaryRate', 'daysWorked', 'grossSalary', 'loans', 'amountPaid', 'amountRemaining',
    ];
    if (numericFields.includes(field)) {
      setEditDraft(prev => ({ ...prev, [field]: raw === '' ? null : parseNum(raw) }));
    } else {
      setEditDraft(prev => ({ ...prev, [field]: raw === '' ? null : raw }));
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <MonthYearSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />

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
                    {record.employeeCode && (
                      <Text style={styles.employeeCode}>{record.employeeCode}</Text>
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
                    <Text style={styles.label}>Gross Salary</Text>
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

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={closeEdit}>
        <Pressable style={styles.backdrop} onPress={closeEdit} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetWrapper}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{editDraft.employeeName}</Text>
            {editDraft.employeeCode && (
              <Text style={styles.sheetSubtitle}>{editDraft.employeeCode}</Text>
            )}
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
                  <Text style={styles.inputLabel}>Gross Salary</Text>
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

              <TouchableOpacity style={styles.doneBtn} onPress={commitEdit}>
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
              <View style={{ height: 8 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f9' },
  scroll: { padding: 12 },

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

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetWrapper: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingBottom: 32, maxHeight: '85%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e0e0e0', alignSelf: 'center', marginTop: 12, marginBottom: 14 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', textAlign: 'center', marginBottom: 2 },
  sheetSubtitle: { fontSize: 12, color: '#aaa', textAlign: 'center', marginBottom: 14 },

  inputRow: { flexDirection: 'row', gap: 10 },
  inputHalf: { flex: 1 },
  inputLabel: { fontSize: 11, color: '#aaa', fontWeight: '500', marginBottom: 2 },
  textInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    padding: 10, fontSize: 15, color: '#1a1a1a',
    backgroundColor: '#fafafa', marginBottom: 14,
  },

  doneBtn: { backgroundColor: '#2d6a4f', borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  doneBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
