import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DatePickerModal from '../components/shared/DatePickerModal';
import { createWorkSession, updateWorkSession } from '../services/casualLabourerService';
import workSessionDraft from '../store/workSessionDraft';
import { useAuth } from '../store/AuthContext';
import { AttendanceStackParamList, CasualWorkSessionDto } from '../types';

type NavProp = NativeStackNavigationProp<AttendanceStackParamList, 'CreateWorkSession'>;
type RoutePropType = RouteProp<AttendanceStackParamList, 'CreateWorkSession'>;

interface SelectedCasual { id: number; name: string; rateOverride?: number; }

function formatDate(d: Date): string { return d.toISOString().split('T')[0]; }

function displayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

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

  useEffect(() => {
    if (isEditing) navigation.setOptions({ title: 'Edit Work Session' });
  }, [isEditing]);

  // Read pending casual selection written by SelectCasualsScreen on every focus.
  useFocusEffect(useCallback(() => {
    if (workSessionDraft.pendingCasuals !== null) {
      const incoming = workSessionDraft.pendingCasuals;
      workSessionDraft.pendingCasuals = null;
      setCasuals(prev => {
        const prevMap = new Map(prev.map(c => [c.id, c]));
        return incoming.map(s => ({
          id: s.id, name: s.name,
          rateOverride: prevMap.get(s.id)?.rateOverride ?? s.rateOverride,
        }));
      });
    }
  }, []));

  function handleClearAll() {
    Alert.alert('Clear Form', 'Clear all entered data?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear', style: 'destructive',
        onPress: () => {
          setSessionDate(formatDate(new Date()));
          setActivity('');
          setDefaultRate('');
          setCasuals([]);
        },
      },
    ]);
  }

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

        {/* Casuals header */}
        <View style={styles.casualsHeader}>
          <Text style={styles.label}>Casuals ({casuals.length})</Text>
          <View style={styles.casualsActions}>
            {!isEditing && (casuals.length > 0 || activity || defaultRate) && (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={handleClearAll}
                activeOpacity={0.8}
              >
                <Feather name="x-circle" size={13} color="#e53e3e" />
                <Text style={styles.clearBtnText}>Clear All</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.chooseBtn}
              onPress={() => navigation.navigate('SelectCasuals', {
                currentSelection: casuals.map(c => ({ id: c.id, rateOverride: c.rateOverride })),
                defaultRate: defaultRateNum,
              })}
              activeOpacity={0.8}
            >
              <Feather name="plus" size={14} color="#7c3aed" />
              <Text style={styles.chooseBtnText}>Choose Casuals</Text>
            </TouchableOpacity>
          </View>
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

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Save button */}
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
        accentColor="#7c3aed"
        allowFuture={false}
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
  casualsActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 7,
    backgroundColor: '#fff1f1', borderRadius: 20,
    borderWidth: 1, borderColor: '#fecaca',
  },
  clearBtnText: { fontSize: 12, fontWeight: '700', color: '#e53e3e' },
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
