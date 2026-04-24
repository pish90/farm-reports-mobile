import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MonthYearSelector from '../components/shared/MonthYearSelector';
import { adminService } from '../services/adminService';
import { FarmLiveStatus } from '../types';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function StatusBadge({ status }: { status: FarmLiveStatus['reportStatus'] }) {
  const cfg = {
    NOT_STARTED: { label: 'Not Started', bg: '#f0f0f0', color: '#888' },
    DRAFT:       { label: 'In Progress', bg: '#FFF8E1', color: '#F59E0B' },
    SUBMITTED:   { label: 'Submitted',   bg: '#D8F3DC', color: '#2D6A4F' },
  }[status];
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function StatCell({ icon, value, label }: { icon: keyof typeof Feather.glyphMap; value: string; label: string }) {
  return (
    <View style={styles.statCell}>
      <Feather name={icon} size={14} color="#52B788" />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function FarmCard({ farm }: { farm: FarmLiveStatus }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.farmName}>{farm.farmName}</Text>
        <StatusBadge status={farm.reportStatus} />
      </View>

      <Text style={styles.periodLabel}>{MONTHS[farm.month - 1]} {farm.year}</Text>

      <View style={styles.statsRow}>
        <StatCell
          icon="users"
          value={String(farm.activeWorkers)}
          label="Workers"
        />
        <StatCell
          icon="calendar"
          value={String(farm.attendanceDaysRecorded)}
          label="Att. days"
        />
        <StatCell
          icon="droplet"
          value={farm.milkTotalLitres > 0 ? `${farm.milkTotalLitres.toFixed(0)}L` : '—'}
          label="Milk"
        />
        <StatCell
          icon="tag"
          value={farm.livestockEntered ? '✓' : '—'}
          label="Livestock"
        />
        <StatCell
          icon="dollar-sign"
          value={farm.expenseCount > 0
            ? `${farm.expenseCount} (${(farm.expenseTotal / 1000).toFixed(1)}k)`
            : '—'}
          label="Expenses"
        />
      </View>
    </View>
  );
}

export default function AdminDashboardScreen() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [farms,       setFarms]       = useState<FarmLiveStatus[]>([]);
  const [isLoading,   setIsLoading]   = useState(true);
  const [isRefreshing,setIsRefreshing]= useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const load = useCallback(async (y: number, m: number, refresh = false) => {
    if (refresh) setIsRefreshing(true); else setIsLoading(true);
    setError(null);
    try {
      const data = await adminService.getFarmLiveStatus(y, m);
      setFarms(data);
    } catch {
      setError('Failed to load farm status. Check your connection.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { load(year, month); }, [year, month]);

  const submitted  = farms.filter(f => f.reportStatus === 'SUBMITTED').length;
  const inProgress = farms.filter(f => f.reportStatus === 'DRAFT').length;
  const notStarted = farms.filter(f => f.reportStatus === 'NOT_STARTED').length;

  return (
    <View style={styles.container}>
      <MonthYearSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2d6a4f" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Feather name="alert-triangle" size={32} color="#e53e3e" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => load(year, month)}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => load(year, month, true)}
              tintColor="#2d6a4f"
            />
          }
        >
          {/* Summary strip */}
          <View style={styles.summaryStrip}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryCount, { color: '#2d6a4f' }]}>{submitted}</Text>
              <Text style={styles.summaryLabel}>Submitted</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryCount, { color: '#F59E0B' }]}>{inProgress}</Text>
              <Text style={styles.summaryLabel}>In Progress</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryCount, { color: '#888' }]}>{notStarted}</Text>
              <Text style={styles.summaryLabel}>Not Started</Text>
            </View>
          </View>

          {farms.map(farm => (
            <FarmCard key={farm.farmId} farm={farm} />
          ))}

          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f9' },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { marginTop: 12, color: '#e53e3e', textAlign: 'center', fontSize: 14 },
  scroll:    { padding: 16 },

  summaryStrip: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  summaryItem:   { flex: 1, alignItems: 'center' },
  summaryCount:  { fontSize: 26, fontWeight: '700' },
  summaryLabel:  { fontSize: 11, color: '#888', marginTop: 2 },
  summaryDivider:{ width: 1, backgroundColor: '#eee' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  farmName:    { fontSize: 16, fontWeight: '700', color: '#1a1a1a', flex: 1, marginRight: 8 },
  periodLabel: { fontSize: 12, color: '#888', marginTop: 2, marginBottom: 12 },

  badge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: '600' },

  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statCell: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 13, fontWeight: '700', color: '#1a1a1a', marginTop: 4 },
  statLabel: { fontSize: 10, color: '#888', marginTop: 1 },

  retryBtn:  { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#2d6a4f', borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
