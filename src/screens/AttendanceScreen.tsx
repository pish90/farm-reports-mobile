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

// ─── Step 1: Calendar to pick a date ─────────────────────────────────────────

interface DayPickerProps {
  visible: boolean;
  year: number;
  month: number;
  markedDays: Set<number>;
  onSelect: (day: number) => void;
  onClose: () => void;
}

function DayPickerModal({ visible, year, month, markedDays, onSelect, onClose }: DayPickerProps) {
  const daysInMonth    = getDaysInMonth(year, month);
  const firstDow       = getFirstDayOfWeek(year, month);
  const todayDay       = new Date().getDate();
  const isCurrentMonth = new Date().getFullYear() === year && new Date().getMonth() + 1 === month;

  const cells: Array<number | null> = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.pickerSheet}>
        <View style={styles.handle} />
        <Text style={styles.sheetTitle}>Daily Register</Text>
        <Text style={styles.sheetSubtitle}>{MONTHS[month - 1]} {year} — select a date</Text>

        {/* Day-of-week labels */}
        <View style={styles.dowRow}>
          {DAY_LABELS.map(l => <Text key={l} style={styles.dowLabel}>{l}</Text>)}
        </View>

        {/* Full month calendar grid */}
        <View style={styles.calGrid}>
          {cells.map((day, idx) => {
            if (!day) return <View key={`e-${idx}`} style={styles.calCell} />;
            const hasAtt  = markedDays.has(day);
            const isToday = isCurrentMonth && day === todayDay;
            return (
              <TouchableOpacity
                key={day}
                style={[
                  styles.calCell,
                  styles.calDayBtn,
                  hasAtt   && styles.calDayMarked,
                  !hasAtt && isToday && styles.calDayToday,
                ]}
                onPress={() => { onSelect(day); onClose(); }}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.calDayNum,
                  hasAtt   && styles.calDayNumMarked,
                  !hasAtt && isToday && styles.calDayNumToday,
                ]}>
                  {day}
                </Text>
                {hasAtt && <View style={styles.calDot} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── Step 2: Employee list for the selected date ──────────────────────────────

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

function DayAttendanceModal({ visible, day, year, month, workers, grid, isSubmitted, onToggle, onClose }: DayAttendanceProps) {
  const date = new Date(year, month - 1, day);
  const dayName = date.toLocaleDateString('en-GB', { weekday: 'long' });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.attSheet}>
        <View style={styles.handle} />

        <View style={styles.attSheetHeader}>
          <View>
            <Text style={styles.sheetTitle}>{dayName}</Text>
            <Text style={styles.sheetSubtitle}>{day} {MONTHS[month - 1]} {year}</Text>
          </View>
          {!isSubmitted && (
            <Text style={styles.attHint}>Tap to toggle</Text>
          )}
        </View>

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

// ─── Per-worker calendar card ─────────────────────────────────────────────────

interface WorkerCardProps {
  worker: WorkerDto;
  year: number;
  month: number;
  daysInMonth: number;
  firstDow: number;
  grid: AttendanceGrid;
  note: string;
  isSubmitted: boolean;
  onToggle: (workerId: number, day: number) => void;
  onNoteChange: (workerId: number, note: string) => void;
}

const WorkerCard = memo(function WorkerCard({
  worker, year, month, daysInMonth, firstDow, grid, note, isSubmitted, onToggle, onNoteChange,
}: WorkerCardProps) {
  const [noteExpanded, setNoteExpanded] = useState(false);

  const todayDay       = new Date().getDate();
  const isCurrentMonth = new Date().getFullYear() === year && new Date().getMonth() + 1 === month;

  const presentCount = Array.from({ length: daysInMonth }, (_, i) => i + 1)
    .filter(d => grid[gridKey(worker.id, d)]).length;
  const pct = daysInMonth > 0 ? presentCount / daysInMonth : 0;

  const cells: Array<number | null> = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <View style={styles.workerCard}>
      {/* Header row */}
      <View style={styles.workerCardHeader}>
        <Text style={styles.workerName}>{worker.name}</Text>
        <View style={styles.workerRight}>
          <View style={[
            styles.workerBadge,
            pct >= 0.8 ? styles.badgeGood : pct >= 0.5 ? styles.badgeWarn : styles.badgeLow,
          ]}>
            <Text style={styles.workerBadgeText}>{presentCount}/{daysInMonth}</Text>
          </View>
          <TouchableOpacity onPress={() => setNoteExpanded(e => !e)} hitSlop={8} style={{ marginLeft: 8 }}>
            <Feather name="message-square" size={16} color={note.trim() ? '#2d6a4f' : '#ccc'} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct * 100}%` as any }]} />
      </View>

      {/* Day-of-week labels */}
      <View style={[styles.dowRow, { marginTop: 10 }]}>
        {DAY_LABELS.map(l => <Text key={l} style={styles.dowLabel}>{l}</Text>)}
      </View>

      {/* Full month calendar grid — tap a day to mark present/absent */}
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
                present    && styles.calDayMarked,
                !present   && isToday && styles.calDayToday,
              ]}
              onPress={() => { if (!isSubmitted) onToggle(worker.id, day); }}
              activeOpacity={0.7}
              disabled={isSubmitted}
            >
              <Text style={[
                styles.calDayNum,
                present    && styles.calDayNumMarked,
                !present   && isToday && styles.calDayNumToday,
              ]}>
                {day}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Expandable note */}
      {noteExpanded && (
        <View style={styles.noteSection}>
          <TextInput
            style={[styles.noteInput, isSubmitted && styles.noteInputDisabled]}
            value={note}
            onChangeText={t => onNoteChange(worker.id, t)}
            placeholder="Monthly note for this worker…"
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

  // Daily Register: two-step flow
  const [showDayPicker,     setShowDayPicker]     = useState(false);
  const [showDayAttendance, setShowDayAttendance] = useState(false);
  const [selectedDay,       setSelectedDay]       = useState(1);

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
      for (const r of rows) newGrid[gridKey(r.worker_id, r.day_of_month)] = r.present === 1;
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
  const firstDow    = getFirstDayOfWeek(year, month);

  // Days that already have at least one worker present — highlighted in the day picker
  const markedDays = new Set<number>();
  for (let d = 1; d <= daysInMonth; d++) {
    if (workers.some(w => grid[gridKey(w.id, d)])) markedDays.add(d);
  }

  function openDailyRegister() {
    const today = new Date().getDate();
    const isThisMonth = new Date().getFullYear() === year && new Date().getMonth() + 1 === month;
    setSelectedDay(isThisMonth ? today : 1);
    setShowDayPicker(true);
  }

  return (
    <View style={styles.container}>
      <MonthYearSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />

      {/* Toolbar: manage workers | save status | Daily Register link */}
      <View style={styles.toolbar}>
        {isAdmin && (
          <TouchableOpacity style={styles.toolbarBtn} onPress={() => navigation.navigate('Workers')} hitSlop={8}>
            <Feather name="user-plus" size={14} color="#2d6a4f" />
            <Text style={styles.toolbarBtnText}>Manage Workers</Text>
          </TouchableOpacity>
        )}

        <View style={{ flex: 1 }} />

        {saveState === 'saving' && (
          <><ActivityIndicator size="small" color="#2d6a4f" style={{ marginRight: 4 }} /><Text style={styles.saveText}>Saving…</Text></>
        )}
        {saveState === 'saved' && (
          <><Feather name="check-circle" size={14} color="#2d6a4f" style={{ marginRight: 4 }} /><Text style={[styles.saveText, { color: '#2d6a4f' }]}>Saved</Text></>
        )}
        {saveState === 'error' && (
          <><Feather name="alert-circle" size={14} color="#e53e3e" style={{ marginRight: 4 }} /><Text style={[styles.saveText, { color: '#e53e3e' }]}>Save failed</Text></>
        )}

        {isLoaded && !isSubmitted && workers.length > 0 && (
          <TouchableOpacity style={styles.dailyRegisterLink} onPress={openDailyRegister} hitSlop={6}>
            <Feather name="calendar" size={14} color="#2d6a4f" />
            <Text style={styles.dailyRegisterText}>Daily Register</Text>
          </TouchableOpacity>
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
            workers.map(worker => (
              <WorkerCard
                key={worker.id}
                worker={worker}
                year={year}
                month={month}
                daysInMonth={daysInMonth}
                firstDow={firstDow}
                grid={grid}
                note={notes[worker.id] ?? ''}
                isSubmitted={isSubmitted}
                onToggle={handleToggle}
                onNoteChange={handleNoteChange}
              />
            ))
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Step 1: pick a date from the calendar */}
      <DayPickerModal
        visible={showDayPicker}
        year={year}
        month={month}
        markedDays={markedDays}
        onSelect={day => {
          setSelectedDay(day);
          setShowDayPicker(false);
          setShowDayAttendance(true);
        }}
        onClose={() => setShowDayPicker(false)}
      />

      {/* Step 2: mark each employee P/A for the chosen date */}
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
  scroll:          { padding: 12 },
  submittedBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#2d6a4f', paddingVertical: 6, marginBottom: 8, borderRadius: 8,
  },
  submittedText: { fontSize: 12, fontWeight: '600', color: '#fff' },

  // Toolbar
  toolbar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee',
  },
  toolbarBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  toolbarBtnText: { fontSize: 13, fontWeight: '600', color: '#2d6a4f' },
  saveText:       { fontSize: 12, color: '#888' },

  // Daily Register link button
  dailyRegisterLink: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginLeft: 12,
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: '#e8f5ef', borderRadius: 16,
  },
  dailyRegisterText: { fontSize: 13, fontWeight: '700', color: '#2d6a4f' },

  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: 200 },
  errorText: { marginTop: 12, color: '#e53e3e', textAlign: 'center', fontSize: 14 },
  emptyText: { color: '#999', fontSize: 14, textAlign: 'center', marginTop: 40 },

  // Worker cards
  workerCard: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 12,
    padding: 12, borderWidth: 1, borderColor: '#eee',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  workerCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  workerName:       { fontSize: 15, fontWeight: '700', color: '#1a1a1a', flex: 1 },
  workerRight:      { flexDirection: 'row', alignItems: 'center' },
  workerBadge:      { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  badgeGood:        { backgroundColor: '#D8F3DC' },
  badgeWarn:        { backgroundColor: '#FFF3CD' },
  badgeLow:         { backgroundColor: '#FFE5E5' },
  workerBadgeText:  { fontSize: 12, fontWeight: '700', color: '#1a1a1a' },
  progressTrack:    { height: 3, backgroundColor: '#f0f0f0', borderRadius: 2, overflow: 'hidden', marginBottom: 4 },
  progressFill:     { height: 3, backgroundColor: '#52B788', borderRadius: 2 },

  // Shared calendar grid (used in both worker cards and day picker)
  dowRow:          { flexDirection: 'row' },
  dowLabel:        { width: CELL_SIZE, textAlign: 'center', fontSize: 10, fontWeight: '600', color: '#aaa', paddingVertical: 2 },
  calGrid:         { flexDirection: 'row', flexWrap: 'wrap' },
  calCell:         { width: CELL_SIZE, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  calDayBtn:       { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  calDayMarked:    { backgroundColor: '#2d6a4f' },
  calDayToday:     { borderWidth: 2, borderColor: '#2d6a4f' },
  calDayNum:       { fontSize: 12, fontWeight: '600', color: '#333' },
  calDayNumMarked: { color: '#fff' },
  calDayNumToday:  { color: '#2d6a4f' },
  calDot:          { width: 3, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.7)', marginTop: 1 },

  // Note
  noteSection:       { marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#f0f0f0', paddingTop: 8 },
  noteInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    padding: 8, fontSize: 13, color: '#1a1a1a',
    backgroundColor: '#fafafa', minHeight: 44, textAlignVertical: 'top',
  },
  noteInputDisabled: { backgroundColor: '#f5f5f5', borderColor: '#ebebeb', color: '#bbb' },

  // Shared modal primitives
  backdrop:      { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  handle:        { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e0e0e0', alignSelf: 'center', marginTop: 12, marginBottom: 14 },
  sheetTitle:    { fontSize: 17, fontWeight: '700', color: '#1a1a1a', textAlign: 'center', marginBottom: 2 },
  sheetSubtitle: { fontSize: 12, color: '#aaa', textAlign: 'center', marginBottom: 14 },

  // Step 1: Day picker sheet
  pickerSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingBottom: 32,
  },
  closeBtn:     { marginTop: 14, paddingVertical: 13, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  closeBtnText: { fontSize: 15, fontWeight: '600', color: '#666' },

  // Step 2: Employee attendance sheet
  attSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingBottom: 32, maxHeight: '75%',
  },
  attSheetHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 },
  attHint:              { fontSize: 11, color: '#aaa', fontStyle: 'italic' },
  attRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0f0',
    borderRadius: 8, marginBottom: 2,
  },
  attRowPresent:        { backgroundColor: '#F0FBF4' },
  attWorkerName:        { fontSize: 15, fontWeight: '500', color: '#333', flex: 1 },
  attWorkerNamePresent: { color: '#1B4332', fontWeight: '600' },
  attBadge:             { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  attBadgeP:            { backgroundColor: '#2d6a4f' },
  attBadgeA:            { backgroundColor: '#f0f0f0' },
  attBadgeText:         { fontSize: 15, fontWeight: '700' },
  attBadgeTextP:        { color: '#fff' },
  attBadgeTextA:        { color: '#aaa' },
  doneBtn:              { marginTop: 14, backgroundColor: '#2d6a4f', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  doneBtnText:          { fontSize: 15, fontWeight: '700', color: '#fff' },
});
