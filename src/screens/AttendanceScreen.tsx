import { Feather } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
  CasualAttendanceInput,
  getCasualAttendance,
  getLocalReport,
  getOrCreateLocalReport,
  markSectionDirty,
  saveAttendance,
  saveAttendanceNotes,
  saveCasualAttendance,
  updateReportSubmitted,
  updateServerReportId,
} from '../db/reportRepository';
import apiClient from '../services/apiClient';
import { getCasualLabourers } from '../services/casualLabourerService';
import { WorkerDto, getWorkers } from '../services/workerService';
import { useAuth } from '../store/AuthContext';
import { AttendanceStackParamList, CasualLabourerDto } from '../types';

type AttendanceStatus = 'P' | 'A' | 'AL' | 'SL' | 'PL';
type AttendanceGrid = Record<string, AttendanceStatus>;
// rate overrides: key is `${casualLabourerId}_${day}`, value is rate (undefined = use default)
type RateOverrides = Record<string, number | undefined>;
// task descriptions: key is `${casualLabourerId}_${day}`, value is free-text task name
type TaskDescriptions = Record<string, string>;
type NotesMap = Record<number, string>;

const STATUS_CYCLE: AttendanceStatus[] = ['A', 'P', 'AL', 'SL', 'PL'];
const STATUS_LABEL: Record<AttendanceStatus, string> = {
  P: 'Present', A: 'Absent', AL: 'Annual Leave', SL: 'Sick Leave', PL: 'Parental Leave',
};
const STATUS_BG: Record<AttendanceStatus, string> = {
  P: '#2d6a4f', A: '#f0f0f0', AL: '#1d4ed8', SL: '#b45309', PL: '#7c3aed',
};
const STATUS_TEXT: Record<AttendanceStatus, string> = {
  P: '#fff', A: '#999', AL: '#fff', SL: '#fff', PL: '#fff',
};

function cycleStatus(current: AttendanceStatus): AttendanceStatus {
  const idx = STATUS_CYCLE.indexOf(current);
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function gridKey(id: number, day: number): string { return `${id}_${day}`; }
function getDaysInMonth(year: number, month: number): number { return new Date(year, month, 0).getDate(); }
function getFirstDayOfWeek(year: number, month: number): number { return new Date(year, month - 1, 1).getDay(); }

// ─── Day picker ───────────────────────────────────────────────────────────────

interface DayPickerProps {
  visible: boolean; year: number; month: number;
  markedDays: Set<number>; onSelect: (day: number) => void; onClose: () => void;
}

function DayPickerModal({ visible, year, month, markedDays, onSelect, onClose }: DayPickerProps) {
  const daysInMonth    = getDaysInMonth(year, month);
  const firstDow       = getFirstDayOfWeek(year, month);
  const now            = new Date();
  const todayDay       = now.getDate();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
  const isFutureMonth  = year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1);

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
        <View style={styles.dowRow}>
          {DAY_LABELS.map(l => <Text key={l} style={styles.dowLabel}>{l}</Text>)}
        </View>
        <View style={styles.calGrid}>
          {cells.map((day, idx) => {
            if (!day) return <View key={`e-${idx}`} style={styles.calCell} />;
            const hasAtt  = markedDays.has(day);
            const isToday = isCurrentMonth && day === todayDay;
            const isFuture = isFutureMonth || (isCurrentMonth && day > todayDay);
            return (
              <View key={day} style={[styles.calCell, isFuture && styles.calDayFuture]}>
                <TouchableOpacity
                  style={[styles.calDayBtn, hasAtt && styles.calDayMarked, !hasAtt && isToday && styles.calDayToday]}
                  onPress={() => { onSelect(day); onClose(); }}
                  activeOpacity={0.7}
                  disabled={isFuture}
                >
                  <Text style={[styles.calDayNum, hasAtt && styles.calDayNumMarked, !hasAtt && isToday && styles.calDayNumToday]}>
                    {day}
                  </Text>
                  {hasAtt && <View style={styles.calDot} />}
                </TouchableOpacity>
              </View>
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

// ─── Day attendance modal (regular workers + casual labourers) ────────────────

interface DayAttendanceProps {
  visible: boolean; day: number; year: number; month: number;
  workers: WorkerDto[]; casuals: CasualLabourerDto[];
  grid: AttendanceGrid; casualGrid: AttendanceGrid;
  rateOverrides: RateOverrides; taskDescriptions: TaskDescriptions;
  isSubmitted: boolean;
  onToggle: (workerId: number, day: number) => void;
  onToggleCasual: (labourerId: number, day: number) => void;
  onRateChange: (labourerId: number, day: number, rate: number | undefined) => void;
  onTaskChange: (labourerId: number, day: number, task: string) => void;
  onClose: () => void;
}

function DayAttendanceModal({
  visible, day, year, month, workers, casuals, grid, casualGrid, rateOverrides, taskDescriptions,
  isSubmitted, onToggle, onToggleCasual, onRateChange, onTaskChange, onClose,
}: DayAttendanceProps) {
  const date    = new Date(year, month - 1, day);
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
          {!isSubmitted && <Text style={styles.attHint}>Tap to cycle status</Text>}
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Regular workers */}
          {workers.length > 0 && (
            <Text style={styles.sectionLabel}>Workers</Text>
          )}
          {workers.map(worker => {
            const status = grid[gridKey(worker.id, day)] ?? 'A';
            const isNonAbsent = status !== 'A';
            return (
              <TouchableOpacity
                key={worker.id}
                style={[styles.attRow, isNonAbsent && styles.attRowPresent]}
                onPress={() => { if (!isSubmitted) onToggle(worker.id, day); }}
                activeOpacity={0.75}
                disabled={isSubmitted}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.attWorkerName, isNonAbsent && styles.attWorkerNamePresent]}>{worker.name}</Text>
                  <Text style={styles.attStatusLabel}>{STATUS_LABEL[status]}</Text>
                </View>
                <View style={[styles.attBadge, { backgroundColor: STATUS_BG[status] }]}>
                  <Text style={[styles.attBadgeText, { color: STATUS_TEXT[status] }]}>{status}</Text>
                </View>
              </TouchableOpacity>
            );
          })}

          {/* Casual labourers */}
          {casuals.length > 0 && (
            <Text style={[styles.sectionLabel, { marginTop: workers.length > 0 ? 12 : 0 }]}>Casual Labourers</Text>
          )}
          {casuals.map(labourer => {
            const status  = casualGrid[gridKey(labourer.id, day)] ?? 'A';
            const isNonAbsent = status !== 'A';
            const overrideKey = gridKey(labourer.id, day);
            const rateVal = rateOverrides[overrideKey] ?? labourer.defaultDailyRate;
            const hasOverride = rateOverrides[overrideKey] !== undefined;
            return (
              <View key={labourer.id} style={[styles.attRow, isNonAbsent && styles.attRowPresent]}>
                <TouchableOpacity
                  style={{ flex: 1 }}
                  onPress={() => { if (!isSubmitted) onToggleCasual(labourer.id, day); }}
                  activeOpacity={0.75}
                  disabled={isSubmitted}
                >
                  <Text style={[styles.attWorkerName, isNonAbsent && styles.attWorkerNamePresent]}>{labourer.name}</Text>
                  <Text style={styles.attStatusLabel}>{STATUS_LABEL[status]}</Text>
                </TouchableOpacity>
                {isNonAbsent && status === 'P' && !isSubmitted && (
                  <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
                    <TextInput
                      style={styles.dayTaskInput}
                      value={taskDescriptions[overrideKey] ?? ''}
                      onChangeText={(t) => onTaskChange(labourer.id, day, t)}
                      placeholder="Task…"
                      placeholderTextColor="#ccc"
                      maxLength={60}
                    />
                    <RateInput
                      value={String(rateVal)}
                      hasOverride={hasOverride}
                      onCommit={(val) => onRateChange(labourer.id, day, val)}
                    />
                  </View>
                )}
                <TouchableOpacity
                  style={{ marginLeft: 8 }}
                  onPress={() => { if (!isSubmitted) onToggleCasual(labourer.id, day); }}
                  activeOpacity={0.75}
                  disabled={isSubmitted}
                >
                  <View style={[styles.attBadge, { backgroundColor: STATUS_BG[status] }]}>
                    <Text style={[styles.attBadgeText, { color: STATUS_TEXT[status] }]}>{status}</Text>
                  </View>
                </TouchableOpacity>
              </View>
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

// ─── Inline rate input (used inside DayAttendanceModal) ───────────────────────

function RateInput({ value, hasOverride, onCommit }: {
  value: string; hasOverride: boolean; onCommit: (val: number | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);

  useEffect(() => { if (!editing) setText(value); }, [value, editing]);

  if (editing) {
    return (
      <TextInput
        style={rateInputStyles.field}
        value={text}
        onChangeText={setText}
        keyboardType="numeric"
        autoFocus
        selectTextOnFocus
        maxLength={8}
        onBlur={() => {
          const parsed = parseFloat(text);
          onCommit(isNaN(parsed) || parsed <= 0 ? undefined : parsed);
          setEditing(false);
        }}
        onSubmitEditing={() => {
          const parsed = parseFloat(text);
          onCommit(isNaN(parsed) || parsed <= 0 ? undefined : parsed);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <TouchableOpacity onPress={() => setEditing(true)} style={rateInputStyles.pill} activeOpacity={0.7}>
      <Text style={[rateInputStyles.text, hasOverride && rateInputStyles.overrideText]}>
        Ksh {value}
      </Text>
      <Feather name="edit-2" size={10} color={hasOverride ? '#7c3aed' : '#aaa'} style={{ marginLeft: 3 }} />
    </TouchableOpacity>
  );
}

const rateInputStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginRight: 8,
    backgroundColor: '#fafafa',
  },
  text:         { fontSize: 12, color: '#666', fontWeight: '500' },
  overrideText: { color: '#7c3aed' },
  field: {
    borderWidth: 1,
    borderColor: '#7c3aed',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 13,
    color: '#1a1a1a',
    width: 80,
    marginRight: 8,
    backgroundColor: '#fafafa',
  },
});

// ─── Rate override bottom sheet (long-press on calendar cell) ─────────────────

interface DayDetailsSheetProps {
  visible: boolean;
  labourerName: string;
  day: number; month: number; year: number;
  currentRate: number;
  defaultRate: number;
  currentTask: string;
  onSave: (rate: number | undefined, task: string) => void;
  onClose: () => void;
}

function DayDetailsSheet({
  visible, labourerName, day, month, year, currentRate, defaultRate, currentTask, onSave, onClose,
}: DayDetailsSheetProps) {
  const [rateText, setRateText] = useState(String(currentRate));
  const [taskText, setTaskText] = useState(currentTask);

  useEffect(() => {
    if (visible) { setRateText(String(currentRate)); setTaskText(currentTask); }
  }, [visible, currentRate, currentTask]);

  function handleSave() {
    const parsed = parseFloat(rateText);
    onSave(isNaN(parsed) || parsed <= 0 ? undefined : parsed, taskText.trim());
    onClose();
  }

  function handleReset() { onSave(undefined, taskText.trim()); onClose(); }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <View style={rateSheetStyles.sheet} elevation={12}>
          <View style={styles.handle} />
          <Text style={rateSheetStyles.title}>{labourerName}</Text>
          <Text style={rateSheetStyles.sub}>{day} {MONTHS[month - 1]} {year}</Text>
          <Text style={rateSheetStyles.label}>Task / work done</Text>
          <TextInput
            style={rateSheetStyles.taskInput}
            value={taskText}
            onChangeText={setTaskText}
            placeholder="e.g. Picking, Weeding, Spraying…"
            placeholderTextColor="#bbb"
            maxLength={100}
            returnKeyType="next"
          />
          <Text style={rateSheetStyles.label}>Daily rate (Ksh)</Text>
          <TextInput
            style={rateSheetStyles.input}
            value={rateText}
            onChangeText={setRateText}
            keyboardType="numeric"
            selectTextOnFocus
            maxLength={8}
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
          {parseFloat(rateText) !== defaultRate && (
            <TouchableOpacity onPress={handleReset} style={rateSheetStyles.resetLink}>
              <Text style={rateSheetStyles.resetText}>Reset to default (Ksh {defaultRate})</Text>
            </TouchableOpacity>
          )}
          <View style={rateSheetStyles.actions}>
            <TouchableOpacity style={rateSheetStyles.cancelBtn} onPress={onClose}>
              <Text style={rateSheetStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={rateSheetStyles.saveBtn} onPress={handleSave}>
              <Text style={rateSheetStyles.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const rateSheetStyles = StyleSheet.create({
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    zIndex: 12,
  },
  title:    { fontSize: 17, fontWeight: '700', color: '#1a1a1a', textAlign: 'center', marginBottom: 2 },
  sub:      { fontSize: 12, color: '#aaa', textAlign: 'center', marginBottom: 16 },
  label:    { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 8 },
  taskInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#1a1a1a', backgroundColor: '#fafafa', marginBottom: 16,
  },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 18, color: '#1a1a1a', backgroundColor: '#fafafa', marginBottom: 8,
  },
  resetLink:   { alignSelf: 'center', marginBottom: 16 },
  resetText:   { fontSize: 13, color: '#7c3aed', textDecorationLine: 'underline' },
  actions:     { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 10,
    borderWidth: 1, borderColor: '#ddd', alignItems: 'center',
  },
  cancelText: { fontSize: 15, color: '#555', fontWeight: '600' },
  saveBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 10,
    backgroundColor: '#2d6a4f', alignItems: 'center',
  },
  saveText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});

// ─── Per-worker calendar card (regular workers) ───────────────────────────────

interface WorkerCardProps {
  worker: WorkerDto; year: number; month: number;
  daysInMonth: number; firstDow: number; grid: AttendanceGrid;
  note: string; isSubmitted: boolean;
  onToggle: (workerId: number, day: number) => void;
  onNoteChange: (workerId: number, note: string) => void;
}

const WorkerCard = memo(function WorkerCard({
  worker, year, month, daysInMonth, firstDow, grid, note, isSubmitted, onToggle, onNoteChange,
}: WorkerCardProps) {
  const [noteExpanded, setNoteExpanded] = useState(false);

  const now            = new Date();
  const todayDay       = now.getDate();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
  const isFutureMonth  = year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1);

  const presentCount = Array.from({ length: daysInMonth }, (_, i) => i + 1)
    .filter(d => grid[gridKey(worker.id, d)] === 'P').length;
  const pct = daysInMonth > 0 ? presentCount / daysInMonth : 0;

  const cells: Array<number | null> = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <View style={styles.workerCard}>
      <View style={styles.workerCardHeader}>
        <Text style={styles.workerName}>{worker.name}</Text>
        <View style={styles.workerRight}>
          <View style={[styles.workerBadge, pct >= 0.8 ? styles.badgeGood : pct >= 0.5 ? styles.badgeWarn : styles.badgeLow]}>
            <Text style={styles.workerBadgeText}>{presentCount}/{daysInMonth}</Text>
          </View>
          <TouchableOpacity onPress={() => setNoteExpanded(e => !e)} hitSlop={8} style={{ marginLeft: 8 }}>
            <Feather name="message-square" size={16} color={note.trim() ? '#2d6a4f' : '#ccc'} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct * 100}%` as any }]} />
      </View>
      <View style={[styles.dowRow, { marginTop: 10 }]}>
        {DAY_LABELS.map(l => <Text key={l} style={styles.dowLabel}>{l}</Text>)}
      </View>
      <View style={styles.calGrid}>
        {cells.map((day, idx) => {
          if (!day) return <View key={`e-${idx}`} style={styles.calCell} />;
          const status   = grid[gridKey(worker.id, day)] ?? 'A';
          const isToday  = isCurrentMonth && day === todayDay;
          const isFuture = isFutureMonth || (isCurrentMonth && day > todayDay);
          return (
            <View key={day} style={[styles.calCell, isFuture && styles.calDayFuture]}>
              <TouchableOpacity
                style={[styles.calDayBtn, { backgroundColor: STATUS_BG[status] }, isToday && status === 'A' && styles.calDayToday]}
                onPress={() => { if (!isSubmitted) onToggle(worker.id, day); }}
                activeOpacity={0.7}
                disabled={isSubmitted || isFuture}
              >
                <Text style={[styles.calDayTiny, { color: STATUS_TEXT[status] }]}>{day}</Text>
                {!isFuture && <Text style={[styles.calStatusLetter, { color: STATUS_TEXT[status] }]}>{status}</Text>}
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
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

// ─── Per-casual-labourer calendar card ───────────────────────────────────────

interface CasualCardProps {
  labourer: CasualLabourerDto; year: number; month: number;
  daysInMonth: number; firstDow: number;
  casualGrid: AttendanceGrid; rateOverrides: RateOverrides; taskDescriptions: TaskDescriptions;
  isSubmitted: boolean;
  onToggle: (labourerId: number, day: number) => void;
  onRateOverride: (labourerId: number, day: number, rate: number | undefined) => void;
  onTaskChange: (labourerId: number, day: number, task: string) => void;
}

const CasualCard = memo(function CasualCard({
  labourer, year, month, daysInMonth, firstDow, casualGrid, rateOverrides, taskDescriptions,
  isSubmitted, onToggle, onRateOverride, onTaskChange,
}: CasualCardProps) {
  const [detailDay, setDetailDay] = useState<number | null>(null);

  const now            = new Date();
  const todayDay       = now.getDate();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
  const isFutureMonth  = year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1);

  const presentCount = Array.from({ length: daysInMonth }, (_, i) => i + 1)
    .filter(d => casualGrid[gridKey(labourer.id, d)] === 'P').length;
  const pct = daysInMonth > 0 ? presentCount / daysInMonth : 0;

  const totalAmount = Array.from({ length: daysInMonth }, (_, i) => i + 1).reduce((sum, d) => {
    if (casualGrid[gridKey(labourer.id, d)] !== 'P') return sum;
    const override = rateOverrides[gridKey(labourer.id, d)];
    return sum + (override ?? labourer.defaultDailyRate);
  }, 0);

  const cells: Array<number | null> = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <View style={styles.casualCard}>
      <View style={styles.workerCardHeader}>
        <Text style={styles.casualName}>{labourer.name}</Text>
        <View style={styles.workerRight}>
          {presentCount > 0 && (
            <Text style={styles.amountBadge}>Ksh {totalAmount.toLocaleString()}</Text>
          )}
          <View style={[styles.workerBadge, { marginLeft: 8 }, pct >= 0.8 ? styles.badgeGood : pct >= 0.5 ? styles.badgeWarn : styles.badgeLow]}>
            <Text style={styles.workerBadgeText}>{presentCount}/{daysInMonth}</Text>
          </View>
        </View>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct * 100}%` as any, backgroundColor: '#7c3aed' }]} />
      </View>
      <View style={[styles.dowRow, { marginTop: 10 }]}>
        {DAY_LABELS.map(l => <Text key={l} style={styles.dowLabel}>{l}</Text>)}
      </View>
      <View style={styles.calGrid}>
        {cells.map((day, idx) => {
          if (!day) return <View key={`e-${idx}`} style={styles.calCell} />;
          const status   = casualGrid[gridKey(labourer.id, day)] ?? 'A';
          const isToday  = isCurrentMonth && day === todayDay;
          const isFuture = isFutureMonth || (isCurrentMonth && day > todayDay);
          const hasOverride = rateOverrides[gridKey(labourer.id, day)] !== undefined;
          return (
            <View key={day} style={[styles.calCell, isFuture && styles.calDayFuture]}>
              <TouchableOpacity
                style={[styles.calDayBtn, { backgroundColor: STATUS_BG[status] }, isToday && status === 'A' && styles.calDayToday]}
                onPress={() => { if (!isSubmitted) onToggle(labourer.id, day); }}
                onLongPress={() => {
                  if (!isSubmitted && status === 'P' && !isFuture) setDetailDay(day);
                }}
                activeOpacity={0.7}
                disabled={isSubmitted || isFuture}
              >
                <Text style={[styles.calDayTiny, { color: STATUS_TEXT[status] }]}>{day}</Text>
                {!isFuture && <Text style={[styles.calStatusLetter, { color: STATUS_TEXT[status] }]}>{status}</Text>}
                {status === 'P' && hasOverride && (
                  <View style={styles.overrideDot} />
                )}
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
      <Text style={styles.rateHint}>
        Default: Ksh {labourer.defaultDailyRate}/day · Long-press P day to set task &amp; rate
      </Text>

      <DayDetailsSheet
        visible={detailDay !== null}
        labourerName={labourer.name}
        day={detailDay ?? 1}
        month={month}
        year={year}
        currentRate={detailDay != null ? (rateOverrides[gridKey(labourer.id, detailDay)] ?? labourer.defaultDailyRate) : labourer.defaultDailyRate}
        defaultRate={labourer.defaultDailyRate}
        currentTask={detailDay != null ? (taskDescriptions[gridKey(labourer.id, detailDay)] ?? '') : ''}
        onSave={(rate, task) => {
          if (detailDay != null) {
            onRateOverride(labourer.id, detailDay, rate);
            onTaskChange(labourer.id, detailDay, task);
          }
        }}
        onClose={() => setDetailDay(null)}
      />
    </View>
  );
});

// ─── Screen ───────────────────────────────────────────────────────────────────

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function AttendanceScreen() {
  const { user }   = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<AttendanceStackParamList>>();
  const isAdmin    = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const now        = new Date();

  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [workers,        setWorkers]        = useState<WorkerDto[]>([]);
  const [casuals,        setCasuals]        = useState<CasualLabourerDto[]>([]);
  const [workersLoaded,  setWorkersLoaded]  = useState(false);
  const [grid,           setGrid]           = useState<AttendanceGrid>({});
  const [casualGrid,      setCasualGrid]      = useState<AttendanceGrid>({});
  const [rateOverrides,   setRateOverrides]   = useState<RateOverrides>({});
  const [taskDescriptions, setTaskDescriptions] = useState<TaskDescriptions>({});
  const [notes,          setNotes]          = useState<NotesMap>({});
  const [localReportId,  setLocalReportId]  = useState<number | null>(null);
  const [isLoaded,       setIsLoaded]       = useState(false);
  const [isSubmitted,    setIsSubmitted]    = useState(false);
  const [loadError,      setLoadError]      = useState<string | null>(null);
  const [saveState,      setSaveState]      = useState<SaveState>('idle');

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
      Promise.all([
        getWorkers(user.farmId!),
        getCasualLabourers(user.farmId!),
      ])
        .then(([ws, cs]) => { setWorkers(ws); setCasuals(cs); setWorkersLoaded(true); })
        .catch(e => { setLoadError(e.message ?? 'Failed to load workers'); setWorkersLoaded(true); });
    }, [user?.farmId]),
  );

  useEffect(() => {
    if (!user || !workersLoaded) return;
    if (workers.length === 0 && casuals.length === 0) { setIsLoaded(true); return; }
    setIsLoaded(false);
    skipSaveRef.current = true;

    async function load() {
      const report = await getOrCreateLocalReport(user!.farmId!, year, month);
      setLocalReportId(report.id);

      const pendingRow = await getDb().getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) AS count FROM sync_queue
         WHERE report_id = ? AND section IN ('attendance','casual-attendance') AND synced = 0`,
        [report.id],
      );
      let serverAttendanceCount = -1;
      if ((pendingRow?.count ?? 0) === 0) {
        try {
          const res = await apiClient.get('/reports', {
            params: { farmId: user!.farmId!, year, month },
          });
          const serverReport = res.data?.data;
          if (serverReport?.id) {
            serverAttendanceCount = serverReport.attendance?.length ?? 0;
            if (!report.server_report_id) await updateServerReportId(report.id, serverReport.id);

            if (serverAttendanceCount > 0) {
              await saveAttendance(report.id, serverReport.attendance.map((a: {
                workerId: number; workerName: string; dayOfMonth: number; status: string; notes: string | null;
              }) => ({
                worker_id: a.workerId, worker_name: a.workerName,
                day_of_month: a.dayOfMonth, present: a.status === 'P' ? 1 : 0,
                status: a.status, notes: a.notes ?? null,
              })));
            }

            if ((serverReport.casualAttendance?.length ?? 0) > 0) {
              await saveCasualAttendance(report.id, serverReport.casualAttendance.map((ca: {
                casualLabourerId: number; casualLabourerName: string;
                dayOfMonth: number; present: boolean; status: string; rateOverride: number | null; taskDescription: string | null;
              }) => ({
                casual_labourer_id: ca.casualLabourerId,
                labourer_name: ca.casualLabourerName,
                day_of_month: ca.dayOfMonth,
                present: ca.present ? 1 : 0,
                status: ca.status,
                rate_override: ca.rateOverride ?? null,
                task_description: ca.taskDescription ?? null,
              })));
            }

            if (serverReport.status === 'SUBMITTED') await updateReportSubmitted(report.id, 'server');
          }
        } catch {
          // Offline — use local DB
        }
      }

      const refreshed = (await getLocalReport(report.id)) ?? report;
      setIsSubmitted(refreshed.status === 'submitted');

      const rows = await getDb().getAllAsync<{
        worker_id: number; day_of_month: number; present: number; status: string | null;
      }>('SELECT worker_id, day_of_month, present, status FROM local_attendance WHERE report_id = ?', [report.id]);

      if (rows.length > 0 && serverAttendanceCount === 0) {
        await markSectionDirty(report.id, 'attendance');
      }

      const newGrid: AttendanceGrid = {};
      for (const r of rows) {
        newGrid[gridKey(r.worker_id, r.day_of_month)] = (r.status as AttendanceStatus | null) ?? (r.present === 1 ? 'P' : 'A');
      }
      setGrid(newGrid);

      const noteRows = await getDb().getAllAsync<{ worker_id: number; note: string }>(
        'SELECT worker_id, note FROM local_attendance_notes WHERE report_id = ?', [report.id],
      );
      const newNotes: NotesMap = {};
      for (const n of noteRows) newNotes[n.worker_id] = n.note;
      setNotes(newNotes);

      // Load casual attendance
      const casualRows = await getCasualAttendance(report.id);
      const newCasualGrid: AttendanceGrid = {};
      const newRateOverrides: RateOverrides = {};
      const newTaskDescriptions: TaskDescriptions = {};
      for (const ca of casualRows) {
        newCasualGrid[gridKey(ca.casual_labourer_id, ca.day_of_month)] = ca.status as AttendanceStatus;
        if (ca.rate_override != null) {
          newRateOverrides[gridKey(ca.casual_labourer_id, ca.day_of_month)] = ca.rate_override;
        }
        if (ca.task_description) {
          newTaskDescriptions[gridKey(ca.casual_labourer_id, ca.day_of_month)] = ca.task_description;
        }
      }
      setCasualGrid(newCasualGrid);
      setRateOverrides(newRateOverrides);
      setTaskDescriptions(newTaskDescriptions);

      setIsLoaded(true);
      setTimeout(() => { skipSaveRef.current = false; }, 0);
    }

    load().catch(e => setLoadError(e.message ?? 'Failed to load attendance'));
  }, [user?.farmId, year, month, workersLoaded, workers, casuals]);

  const performSave = useCallback(async (
    currentGrid: AttendanceGrid,
    currentCasualGrid: AttendanceGrid,
    currentRateOverrides: RateOverrides,
    currentTaskDescriptions: TaskDescriptions,
    currentNotes: NotesMap,
    reportId: number,
    currentWorkers: WorkerDto[],
    currentCasuals: CasualLabourerDto[],
    days: number,
  ) => {
    setSaveState('saving');
    try {
      // Regular workers
      const records: AttendanceInput[] = [];
      for (const worker of currentWorkers) {
        for (let day = 1; day <= days; day++) {
          const status = currentGrid[gridKey(worker.id, day)] ?? 'A';
          records.push({ worker_id: worker.id, worker_name: worker.name, day_of_month: day, status, present: status === 'P' ? 1 : 0, notes: null });
        }
      }
      await saveAttendance(reportId, records);
      await markSectionDirty(reportId, 'attendance');

      // Notes
      const noteEntries = Object.entries(currentNotes).map(([id, note]) => ({ worker_id: Number(id), note }));
      await saveAttendanceNotes(reportId, noteEntries);
      await markSectionDirty(reportId, 'attendance-notes');

      // Casual labourers
      const casualRecords: CasualAttendanceInput[] = [];
      for (const labourer of currentCasuals) {
        for (let day = 1; day <= days; day++) {
          const status = currentCasualGrid[gridKey(labourer.id, day)] ?? 'A';
          casualRecords.push({
            casual_labourer_id: labourer.id,
            labourer_name: labourer.name,
            day_of_month: day,
            present: status === 'P' ? 1 : 0,
            status,
            rate_override: currentRateOverrides[gridKey(labourer.id, day)] ?? null,
            task_description: currentTaskDescriptions[gridKey(labourer.id, day)] ?? null,
          });
        }
      }
      if (casualRecords.length > 0) {
        await saveCasualAttendance(reportId, casualRecords);
        await markSectionDirty(reportId, 'casual-attendance');
      }

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
      performSave(grid, casualGrid, rateOverrides, taskDescriptions, notes, localReportId, workers, casuals, days);
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [grid, casualGrid, rateOverrides, taskDescriptions, notes, isLoaded, localReportId, workers, casuals]);

  const handleToggle = useCallback((workerId: number, day: number) => {
    setGrid(prev => {
      const current = prev[gridKey(workerId, day)] ?? 'A';
      return { ...prev, [gridKey(workerId, day)]: cycleStatus(current) };
    });
  }, []);

  const handleToggleCasual = useCallback((labourerId: number, day: number) => {
    setCasualGrid(prev => {
      const current = prev[gridKey(labourerId, day)] ?? 'A';
      return { ...prev, [gridKey(labourerId, day)]: cycleStatus(current) };
    });
  }, []);

  const handleRateChange = useCallback((labourerId: number, day: number, rate: number | undefined) => {
    setRateOverrides(prev => {
      const next = { ...prev };
      if (rate === undefined) { delete next[gridKey(labourerId, day)]; }
      else { next[gridKey(labourerId, day)] = rate; }
      return next;
    });
  }, []);

  const handleTaskChange = useCallback((labourerId: number, day: number, task: string) => {
    setTaskDescriptions(prev => {
      const next = { ...prev };
      if (!task) { delete next[gridKey(labourerId, day)]; }
      else { next[gridKey(labourerId, day)] = task; }
      return next;
    });
  }, []);

  const handleNoteChange = useCallback((workerId: number, note: string) => {
    setNotes(prev => ({ ...prev, [workerId]: note }));
  }, []);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDow    = getFirstDayOfWeek(year, month);

  const markedDays = new Set<number>();
  for (let d = 1; d <= daysInMonth; d++) {
    const regularMark = workers.some(w => ['P','AL','SL','PL'].includes(grid[gridKey(w.id, d)] ?? 'A'));
    const casualMark  = casuals.some(c => ['P','AL','SL','PL'].includes(casualGrid[gridKey(c.id, d)] ?? 'A'));
    if (regularMark || casualMark) markedDays.add(d);
  }

  function openDailyRegister() {
    const today = new Date().getDate();
    const isThisMonth = new Date().getFullYear() === year && new Date().getMonth() + 1 === month;
    setSelectedDay(isThisMonth ? today : 1);
    setShowDayPicker(true);
  }

  const hasAnyWorkers = workers.length > 0 || casuals.length > 0;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <MonthYearSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />

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
        {isLoaded && !isSubmitted && hasAnyWorkers && (
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

          {!hasAnyWorkers && (
            <Text style={styles.emptyText}>No workers found for this farm.</Text>
          )}

          {/* Regular workers */}
          {workers.map(worker => (
            <WorkerCard
              key={worker.id}
              worker={worker}
              year={year} month={month}
              daysInMonth={daysInMonth} firstDow={firstDow}
              grid={grid}
              note={notes[worker.id] ?? ''}
              isSubmitted={isSubmitted}
              onToggle={handleToggle}
              onNoteChange={handleNoteChange}
            />
          ))}

          {/* Casual labourers section */}
          {casuals.length > 0 && (
            <>
              <View style={styles.sectionDivider}>
                <View style={styles.sectionDividerLine} />
                <Text style={styles.sectionDividerText}>Casual Labourers</Text>
                <View style={styles.sectionDividerLine} />
              </View>
              {casuals.map(labourer => (
                <CasualCard
                  key={labourer.id}
                  labourer={labourer}
                  year={year} month={month}
                  daysInMonth={daysInMonth} firstDow={firstDow}
                  casualGrid={casualGrid}
                  rateOverrides={rateOverrides}
                  taskDescriptions={taskDescriptions}
                  isSubmitted={isSubmitted}
                  onToggle={handleToggleCasual}
                  onRateOverride={handleRateChange}
                  onTaskChange={handleTaskChange}
                />
              ))}
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      <DayPickerModal
        visible={showDayPicker}
        year={year} month={month}
        markedDays={markedDays}
        onSelect={day => { setSelectedDay(day); setShowDayPicker(false); setShowDayAttendance(true); }}
        onClose={() => setShowDayPicker(false)}
      />

      <DayAttendanceModal
        visible={showDayAttendance}
        day={selectedDay} year={year} month={month}
        workers={workers} casuals={casuals}
        grid={grid} casualGrid={casualGrid}
        rateOverrides={rateOverrides} taskDescriptions={taskDescriptions}
        isSubmitted={isSubmitted}
        onToggle={handleToggle}
        onToggleCasual={handleToggleCasual}
        onRateChange={handleRateChange}
        onTaskChange={handleTaskChange}
        onClose={() => setShowDayAttendance(false)}
      />
    </KeyboardAvoidingView>
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

  toolbar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee',
  },
  toolbarBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  toolbarBtnText: { fontSize: 13, fontWeight: '600', color: '#2d6a4f' },
  saveText:       { fontSize: 12, color: '#888' },
  dailyRegisterLink: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 12,
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#e8f5ef', borderRadius: 16,
  },
  dailyRegisterText: { fontSize: 13, fontWeight: '700', color: '#2d6a4f' },

  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: 200 },
  errorText: { marginTop: 12, color: '#e53e3e', textAlign: 'center', fontSize: 14 },
  emptyText: { color: '#999', fontSize: 14, textAlign: 'center', marginTop: 40 },

  // Section divider between regular workers and casual labourers
  sectionDivider:     { flexDirection: 'row', alignItems: 'center', marginVertical: 16, paddingHorizontal: 4 },
  sectionDividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#ddd' },
  sectionDividerText: { fontSize: 12, fontWeight: '700', color: '#888', marginHorizontal: 12, textTransform: 'uppercase', letterSpacing: 0.8 },
  sectionLabel:       { fontSize: 12, fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 4, paddingVertical: 6 },

  // Regular worker cards
  workerCard: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 12,
    padding: 12, borderWidth: 1, borderColor: '#eee',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  // Casual labourer cards (purple accent)
  casualCard: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 12,
    padding: 12, borderWidth: 1, borderColor: '#ede9fe',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  workerCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  workerName:       { fontSize: 15, fontWeight: '700', color: '#1a1a1a', flex: 1 },
  casualName:       { fontSize: 15, fontWeight: '700', color: '#5b21b6', flex: 1 },
  workerRight:      { flexDirection: 'row', alignItems: 'center' },
  workerBadge:      { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  badgeGood:        { backgroundColor: '#D8F3DC' },
  badgeWarn:        { backgroundColor: '#FFF3CD' },
  badgeLow:         { backgroundColor: '#FFE5E5' },
  workerBadgeText:  { fontSize: 12, fontWeight: '700', color: '#1a1a1a' },
  amountBadge:      { fontSize: 12, fontWeight: '700', color: '#5b21b6', marginRight: 4 },
  progressTrack:    { height: 3, backgroundColor: '#f0f0f0', borderRadius: 2, overflow: 'hidden', marginBottom: 4 },
  progressFill:     { height: 3, backgroundColor: '#52B788', borderRadius: 2 },
  rateHint:         { fontSize: 11, color: '#bbb', marginTop: 8, textAlign: 'center' },

  // Shared calendar grid
  dowRow:           { flexDirection: 'row' },
  dowLabel:         { width: CELL_SIZE, textAlign: 'center', fontSize: 10, fontWeight: '600', color: '#aaa', paddingVertical: 2 },
  calGrid:          { flexDirection: 'row', flexWrap: 'wrap' },
  calCell:          { width: CELL_SIZE, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  calDayBtn:        { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  calDayFuture:     { opacity: 0.25 },
  calDayToday:      { borderWidth: 2, borderColor: '#2d6a4f' },
  calDayMarked:     { backgroundColor: '#2d6a4f' },
  calDayNum:        { fontSize: 12, fontWeight: '600', color: '#333' },
  calDayNumMarked:  { color: '#fff' },
  calDayNumToday:   { color: '#2d6a4f' },
  calDot:           { width: 3, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.7)', marginTop: 1 },
  calDayTiny:       { fontSize: 9, fontWeight: '600', lineHeight: 11 },
  calStatusLetter:  { fontSize: 11, fontWeight: '800', lineHeight: 13 },
  overrideDot:      { width: 4, height: 4, borderRadius: 2, backgroundColor: '#fff', marginTop: 1 },

  // Notes
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

  // Day picker sheet
  pickerSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingBottom: 32,
  },
  closeBtn:     { marginTop: 14, paddingVertical: 13, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  closeBtnText: { fontSize: 15, fontWeight: '600', color: '#666' },

  // Day attendance sheet
  attSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingBottom: 32, maxHeight: '80%',
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
  attStatusLabel:       { fontSize: 11, color: '#aaa', marginTop: 1 },
  attBadge:             { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  attBadgeText:         { fontSize: 13, fontWeight: '800' },
  doneBtn:              { marginTop: 14, backgroundColor: '#2d6a4f', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  doneBtnText:          { fontSize: 15, fontWeight: '700', color: '#fff' },
  dayTaskInput: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, color: '#555',
    backgroundColor: '#fafafa', marginBottom: 4, minWidth: 90, textAlign: 'right',
  },
});
