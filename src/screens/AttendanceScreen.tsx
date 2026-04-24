import { Feather } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
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
type NotesMap = Record<number, string>;

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function gridKey(workerId: number, day: number): string {
  return `${workerId}_${day}`;
}
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

// ─── Per-worker day sheet ─────────────────────────────────────────────────────

interface WorkerDaysModalProps {
  visible: boolean;
  worker: WorkerDto | null;
  year: number;
  month: number;
  daysInMonth: number;
  grid: AttendanceGrid;
  note: string;
  isSubmitted: boolean;
  onToggle: (workerId: number, day: number) => void;
  onNoteChange: (workerId: number, note: string) => void;
  onClose: () => void;
}

function WorkerDaysModal({
  visible, worker, year, month, daysInMonth, grid, note,
  isSubmitted, onToggle, onNoteChange, onClose,
}: WorkerDaysModalProps) {
  if (!worker) return null;

  const firstDow       = getFirstDayOfWeek(year, month);
  const todayDay       = new Date().getDate();
  const todayMonth     = new Date().getMonth() + 1;
  const todayYear      = new Date().getFullYear();
  const isCurrentMonth = year === todayYear && month === todayMonth;

  const cells: Array<number | null> = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const presentCount = Array.from({ length: daysInMonth }, (_, i) => i + 1)
    .filter(d => grid[gridKey(worker.id, d)]).length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.workerSheet}>
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.workerSheetHeader}>
          <Text style={styles.workerSheetName} numberOfLines={1}>{worker.name}</Text>
          <View style={styles.workerSheetBadge}>
            <Text style={styles.workerSheetBadgeText}>{presentCount} / {daysInMonth} days</Text>
          </View>
        </View>
        <Text style={styles.workerSheetMonth}>{MONTHS[month - 1]} {year}</Text>

        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Day-of-week headers */}
          <View style={styles.dowRow}>
            {DAY_LABELS.map(l => (
              <Text key={l} style={styles.dowLabel}>{l}</Text>
            ))}
          </View>

          {/* Calendar grid — each cell toggles present/absent */}
          <View style={styles.calGrid}>
            {cells.map((day, idx) => {
              if (!day) return <View key={`e-${idx}`} style={styles.calCell} />;
              const present = grid[gridKey(worker.id, day)] ?? false;
              const isToday = isCurrentMonth && day === todayDay;
              return (
                <TouchableOpacity
                  key={day}
                  style={[
                    styles.calCell,
                    styles.calDayBtn,
                    present && styles.calDayPresent,
                    !present && isToday && styles.calDayToday,
                  ]}
                  onPress={() => { if (!isSubmitted) onToggle(worker.id, day); }}
                  activeOpacity={0.7}
                  disabled={isSubmitted}
                >
                  <Text style={[
                    styles.calDayNum,
                    present && styles.calDayNumPresent,
                    !present && isToday && styles.calDayNumToday,
                  ]}>
                    {day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Monthly note */}
          <View style={styles.noteSection}>
            <Text style={styles.noteLabel}>Monthly Note (optional)</Text>
            <TextInput
              style={[styles.noteInput, isSubmitted && styles.noteInputDisabled]}
              value={note}
              onChangeText={t => onNoteChange(worker.id, t)}
              placeholder="e.g. Extended leave week 3"
              placeholderTextColor="#bbb"
              multiline
              editable={!isSubmitted}
              maxLength={500}
            />
          </View>

          <View style={{ height: 8 }} />
        </ScrollView>

        <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── Worker summary row ───────────────────────────────────────────────────────

interface WorkerSummaryRowProps {
  worker: WorkerDto;
  daysInMonth: number;
  grid: AttendanceGrid;
  hasNote: boolean;
  onPress: () => void;
}

const WorkerSummaryRow = memo(function WorkerSummaryRow({
  worker, daysInMonth, grid, hasNote, onPress,
}: WorkerSummaryRowProps) {
  const presentCount = Array.from({ length: daysInMonth }, (_, i) => i + 1)
    .filter(d => grid[gridKey(worker.id, d)]).length;
  const pct = daysInMonth > 0 ? presentCount / daysInMonth : 0;

  return (
    <TouchableOpacity style={styles.summaryCard} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.summaryRow}>
        <View style={styles.summaryLeft}>
          <View style={styles.summaryNameRow}>
            <Text style={styles.summaryName}>{worker.name}</Text>
            {hasNote && (
              <Feather name="message-square" size={12} color="#aaa" style={{ marginLeft: 6 }} />
            )}
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pct * 100}%` as any }]} />
          </View>
        </View>
        <View style={styles.summaryRight}>
          <View style={[
            styles.summaryBadge,
            pct >= 0.8 ? styles.summaryBadgeGood :
            pct >= 0.5 ? styles.summaryBadgeWarn : styles.summaryBadgeLow,
          ]}>
            <Text style={styles.summaryBadgeText}>{presentCount}/{daysInMonth}</Text>
          </View>
          <Feather name="chevron-right" size={16} color="#ccc" style={{ marginLeft: 8 }} />
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ─── Screen ───────────────────────────────────────────────────────────────────

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function AttendanceScreen() {
  const { user }   = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<AttendanceStackParamList>>();
  const isAdmin    = user?.role === 'ADMIN';
  const now        = new Date();

  const [year,  setYear]  = useState(now.getFullYear());
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

  const [selectedWorker, setSelectedWorker] = useState<WorkerDto | null>(null);

  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipSaveRef   = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      setLoadError(null);
      getWorkers(user.farmId)
        .then(w => { setWorkers(w); setWorkersLoaded(true); })
        .catch(e => { setLoadError(e.message ?? 'Failed to load workers'); setWorkersLoaded(true); });
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

    load().catch(e => setLoadError(e.message ?? 'Failed to load attendance'));
  }, [user?.farmId, year, month, workersLoaded, workers]);

  const performSave = useCallback(async (
    currentGrid: AttendanceGrid,
    currentNotes: NotesMap,
    reportId: number,
    currentWorkers: WorkerDto[],
    days: number,
  ) => {
    setSaveState('saving');
    try {
      const records: AttendanceInput[] = [];
      for (const worker of currentWorkers) {
        for (let day = 1; day <= days; day++) {
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
  }, []);

  useEffect(() => {
    if (!isLoaded || !localReportId || isSubmitted || skipSaveRef.current) return;
    const days = getDaysInMonth(year, month);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      performSave(grid, notes, localReportId, workers, days);
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [grid, notes, isLoaded, localReportId, workers]);

  const handleToggle = useCallback((workerId: number, day: number) => {
    setGrid(prev => ({ ...prev, [gridKey(workerId, day)]: !prev[gridKey(workerId, day)] }));
  }, []);

  const handleNoteChange = useCallback((workerId: number, note: string) => {
    setNotes(prev => ({ ...prev, [workerId]: note }));
  }, []);

  const daysInMonth = getDaysInMonth(year, month);

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

          {workers.length === 0 ? (
            <Text style={styles.emptyText}>No workers found for this farm.</Text>
          ) : (
            <>
              <Text style={styles.hintText}>Tap a worker to mark their attendance for the month.</Text>
              {workers.map(worker => (
                <WorkerSummaryRow
                  key={worker.id}
                  worker={worker}
                  daysInMonth={daysInMonth}
                  grid={grid}
                  hasNote={!!notes[worker.id]?.trim()}
                  onPress={() => setSelectedWorker(worker)}
                />
              ))}
            </>
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      <WorkerDaysModal
        visible={selectedWorker !== null}
        worker={selectedWorker}
        year={year}
        month={month}
        daysInMonth={daysInMonth}
        grid={grid}
        note={selectedWorker ? (notes[selectedWorker.id] ?? '') : ''}
        isSubmitted={isSubmitted}
        onToggle={handleToggle}
        onNoteChange={handleNoteChange}
        onClose={() => setSelectedWorker(null)}
      />
    </View>
  );
}

const CELL_SIZE = `${100 / 7}%` as const;

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f5f7f9' },
  scroll:          { padding: 12, paddingBottom: 16 },
  submittedBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#2d6a4f', paddingVertical: 6, marginBottom: 8, borderRadius: 8,
  },
  submittedText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  statusBar:     {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 6, minHeight: 28, backgroundColor: '#f5f7f9',
  },
  statusText:    { fontSize: 13, color: '#888' },
  manageBtn:     { flexDirection: 'row', alignItems: 'center' },
  manageBtnText: { fontSize: 13, color: '#2d6a4f', fontWeight: '600' },
  centered:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: 200 },
  errorText:     { marginTop: 12, color: '#e53e3e', textAlign: 'center', fontSize: 14 },
  emptyText:     { color: '#999', fontSize: 14, textAlign: 'center', marginTop: 40 },
  hintText:      { fontSize: 12, color: '#aaa', textAlign: 'center', marginBottom: 12 },

  // Worker summary cards
  summaryCard: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#eee', overflow: 'hidden',
  },
  summaryRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  summaryLeft:    { flex: 1, marginRight: 12 },
  summaryNameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  summaryName:    { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  progressTrack:  { height: 4, backgroundColor: '#f0f0f0', borderRadius: 2, overflow: 'hidden' },
  progressFill:   { height: 4, backgroundColor: '#52B788', borderRadius: 2 },
  summaryRight:     { flexDirection: 'row', alignItems: 'center' },
  summaryBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  summaryBadgeGood: { backgroundColor: '#D8F3DC' },
  summaryBadgeWarn: { backgroundColor: '#FFF3CD' },
  summaryBadgeLow:  { backgroundColor: '#FFE5E5' },
  summaryBadgeText: { fontSize: 12, fontWeight: '700', color: '#1a1a1a' },

  // Shared modal
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  handle:   {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#e0e0e0',
    alignSelf: 'center', marginTop: 12, marginBottom: 14,
  },

  // Worker days sheet
  workerSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingBottom: 32, maxHeight: '88%',
  },
  workerSheetHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  workerSheetName:      { fontSize: 18, fontWeight: '700', color: '#1a1a1a', flex: 1, marginRight: 12 },
  workerSheetMonth:     { fontSize: 13, color: '#888', marginBottom: 16 },
  workerSheetBadge:     { backgroundColor: '#EDF7F1', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  workerSheetBadgeText: { fontSize: 13, fontWeight: '700', color: '#2d6a4f' },

  // Calendar
  dowRow:   { flexDirection: 'row', marginBottom: 4 },
  dowLabel: { width: CELL_SIZE, textAlign: 'center', fontSize: 11, fontWeight: '600', color: '#888' },
  calGrid:  { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  calCell:  { width: CELL_SIZE, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  calDayBtn:      { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  calDayPresent:  { backgroundColor: '#2d6a4f' },
  calDayToday:    { borderWidth: 2, borderColor: '#2d6a4f' },
  calDayNum:        { fontSize: 14, fontWeight: '600', color: '#333' },
  calDayNumPresent: { color: '#fff' },
  calDayNumToday:   { color: '#2d6a4f' },

  // Note
  noteSection:       { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#f0f0f0', paddingTop: 14 },
  noteLabel:         { fontSize: 12, fontWeight: '600', color: '#888', marginBottom: 6 },
  noteInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    padding: 8, fontSize: 14, color: '#1a1a1a',
    backgroundColor: '#fafafa', minHeight: 52, textAlignVertical: 'top',
  },
  noteInputDisabled: { backgroundColor: '#f5f5f5', borderColor: '#ebebeb', color: '#bbb' },

  // Done button
  doneBtn:     { marginTop: 16, backgroundColor: '#2d6a4f', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  doneBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
