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

// ─── Day picker modal ─────────────────────────────────────────────────────────

interface DayPickerProps {
  visible: boolean;
  year: number;
  month: number;
  markedDays: Set<number>;
  onSelect: (day: number) => void;
  onClose: () => void;
}

function DayPickerModal({ visible, year, month, markedDays, onSelect, onClose }: DayPickerProps) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDow    = getFirstDayOfWeek(year, month);
  const todayDay    = new Date().getDate();
  const todayMonth  = new Date().getMonth() + 1;
  const todayYear   = new Date().getFullYear();
  const isCurrentMonth = year === todayYear && month === todayMonth;

  const cells: Array<number | null> = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.pickerSheet}>
        <View style={styles.handle} />
        <Text style={styles.pickerTitle}>
          Select Day — {MONTHS[month - 1]} {year}
        </Text>

        {/* Day-of-week headers */}
        <View style={styles.dowRow}>
          {DAY_LABELS.map(l => (
            <Text key={l} style={styles.dowLabel}>{l}</Text>
          ))}
        </View>

        {/* Calendar grid */}
        <View style={styles.calGrid}>
          {cells.map((day, idx) => {
            if (!day) return <View key={`e-${idx}`} style={styles.calCell} />;
            const marked  = markedDays.has(day);
            const isToday = isCurrentMonth && day === todayDay;
            return (
              <TouchableOpacity
                key={day}
                style={[
                  styles.calCell,
                  styles.calDayBtn,
                  marked  && styles.calDayMarked,
                  isToday && !marked && styles.calDayToday,
                ]}
                onPress={() => { onSelect(day); onClose(); }}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.calDayNum,
                  marked  && styles.calDayNumMarked,
                  isToday && !marked && styles.calDayNumToday,
                ]}>
                  {day}
                </Text>
                {marked && <View style={styles.calDot} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── Day attendance modal ─────────────────────────────────────────────────────

interface DayAttendanceProps {
  visible: boolean;
  day: number;
  year: number;
  month: number;
  workers: WorkerDto[];
  grid: AttendanceGrid;
  isSubmitted: boolean;
  onToggle: (workerId: number, day: number) => void;
  onClose: () => void;
}

function DayAttendanceModal({
  visible, day, year, month, workers, grid, isSubmitted, onToggle, onClose,
}: DayAttendanceProps) {
  const dayName = new Date(year, month - 1, day)
    .toLocaleDateString('en-GB', { weekday: 'long' });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.attSheet}>
        <View style={styles.handle} />
        <Text style={styles.attTitle}>{dayName}, {day} {MONTHS[month - 1]}</Text>
        <Text style={styles.attSubtitle}>Tap a name to toggle Present / Absent</Text>

        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {workers.map(worker => {
            const present = grid[gridKey(worker.id, day)] ?? false;
            return (
              <TouchableOpacity
                key={worker.id}
                style={[styles.attRow, present && styles.attRowPresent]}
                onPress={() => { if (!isSubmitted) onToggle(worker.id, day); }}
                activeOpacity={0.75}
                disabled={isSubmitted}
              >
                <Text style={[styles.attWorkerName, present && styles.attWorkerNamePresent]}>
                  {worker.name}
                </Text>
                <View style={[styles.attBadge, present ? styles.attBadgeP : styles.attBadgeA]}>
                  <Text style={[styles.attBadgeText, present ? styles.attBadgeTextP : styles.attBadgeTextA]}>
                    {present ? 'P' : 'A'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
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
  note: string;
  isSubmitted: boolean;
  onNoteChange: (workerId: number, note: string) => void;
}

const WorkerSummaryRow = memo(function WorkerSummaryRow({
  worker, daysInMonth, grid, note, isSubmitted, onNoteChange,
}: WorkerSummaryRowProps) {
  const [expanded, setExpanded] = useState(false);
  const presentCount = Array.from({ length: daysInMonth }, (_, i) => i + 1)
    .filter(d => grid[gridKey(worker.id, d)]).length;
  const pct = daysInMonth > 0 ? presentCount / daysInMonth : 0;

  return (
    <View style={styles.summaryCard}>
      <TouchableOpacity
        style={styles.summaryRow}
        onPress={() => setExpanded(e => !e)}
        activeOpacity={0.75}
      >
        <View style={styles.summaryLeft}>
          <Text style={styles.summaryName}>{worker.name}</Text>
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
          <Feather name={expanded ? 'chevron-up' : 'message-square'} size={15} color="#aaa" style={{ marginLeft: 8 }} />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.noteExpanded}>
          <Text style={styles.noteLabel}>End-of-month note</Text>
          <TextInput
            style={[styles.noteInput, isSubmitted && styles.noteInputDisabled]}
            value={note}
            onChangeText={t => onNoteChange(worker.id, t)}
            placeholder="Optional note for this worker"
            placeholderTextColor="#bbb"
            multiline
            editable={!isSubmitted}
            maxLength={500}
          />
        </View>
      )}
    </View>
  );
});

// ─── Screen ───────────────────────────────────────────────────────────────────

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function AttendanceScreen() {
  const { user }     = useAuth();
  const navigation   = useNavigation<NativeStackNavigationProp<AttendanceStackParamList>>();
  const isAdmin      = user?.role === 'ADMIN';
  const now          = new Date();

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

  const [showDayPicker,     setShowDayPicker]     = useState(false);
  const [showDayAttendance, setShowDayAttendance] = useState(false);
  const [selectedDay,       setSelectedDay]       = useState<number>(1);

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
  }, []);

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
    setGrid(prev => ({ ...prev, [gridKey(workerId, day)]: !prev[gridKey(workerId, day)] }));
  }, []);

  const handleNoteChange = useCallback((workerId: number, note: string) => {
    setNotes(prev => ({ ...prev, [workerId]: note }));
  }, []);

  // Days that have any recorded attendance — used to highlight the calendar
  const markedDays = new Set<number>();
  const daysInMonth = getDaysInMonth(year, month);
  for (let d = 1; d <= daysInMonth; d++) {
    if (workers.some(w => gridKey(w.id, d) in grid)) {
      markedDays.add(d);
    }
  }

  function openDayAttendance(day: number) {
    setSelectedDay(day);
    setShowDayAttendance(true);
  }

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
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
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
              <Text style={styles.hintText}>
                Tap <Feather name="calendar" size={13} color="#2d6a4f" /> to mark attendance for a day.
                Tap a worker's row to add a monthly note.
              </Text>
              {workers.map(worker => (
                <WorkerSummaryRow
                  key={worker.id}
                  worker={worker}
                  daysInMonth={daysInMonth}
                  grid={grid}
                  note={notes[worker.id] ?? ''}
                  isSubmitted={isSubmitted}
                  onNoteChange={handleNoteChange}
                />
              ))}
            </>
          )}
          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      {/* Mark Attendance FAB */}
      {isLoaded && !isSubmitted && workers.length > 0 && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setShowDayPicker(true)}
          activeOpacity={0.85}
        >
          <Feather name="calendar" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Day picker modal */}
      <DayPickerModal
        visible={showDayPicker}
        year={year}
        month={month}
        markedDays={markedDays}
        onSelect={day => openDayAttendance(day)}
        onClose={() => setShowDayPicker(false)}
      />

      {/* Day attendance modal */}
      <DayAttendanceModal
        visible={showDayAttendance}
        day={selectedDay}
        year={year}
        month={month}
        workers={workers}
        grid={grid}
        isSubmitted={isSubmitted}
        onToggle={handleToggle}
        onClose={() => setShowDayAttendance(false)}
      />
    </View>
  );
}

const CELL_SIZE = `${100 / 7}%` as const;

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
  hintText:        { fontSize: 12, color: '#aaa', textAlign: 'center', marginBottom: 12, lineHeight: 18 },

  // Worker summary cards
  summaryCard: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#eee', overflow: 'hidden',
  },
  summaryRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  summaryLeft: { flex: 1, marginRight: 12 },
  summaryName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a', marginBottom: 6 },
  progressTrack: {
    height: 4, backgroundColor: '#f0f0f0', borderRadius: 2, overflow: 'hidden',
  },
  progressFill: { height: 4, backgroundColor: '#52B788', borderRadius: 2 },
  summaryRight: { flexDirection: 'row', alignItems: 'center' },
  summaryBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  summaryBadgeGood: { backgroundColor: '#D8F3DC' },
  summaryBadgeWarn: { backgroundColor: '#FFF3CD' },
  summaryBadgeLow:  { backgroundColor: '#FFE5E5' },
  summaryBadgeText: { fontSize: 12, fontWeight: '700', color: '#1a1a1a' },
  noteExpanded:  { paddingHorizontal: 14, paddingBottom: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  noteLabel:     { fontSize: 12, fontWeight: '600', color: '#888', marginTop: 10, marginBottom: 4 },
  noteInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    padding: 8, fontSize: 14, color: '#1a1a1a',
    backgroundColor: '#fafafa', minHeight: 48, textAlignVertical: 'top',
  },
  noteInputDisabled: { backgroundColor: '#f5f5f5', borderColor: '#ebebeb', color: '#bbb' },

  // FAB
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: '#2d6a4f', alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 5,
  },

  // Shared modal styles
  backdrop:    { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  handle:      { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e0e0e0', alignSelf: 'center', marginTop: 12, marginBottom: 14 },

  // Day picker
  pickerSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingBottom: 32,
  },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', textAlign: 'center', marginBottom: 16 },
  dowRow:      { flexDirection: 'row', marginBottom: 4 },
  dowLabel:    { width: CELL_SIZE, textAlign: 'center', fontSize: 11, fontWeight: '600', color: '#888' },
  calGrid:     { flexDirection: 'row', flexWrap: 'wrap' },
  calCell:     { width: CELL_SIZE, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 3 },
  calDayBtn:   { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  calDayMarked:    { backgroundColor: '#2d6a4f' },
  calDayToday:     { borderWidth: 2, borderColor: '#2d6a4f' },
  calDayNum:       { fontSize: 14, fontWeight: '600', color: '#333' },
  calDayNumMarked: { color: '#fff' },
  calDayNumToday:  { color: '#2d6a4f' },
  calDot:          { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.7)', marginTop: 2 },
  closeBtn:    { marginTop: 16, paddingVertical: 13, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  closeBtnText:{ fontSize: 15, fontWeight: '600', color: '#666' },

  // Day attendance
  attSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingBottom: 32, maxHeight: '75%',
  },
  attTitle:    { fontSize: 17, fontWeight: '700', color: '#1a1a1a', textAlign: 'center', marginBottom: 4 },
  attSubtitle: { fontSize: 12, color: '#aaa', textAlign: 'center', marginBottom: 16 },
  attRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0f0',
    borderRadius: 8, marginBottom: 2,
  },
  attRowPresent:      { backgroundColor: '#F0FBF4' },
  attWorkerName:      { fontSize: 15, fontWeight: '500', color: '#333', flex: 1 },
  attWorkerNamePresent:{ color: '#1B4332', fontWeight: '600' },
  attBadge:           { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  attBadgeP:          { backgroundColor: '#2d6a4f' },
  attBadgeA:          { backgroundColor: '#f0f0f0' },
  attBadgeText:       { fontSize: 14, fontWeight: '700' },
  attBadgeTextP:      { color: '#fff' },
  attBadgeTextA:      { color: '#999' },
  doneBtn:     { marginTop: 16, backgroundColor: '#2d6a4f', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  doneBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
