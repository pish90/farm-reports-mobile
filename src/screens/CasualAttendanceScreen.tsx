import { Feather } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { deleteWorkSession, getWorkSessions } from '../services/casualLabourerService';
import { useAuth } from '../store/AuthContext';
import { AttendanceStackParamList, CasualWorkSessionDto } from '../types';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function totalForSession(session: CasualWorkSessionDto): number {
  return session.entries.reduce((sum, e) => sum + e.effectiveRate, 0);
}

export default function CasualAttendanceScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<AttendanceStackParamList>>();

  const [sessions, setSessions] = useState<CasualWorkSessionDto[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user?.farmId) return;
      setLoading(true);
      setError(null);
      getWorkSessions(user.farmId)
        .then(data => setSessions(data))
        .catch(e => setError(e.message ?? 'Failed to load sessions'))
        .finally(() => setLoading(false));
    }, [user?.farmId]),
  );

  function handleDelete(session: CasualWorkSessionDto) {
    Alert.alert(
      'Delete Session',
      `Delete ${session.activity} on ${formatDate(session.sessionDate)}?\n\nThis will remove all ${session.entries.length} worker entries.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await deleteWorkSession(user!.farmId!, session.id);
              setSessions(prev => prev.filter(s => s.id !== session.id));
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'Failed to delete session');
            }
          },
        },
      ],
    );
  }

  return (
    <View style={styles.container}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.headerLabel}>All work sessions</Text>
          <Text style={styles.headerSub}>{sessions.length} recorded</Text>
        </View>
        <TouchableOpacity
          style={styles.reportBtn}
          onPress={() => navigation.navigate('CasualReport')}
          activeOpacity={0.8}
        >
          <Feather name="bar-chart-2" size={15} color="#7c3aed" />
          <Text style={styles.reportBtnText}>Report</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#7c3aed" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Feather name="alert-triangle" size={32} color="#e53e3e" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={s => String(s.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Feather name="calendar" size={40} color="#ddd" />
              <Text style={styles.emptyText}>No sessions yet.</Text>
              <Text style={styles.emptyHint}>Tap + to record a work session.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardLeft}>
                <Text style={styles.cardDate}>{formatDate(item.sessionDate)}</Text>
                <Text style={styles.cardActivity}>{item.activity}</Text>
                <View style={styles.cardMeta}>
                  <Feather name="users" size={12} color="#888" />
                  <Text style={styles.cardMetaText}>{item.entries.length} casuals</Text>
                  <Text style={styles.cardMetaSep}>·</Text>
                  <Text style={styles.cardMetaText}>Default Ksh {item.defaultDailyRate}/day</Text>
                </View>
              </View>
              <View style={styles.cardRight}>
                <Text style={styles.cardTotal}>Ksh {totalForSession(item).toLocaleString()}</Text>
                <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={8} style={{ marginTop: 8 }}>
                  <Feather name="trash-2" size={16} color="#f87171" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('CreateWorkSession', undefined)}
        activeOpacity={0.85}
      >
        <Feather name="plus" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f9' },

  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee',
  },
  headerLabel: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  headerSub:   { fontSize: 12, color: '#888', marginTop: 2 },
  reportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#f3e8ff', borderRadius: 20,
  },
  reportBtnText: { fontSize: 13, fontWeight: '700', color: '#7c3aed' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { marginTop: 12, color: '#e53e3e', textAlign: 'center', fontSize: 14 },

  list: { padding: 12, paddingBottom: 100 },
  emptyWrap: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#bbb', marginTop: 14 },
  emptyHint: { fontSize: 13, color: '#ccc', marginTop: 4 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1, borderColor: '#ede9fe',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  cardLeft: { flex: 1 },
  cardDate: { fontSize: 12, color: '#888', marginBottom: 3 },
  cardActivity: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 6 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardMetaText: { fontSize: 12, color: '#888' },
  cardMetaSep:  { fontSize: 12, color: '#ccc' },

  cardRight: { alignItems: 'flex-end', marginLeft: 12 },
  cardTotal: { fontSize: 15, fontWeight: '800', color: '#7c3aed' },

  fab: {
    position: 'absolute', bottom: 28, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#7c3aed',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
});
