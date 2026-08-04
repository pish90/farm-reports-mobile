import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MilkRow, { MilkFormValues, ROW_HEIGHT } from '../../components/milk/MilkRow';
import MonthYearSelector from '../../components/shared/MonthYearSelector';
import { getDb } from '../../db/database';
import {
  getLocalReport,
  getOrCreateLocalReport,
  markSectionDirty,
  saveMilk,
  updateReportSubmitted,
  updateServerReportId,
} from '../../db/reportRepository';
import apiClient from '../../services/apiClient';
import { useAuth } from '../../store/AuthContext';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function parseLitres(val: string | undefined): number {
  const n = parseFloat(val ?? '0');
  return isNaN(n) || n < 0 ? 0 : n;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

// ─── Footer ──────────────────────────────────────────────────────────────────

interface FooterProps {
  totalLitres: number;
  pricePerLitre: number;
  isAdmin?: boolean;
  onPriceChange?: (price: number) => void;
}

function MilkFooter({ totalLitres, pricePerLitre, isAdmin, onPriceChange }: FooterProps) {
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const grandTotal = totalLitres * pricePerLitre;

  function commitPrice() {
    const val = parseFloat(editingPrice ?? '');
    if (!isNaN(val) && val > 0) onPriceChange?.(val);
    setEditingPrice(null);
  }

  return (
    <View style={footerStyles.container}>
      <View style={footerStyles.row}>
        <Text style={footerStyles.label}>Total Litres</Text>
        <Text style={footerStyles.value}>{fmt(totalLitres)} L</Text>
      </View>
      <TouchableOpacity
        style={[footerStyles.row, footerStyles.grandRow]}
        onPress={isAdmin && editingPrice === null ? () => setEditingPrice(String(pricePerLitre)) : undefined}
        activeOpacity={isAdmin ? 0.75 : 1}
      >
        <View style={footerStyles.grandLabelRow}>
          {editingPrice !== null ? (
            <>
              <Text style={footerStyles.grandLabel}>Value (×</Text>
              <TextInput
                style={footerStyles.priceInput}
                value={editingPrice}
                onChangeText={setEditingPrice}
                onBlur={commitPrice}
                onSubmitEditing={commitPrice}
                keyboardType="decimal-pad"
                returnKeyType="done"
                autoFocus
                selectTextOnFocus
              />
              <Text style={footerStyles.grandLabel}>)</Text>
            </>
          ) : (
            <>
              <Text style={footerStyles.grandLabel}>Value (×{pricePerLitre})</Text>
              {isAdmin && <Feather name="edit-2" size={11} color="rgba(255,255,255,0.6)" style={{ marginLeft: 6 }} />}
            </>
          )}
        </View>
        <Text style={footerStyles.grandValue}>{fmt(grandTotal)}</Text>
      </TouchableOpacity>
    </View>
  );
}

const footerStyles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 32,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#d0e8db',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0ede6',
  },
  grandRow: { backgroundColor: '#2d6a4f' },
  label: { fontSize: 15, color: '#444' },
  value: { fontSize: 15, fontWeight: '600', color: '#1a1a1a', fontVariant: ['tabular-nums'] },
  grandLabel: { fontSize: 15, fontWeight: '700', color: '#fff' },
  grandValue: { fontSize: 15, fontWeight: '700', color: '#fff', fontVariant: ['tabular-nums'] },
  grandLabelRow: { flexDirection: 'row', alignItems: 'center' },
  priceInput: {
    color: '#fff', fontWeight: '700', fontSize: 15,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.6)',
    minWidth: 40, textAlign: 'center', paddingVertical: 0, paddingHorizontal: 2,
  },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function MilkScreen() {
  const { user } = useAuth();
  const now = new Date();
  const isAdmin = user?.role === 'ADMIN';

  const [year,       setYear]       = useState(now.getFullYear());
  const [month,      setMonth]      = useState(now.getMonth() + 1);
  const [milkPrice,  setMilkPrice]  = useState(40);

  const [localReportId, setLocalReportId] = useState<number | null>(null);
  const [loadError,     setLoadError]     = useState<string | null>(null);
  const [isLoaded,      setIsLoaded]      = useState(false);
  const [isSubmitted,   setIsSubmitted]   = useState(false);
  const [saveState,     setSaveState]     = useState<SaveState>('idle');

  const debounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipSaveRef    = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem('milk_price_per_litre').then(v => {
      const n = parseFloat(v ?? '');
      if (!isNaN(n) && n > 0) setMilkPrice(n);
    });
  }, []);

  const daysInMonth = getDaysInMonth(year, month);

  const days = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => i + 1),
    [daysInMonth],
  );

  const { control, reset, formState: { errors } } = useForm<MilkFormValues>({
    defaultValues: {},
    mode: 'onChange',
  });

  const watchedValues = useWatch({ control });

  const totalLitres = useMemo(() => {
    return days.reduce((sum, d) => sum + parseLitres(watchedValues[`day_${d}`]), 0);
  }, [watchedValues, days]);

  // ── Load/create local report + existing rows ────────────────────────────
  useEffect(() => {
    if (!user) return;
    setIsLoaded(false);
    setLoadError(null);

    async function load() {
      const report = await getOrCreateLocalReport(user!.farmId!, year, month);
      setLocalReportId(report.id);

      const db = getDb();

      const pendingRow = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) AS count FROM sync_queue
         WHERE report_id = ? AND section = 'milk' AND synced = 0`,
        [report.id],
      );
      if ((pendingRow?.count ?? 0) === 0) {
        try {
          const res = await apiClient.get('/reports', {
            params: { farmId: user!.farmId!, year, month },
          });
          const serverReport = res.data?.data;
          if (serverReport?.id) {
            if (!report.server_report_id) {
              await updateServerReportId(report.id, serverReport.id);
            }
            if (serverReport.milk?.length > 0) {
              await saveMilk(
                report.id,
                serverReport.milk.map((m: { dayOfMonth: number; litres: number }) => ({
                  day_of_month: m.dayOfMonth,
                  litres: m.litres,
                })),
              );
            }
            if (serverReport.status === 'SUBMITTED') {
              await updateReportSubmitted(report.id, 'server');
            }
          }
        } catch {
          // Offline or report not found — use local DB
        }
      }

      const refreshed = (await getLocalReport(report.id)) ?? report;
      setIsSubmitted(refreshed.status === 'submitted');

      const rows = await db.getAllAsync<{ day_of_month: number; litres: number }>(
        'SELECT day_of_month, litres FROM local_milk WHERE report_id = ?',
        [report.id],
      );

      const defaults: MilkFormValues = {};
      for (let d = 1; d <= getDaysInMonth(year, month); d++) {
        defaults[`day_${d}`] = '';
      }
      for (const row of rows) {
        defaults[`day_${row.day_of_month}`] = row.litres === 0 ? '' : String(row.litres);
      }

      skipSaveRef.current = true;
      reset(defaults);
      setIsLoaded(true);
    }

    load().catch((e) => setLoadError(e.message ?? 'Failed to load report'));
  }, [user?.farmId, year, month]);

  // ── Auto-save with 500 ms debounce ─────────────────────────────────────
  const performSave = useCallback(
    async (values: MilkFormValues, reportId: number, numDays: number) => {
      setSaveState('saving');
      try {
        const records = Array.from({ length: numDays }, (_, i) => i + 1).map((d) => ({
          day_of_month: d,
          litres: parseLitres(values[`day_${d}`]),
        }));

        await saveMilk(reportId, records);
        await markSectionDirty(reportId, 'milk');

        setSaveState('saved');
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaveState('idle'), 2000);
      } catch {
        setSaveState('error');
      }
    },
    [],
  );

  useEffect(() => {
    if (!isLoaded || !localReportId || isSubmitted) return;

    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      performSave(watchedValues as MilkFormValues, localReportId, daysInMonth);
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [watchedValues, isLoaded, localReportId]);

  // ── Render helpers ──────────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item: day }: { item: number }) => (
      <MilkRow
        day={day}
        month={month}
        year={year}
        control={control}
        isSubmitted={isSubmitted}
      />
    ),
    [control, month, year, isSubmitted],
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index }),
    [],
  );

  function handlePriceChange(price: number) {
    setMilkPrice(price);
    AsyncStorage.setItem('milk_price_per_litre', String(price));
  }

  const ListFooter = useMemo(
    () => (
      <MilkFooter
        totalLitres={totalLitres}
        pricePerLitre={milkPrice}
        isAdmin={isAdmin}
        onPriceChange={handlePriceChange}
      />
    ),
    [totalLitres, milkPrice, isAdmin],
  );

  // ── Main render ─────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <MonthYearSelector
        year={year}
        month={month}
        onChange={(y, m) => { setYear(y); setMonth(m); }}
      />

      {/* Submitted banner */}
      {isSubmitted && (
        <View style={styles.submittedBanner}>
          <Feather name="lock" size={13} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.submittedText}>Report Submitted — Read Only</Text>
        </View>
      )}

      {/* Save status */}
      <View style={styles.statusBar}>
        {saveState === 'saving' && (
          <>
            <ActivityIndicator size="small" color="#2d6a4f" style={{ marginRight: 6 }} />
            <Text style={styles.statusText}>Saving…</Text>
          </>
        )}
        {saveState === 'saved' && (
          <>
            <Feather name="check-circle" size={15} color="#2d6a4f" style={{ marginRight: 6 }} />
            <Text style={[styles.statusText, { color: '#2d6a4f' }]}>Saved</Text>
          </>
        )}
        {saveState === 'error' && (
          <>
            <Feather name="alert-circle" size={15} color="#e53e3e" style={{ marginRight: 6 }} />
            <Text style={[styles.statusText, { color: '#e53e3e' }]}>Save failed</Text>
          </>
        )}
      </View>

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
        <FlatList
          data={days}
          renderItem={renderItem}
          keyExtractor={(day) => `day-${day}`}
          getItemLayout={getItemLayout}
          initialNumToRender={38}
          maxToRenderPerBatch={38}
          windowSize={5}
          ListFooterComponent={ListFooter}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f5f7f9' },
  submittedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2d6a4f', paddingVertical: 6 },
  submittedText:   { fontSize: 12, fontWeight: '600', color: '#fff' },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 6,
    minHeight: 28,
    backgroundColor: '#f5f7f9',
  },
  statusText: { fontSize: 13, color: '#888' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { marginTop: 12, color: '#e53e3e', textAlign: 'center', fontSize: 14 },
});
