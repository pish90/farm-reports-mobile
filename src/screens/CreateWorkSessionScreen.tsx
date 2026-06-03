import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createWorkSession } from '../services/casualLabourerService';
import { useAuth } from '../store/AuthContext';
import { AttendanceStackParamList } from '../types';

type NavProp = NativeStackNavigationProp<AttendanceStackParamList, 'CreateWorkSession'>;
type RoutePropType = RouteProp<AttendanceStackParamList, 'CreateWorkSession'>;

interface SelectedCasual {
  id: number;
  name: string;
  rateOverride?: number;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

export default function CreateWorkSessionScreen() {
  const { user }   = useAuth();
  const navigation = useNavigation<NavProp>();
  const route      = useRoute<RoutePropType>();

  const [sessionDate, setSessionDate]     = useState(formatDate(new Date()));
  const [activity, setActivity]           = useState('');
  const [defaultRate, setDefaultRate]     = useState('');
  const [casuals, setCasuals]             = useState<SelectedCasual[]>([]);
  const [saving, setSaving]               = useState(false);

  // When returning from SelectCasualsScreen, merge in the selected casuals
  useEffect(() => {
    const selected = route.params?.selectedCasuals;
    if (!selected) return;
    // Merge: keep existing rate overrides, add newly selected casuals
    setCasuals(prev => {
      const prevMap = new Map(prev.map(c => [c.id, c]));
      const merged: SelectedCasual[] = selected.map(s => ({
        id: s.id,
        name: s.name,
        rateOverride: prevMap.get(s.id)?.rateOverride ?? s.rateOverride,
      }));
      return merged;
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

    if (!trimActivity) { Alert.alert('Missing activity', 'Please enter a work activity.'); return; }
    if (isNaN(rate) || rate <= 0) { Alert.alert('Invalid rate', 'Please enter a valid daily rate.'); return; }
    if (casuals.length === 0) { Alert.alert('No casuals', 'Please choose at least one casual.'); return; }

    setSaving(true);
    try {
      await createWorkSession(user!.farmId!, {
        sessionDate,
        activity: trimActivity,
        defaultDailyRate: rate,
        entries: casuals.map(c => ({
          casualLabourerId: c.id,
          rateOverride: c.rateOverride,
        })),
      });
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to save session');
    } finally {
      setSaving(false);
    }
  }

  const defaultRateNum = parseFloat(defaultRate) || 0;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Date */}
        <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          value={sessionDate}
          onChangeText={setSessionDate}
          placeholder="2026-06-03"
          placeholderTextColor="#bbb"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          returnKeyType="next"
        />

        {/* Activity */}
        <Text style={[styles.label, { marginTop: 18 }]}>Activity</Text>
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
        <Text style={[styles.label, { marginTop: 18 }]}>Default Daily Rate (Ksh)</Text>
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

        {/* Casuals section */}
        <View style={styles.casualsHeader}>
          <Text style={styles.label}>Casuals ({casuals.length})</Text>
          <TouchableOpacity
            style={styles.chooseBtn}
            onPress={() =>
              navigation.navigate('SelectCasuals', {
                currentSelection: casuals.map(c => ({ id: c.id, rateOverride: c.rateOverride })),
                defaultRate: defaultRateNum,
              })
            }
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
          const effective = c.rateOverride ?? defaultRateNum;
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

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Save button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Save Work Session</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f9' },
  content:   { padding: 20, paddingBottom: 20 },

  label: { fontSize: 13, fontWeight: '700', color: '#555', marginBottom: 8 },

  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 13,
    borderWidth: 1, borderColor: '#ddd',
  },
  dateBtnText: { flex: 1, fontSize: 15, color: '#1a1a1a', fontWeight: '500' },

  input: {
    backgroundColor: '#fff', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 13,
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
  chooseBtnText: { fontSize: 13, fontWeight: '700', color: '#7c3aed' },
  casualsEmptyHint: { fontSize: 13, color: '#bbb', textAlign: 'center', paddingVertical: 16 },

  casualRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    marginBottom: 8,
    borderWidth: 1, borderColor: '#ede9fe',
  },
  casualName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  casualRateWrap: { flexDirection: 'row', alignItems: 'center', marginRight: 8 },
  casualRatePrefix: { fontSize: 13, color: '#888', marginRight: 4 },
  casualRateInput: {
    width: 70, fontSize: 14, fontWeight: '600', color: '#555',
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4, textAlign: 'right',
    backgroundColor: '#fafafa',
  },
  casualRateInputOverride: { borderColor: '#7c3aed', color: '#7c3aed' },

  footer: {
    padding: 16, backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#eee',
  },
  saveBtn: {
    backgroundColor: '#7c3aed', borderRadius: 12,
    paddingVertical: 15, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
