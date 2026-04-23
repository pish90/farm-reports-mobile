import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ExpenseForm, { ExpenseFormValues } from '../../components/expenses/ExpenseForm';
import ExpenseRow from '../../components/expenses/ExpenseRow';
import MonthYearSelector from '../../components/shared/MonthYearSelector';
import { getDb } from '../../db/database';
import {
  LocalExpenseRecord,
  getOrCreateLocalReport,
  markSectionDirty,
  saveExpenses,
} from '../../db/reportRepository';
import {
  BusinessUnitDto,
  ExpenseCategoryDto,
  getBusinessUnits,
  getExpenseCategories,
} from '../../services/lookupService';
import { useAuth } from '../../store/AuthContext';
import { scanReceipt } from '../../services/receiptService';

function buildDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function toFormValues(expense: LocalExpenseRecord): ExpenseFormValues {
  const day = parseInt(expense.date.split('-')[2], 10);
  return {
    day: String(day),
    supplier_contractor: expense.supplier_contractor ?? '',
    receipt_no: expense.receipt_no ?? '',
    cost: String(expense.cost),
    description: expense.description ?? '',
    category_id: expense.category_id ?? null,
    category_code: expense.category_code ?? null,
    category_name: expense.category_name ?? null,
    business_unit_id: expense.business_unit_id ?? null,
    business_unit_code: expense.business_unit_code ?? null,
    business_unit_name: expense.business_unit_name ?? null,
    apportionments: [],
  };
}

export default function ExpensesScreen() {
  const { user } = useAuth();
  const now = new Date();

  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [localReportId, setLocalReportId] = useState<number | null>(null);
  const [expenses,      setExpenses]      = useState<LocalExpenseRecord[]>([]);
  const [loadError,     setLoadError]     = useState<string | null>(null);
  const [isLoaded,      setIsLoaded]      = useState(false);
  const [isSubmitted,   setIsSubmitted]   = useState(false);

  const [formVisible,    setFormVisible]    = useState(false);
  const [editingExpense, setEditingExpense] = useState<LocalExpenseRecord | null>(null);
  const [scannedInitial, setScannedInitial] = useState<ExpenseFormValues | undefined>(undefined);
  const [isScanning,     setIsScanning]     = useState(false);

  const [categories,    setCategories]    = useState<ExpenseCategoryDto[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnitDto[]>([]);

  // ── Load report + expenses ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    setIsLoaded(false);
    setLoadError(null);
    setExpenses([]);

    async function load() {
      const report = await getOrCreateLocalReport(user!.farmId, year, month);
      setLocalReportId(report.id);
      setIsSubmitted(report.status === 'submitted');

      const rows = await getDb().getAllAsync<LocalExpenseRecord>(
        'SELECT * FROM local_expenses WHERE report_id = ? ORDER BY entry_no',
        [report.id],
      );
      setExpenses(rows);
      setIsLoaded(true);
    }

    load().catch((e) => setLoadError(e.message ?? 'Failed to load expenses'));
  }, [user?.farmId, year, month]);

  // ── Load lookup data once ──────────────────────────────────────────────────
  useEffect(() => {
    getExpenseCategories().then(setCategories).catch(() => {});
    getBusinessUnits().then(setBusinessUnits).catch(() => {});
  }, []);

  // ── Persist and reload ─────────────────────────────────────────────────────
  async function persistAndReload(reportId: number, updated: LocalExpenseRecord[]) {
    const inputs = updated.map((e) => ({
      entry_no: e.entry_no,
      date: e.date,
      supplier_contractor: e.supplier_contractor,
      receipt_no: e.receipt_no,
      cost: e.cost,
      description: e.description,
      category_id: e.category_id,
      category_code: e.category_code,
      category_name: e.category_name,
      business_unit_id: e.business_unit_id,
      business_unit_code: e.business_unit_code,
      business_unit_name: e.business_unit_name,
    }));
    await saveExpenses(reportId, inputs);
    await markSectionDirty(reportId, 'expenses');

    const rows = await getDb().getAllAsync<LocalExpenseRecord>(
      'SELECT * FROM local_expenses WHERE report_id = ? ORDER BY entry_no',
      [reportId],
    );
    setExpenses(rows);
  }

  // ── Open / close form ──────────────────────────────────────────────────────
  function openAdd() {
    setEditingExpense(null);
    setFormVisible(true);
  }

  function openEdit(expense: LocalExpenseRecord) {
    setEditingExpense(expense);
    setScannedInitial(undefined);
    setFormVisible(true);
  }

  async function openScan() {
    Alert.alert('Scan Receipt', 'Choose an option', [
      {
        text: 'Take Photo',
        onPress: () => launchScan('camera'),
      },
      {
        text: 'Choose from Gallery',
        onPress: () => launchScan('gallery'),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function launchScan(source: 'camera' | 'gallery') {
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permission required', 'Please allow access to continue.');
      return;
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true, mediaTypes: 'images' });

    if (result.canceled || !result.assets[0]) return;

    setIsScanning(true);
    try {
      const data = await scanReceipt(result.assets[0].uri);
      const initial: ExpenseFormValues = {
        day: data.day != null ? String(data.day) : '',
        supplier_contractor: data.supplierContractor ?? '',
        receipt_no: data.receiptNo ?? '',
        cost: data.cost != null ? String(data.cost) : '',
        description: data.description ?? '',
        category_id: null, category_code: null, category_name: null,
        business_unit_id: null, business_unit_code: null, business_unit_name: null,
        apportionments: [],
      };
      setScannedInitial(initial);
      setEditingExpense(null);
      setFormVisible(true);
    } catch {
      Alert.alert('Scan failed', 'Could not read the receipt. You can enter details manually.');
      setScannedInitial(undefined);
      setEditingExpense(null);
      setFormVisible(true);
    } finally {
      setIsScanning(false);
    }
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = useCallback(
    async (values: ExpenseFormValues) => {
      if (!localReportId || isSubmitted) return;
      setFormVisible(false);

      const day  = parseInt(values.day, 10);
      const cost = parseFloat(values.cost);
      const date = buildDate(year, month, day);

      let updated: LocalExpenseRecord[];

      if (editingExpense) {
        updated = expenses.map((e) =>
          e.id === editingExpense.id
            ? {
                ...e, date,
                supplier_contractor: values.supplier_contractor,
                receipt_no: values.receipt_no,
                cost,
                description: values.description,
                category_id: values.category_id,
                category_code: values.category_code,
                category_name: values.category_name,
                business_unit_id: values.business_unit_id,
                business_unit_code: values.business_unit_code,
                business_unit_name: values.business_unit_name,
              }
            : e,
        );
      } else {
        updated = [
          ...expenses,
          {
            id: 0,
            report_id: localReportId,
            entry_no: expenses.length + 1,
            date,
            supplier_contractor: values.supplier_contractor,
            receipt_no: values.receipt_no,
            cost,
            description: values.description,
            category_id: values.category_id,
            category_code: values.category_code,
            category_name: values.category_name,
            business_unit_id: values.business_unit_id,
            business_unit_code: values.business_unit_code,
            business_unit_name: values.business_unit_name,
          },
        ];
      }

      // Renumber sequentially
      updated = updated.map((e, i) => ({ ...e, entry_no: i + 1 }));

      try {
        await persistAndReload(localReportId, updated);
      } catch {
        // state unchanged; user can retry
      }
    },
    [localReportId, expenses, editingExpense, year, month],
  );

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(
    async (expense: LocalExpenseRecord) => {
      if (!localReportId || isSubmitted) return;

      const filtered = expenses
        .filter((e) => e.id !== expense.id)
        .map((e, i) => ({ ...e, entry_no: i + 1 }));

      try {
        await persistAndReload(localReportId, filtered);
      } catch {
        // state unchanged
      }
    },
    [localReportId, expenses],
  );

  // ── Totals ─────────────────────────────────────────────────────────────────
  const total = expenses.reduce((sum, e) => sum + e.cost, 0);

  // ── Render ─────────────────────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item }: { item: LocalExpenseRecord }) => (
      <ExpenseRow expense={item} onEdit={openEdit} onDelete={handleDelete} />
    ),
    [handleDelete],
  );

  return (
    <View style={styles.container}>
      <MonthYearSelector
        year={year}
        month={month}
        onChange={(y, m) => { setYear(y); setMonth(m); }}
      />

      {loadError ? (
        <View style={styles.centered}>
          <Feather name="alert-triangle" size={32} color="#e53e3e" />
          <Text style={styles.errorText}>{loadError}</Text>
        </View>
      ) : !isLoaded ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2d6a4f" />
        </View>
      ) : (
        <>
          {isSubmitted && (
            <View style={styles.submittedBanner}>
              <Feather name="lock" size={13} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.submittedText}>Report Submitted — Read Only</Text>
            </View>
          )}
          <FlatList
            data={expenses}
            renderItem={renderItem}
            keyExtractor={(item) => String(item.id === 0 ? `tmp-${item.entry_no}` : item.id)}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Feather name="file-text" size={44} color="#ccc" />
                <Text style={styles.emptyText}>No expenses yet</Text>
                <Text style={styles.emptyHint}>Tap + to add the first entry</Text>
              </View>
            }
            ListFooterComponent={
              expenses.length > 0 ? (
                <View style={styles.totalCard}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>{total.toFixed(2)}</Text>
                </View>
              ) : null
            }
            contentContainerStyle={
              expenses.length === 0 ? styles.emptyContainer : styles.listContent
            }
            keyboardShouldPersistTaps="handled"
          />

          {/* Floating action buttons — hidden when submitted */}
          {!isSubmitted && (
            <>
              <TouchableOpacity style={styles.fabScan} onPress={openScan} activeOpacity={0.85} disabled={isScanning}>
                <Feather name="camera" size={24} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.fab} onPress={openAdd} activeOpacity={0.85}>
                <Feather name="plus" size={28} color="#fff" />
              </TouchableOpacity>
            </>
          )}

          {/* Scanning overlay */}
          {isScanning && (
            <View style={styles.scanOverlay}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.scanOverlayText}>Reading receipt…</Text>
            </View>
          )}
        </>
      )}

      <ExpenseForm
        visible={formVisible}
        year={year}
        month={month}
        initial={scannedInitial ?? (editingExpense ? toFormValues(editingExpense) : undefined)}
        isEditing={!!editingExpense && !scannedInitial}
        categories={categories}
        businessUnits={businessUnits}
        onSave={handleSave}
        onCancel={() => { setFormVisible(false); setScannedInitial(undefined); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f5f7f9' },
  submittedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2d6a4f', paddingVertical: 6 },
  submittedText:   { fontSize: 12, fontWeight: '600', color: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { marginTop: 12, color: '#e53e3e', textAlign: 'center', fontSize: 14 },

  listContent: { paddingBottom: 100 },
  emptyContainer: { flex: 1 },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#aaa', marginTop: 14 },
  emptyHint: { fontSize: 13, color: '#bbb', marginTop: 4 },

  totalCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    margin: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#2d6a4f',
    borderRadius: 12,
  },
  totalLabel: { fontSize: 16, fontWeight: '700', color: '#fff' },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    fontVariant: ['tabular-nums'],
  },

  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#2d6a4f',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
  fabScan: {
    position: 'absolute',
    bottom: 24,
    right: 96,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#40916c',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  scanOverlayText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
