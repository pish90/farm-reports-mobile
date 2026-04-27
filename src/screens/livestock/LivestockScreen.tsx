import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MonthYearSelector from '../../components/shared/MonthYearSelector';
import { LivestockFormValues } from '../../components/livestock/LivestockSection';
import LivestockSection from '../../components/livestock/LivestockSection';
import {
  getOrCreateLocalReport,
  markSectionDirty,
  saveLivestock,
  saveLivestockNotes,
} from '../../db/reportRepository';
import {
  CATEGORY_ORDER,
  GroupedLivestockTypes,
  getLivestockTypes,
} from '../../services/livestockService';
import { useAuth } from '../../store/AuthContext';
import { getDb } from '../../db/database';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function buildDefaultValues(grouped: GroupedLivestockTypes): LivestockFormValues {
  const vals: LivestockFormValues = {};
  for (const types of Object.values(grouped)) {
    for (const t of types) {
      vals[`count_${t.id}`] = '0';
    }
  }
  return vals;
}

export default function LivestockScreen() {
  const { user } = useAuth();
  const now = new Date();

  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [grouped,        setGrouped]        = useState<GroupedLivestockTypes | null>(null);
  const [localReportId,  setLocalReportId]  = useState<number | null>(null);
  const [loadError,      setLoadError]      = useState<string | null>(null);
  const [isLoaded,       setIsLoaded]       = useState(false);
  const [isSubmitted,    setIsSubmitted]    = useState(false);
  const [saveState,      setSaveState]      = useState<SaveState>('idle');
  const [categoryNotes,  setCategoryNotes]  = useState<Record<string, string>>({});

  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { control, reset, formState: { errors }, watch } = useForm<LivestockFormValues>({
    defaultValues: {},
    mode: 'onChange',
  });

  const watchedValues = useWatch({ control });

  // ── Load livestock types (once, per farm) ────────────────────────────────
  useEffect(() => {
    if (!user) return;
    setLoadError(null);
    getLivestockTypes(user.farmId!)
      .then(setGrouped)
      .catch((e) => setLoadError(e.message ?? 'Failed to load livestock types'));
  }, [user?.farmId]);

  // ── Load/create local report + existing data when month/year changes ─────
  useEffect(() => {
    if (!user || !grouped) return;
    setIsLoaded(false);

    async function load() {
      const report = await getOrCreateLocalReport(user!.farmId!, year, month);
      setLocalReportId(report.id);
      setIsSubmitted(report.status === 'submitted');

      // Load existing livestock data for this report
      const db = getDb();
      const rows = await db.getAllAsync<{ livestock_type_id: number; count: number }>(
        'SELECT livestock_type_id, count FROM local_livestock WHERE report_id = ?',
        [report.id],
      );

      const defaults = buildDefaultValues(grouped!);
      for (const row of rows) {
        defaults[`count_${row.livestock_type_id}`] = String(row.count);
      }
      reset(defaults);

      const noteRows = await db.getAllAsync<{ category: string; note: string }>(
        'SELECT category, note FROM local_livestock_notes WHERE report_id = ?', [report.id],
      );
      const notes: Record<string, string> = {};
      for (const n of noteRows) notes[n.category] = n.note;
      setCategoryNotes(notes);

      setIsLoaded(true);
    }

    load().catch((e) => setLoadError(e.message ?? 'Failed to load report'));
  }, [user?.farmId, year, month, grouped]);

  // ── Auto-save with 500 ms debounce ───────────────────────────────────────
  const handleNoteChange = useCallback((category: string, note: string) => {
    setCategoryNotes((prev) => ({ ...prev, [category]: note }));
  }, []);

  const performSave = useCallback(
    async (values: LivestockFormValues, reportId: number, types: GroupedLivestockTypes, currentNotes: Record<string, string>) => {
      setSaveState('saving');
      try {
        const records = Object.values(types)
          .flat()
          .map((t) => ({
            livestock_type_id: t.id,
            category: t.category,
            type_name: t.type,
            count: Math.max(0, parseInt(values[`count_${t.id}`] ?? '0', 10) || 0),
          }));

        await saveLivestock(reportId, records);
        await markSectionDirty(reportId, 'livestock');

        const noteEntries = Object.entries(types)
          .map(([cat]) => ({ category: cat, note: currentNotes[cat] ?? '' }))
          .filter((n) => n.note.trim());
        await saveLivestockNotes(reportId, noteEntries);
        await markSectionDirty(reportId, 'livestock-notes');

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
    if (!isLoaded || !localReportId || !grouped || isSubmitted) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      performSave(watchedValues as LivestockFormValues, localReportId, grouped, categoryNotes);
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [watchedValues, categoryNotes, isLoaded, localReportId, grouped]);

  // ── Render ────────────────────────────────────────────────────────────────
  const orderedCategories = grouped
    ? CATEGORY_ORDER.filter((c) => grouped[c]?.length > 0)
    : [];

  return (
    <View style={styles.container}>
      <MonthYearSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />

      {/* Save status indicator */}
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
      ) : !grouped || !isLoaded ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2d6a4f" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {isSubmitted && (
            <View style={styles.submittedBanner}>
              <Feather name="lock" size={13} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.submittedText}>Report Submitted — Read Only</Text>
            </View>
          )}
          {orderedCategories.map((category) => (
            <LivestockSection
              key={category}
              category={category}
              types={grouped[category]}
              control={control}
              errors={errors}
              watch={watch}
              isSubmitted={isSubmitted}
              note={categoryNotes[category] ?? ''}
              onNoteChange={handleNoteChange}
            />
          ))}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f5f7f9' },
  scroll:          { paddingBottom: 16 },
  submittedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2d6a4f', paddingVertical: 6, marginBottom: 4 },
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
