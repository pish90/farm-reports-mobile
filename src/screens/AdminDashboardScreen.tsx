import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MonthYearSelector from '../components/shared/MonthYearSelector';
import { adminService } from '../services/adminService';
import { useAuth } from '../store/AuthContext';
import { AdminStackParamList, FarmLiveStatus } from '../types';

type Nav = NativeStackNavigationProp<AdminStackParamList, 'AdminDashboard'>;

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

interface FarmCardProps {
  farm: FarmLiveStatus;
  onPress: () => void;
  onReopen: () => void;
  reopening: boolean;
  isOpsManager: boolean;
}

function FarmCard({ farm, onPress, onReopen, reopening, isOpsManager }: FarmCardProps) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.cardHeader}>
        <Text style={styles.farmName}>{farm.farmName}</Text>
        <StatusBadge status={farm.reportStatus} />
      </View>

      <Text style={styles.periodLabel}>{MONTHS[farm.month - 1]} {farm.year}</Text>

      <View style={styles.statsRow}>
        <StatCell icon="users"      value={String(farm.activeWorkers)}               label="Workers" />
        <StatCell icon="calendar"   value={String(farm.attendanceDaysRecorded)}       label="Att. days" />
        <StatCell icon="droplet"    value={farm.milkTotalLitres > 0 ? `${farm.milkTotalLitres.toFixed(0)}L` : '—'} label="Milk" />
        <StatCell icon="tag"        value={farm.livestockEntered ? '✓' : '—'}        label="Livestock" />
        <StatCell
          icon="dollar-sign"
          value={farm.expenseCount > 0 ? `${farm.expenseCount} (${(farm.expenseTotal / 1000).toFixed(1)}k)` : '—'}
          label="Expenses"
        />
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.tapHint}>
          <Feather name="chevron-right" size={12} color="#aaa" /> {isOpsManager ? 'Tap to view' : 'Tap to view / edit'}
        </Text>
        {farm.reportStatus === 'SUBMITTED' && !isOpsManager && (
          <TouchableOpacity
            style={[styles.reopenBtn, reopening && styles.reopenBtnDisabled]}
            onPress={onReopen}
            disabled={reopening}
          >
            {reopening ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Feather name="unlock" size={13} color="#fff" />
                <Text style={styles.reopenBtnText}>Reopen</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function AdminDashboardScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const isOpsManager = user?.role === 'OPERATIONS_MANAGER';
  const isManager    = user?.role === 'MANAGER';
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [farms,         setFarms]         = useState<FarmLiveStatus[]>([]);
  const [isLoading,     setIsLoading]     = useState(true);
  const [isRefreshing,  setIsRefreshing]  = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [reopeningId,   setReopeningId]   = useState<number | null>(null);
  const [isExporting,   setIsExporting]   = useState(false);

  const load = useCallback(async (y: number, m: number, refresh = false) => {
    if (refresh) setIsRefreshing(true); else setIsLoading(true);
    setError(null);
    try {
      const all = await adminService.getFarmLiveStatus(y, m);
      setFarms(isManager && user?.farmId ? all.filter(f => f.farmId === user.farmId) : all);
    } catch {
      setError('Failed to load farm status. Check your connection.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { load(year, month); }, [year, month]);

  async function handleReopen(farm: FarmLiveStatus) {
    if (!farm.reportId) return;
    setReopeningId(farm.farmId);
    try {
      await adminService.reopenReport(farm.reportId);
      await load(year, month);
    } catch {
      Alert.alert('Error', 'Failed to reopen report. Please try again.');
    } finally {
      setReopeningId(null);
    }
  }

  async function handleExport() {
    setIsExporting(true);
    try {
      await adminService.downloadAllFarmsExcel(year, month);
    } catch {
      Alert.alert('Export Failed', 'Could not generate the Excel file. Please check your connection.');
    } finally {
      setIsExporting(false);
    }
  }

  const submitted  = farms.filter(f => f.reportStatus === 'SUBMITTED').length;
  const inProgress = farms.filter(f => f.reportStatus === 'DRAFT').length;
  const notStarted = farms.filter(f => f.reportStatus === 'NOT_STARTED').length;

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.title}>{isManager ? 'My Farm Report' : 'Farm Overview'}</Text>
        {!isManager && (
          <TouchableOpacity
            style={[styles.exportBtn, isExporting && styles.exportBtnDisabled]}
            onPress={handleExport}
            disabled={isExporting}
          >
            {isExporting ? (
              <ActivityIndicator size="small" color="#2d6a4f" />
            ) : (
              <>
                <Feather name="download" size={16} color="#2d6a4f" />
                <Text style={styles.exportBtnText}>Excel</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

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
            <RefreshControl refreshing={isRefreshing} onRefresh={() => load(year, month, true)} tintColor="#2d6a4f" />
          }
        >
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
            <FarmCard
              key={farm.farmId}
              farm={farm}
              isOpsManager={isOpsManager}
              onPress={() => navigation.navigate('AdminFarmDetail', {
                farmId: farm.farmId,
                farmName: farm.farmName,
                reportId: farm.reportId,
                year,
                month,
              })}
              onReopen={() => handleReopen(farm)}
              reopening={reopeningId === farm.farmId}
            />
          ))}

          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f9' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#e8f5ef', borderRadius: 20,
  },
  exportBtnDisabled: { opacity: 0.5 },
  exportBtnText: { fontSize: 13, fontWeight: '600', color: '#2d6a4f' },

  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { marginTop: 12, color: '#e53e3e', textAlign: 'center', fontSize: 14 },
  scroll:    { padding: 16 },

  summaryStrip: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12,
    paddingVertical: 14, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
  },
  summaryItem:   { flex: 1, alignItems: 'center' },
  summaryCount:  { fontSize: 26, fontWeight: '700' },
  summaryLabel:  { fontSize: 11, color: '#888', marginTop: 2 },
  summaryDivider:{ width: 1, backgroundColor: '#eee' },

  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
  },
  cardHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  farmName:    { fontSize: 16, fontWeight: '700', color: '#1a1a1a', flex: 1, marginRight: 8 },
  periodLabel: { fontSize: 12, color: '#888', marginTop: 2, marginBottom: 12 },
  cardFooter:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  tapHint:     { fontSize: 11, color: '#aaa' },

  badge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: '600' },

  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statCell: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 13, fontWeight: '700', color: '#1a1a1a', marginTop: 4 },
  statLabel: { fontSize: 10, color: '#888', marginTop: 1 },

  reopenBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#2d6a4f', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
  },
  reopenBtnDisabled: { opacity: 0.6 },
  reopenBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  retryBtn:  { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#2d6a4f', borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
