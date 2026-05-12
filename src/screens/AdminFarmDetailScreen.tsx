import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { ApportionmentValue, ExpenseFormValues } from '../components/expenses/ExpenseForm';
import ExpenseForm from '../components/expenses/ExpenseForm';
import {
  BusinessUnitDto,
  ExpenseCategoryDto,
  getBusinessUnits,
  getExpenseCategories,
} from '../services/lookupService';
import {
  ExpenseEntryPayload,
  adminService,
  serverExpenseToLocal,
} from '../services/adminService';
import {
  AdminReport,
  AdminStackParamList,
  ServerExpense,
} from '../types';
import { useAuth } from '../store/AuthContext';

type Props = NativeStackScreenProps<AdminStackParamList, 'AdminFarmDetail'>;

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function serverExpenseToFormValues(e: ServerExpense, receiptUris: string[] = []): ExpenseFormValues {
  const day = parseInt(e.date.split('-')[2], 10);
  return {
    day: String(day),
    supplier_contractor: e.supplierContractor ?? '',
    receipt_no: e.receiptNo ?? '',
    cost: String(e.cost),
    description: e.description ?? '',
    category_id: e.categoryId,
    category_code: e.categoryCode,
    category_name: e.categoryName,
    business_unit_id: e.businessUnitId,
    business_unit_code: e.businessUnitCode,
    business_unit_name: e.businessUnitName,
    apportionments: e.apportionments.map(ap => ({
      business_unit_id: ap.businessUnitId,
      business_unit_code: ap.businessUnitCode,
      business_unit_name: ap.businessUnitName,
      percentage: String(ap.percentage),
      amount: String(ap.amount),
    } as ApportionmentValue)),
    receipt_image_uris: receiptUris,
  };
}

function formValuesToPayload(
  values: ExpenseFormValues,
  entryNo: number,
  year: number,
  month: number,
): ExpenseEntryPayload {
  return {
    entryNo,
    date: buildDate(year, month, parseInt(values.day, 10)),
    supplierContractor: values.supplier_contractor || null,
    receiptNo: values.receipt_no || null,
    cost: parseFloat(values.cost) || 0,
    description: values.description || null,
    categoryId: values.category_id,
    businessUnitId: values.business_unit_id,
    apportionments: values.apportionments.map(ap => ({
      businessUnitId: ap.business_unit_id,
      businessUnitCode: ap.business_unit_code,
      businessUnitName: ap.business_unit_name,
      percentage: parseFloat(ap.percentage) || 0,
      amount: parseFloat(ap.amount) || 0,
    })),
  };
}

// ─── Expense row for admin (no local IDs) ────────────────────────────────────

function formatDate(iso: string): string {
  const parts = iso.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : iso;
}

interface AdminExpenseRowProps {
  expense: ServerExpense;
  onEdit: (e: ServerExpense) => void;
  onDelete: (e: ServerExpense) => void;
  onViewReceipts?: (uris: string[]) => void;
  receiptUris?: string[];
  isSubmitted: boolean;
  readOnly?: boolean;
}

function AdminExpenseRow({ expense, onEdit, onDelete, onViewReceipts, receiptUris = [], isSubmitted, readOnly = false }: AdminExpenseRowProps) {
  function renderRightActions() {
    if (isSubmitted || readOnly) return null;
    return (
      <TouchableOpacity style={styles.deleteAction} onPress={() => onDelete(expense)}>
        <Feather name="trash-2" size={18} color="#fff" />
        <Text style={styles.deleteLabel}>Delete</Text>
      </TouchableOpacity>
    );
  }

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
      <TouchableOpacity
        style={styles.expenseRow}
        onPress={() => !isSubmitted && !readOnly && onEdit(expense)}
        activeOpacity={isSubmitted || readOnly ? 1 : 0.7}
      >
        <View style={styles.entryBadge}>
          <Text style={styles.entryNo}>{expense.entryNo}</Text>
        </View>
        <View style={styles.expenseBody}>
          <Text style={styles.supplier} numberOfLines={1}>
            {expense.supplierContractor || '—'}
          </Text>
          {expense.description ? (
            <Text style={styles.expenseDesc} numberOfLines={1}>{expense.description}</Text>
          ) : null}
          <Text style={styles.expenseMeta} numberOfLines={1}>
            {formatDate(expense.date)}
            {expense.categoryName ? `  ·  ${expense.categoryName}` : ''}
          </Text>
        </View>
        {receiptUris.length > 0 && (
          <TouchableOpacity onPress={() => onViewReceipts?.(receiptUris)} hitSlop={8} style={styles.receiptIcon}>
            <Feather name="camera" size={14} color="#52B788" />
            {receiptUris.length > 1 && <Text style={styles.receiptCount}>{receiptUris.length}</Text>}
          </TouchableOpacity>
        )}
        <Text style={styles.expenseCost}>{expense.cost.toFixed(2)}</Text>
        {!isSubmitted && !readOnly && <Feather name="chevron-right" size={16} color="#ccc" style={{ marginLeft: 4 }} />}
      </TouchableOpacity>
    </Swipeable>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, icon }: { title: string; icon: keyof typeof Feather.glyphMap }) {
  return (
    <View style={styles.sectionHeader}>
      <Feather name={icon} size={16} color="#2d6a4f" />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AdminFarmDetailScreen({ route, navigation }: Props) {
  const { farmId, farmName, reportId: initialReportId, year, month } = route.params;
  const { user } = useAuth();
  const isOpsManager = useMemo(() => user?.role === 'OPERATIONS_MANAGER', [user]);

  const [report,       setReport]       = useState<AdminReport | null>(null);
  const [noReport,     setNoReport]     = useState(false);
  const [isLoading,    setIsLoading]    = useState(true);
  const [isSaving,     setIsSaving]     = useState(false);
  const [isExporting,  setIsExporting]  = useState(false);
  const [formVisible,  setFormVisible]  = useState(false);
  const [editingExpense, setEditingExpense] = useState<ServerExpense | null>(null);
  const [categories,   setCategories]   = useState<ExpenseCategoryDto[]>([]);
  const [businessUnits,setBusinessUnits]= useState<BusinessUnitDto[]>([]);
  const [receiptUris,  setReceiptUris]  = useState<string[]>([]);
  const [receiptIdx,   setReceiptIdx]   = useState(0);
  const [receiptMap,   setReceiptMap]   = useState<Record<number, string[]>>({});

  const isSubmitted = report?.status === 'SUBMITTED';

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: farmName,
      headerRight: isOpsManager ? undefined : () => (
        <TouchableOpacity
          style={styles.headerExportBtn}
          onPress={handleExport}
          disabled={isExporting || !report}
        >
          {isExporting ? (
            <ActivityIndicator size="small" color="#2d6a4f" />
          ) : (
            <Feather name="download" size={20} color="#2d6a4f" />
          )}
        </TouchableOpacity>
      ),
    });
  }, [farmName, isExporting, report, isOpsManager]);

  useEffect(() => {
    loadReport();
    getExpenseCategories().then(setCategories).catch(() => {});
    getBusinessUnits().then(setBusinessUnits).catch(() => {});
  }, []);

  async function loadReport() {
    setIsLoading(true);
    setNoReport(false);
    try {
      if (initialReportId) {
        setReport(await adminService.getReport(initialReportId));
      } else if (isOpsManager) {
        const data = await adminService.getFarmReport(farmId, year, month);
        if (data === null) setNoReport(true);
        else setReport(data);
      } else {
        setReport(await adminService.getOrCreateReport(farmId, year, month));
      }
    } catch {
      Alert.alert('Error', 'Failed to load report data.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleReopen() {
    if (!report) return;
    Alert.alert(
      'Reopen Report',
      `Reopen ${farmName}'s ${MONTHS[month - 1]} ${year} report for editing?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reopen', style: 'destructive',
          onPress: async () => {
            setIsSaving(true);
            try {
              const updated = await adminService.reopenReport(report.id);
              setReport(updated);
            } catch {
              Alert.alert('Error', 'Failed to reopen report.');
            } finally {
              setIsSaving(false);
            }
          },
        },
      ],
    );
  }

  async function handleSubmit() {
    if (!report) return;
    Alert.alert(
      'Submit Report',
      `Submit ${farmName}'s ${MONTHS[month - 1]} ${year} report?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit', style: 'default',
          onPress: async () => {
            setIsSaving(true);
            try {
              const updated = await adminService.submitReport(report.id, farmId);
              setReport(updated);
            } catch (err: any) {
              Alert.alert('Error', err?.response?.data?.message ?? 'Failed to submit report.');
            } finally {
              setIsSaving(false);
            }
          },
        },
      ],
    );
  }

  async function handleExport() {
    if (!report) return;
    setIsExporting(true);
    try {
      await adminService.downloadFarmExcel(report.id, farmName, year, month);
    } catch {
      Alert.alert('Export Failed', 'Could not generate the Excel file.');
    } finally {
      setIsExporting(false);
    }
  }

  const handleSaveExpense = useCallback(async (values: ExpenseFormValues) => {
    if (!report || isSubmitted) return;
    setFormVisible(false);

    const day  = parseInt(values.day, 10);
    const cost = parseFloat(values.cost) || 0;
    const date = buildDate(year, month, day);

    let updatedExpenses: ServerExpense[];

    if (editingExpense) {
      setReceiptMap(prev => {
        const next = { ...prev };
        if (values.receipt_image_uris.length > 0) {
          next[editingExpense.id] = values.receipt_image_uris;
        } else {
          delete next[editingExpense.id];
        }
        return next;
      });
      updatedExpenses = report.expenses.map(e =>
        e.id === editingExpense.id
          ? {
              ...e, date, cost,
              supplierContractor: values.supplier_contractor || null,
              receiptNo: values.receipt_no || null,
              description: values.description || null,
              categoryId: values.category_id,
              categoryCode: values.category_code,
              categoryName: values.category_name,
              businessUnitId: values.business_unit_id,
              businessUnitCode: values.business_unit_code,
              businessUnitName: values.business_unit_name,
              apportionments: values.apportionments.map(ap => ({
                businessUnitId: ap.business_unit_id,
                businessUnitCode: ap.business_unit_code,
                businessUnitName: ap.business_unit_name,
                percentage: parseFloat(ap.percentage) || 0,
                amount: parseFloat(ap.amount) || 0,
              })),
            }
          : e,
      );
    } else {
      const nextNo = report.expenses.length > 0
        ? Math.max(...report.expenses.map(e => e.entryNo)) + 1 : 1;
      updatedExpenses = [
        ...report.expenses,
        {
          id: -Date.now(), entryNo: nextNo, date, cost,
          supplierContractor: values.supplier_contractor || null,
          receiptNo: values.receipt_no || null,
          description: values.description || null,
          categoryId: values.category_id,
          categoryCode: values.category_code,
          categoryName: values.category_name,
          businessUnitId: values.business_unit_id,
          businessUnitCode: values.business_unit_code,
          businessUnitName: values.business_unit_name,
          apportionments: values.apportionments.map(ap => ({
            businessUnitId: ap.business_unit_id,
            businessUnitCode: ap.business_unit_code,
            businessUnitName: ap.business_unit_name,
            percentage: parseFloat(ap.percentage) || 0,
            amount: parseFloat(ap.amount) || 0,
          })),
        },
      ];
    }

    const reNumbered = updatedExpenses.map((e, i) => ({ ...e, entryNo: i + 1 }));

    setReport(prev => prev ? { ...prev, expenses: reNumbered } : prev);
    setIsSaving(true);
    try {
      const payload = reNumbered.map(e => formValuesToPayload(
        serverExpenseToFormValues(e), e.entryNo, year, month,
      ));
      await adminService.upsertExpenses(report.id, farmId, payload);
    } catch {
      Alert.alert('Save Failed', 'Could not save changes. Changes may not be persisted.');
    } finally {
      setIsSaving(false);
    }
  }, [report, editingExpense, year, month, farmId, isSubmitted]);

  const handleDeleteExpense = useCallback(async (expense: ServerExpense) => {
    if (!report || isSubmitted) return;
    const filtered = report.expenses
      .filter(e => e.id !== expense.id)
      .map((e, i) => ({ ...e, entryNo: i + 1 }));
    setReport(prev => prev ? { ...prev, expenses: filtered } : prev);
    setIsSaving(true);
    try {
      const payload = filtered.map(e => formValuesToPayload(
        serverExpenseToFormValues(e), e.entryNo, year, month,
      ));
      await adminService.upsertExpenses(report.id, farmId, payload);
    } catch {
      Alert.alert('Save Failed', 'Could not save changes.');
    } finally {
      setIsSaving(false);
    }
  }, [report, year, month, farmId, isSubmitted]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2d6a4f" />
      </View>
    );
  }

  if (noReport) {
    return (
      <View style={styles.centered}>
        <Feather name="file" size={40} color="#ccc" />
        <Text style={styles.noReportText}>No report started for {MONTHS[month - 1]} {year}</Text>
      </View>
    );
  }

  if (!report) {
    return (
      <View style={styles.centered}>
        <Feather name="alert-triangle" size={32} color="#e53e3e" />
        <Text style={styles.errorText}>Failed to load report</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadReport}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const expenseTotal = report.expenses.reduce((s, e) => s + e.cost, 0);
  const milkTotal    = report.milk.reduce((s, m) => s + (m.litres ?? 0), 0);

  // Attendance summary: workers → present days
  const attendanceByWorker: Record<number, { name: string; present: number }> = {};
  for (const a of report.attendance) {
    if (!attendanceByWorker[a.workerId]) attendanceByWorker[a.workerId] = { name: a.workerName, present: 0 };
    if (a.present) attendanceByWorker[a.workerId].present++;
  }
  const daysInMonth = new Date(year, month, 0).getDate();
  const workerEntries = Object.values(attendanceByWorker);

  // Livestock by category
  const livestockByCategory: Record<string, { type: string; count: number }[]> = {};
  for (const l of report.livestock) {
    if (!livestockByCategory[l.category]) livestockByCategory[l.category] = [];
    livestockByCategory[l.category].push({ type: l.type, count: l.count });
  }

  const sortedMilk = [...report.milk].sort((a, b) => a.dayOfMonth - b.dayOfMonth);

  return (
    <View style={styles.container}>
      {/* Status bar */}
      <View style={styles.statusBar}>
        <View>
          <Text style={styles.periodText}>{MONTHS[month - 1]} {year}</Text>
          <View style={[
            styles.statusBadge,
            isSubmitted ? styles.statusSubmitted : styles.statusDraft,
          ]}>
            <Text style={[styles.statusText, isSubmitted ? styles.statusTextSubmitted : styles.statusTextDraft]}>
              {isSubmitted ? 'Submitted' : 'In Progress'}
            </Text>
          </View>
        </View>
        {!isOpsManager && (
          <View style={styles.actionBtns}>
            {isSubmitted ? (
              <TouchableOpacity
                style={[styles.actionBtn, styles.reopenBtn, isSaving && styles.actionBtnDisabled]}
                onPress={handleReopen}
                disabled={isSaving}
              >
                {isSaving ? <ActivityIndicator size="small" color="#fff" /> : (
                  <>
                    <Feather name="unlock" size={14} color="#fff" />
                    <Text style={styles.actionBtnText}>Reopen</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.actionBtn, styles.submitBtn, isSaving && styles.actionBtnDisabled]}
                onPress={handleSubmit}
                disabled={isSaving}
              >
                {isSaving ? <ActivityIndicator size="small" color="#fff" /> : (
                  <>
                    <Feather name="check-circle" size={14} color="#fff" />
                    <Text style={styles.actionBtnText}>Submit</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* ── Attendance ────────────────────────────────────────────── */}
        <SectionHeader title="Attendance" icon="users" />
        {workerEntries.length === 0 ? (
          <Text style={styles.emptySection}>No attendance recorded</Text>
        ) : (
          workerEntries.map(w => (
            <View key={w.name} style={styles.attRow}>
              <Text style={styles.attName}>{w.name}</Text>
              <Text style={styles.attCount}>
                {w.present} / {daysInMonth}
              </Text>
            </View>
          ))
        )}

        {/* ── Livestock ─────────────────────────────────────────────── */}
        <SectionHeader title="Livestock Returns" icon="tag" />
        {Object.keys(livestockByCategory).length === 0 ? (
          <Text style={styles.emptySection}>No livestock entered</Text>
        ) : (
          Object.entries(livestockByCategory).map(([cat, items]) => (
            <View key={cat}>
              <Text style={styles.categoryLabel}>{cat.charAt(0) + cat.slice(1).toLowerCase()}</Text>
              {items.map(item => (
                <View key={item.type} style={styles.livestockRow}>
                  <Text style={styles.livestockType}>{item.type}</Text>
                  <Text style={styles.livestockCount}>{item.count}</Text>
                </View>
              ))}
            </View>
          ))
        )}

        {/* ── Milk ──────────────────────────────────────────────────── */}
        <SectionHeader title={`Milk Production  ·  Total: ${milkTotal.toFixed(1)} L`} icon="droplet" />
        {sortedMilk.length === 0 ? (
          <Text style={styles.emptySection}>No milk data recorded</Text>
        ) : (
          <View style={styles.milkGrid}>
            {sortedMilk.map(m => (
              <View key={m.dayOfMonth} style={styles.milkCell}>
                <Text style={styles.milkDay}>{m.dayOfMonth}</Text>
                <Text style={styles.milkLitres}>{(m.litres ?? 0).toFixed(1)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Expenses ──────────────────────────────────────────────── */}
        <SectionHeader title={`Expenses  ·  Total: ${expenseTotal.toFixed(2)}`} icon="dollar-sign" />
        {report.expenses.length === 0 ? (
          <Text style={styles.emptySection}>No expenses recorded</Text>
        ) : (
          report.expenses
            .slice()
            .sort((a, b) => a.entryNo - b.entryNo)
            .map(exp => (
              <AdminExpenseRow
                key={exp.id}
                expense={exp}
                onEdit={e => { setEditingExpense(e); setFormVisible(true); }}
                onDelete={handleDeleteExpense}
                receiptUris={receiptMap[exp.id] ?? []}
                onViewReceipts={uris => { setReceiptUris(uris); setReceiptIdx(0); }}
                isSubmitted={isSubmitted}
                readOnly={isOpsManager}
              />
            ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* FAB: add expense */}
      {!isSubmitted && !isOpsManager && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => { setEditingExpense(null); setFormVisible(true); }}
          activeOpacity={0.85}
        >
          <Feather name="plus" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      <ExpenseForm
        visible={formVisible}
        year={year}
        month={month}
        initial={editingExpense ? serverExpenseToFormValues(editingExpense, receiptMap[editingExpense.id] ?? []) : undefined}
        isEditing={!!editingExpense}
        categories={categories}
        businessUnits={businessUnits}
        onSave={handleSaveExpense}
        onCancel={() => setFormVisible(false)}
      />

      <Modal visible={receiptUris.length > 0} transparent animationType="fade" onRequestClose={() => setReceiptUris([])}>
        <View style={styles.receiptOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setReceiptUris([])} />
          {receiptUris[receiptIdx] ? (
            <Image source={{ uri: receiptUris[receiptIdx] }} style={styles.receiptFullImage} resizeMode="contain" pointerEvents="none" />
          ) : null}
          {receiptUris.length > 1 && (
            <>
              {receiptIdx > 0 && (
                <TouchableOpacity style={[styles.receiptNavBtn, styles.receiptNavLeft]} onPress={() => setReceiptIdx(i => i - 1)}>
                  <Feather name="chevron-left" size={28} color="#fff" />
                </TouchableOpacity>
              )}
              {receiptIdx < receiptUris.length - 1 && (
                <TouchableOpacity style={[styles.receiptNavBtn, styles.receiptNavRight]} onPress={() => setReceiptIdx(i => i + 1)}>
                  <Feather name="chevron-right" size={28} color="#fff" />
                </TouchableOpacity>
              )}
              <View style={styles.receiptCounter}>
                <Text style={styles.receiptCounterText}>{receiptIdx + 1} / {receiptUris.length}</Text>
              </View>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f9' },
  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText:   { marginTop: 12, color: '#e53e3e', textAlign: 'center', fontSize: 14 },
  noReportText:{ marginTop: 16, color: '#999', textAlign: 'center', fontSize: 15 },
  retryBtn:  { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#2d6a4f', borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  scroll:    { padding: 16 },

  // Status bar
  statusBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e8e8e8',
  },
  periodText:          { fontSize: 14, color: '#555', marginBottom: 4 },
  statusBadge:         { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start' },
  statusSubmitted:     { backgroundColor: '#D8F3DC' },
  statusDraft:         { backgroundColor: '#FFF8E1' },
  statusText:          { fontSize: 12, fontWeight: '600' },
  statusTextSubmitted: { color: '#2D6A4F' },
  statusTextDraft:     { color: '#F59E0B' },
  actionBtns:          { flexDirection: 'row', gap: 8 },
  actionBtn:           { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  actionBtnDisabled:   { opacity: 0.6 },
  reopenBtn:           { backgroundColor: '#52B788' },
  submitBtn:           { backgroundColor: '#2d6a4f' },
  actionBtnText:       { color: '#fff', fontSize: 13, fontWeight: '600' },
  headerExportBtn:     { padding: 4, marginRight: 4 },

  // Section headers
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10,
    marginTop: 12, borderRadius: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', flex: 1 },
  emptySection: { fontSize: 13, color: '#aaa', textAlign: 'center', paddingVertical: 12 },

  // Attendance
  attRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0f0' },
  attName:  { fontSize: 14, color: '#1a1a1a', flex: 1 },
  attCount: { fontSize: 14, fontWeight: '700', color: '#2d6a4f', fontVariant: ['tabular-nums'] },

  // Livestock
  categoryLabel: { fontSize: 12, fontWeight: '600', color: '#888', textTransform: 'uppercase', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 2 },
  livestockRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 6, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0f0' },
  livestockType: { fontSize: 14, color: '#1a1a1a' },
  livestockCount:{ fontSize: 14, fontWeight: '700', color: '#1a1a1a', fontVariant: ['tabular-nums'] },

  // Milk grid
  milkGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, backgroundColor: '#fff', padding: 12, borderRadius: 4 },
  milkCell: { width: 48, alignItems: 'center', paddingVertical: 4 },
  milkDay:  { fontSize: 10, color: '#888' },
  milkLitres: { fontSize: 13, fontWeight: '600', color: '#1a1a1a', fontVariant: ['tabular-nums'] },

  // Expense rows
  expenseRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e8e8e8' },
  entryBadge:  { width: 28, height: 28, borderRadius: 14, backgroundColor: '#e8f5ef', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  entryNo:     { fontSize: 12, fontWeight: '700', color: '#2d6a4f', fontVariant: ['tabular-nums'] },
  expenseBody: { flex: 1 },
  supplier:    { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  expenseDesc: { fontSize: 13, color: '#555', marginTop: 1 },
  expenseMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  expenseCost: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', fontVariant: ['tabular-nums'], marginLeft: 8 },
  deleteAction:{ width: 80, justifyContent: 'center', alignItems: 'center', backgroundColor: '#e53e3e' },
  deleteLabel: { fontSize: 12, fontWeight: '600', color: '#fff', marginTop: 2 },

  // FAB
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: '#2d6a4f', alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 5,
  },

  // Receipt viewer
  receiptOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  receiptFullImage:  { width: '100%', height: '80%' },
  receiptIcon:       { marginLeft: 6, alignItems: 'center' },
  receiptCount:      { fontSize: 9, fontWeight: '700', color: '#52B788', marginTop: 1 },
  receiptNavBtn:     { position: 'absolute', top: '45%', padding: 14, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 999 },
  receiptNavLeft:    { left: 16 },
  receiptNavRight:   { right: 16 },
  receiptCounter:    { position: 'absolute', bottom: 48, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  receiptCounterText:{ color: '#fff', fontSize: 13, fontWeight: '600' },
});
