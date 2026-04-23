import { Feather } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MonthYearSelector from '../components/shared/MonthYearSelector';
import { getDb } from '../db/database';
import {
  AttendanceInput,
  getOrCreateLocalReport,
  markSectionDirty,
  saveAttendance,
  saveAttendanceNotes,
} from '../db/reportRepository';
import { WorkerDto, getWorkers } from '../services/workerService';
import { useAuth } from '../store/AuthContext';
import { AttendanceStackParamList } from '../types';

type AttendanceGrid = Record<string, boolean>;
type NotesMap = Record<number, string>; // workerId → note

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function gridKey(workerId: number, day: number): string {
  return `${workerId}_${day}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay(); // 0=Sun
}

// ─── Worker card ─────────────────────────────────────────────────────────────

interface WorkerCardProps {
  worker: WorkerDto;
  year: number;
  month: number;
  grid: AttendanceGrid;
  note: string;
  onToggle: (workerId: number, day: number) => void;
  onNoteChange: (workerId: number, note: string) => void;
  isSubmitted: boolean;
}

const WorkerCard = memo(function WorkerCard({
  worker, year, month, grid, note, onToggle, onNoteChange, isSubmitted,
}: WorkerCardProps) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDow = getFirstDayOfWeek(year, month);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const presentCount = days.filter((d) => grid[gridKey(worker.id, d)]).length;

  // Build calendar grid: leading empty cells + day cells
  const cells: Array<{ day: number | null }> = [
    ...Array.from({ length: firstDow }, () => ({ day: null })),
    ...days.map((d) => ({ day: d })),
  ];

  return (
    <View style={styles.workerCard}>
      <View style={styles.workerHeader}>
        <Text style={styles.workerName}>{worker.name}</Text>
        <View style={styles.presentBadge}>
          <Text style={styles.presentBadgeText}>{presentCount} / {daysInMonth} days</Text>
        </View>
      </View>

      {/* Day-of-week headers */}
      <View style={styles.dowRow}>
        {DAY_LABELS.map((label) => (
          <Text key={label} style={styles.dowLabel}>{label}</Text>
        ))}
      </View>

      {/* Calendar grid */}
      <View style={styles.calendarGrid}>
        {cells.map((cell, idx) => {
          if (!cell.day) {
            return <View key={`empty-${idx}`} style={styles.dayCell} />;
          }
          const present = grid[gridKey(worker.id, cell.day)] ?? false;
          return (
            <View key={cell.day} style={styles.dayCell}>
              <TouchableOpacity
                style={[
                  styles.dayButton,
                  present ? styles.dayPresent : styles.dayAbsent,
                ]}
                onPress={() => onToggle(worker.id, cell.day!)}
                disabled={isSubmitted}
                activeOpacity={0.7}
              >
                <Text style={[styles.dayNum, present ? styles.dayNumPresent : styles.dayNumAbsent]}>
                  {cell.day}
                </Text>
                <Text style={[styles.dayStatus, present ? styles.dayStatusPresent : styles.dayStatusAbsent]}>
                  {present ? 'P' : 'A'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      {/* End-of-month note */}
      <View style={styles.noteRow}>
        <Text style={styles.noteLabel}>Note</Text>
        <TextInput
          style={[styles.noteInput, isSubmitted && styles.noteInputDisabled]}
          value={note}
          onChangeText={(t) => onNoteChange(worker.id, t)}
          placeholder="End-of-month note (optional)"
          placeholderTextColor="#bbb"
          multiline
          editable={!isSubmitted}
          maxLength={500}
        />
      </View>
    </View>
  );
});

// ─── Screen ──────────────────────────────────────────────────────────────────

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function AttendanceScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<AttendanceStackParamList>>();
  const isAdmin = user?.role === 'ADMIN';
  const now = new Date();

  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [workers,       setWorkers]       = useState<WorkerDto[]>([]);
  const [workersLoaded, setWorkersLoaded] = useState(false);
  const [grid,          setGrid]          = useState<AttendanceGrid>({});
  const [notes,         setNotes]         = useState<NotesMap>({});
  const [localReportId, setLocalReportId] = useState<number | null>(null);
  const [isLoaded,      setIsLoaded]      = useState(false);
  const [isSubmitted,   setIsSubmitted]   = useState(false);
  const [loadError,     setLoadError]     = useState<string | null>(null);
  const [saveState,     setSaveState]     = useState<SaveState>('idle');

  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipSaveRef   = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      setLoadError(null);
      getWorkers(user.farmId)
        .then((w) => { setWorkers(w); setWorkersLoaded(true); })
        .catch((e) => { setLoadError(e.message ?? 'Failed to load workers'); setWorkersLoaded(true); });
    }, [user?.farmId]),
  );

  useEffect(() => {
    if (!user || !workersLoaded) return;
    if (workers.length === 0) { setIsLoaded(true); return; }
    setIsLoaded(false);
    skipSaveRef.current = true;

    async function load() {
      const report = await getOrCreateLocalReport(user!.farmId, year, month);
      setLocalReportId(report.id);
      setIsSubmitted(report.status === 'submitted');

      const rows = await getDb().getAllAsync<{
        worker_id: number; day_of_month: number; present: number;
      }>('SELECT worker_id, day_of_month, present FROM local_attendance WHERE report_id = ?', [report.id]);

      const newGrid: AttendanceGrid = {};
      for (const row of rows) {
        newGrid[gridKey(row.worker_id, row.day_of_month)] = row.present === 1;
      }
      setGrid(newGrid);

      const noteRows = await getDb().getAllAsync<{ worker_id: number; note: string }>(
        'SELECT worker_id, note FROM local_attendance_notes WHERE report_id = ?', [report.id],
      );
      const newNotes: NotesMap = {};
      for (const n of noteRows) newNotes[n.worker_id] = n.note;
      setNotes(newNotes);

      setIsLoaded(true);
      setTimeout(() => { skipSaveRef.current = false; }, 0);
    }

    load().catch((e) => setLoadError(e.message ?? 'Failed to load attendance'));
  }, [user?.farmId, year, month, workersLoaded, workers]);

  const performSave = useCallback(
    async (
      currentGrid: AttendanceGrid,
      currentNotes: NotesMap,
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
              worker_id: worker.id,
              worker_name: worker.name,
              day_of_month: day,
              present: currentGrid[gridKey(worker.id, day)] ? 1 : 0,
              notes: null,
            });
          }
        }
        await saveAttendance(reportId, records);
        await markSectionDirty(reportId, 'attendance');

        const noteEntries = Object.entries(currentNotes)
          .map(([id, note]) => ({ worker_id: Number(id), note }));
        await saveAttendanceNotes(reportId, noteEntries);
        await markSectionDirty(reportId, 'attendance-notes');

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
      performSave(grid, notes, localReportId, workers, daysInMonth);
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [grid, notes, isLoaded, localReportId, workers]);

  const handleToggle = useCallback((workerId: number, day: number) => {
    setGrid((prev) => ({ ...prev, [gridKey(workerId, day)]: !prev[gridKey(workerId, day)] }));
  }, []);

  const handleNoteChange = useCallback((workerId: number, note: string) => {
    setNotes((prev) => ({ ...prev, [workerId]: note }));
  }, []);

  return (
    <View style={styles.container}>
      <MonthYearSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />

      <View style={styles.statusBar}>
        {isAdmin && (
          <TouchableOpacity
            style={styles.manageBtn}
            onPress={() => navigation.navigate('Workers')}
            hitSlop={8}
          >
            <Feather name="user-plus" size={14} color="#2d6a4f" style={{ marginRight: 4 }} />
            <Text style={styles.manageBtnText}>Manage Workers</Text>
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }} />
        {saveState === 'saving' && (
          <><ActivityIndicator size="small" color="#2d6a4f" style={{ marginRight: 6 }} /><Text style={styles.statusText}>Saving…</Text></>
        )}
        {saveState === 'saved' && (
          <><Feather name="check-circle" size={15} color="#2d6a4f" style={{ marginRight: 6 }} /><Text style={[styles.statusText, { color: '#2d6a4f' }]}>Saved</Text></>
        )}
        {saveState === 'error' && (
          <><Feather name="alert-circle" size={15} color="#e53e3e" style={{ marginRight: 6 }} /><Text style={[styles.statusText, { color: '#e53e3e' }]}>Save failed</Text></>
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
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
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
                year={year}
                month={month}
                grid={grid}
                note={notes[worker.id] ?? ''}
                onToggle={handleToggle}
                onNoteChange={handleNoteChange}
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

const CELL_PCT = `${100 / 7}%` as const;

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f5f7f9' },
  scroll:          { padding: 12, paddingBottom: 16 },
  submittedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2d6a4f', paddingVertical: 6, marginBottom: 8, borderRadius: 8 },
  submittedText:   { fontSize: 12, fontWeight: '600', color: '#fff' },
  statusBar:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 6, minHeight: 28, backgroundColor: '#f5f7f9' },
  statusText:      { fontSize: 13, color: '#888' },
  manageBtn:       { flexDirection: 'row', alignItems: 'center' },
  manageBtnText:   { fontSize: 13, color: '#2d6a4f', fontWeight: '600' },
  centered:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: 200 },
  errorText:       { marginTop: 12, color: '#e53e3e', textAlign: 'center', fontSize: 14 },
  emptyText:       { color: '#999', fontSize: 14, textAlign: 'center', marginTop: 40 },

  workerCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
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

  dowRow:   { flexDirection: 'row', marginBottom: 4 },
  dowLabel: { width: CELL_PCT, textAlign: 'center', fontSize: 11, fontWeight: '600', color: '#888' },

  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell:      { width: CELL_PCT, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  dayButton:    { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  dayPresent:   { backgroundColor: '#2d6a4f' },
  dayAbsent:    { backgroundColor: '#f0f0f0' },
  dayNum:       { fontSize: 12, fontWeight: '700' },
  dayNumPresent:  { color: '#fff' },
  dayNumAbsent:   { color: '#555' },
  dayStatus:      { fontSize: 9, fontWeight: '600', marginTop: 1 },
  dayStatusPresent: { color: 'rgba(255,255,255,0.8)' },
  dayStatusAbsent:  { color: '#aaa' },

  noteRow:   { marginTop: 10, borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 8 },
  noteLabel: { fontSize: 12, fontWeight: '600', color: '#888', marginBottom: 4 },
  noteInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 8,
    fontSize: 14,
    color: '#1a1a1a',
    backgroundColor: '#fafafa',
    minHeight: 48,
    textAlignVertical: 'top',
  },
  noteInputDisabled: { backgroundColor: '#f5f5f5', borderColor: '#ebebeb', color: '#bbb' },
});
