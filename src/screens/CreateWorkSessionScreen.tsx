import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createWorkSession, updateWorkSession } from '../services/casualLabourerService';
import { useAuth } from '../store/AuthContext';
import { AttendanceStackParamList, CasualWorkSessionDto } from '../types';

type NavProp = NativeStackNavigationProp<AttendanceStackParamList, 'CreateWorkSession'>;
type RoutePropType = RouteProp<AttendanceStackParamList, 'CreateWorkSession'>;

interface SelectedCasual { id: number; name: string; rateOverride?: number; }

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function formatDate(d: Date): string { return d.toISOString().split('T')[0]; }

function displayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getDaysInMonth(year: number, month: number) { return new Date(year, month, 0).getDate(); }
function getFirstDow(year: number, month: number) { return new Date(year, month - 1, 1).getDay(); }

// ─── Inline calendar date picker modal ───────────────────────────────────────

function DatePickerModal({ visible, value, onSelect, onClose }: {
  visible: boolean; value: string;
  onSelect: (date: string) => void; onClose: () => void;
}) {
  const initial = new Date(value + 'T00:00:00');
  const [year, setYear]   = useState(initial.getFullYear());
  const [month, setMonth] = useState(initial.getMonth() + 1);
  const selected          = value;
  const today             = formatDate(new Date());

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  const daysInMonth = getDaysInMonth(year, month);
  const firstDow    = getFirstDow(year, month);
  const cells: Array<number | null> = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={dpStyles.backdrop} onPress={onClose} />
      <View style={dpStyles.sheet}>
        <View style={dpStyles.handle} />
        <Text style={dpStyles.title}>Select Date</Text>

        {/* Month / Year navigation */}
        <View style={dpStyles.navRow}>
          <TouchableOpacity onPress={prevMonth} hitSlop={12} style={dpStyles.navBtn}>
            <Feather name="chevron-left" size={22} color="#7c3aed" />
          </TouchableOpacity>
          <Text style={dpStyles.navLabel}>{MONTHS[month - 1]} {year}</Text>
          <TouchableOpacity onPress={nextMonth} hitSlop={12} style={dpStyles.navBtn}>
            <Feather name="chevron-right" size={22} color="#7c3aed" />
          </TouchableOpacity>
        </View>

        {/* Day-of-week header */}
        <View style={dpStyles.dowRow}>
          {DAY_LABELS.map(l => <Text key={l} style={dpStyles.dowLabel}>{l}</Text>)}
        </View>

        {/* Calendar grid */}
        <View style={dpStyles.grid}>
          {cells.map((day, idx) => {
            if (!day) return <View key={`e-${idx}`} style={dpStyles.cell} />;
            const iso      = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const isSelected = iso === selected;
            const isToday    = iso === today;
            const isFuture   = iso > today;
            return (
              <TouchableOpacity
                key={day}
                style={[dpStyles.cell, isSelected && dpStyles.cellSelected, !isSelected && isToday && dpStyles.cellToday, isFuture && dpStyles.cellFuture]}
                onPress={() => { if (!isFuture) { onSelect(iso); onClose(); } }}
                disabled={isFuture}
                activeOpacity={0.7}
              >
                <Text style={[dpStyles.cellText, isSelected && dpStyles.cellTextSelected, !isSelected && isToday && dpStyles.cellTextToday, isFuture && dpStyles.cellTextFuture]}>
                  {day}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={dpStyles.cancelBtn} onPress={onClose}>
          <Text style={dpStyles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const CELL = `${100 / 7}%` as const;
const dpStyles = StyleSheet.create({
  backdrop:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  handle:   { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e0e0e0', alignSelf: 'center', marginTop: 12, marginBottom: 10 },
  title:    { fontSize: 16, fontWeight: '700', color: '#1a1a1a', textAlign: 'center', marginBottom: 14 },
  navRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  navBtn:   { padding: 4 },
  navLabel: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  dowRow:   { flexDirection: 'row', marginBottom: 4 },
  dowLabel: { width: CELL, textAlign: 'center', fontSize: 11, fontWeight: '600', color: '#aaa', paddingVertical: 4 },
  grid:     { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: CELL, aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center',
    padding: 3,
  },
  cellSelected:   { backgroundColor: '#7c3aed', borderRadius: 999 },
  cellToday:      { borderWidth: 2, borderColor: '#7c3aed', borderRadius: 999 },
  cellFuture:     { opacity: 0.3 },
  cellText:       { fontSize: 14, fontWeight: '500', color: '#1a1a1a' },
  cellTextSelected:{ color: '#fff', fontWeight: '700' },
  cellTextToday:  { color: '#7c3aed', fontWeight: '700' },
  cellTextFuture: { color: '#aaa' },
  cancelBtn:      { marginTop: 14, paddingVertical: 13, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  cancelText:     { fontSize: 15, fontWeight: '600', color: '#666' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CreateWorkSessionScreen() {
  const { user }   = useAuth();
  const navigation = useNavigation<NavProp>();
  const route      = useRoute<RoutePropType>();

  const existingSession: CasualWorkSessionDto | undefined = route.params?.session;
  const isEditing = Boolean(existingSession);

  const [sessionDate, setSessionDate] = useState(existingSession?.sessionDate ?? formatDate(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activity, setActivity]       = useState(existingSession?.activity ?? '');
  const [defaultRate, setDefaultRate] = useState(existingSession ? String(existingSession.defaultDailyRate) : '');
  const [casuals, setCasuals]         = useState<SelectedCasual[]>(
    existingSession?.entries.map(e => ({ id: e.casualLabourerId, name: e.labourerName, rateOverride: e.rateOverride ?? undefined })) ?? []
  );
  const [saving, setSaving] = useState(false);

  // Update navigation title when in edit mode
  useEffect(() => {
    if (isEditing) navigation.setOptions({ title: 'Edit Work Session' });
  }, [isEditing]);

  // When returning from SelectCasualsScreen, merge in the selected casuals
  useEffect(() => {
    const selected = route.params?.selectedCasuals;
    if (!selected) return;
    setCasuals(prev => {
      const prevMap = new Map(prev.map(c => [c.id, c]));
      return selected.map(s => ({
        id: s.id, name: s.name,
        rateOverride: prevMap.get(s.id)?.rateOverride ?? s.rateOverride,
      }));
    });
  }, [route.params?.selectedCasuals]);

  function updateRate(labourerId: number, val: string) {
    const parsed = parseFloat(val);
    setCasuals(prev => prev.map(c =>
      c.id === labourerId
        ? { ...c, rateOverride: isNaN(parsed) || parsed <= 0 ? undefined : parsed }
        : c,
    ));
  }

  async function handleSave() {
    const trimActivity = activity.trim();
    const rate = parseFloat(defaultRate);
    if (!trimActivity)          { Alert.alert('Missing activity', 'Please enter a work activity.'); return; }
    if (isNaN(rate) || rate <= 0) { Alert.alert('Invalid rate', 'Please enter a valid daily rate.'); return; }
    if (casuals.length === 0)   { Alert.alert('No casuals', 'Please choose at least one casual.'); return; }

    const payload = {
      sessionDate,
      activity: trimActivity,
      defaultDailyRate: rate,
      entries: casuals.map(c => ({ casualLabourerId: c.id, rateOverride: c.rateOverride })),
    };

    setSaving(true);
    try {
      if (isEditing && existingSession) {
        await updateWorkSession(user!.farmId!, existingSession.id, payload);
      } else {
        await createWorkSession(user!.farmId!, payload);
      }
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to save session');
    } finally {
      setSaving(false);
    }
  }

  const defaultRateNum = parseFloat(defaultRate) || 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#f5f7f9' }}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
      >
        {/* Date */}
        <Text style={styles.label}>Date</Text>
        <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)} activeOpacity={0.8}>
          <Feather name="calendar" size={16} color="#7c3aed" />
          <Text style={styles.dateBtnText}>{displayDate(sessionDate)}</Text>
          <Feather name="chevron-down" size={16} color="#aaa" />
        </TouchableOpacity>

        {/* Activity */}
        <Text style={[styles.label, { marginTop: 20 }]}>Activity</Text>
        <TextInput
          style={styles.input}
          value={activity}
          onChangeText={setActivity}
          placeholder="e.g. Weeding, Spraying, Digging…"
          placeholderTextColor="#bbb"
          maxLength={120}
          returnKeyType="next"
        />

        {/* Default Daily Rate */}
        <Text style={[styles.label, { marginTop: 20 }]}>Default Daily Rate (Ksh)</Text>
        <TextInput
          style={styles.input}
          value={defaultRate}
          onChangeText={setDefaultRate}
          placeholder="e.g. 150"
          placeholderTextColor="#bbb"
          keyboardType="numeric"
          maxLength={8}
          returnKeyType="done"
        />

        {/* Casuals */}
        <View style={styles.casualsHeader}>
          <Text style={styles.label}>Casuals ({casuals.length})</Text>
          <TouchableOpacity
            style={styles.chooseBtn}
            onPress={() => navigation.navigate('SelectCasuals', {
              currentSelection: casuals.map(c => ({ id: c.id, rateOverride: c.rateOverride })),
              defaultRate: defaultRateNum,
            })}
            activeOpacity={0.8}
          >
            <Feather name="plus" size={14} color="#7c3aed" />
            <Text style={styles.chooseBtnText}>Choose Casuals +</Text>
          </TouchableOpacity>
        </View>

        {casuals.length === 0 && (
          <Text style={styles.casualsEmptyHint}>No casuals selected yet.</Text>
        )}

        {casuals.map(c => {
          const isOverride = c.rateOverride !== undefined;
          return (
            <View key={c.id} style={styles.casualRow}>
              <Text style={styles.casualName} numberOfLines={1}>{c.name}</Text>
              <View style={styles.casualRateWrap}>
                <Text style={styles.casualRatePrefix}>Ksh</Text>
                <TextInput
                  style={[styles.casualRateInput, isOverride && styles.casualRateInputOverride]}
                  value={String(isOverride ? c.rateOverride! : (defaultRateNum || ''))}
                  onChangeText={v => updateRate(c.id, v)}
                  keyboardType="numeric"
                  maxLength={8}
                  selectTextOnFocus
                  placeholder={String(defaultRateNum || '—')}
                  placeholderTextColor="#ccc"
                />
              </View>
              {isOverride && (
                <TouchableOpacity onPress={() => updateRate(c.id, String(defaultRateNum))} hitSlop={8}>
                  <Feather name="rotate-ccw" size={14} color="#aaa" />
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {/* Extra space so footer doesn't overlap last input */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Save button — floats over scroll content */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>{isEditing ? 'Update Work Session' : 'Save Work Session'}</Text>}
        </TouchableOpacity>
      </View>

      <DatePickerModal
        visible={showDatePicker}
        value={sessionDate}
        onSelect={setSessionDate}
        onClose={() => setShowDatePicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20 },

  label: { fontSize: 13, fontWeight: '700', color: '#555', marginBottom: 8 },

  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 14,
    borderWidth: 1, borderColor: '#ddd',
  },
  dateBtnText: { flex: 1, fontSize: 15, color: '#1a1a1a', fontWeight: '500' },

  input: {
    backgroundColor: '#fff', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 14,
    fontSize: 15, color: '#1a1a1a',
    borderWidth: 1, borderColor: '#ddd',
  },

  casualsHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 22, marginBottom: 10,
  },
  chooseBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#f3e8ff', borderRadius: 20,
  },
  chooseBtnText:    { fontSize: 13, fontWeight: '700', color: '#7c3aed' },
  casualsEmptyHint: { fontSize: 13, color: '#bbb', textAlign: 'center', paddingVertical: 16 },

  casualRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1, borderColor: '#ede9fe',
  },
  casualName:       { flex: 1, fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  casualRateWrap:   { flexDirection: 'row', alignItems: 'center', marginRight: 8 },
  casualRatePrefix: { fontSize: 13, color: '#888', marginRight: 4 },
  casualRateInput: {
    width: 72, fontSize: 14, fontWeight: '600', color: '#555',
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 6, textAlign: 'right',
    backgroundColor: '#fafafa',
  },
  casualRateInputOverride: { borderColor: '#7c3aed', color: '#7c3aed' },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#eee',
  },
  saveBtn: {
    backgroundColor: '#7c3aed', borderRadius: 12,
    paddingVertical: 15, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText:     { fontSize: 16, fontWeight: '700', color: '#fff' },
});
