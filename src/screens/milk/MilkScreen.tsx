import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MilkRow, { MilkFormValues, ROW_HEIGHT } from '../../components/milk/MilkRow';
import MonthYearSelector from '../../components/shared/MonthYearSelector';
import { getDb } from '../../db/database';
import {
  getOrCreateLocalReport,
  markSectionDirty,
  saveMilk,
} from '../../db/reportRepository';
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

interface FooterProps { totalLitres: number }

function MilkFooter({ totalLitres }: FooterProps) {
  const grandTotal = totalLitres * 40;
  return (
    <View style={footerStyles.container}>
      <View style={footerStyles.row}>
        <Text style={footerStyles.label}>Total Litres</Text>
        <Text style={footerStyles.value}>{fmt(totalLitres)} L</Text>
      </View>
      <View style={[footerStyles.row, footerStyles.grandRow]}>
        <Text style={footerStyles.grandLabel}>Value (×40)</Text>
        <Text style={footerStyles.grandValue}>{fmt(grandTotal)}</Text>
      </View>
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
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function MilkScreen() {
  const { user } = useAuth();
  const now = new Date();

  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [localReportId, setLocalReportId] = useState<number | null>(null);
  const [loadError,     setLoadError]     = useState<string | null>(null);
  const [isLoaded,      setIsLoaded]      = useState(false);
  const [isSubmitted,   setIsSubmitted]   = useState(false);
  const [saveState,     setSaveState]     = useState<SaveState>('idle');

  const debounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipSaveRef    = useRef(false);

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
      const report = await getOrCreateLocalReport(user!.farmId, year, month);
      setLocalReportId(report.id);
      setIsSubmitted(report.status === 'submitted');

      const db = getDb();
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
      performSave(watchedValues, localReportId, daysInMonth);
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
    (_: unknown, index: number) => ({
      length: ROW_HEIGHT,
      offset: ROW_HEIGHT * index,
      index,
    }),
    [],
  );

  const ListFooter = useMemo(
    () => <MilkFooter totalLitres={totalLitres} />,
    [totalLitres],
  );

  // ── Main render ─────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
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
          keyExtractor={(item) => String(item)}
          getItemLayout={getItemLayout}
          initialNumToRender={31}
          maxToRenderPerBatch={31}
          windowSize={5}
          ListFooterComponent={ListFooter}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}
    </View>
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
