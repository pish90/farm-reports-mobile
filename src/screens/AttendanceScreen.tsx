import { Feather } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MonthYearSelector from '../components/shared/MonthYearSelector';
import { getDb } from '../db/database';
import {
  AttendanceInput,
  getOrCreateLocalReport,
  markSectionDirty,
  saveAttendance,
} from '../db/reportRepository';
import { WorkerDto, getWorkers } from '../services/workerService';
import { useAuth } from '../store/AuthContext';

// attendance grid key: `${workerId}_${day}` → present (true) | absent (false)
type AttendanceGrid = Record<string, boolean>;

function gridKey(workerId: number, day: number): string {
  return `${workerId}_${day}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// ─── Worker card ─────────────────────────────────────────────────────────────

interface WorkerCardProps {
  worker: WorkerDto;
  daysInMonth: number;
  grid: AttendanceGrid;
  onToggle: (workerId: number, day: number) => void;
  isSubmitted: boolean;
}

const WorkerCard = memo(function WorkerCard({
  worker,
  daysInMonth,
  grid,
  onToggle,
  isSubmitted,
}: WorkerCardProps) {
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const presentCount = days.filter((d) => grid[gridKey(worker.id, d)]).length;

  return (
    <View style={styles.workerCard}>
      <View style={styles.workerHeader}>
        <Text style={styles.workerName}>{worker.name}</Text>
        <View style={styles.presentBadge}>
          <Text style={styles.presentBadgeText}>{presentCount} / {daysInMonth}</Text>
        </View>
      </View>
      <View style={styles.daysGrid}>
        {days.map((day) => {
          const present = grid[gridKey(worker.id, day)] ?? false;
          return (
            <TouchableOpacity
              key={day}
              style={[styles.dayDot, present ? styles.dayPresent : styles.dayAbsent]}
              onPress={() => onToggle(worker.id, day)}
              disabled={isSubmitted}
              activeOpacity={0.7}
              hitSlop={4}
            >
              <Text style={[styles.dayNum, present ? styles.dayNumPresent : styles.dayNumAbsent]}>
                {day}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});

// ─── Screen ───────────────────────────────────────────────────────────────────

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function AttendanceScreen() {
  const { user } = useAuth();
  const now = new Date();

  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [workers,       setWorkers]       = useState<WorkerDto[]>([]);
  const [grid,          setGrid]          = useState<AttendanceGrid>({});
  const [localReportId, setLocalReportId] = useState<number | null>(null);
  const [isLoaded,      setIsLoaded]      = useState(false);
  const [isSubmitted,   setIsSubmitted]   = useState(false);
  const [loadError,     setLoadError]     = useState<string | null>(null);
  const [saveState,     setSaveState]     = useState<SaveState>('idle');

  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipSaveRef   = useRef(true);

  // ── Load workers (once per farm) ─────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    setLoadError(null);
    getWorkers(user.farmId)
      .then(setWorkers)
      .catch((e) => setLoadError(e.message ?? 'Failed to load workers'));
  }, [user?.farmId]);

  // ── Load/create report + existing attendance when month/year changes ─────
  useEffect(() => {
    if (!user || workers.length === 0) return;
    setIsLoaded(false);
    skipSaveRef.current = true;

    async function load() {
      const report = await getOrCreateLocalReport(user!.farmId, year, month);
      setLocalReportId(report.id);
      setIsSubmitted(report.status === 'submitted');

      const rows = await getDb().getAllAsync<{
        worker_id: number;
        day_of_month: number;
        present: number;
      }>(
        'SELECT worker_id, day_of_month, present FROM local_attendance WHERE report_id = ?',
        [report.id],
      );

      const newGrid: AttendanceGrid = {};
      for (const row of rows) {
        newGrid[gridKey(row.worker_id, row.day_of_month)] = row.present === 1;
      }
      setGrid(newGrid);
      setIsLoaded(true);
      setTimeout(() => { skipSaveRef.current = false; }, 0);
    }

    load().catch((e) => setLoadError(e.message ?? 'Failed to load attendance'));
  }, [user?.farmId, year, month, workers]);

  // ── Auto-save with 500 ms debounce ───────────────────────────────────────
  const performSave = useCallback(
    async (
      currentGrid: AttendanceGrid,
      reportId: number,
      currentWorkers: WorkerDto[],
      daysInMonth: number,
    ) => {
      setSaveState('saving');
      try {
        const records: AttendanceInput[] = [];
        for (const worker of currentWorkers) {
          for (let day = 1; day <= daysInMonth; day++) {
            records.push({
              worker_id:    worker.id,
              worker_name:  worker.name,
              day_of_month: day,
              present:      currentGrid[gridKey(worker.id, day)] ? 1 : 0,
              notes:        null,
            });
          }
        }
        await saveAttendance(reportId, records);
        await markSectionDirty(reportId, 'attendance');
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
    if (!isLoaded || !localReportId || isSubmitted || skipSaveRef.current) return;

    const daysInMonth = getDaysInMonth(year, month);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      performSave(grid, localReportId, workers, daysInMonth);
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [grid, isLoaded, localReportId, workers]);

  // ── Toggle ────────────────────────────────────────────────────────────────
  const handleToggle = useCallback((workerId: number, day: number) => {
    setGrid((prev) => ({ ...prev, [gridKey(workerId, day)]: !prev[gridKey(workerId, day)] }));
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  const daysInMonth = getDaysInMonth(year, month);

  return (
    <View style={styles.container}>
      <MonthYearSelector
        year={year}
        month={month}
        onChange={(y, m) => { setYear(y); setMonth(m); }}
      />

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
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {isSubmitted && (
            <View style={styles.submittedBanner}>
              <Feather name="lock" size={13} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.submittedText}>Report Submitted — Read Only</Text>
            </View>
          )}

          {workers.length === 0 ? (
            <Text style={styles.emptyText}>No workers found for this farm.</Text>
          ) : (
            workers.map((worker) => (
              <WorkerCard
                key={worker.id}
                worker={worker}
                daysInMonth={daysInMonth}
                grid={grid}
                onToggle={handleToggle}
                isSubmitted={isSubmitted}
              />
            ))
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </View>
  );
}

const DOT_SIZE = 36;

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f5f7f9' },
  scroll:          { padding: 12, paddingBottom: 16 },
  submittedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2d6a4f', paddingVertical: 6, marginBottom: 8, borderRadius: 8 },
  submittedText:   { fontSize: 12, fontWeight: '600', color: '#fff' },
  statusBar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 16, paddingVertical: 6, minHeight: 28, backgroundColor: '#f5f7f9' },
  statusText:      { fontSize: 13, color: '#888' },
  centered:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: 200 },
  errorText:       { marginTop: 12, color: '#e53e3e', textAlign: 'center', fontSize: 14 },
  emptyText:       { color: '#999', fontSize: 14, textAlign: 'center', marginTop: 40 },

  workerCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  workerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  workerName:        { fontSize: 15, fontWeight: '600', color: '#1a1a1a', flex: 1 },
  presentBadge:      { backgroundColor: '#e8f5e9', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  presentBadgeText:  { fontSize: 12, color: '#2d6a4f', fontWeight: '600' },

  daysGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayDot:         { width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  dayPresent:     { backgroundColor: '#2d6a4f' },
  dayAbsent:      { backgroundColor: '#f0f0f0' },
  dayNum:         { fontSize: 12, fontWeight: '600' },
  dayNumPresent:  { color: '#fff' },
  dayNumAbsent:   { color: '#aaa' },
});
