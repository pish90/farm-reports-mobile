import { Feather } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MonthYearSelector from '../components/shared/MonthYearSelector';
import { deleteWorkSession, getWorkSessions } from '../services/casualLabourerService';
import { useAuth } from '../store/AuthContext';
import { AttendanceStackParamList, CasualWorkEntryDto, CasualWorkSessionDto } from '../types';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function totalForSession(session: CasualWorkSessionDto): number {
  return session.entries.reduce((sum, e) => sum + e.effectiveRate, 0);
}

// ─── Session detail modal ────────────────────────────────────────────────────

function SessionDetailModal({
  session,
  onClose,
}: {
  session: CasualWorkSessionDto | null;
  onClose: () => void;
}) {
  if (!session) return null;
  const total = totalForSession(session);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={detailStyles.backdrop} onPress={onClose} />
      <View style={detailStyles.sheet}>
        <View style={detailStyles.handle} />

        {/* Header */}
        <Text style={detailStyles.activity} numberOfLines={2}>{session.activity}</Text>
        <View style={detailStyles.metaRow}>
          <Feather name="calendar" size={13} color="#888" />
          <Text style={detailStyles.metaText}>{formatDate(session.sessionDate)}</Text>
          <Text style={detailStyles.metaSep}>·</Text>
          <Feather name="dollar-sign" size={13} color="#888" />
          <Text style={detailStyles.metaText}>Default Ksh {session.defaultDailyRate}/day</Text>
        </View>

        <View style={detailStyles.divider} />

        {/* Worker list */}
        <ScrollView style={detailStyles.workerList} showsVerticalScrollIndicator={false}>
          {session.entries.length === 0 && (
            <Text style={detailStyles.emptyText}>No workers recorded.</Text>
          )}
          {session.entries.map((entry: CasualWorkEntryDto) => (
            <View key={entry.id} style={detailStyles.workerRow}>
              <Text style={detailStyles.workerName} numberOfLines={1}>{entry.labourerName}</Text>
              <View style={detailStyles.workerRateWrap}>
                {entry.rateOverride !== null && (
                  <View style={detailStyles.overrideBadge}>
                    <Text style={detailStyles.overrideBadgeText}>override</Text>
                  </View>
                )}
                <Text style={detailStyles.workerRate}>Ksh {entry.effectiveRate.toLocaleString()}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={detailStyles.divider} />

        {/* Total */}
        <View style={detailStyles.totalRow}>
          <Text style={detailStyles.totalLabel}>Total</Text>
          <Text style={detailStyles.totalValue}>Ksh {total.toLocaleString()}</Text>
        </View>

        <TouchableOpacity style={detailStyles.closeBtn} onPress={onClose} activeOpacity={0.85}>
          <Text style={detailStyles.closeBtnText}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const detailStyles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    maxHeight: '75%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e0e0e0', alignSelf: 'center', marginTop: 12, marginBottom: 16 },
  activity: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 6 },
  metaRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 14 },
  metaText: { fontSize: 13, color: '#888' },
  metaSep:  { fontSize: 13, color: '#ccc' },
  divider:  { height: StyleSheet.hairlineWidth, backgroundColor: '#eee', marginVertical: 10 },
  workerList: { maxHeight: 260 },
  emptyText:  { fontSize: 14, color: '#bbb', textAlign: 'center', paddingVertical: 16 },
  workerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0f0',
  },
  workerName:     { flex: 1, fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  workerRateWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  overrideBadge:  { backgroundColor: '#f3e8ff', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  overrideBadgeText: { fontSize: 10, fontWeight: '700', color: '#7c3aed' },
  workerRate:     { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  totalLabel: { fontSize: 15, fontWeight: '700', color: '#555' },
  totalValue: { fontSize: 17, fontWeight: '800', color: '#7c3aed' },
  closeBtn: {
    marginTop: 10, paddingVertical: 13,
    borderRadius: 12, borderWidth: 1, borderColor: '#ddd',
    alignItems: 'center',
  },
  closeBtnText: { fontSize: 15, fontWeight: '600', color: '#666' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

export default function CasualAttendanceScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<AttendanceStackParamList>>();

  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [sessions, setSessions]         = useState<CasualWorkSessionDto[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [detailSession, setDetailSession] = useState<CasualWorkSessionDto | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user?.farmId) return;
      let cancelled = false;
      setLoading(true);
      setError(null);

      // The list is scoped to one month (the picker above), which is naturally small,
      // so rather than a manual "load more" this drains every page for that month up
      // front — the monthly total below needs the complete set to be accurate.
      async function loadAllForMonth() {
        const all: CasualWorkSessionDto[] = [];
        let page = 0;
        for (;;) {
          const res = await getWorkSessions(user!.farmId!, { year, month, page, size: PAGE_SIZE });
          all.push(...res.content);
          if (cancelled || page + 1 >= res.totalPages) break;
          page += 1;
        }
        return all;
      }

      loadAllForMonth()
        .then(data => { if (!cancelled) setSessions(data); })
        .catch(e => { if (!cancelled) setError(e.message ?? 'Failed to load sessions'); })
        .finally(() => { if (!cancelled) setLoading(false); });

      return () => { cancelled = true; };
    }, [user?.farmId, year, month]),
  );

  const monthTotal = sessions.reduce((sum, s) => sum + totalForSession(s), 0);

  function handleDelete(session: CasualWorkSessionDto) {
    Alert.alert(
      'Delete Session',
      `Delete "${session.activity}" on ${formatDate(session.sessionDate)}?\n\nThis will remove all ${session.entries.length} worker entries.`,
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
      {/* Month selector */}
      <MonthYearSelector
        year={year}
        month={month}
        onChange={(y, m) => { setYear(y); setMonth(m); }}
      />

      {/* Monthly summary */}
      <View style={styles.summaryRow}>
        <View>
          <Text style={styles.summaryLabel}>Total for {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month - 1]}</Text>
          <Text style={styles.summaryTotal}>Ksh {monthTotal.toLocaleString()}</Text>
        </View>
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
              <Text style={styles.emptyText}>No sessions this month.</Text>
              <Text style={styles.emptyHint}>Tap + to record a work session.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => setDetailSession(item)}
              activeOpacity={0.85}
            >
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
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    onPress={() => navigation.navigate('CreateWorkSession', { session: item })}
                    hitSlop={8}
                  >
                    <Feather name="edit-2" size={15} color="#7c3aed" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={8}>
                    <Feather name="trash-2" size={15} color="#f87171" />
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
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

      {/* Session detail modal */}
      <SessionDetailModal
        session={detailSession}
        onClose={() => setDetailSession(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f9' },

  summaryRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee',
  },
  summaryLabel: { fontSize: 12, color: '#888', marginBottom: 3 },
  summaryTotal: { fontSize: 20, fontWeight: '800', color: '#7c3aed' },

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

  cardRight:   { alignItems: 'flex-end', marginLeft: 12 },
  cardTotal:   { fontSize: 15, fontWeight: '800', color: '#7c3aed' },
  cardActions: { flexDirection: 'row', gap: 16, marginTop: 10, alignItems: 'center' },

  fab: {
    position: 'absolute', bottom: 28, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#7c3aed',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
});
