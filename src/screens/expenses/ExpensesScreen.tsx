import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ExpenseForm, { ApportionmentValue, ExpenseFormValues } from '../../components/expenses/ExpenseForm';
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

// Expense enriched with its apportionments for round-tripping through the form
type ExpenseWithApports = LocalExpenseRecord & { apportionments: ApportionmentValue[] };

function parseUris(raw: string | null): string[] {
  if (!raw) return [];
  if (raw.startsWith('[')) { try { return JSON.parse(raw); } catch {} }
  return [raw];
}
function serializeUris(uris: string[]): string | null {
  return uris.length > 0 ? JSON.stringify(uris) : null;
}

function buildDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function toFormValues(expense: ExpenseWithApports): ExpenseFormValues {
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
    apportionments: expense.apportionments,
    receipt_image_uris: parseUris(expense.receipt_image_uri),
  };
}

export default function ExpensesScreen() {
  const { user } = useAuth();
  const now = new Date();

  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [localReportId, setLocalReportId] = useState<number | null>(null);
  const [expenses,      setExpenses]      = useState<ExpenseWithApports[]>([]);
  const [loadError,     setLoadError]     = useState<string | null>(null);
  const [isLoaded,      setIsLoaded]      = useState(false);
  const [isSubmitted,   setIsSubmitted]   = useState(false);

  const [formVisible,    setFormVisible]    = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseWithApports | null>(null);
  const [receiptUris,    setReceiptUris]    = useState<string[]>([]);
  const [receiptIdx,     setReceiptIdx]     = useState(0);

  const [categories,    setCategories]    = useState<ExpenseCategoryDto[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnitDto[]>([]);

  // ── Load report + expenses + apportionments ───────────────────────────────
  useEffect(() => {
    if (!user) return;
    setIsLoaded(false);
    setLoadError(null);
    setExpenses([]);
    load();

    async function load() {
      const report = await getOrCreateLocalReport(user!.farmId!, year, month);
      setLocalReportId(report.id);
      setIsSubmitted(report.status === 'submitted');

      const rows = await getDb().getAllAsync<LocalExpenseRecord>(
        'SELECT * FROM local_expenses WHERE report_id = ? ORDER BY entry_no',
        [report.id],
      );

      const apportRows = await getDb().getAllAsync<{
        expense_local_id: number;
        business_unit_id: number;
        business_unit_code: string;
        business_unit_name: string;
        percentage: number;
        amount: number;
      }>(
        `SELECT ea.* FROM local_expense_apportionments ea
         JOIN local_expenses e ON ea.expense_local_id = e.id
         WHERE e.report_id = ?`,
        [report.id],
      );

      const apportByExpenseId: Record<number, ApportionmentValue[]> = {};
      for (const ap of apportRows) {
        if (!apportByExpenseId[ap.expense_local_id]) apportByExpenseId[ap.expense_local_id] = [];
        apportByExpenseId[ap.expense_local_id].push({
          business_unit_id: ap.business_unit_id,
          business_unit_code: ap.business_unit_code,
          business_unit_name: ap.business_unit_name,
          percentage: String(ap.percentage),
          amount: String(ap.amount),
        });
      }

      setExpenses(rows.map(e => ({ ...e, apportionments: apportByExpenseId[e.id] ?? [] })));
      setIsLoaded(true);
    }

    load().catch((e) => setLoadError(e.message ?? 'Failed to load expenses'));
  }, [user?.farmId, year, month]);

  // ── Load lookup data once ─────────────────────────────────────────────────
  useEffect(() => {
    getExpenseCategories().then(setCategories).catch(() => {});
    getBusinessUnits().then(setBusinessUnits).catch(() => {});
  }, []);

  // ── Persist and reload ────────────────────────────────────────────────────
  async function persistAndReload(reportId: number, updated: ExpenseWithApports[]) {
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
      receipt_image_uri: e.receipt_image_uri,
      apportionments: e.apportionments.map(ap => ({
        business_unit_id: ap.business_unit_id,
        business_unit_code: ap.business_unit_code,
        business_unit_name: ap.business_unit_name,
        percentage: parseFloat(ap.percentage) || 0,
        amount: parseFloat(ap.amount) || 0,
      })),
    }));
    await saveExpenses(reportId, inputs);
    await markSectionDirty(reportId, 'expenses');

    // Reload with apportionments
    const rows = await getDb().getAllAsync<LocalExpenseRecord>(
      'SELECT * FROM local_expenses WHERE report_id = ? ORDER BY entry_no',
      [reportId],
    );
    const apportRows = await getDb().getAllAsync<{
      expense_local_id: number;
      business_unit_id: number; business_unit_code: string; business_unit_name: string;
      percentage: number; amount: number;
    }>(
      `SELECT ea.* FROM local_expense_apportionments ea
       JOIN local_expenses e ON ea.expense_local_id = e.id
       WHERE e.report_id = ?`,
      [reportId],
    );
    const apportByExpenseId: Record<number, ApportionmentValue[]> = {};
    for (const ap of apportRows) {
      if (!apportByExpenseId[ap.expense_local_id]) apportByExpenseId[ap.expense_local_id] = [];
      apportByExpenseId[ap.expense_local_id].push({
        business_unit_id: ap.business_unit_id,
        business_unit_code: ap.business_unit_code,
        business_unit_name: ap.business_unit_name,
        percentage: String(ap.percentage),
        amount: String(ap.amount),
      });
    }
    setExpenses(rows.map(e => ({ ...e, apportionments: apportByExpenseId[e.id] ?? [] })));
  }

  // ── Open form ─────────────────────────────────────────────────────────────
  function openAdd() {
    setEditingExpense(null);
    setFormVisible(true);
  }

  function openEdit(expense: LocalExpenseRecord) {
    const rich = expenses.find(e => e.id === expense.id) ?? { ...expense, apportionments: [] };
    setEditingExpense(rich);
    setFormVisible(true);
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(
    async (values: ExpenseFormValues) => {
      if (!localReportId || isSubmitted) return;
      setFormVisible(false);

      const day  = parseInt(values.day, 10);
      const cost = parseFloat(values.cost);
      const date = buildDate(year, month, day);

      let updated: ExpenseWithApports[];

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
                receipt_image_uri: serializeUris(values.receipt_image_uris),
                apportionments: values.apportionments,
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
            receipt_image_uri: serializeUris(values.receipt_image_uris),
            apportionments: values.apportionments,
          },
        ];
      }

      updated = updated.map((e, i) => ({ ...e, entry_no: i + 1 }));

      try {
        await persistAndReload(localReportId, updated);
      } catch {
        // state unchanged; user can retry
      }
    },
    [localReportId, expenses, editingExpense, year, month],
  );

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(
    async (expense: LocalExpenseRecord) => {
      if (!localReportId || isSubmitted) return;
      const filtered = expenses
        .filter((e) => e.id !== expense.id)
        .map((e, i) => ({ ...e, entry_no: i + 1 }));
      try {
        await persistAndReload(localReportId, filtered);
      } catch {}
    },
    [localReportId, expenses],
  );

  const total = expenses.reduce((sum, e) => sum + e.cost, 0);

  const renderItem = useCallback(
    ({ item }: { item: ExpenseWithApports }) => (
      <ExpenseRow
        expense={item}
        onEdit={openEdit}
        onDelete={handleDelete}
        onViewReceipts={uris => { setReceiptUris(uris); setReceiptIdx(0); }}
      />
    ),
    [handleDelete],
  );

  return (
    <View style={styles.container}>
      <MonthYearSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />

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
            contentContainerStyle={expenses.length === 0 ? styles.emptyContainer : styles.listContent}
            keyboardShouldPersistTaps="handled"
          />

          {!isSubmitted && (
            <TouchableOpacity style={styles.fab} onPress={openAdd} activeOpacity={0.85}>
              <Feather name="plus" size={28} color="#fff" />
            </TouchableOpacity>
          )}
        </>
      )}

      <ExpenseForm
        visible={formVisible}
        year={year}
        month={month}
        initial={editingExpense ? toFormValues(editingExpense) : undefined}
        isEditing={!!editingExpense}
        categories={categories}
        businessUnits={businessUnits}
        onSave={handleSave}
        onCancel={() => setFormVisible(false)}
      />

      <Modal visible={receiptUris.length > 0} transparent animationType="fade" onRequestClose={() => setReceiptUris([])}>
        <View style={styles.receiptOverlay}>
          {receiptUris[receiptIdx] ? (
            <Image source={{ uri: receiptUris[receiptIdx] }} style={styles.receiptFullImage} resizeMode="contain" />
          ) : null}
          {receiptUris.length > 1 && (
            <>
              <TouchableOpacity
                style={[styles.receiptNavBtn, styles.receiptNavLeft]}
                onPress={() => setReceiptIdx(i => Math.max(0, i - 1))}
                disabled={receiptIdx === 0}
              >
                <Feather name="chevron-left" size={28} color={receiptIdx === 0 ? 'rgba(255,255,255,0.3)' : '#fff'} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.receiptNavBtn, styles.receiptNavRight]}
                onPress={() => setReceiptIdx(i => Math.min(receiptUris.length - 1, i + 1))}
                disabled={receiptIdx === receiptUris.length - 1}
              >
                <Feather name="chevron-right" size={28} color={receiptIdx === receiptUris.length - 1 ? 'rgba(255,255,255,0.3)' : '#fff'} />
              </TouchableOpacity>
              <View style={styles.receiptCounter}>
                <Text style={styles.receiptCounterText}>{receiptIdx + 1} / {receiptUris.length}</Text>
              </View>
            </>
          )}
          <TouchableOpacity style={styles.receiptCloseBtn} onPress={() => setReceiptUris([])}>
            <Feather name="x" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f5f7f9' },
  submittedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2d6a4f', paddingVertical: 6 },
  submittedText:   { fontSize: 12, fontWeight: '600', color: '#fff' },
  centered:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText:       { marginTop: 12, color: '#e53e3e', textAlign: 'center', fontSize: 14 },
  listContent:     { paddingBottom: 100 },
  emptyContainer:  { flex: 1 },
  empty:           { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 64 },
  emptyText:       { fontSize: 16, fontWeight: '600', color: '#aaa', marginTop: 14 },
  emptyHint:       { fontSize: 13, color: '#bbb', marginTop: 4 },
  totalCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    margin: 16, paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: '#2d6a4f', borderRadius: 12,
  },
  totalLabel: { fontSize: 16, fontWeight: '700', color: '#fff' },
  totalValue: { fontSize: 18, fontWeight: '700', color: '#fff', fontVariant: ['tabular-nums'] },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: '#2d6a4f', alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 5,
  },
  receiptOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
  receiptFullImage: { width: '100%', height: '80%' },
  receiptCloseBtn: {
    position: 'absolute', top: 48, right: 20,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  receiptNavBtn: {
    position: 'absolute', top: '50%', padding: 12,
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 24,
  },
  receiptNavLeft:  { left: 12 },
  receiptNavRight: { right: 12 },
  receiptCounter: {
    position: 'absolute', bottom: 48,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 4,
  },
  receiptCounterText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
