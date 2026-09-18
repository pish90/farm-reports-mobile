import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MonthYearSelector from '../components/shared/MonthYearSelector';
import {
  SectionSummary,
  getOrCreateLocalReport,
  getReportSectionSummary,
} from '../db/reportRepository';
import { useAuth } from '../store/AuthContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type StatusColor = 'green' | 'amber' | 'red' | 'grey';

const COLOR: Record<StatusColor, string> = {
  green: '#2d6a4f',
  amber: '#d97706',
  red:   '#e53e3e',
  grey:  '#9ca3af',
};

const ICON: Record<StatusColor, keyof typeof Feather.glyphMap> = {
  green: 'check-circle',
  amber: 'alert-circle',
  red:   'x-circle',
  grey:  'minus-circle',
};

// ─── StatusRow ────────────────────────────────────────────────────────────────

interface StatusRowProps {
  label: string;
  detail: string;
  status: StatusColor;
}

function StatusRow({ label, detail, status }: StatusRowProps) {
  return (
    <View style={rowStyles.row}>
      <Feather name={ICON[status]} size={20} color={COLOR[status]} style={rowStyles.icon} />
      <View style={rowStyles.body}>
        <Text style={rowStyles.label}>{label}</Text>
        <Text style={rowStyles.detail}>{detail}</Text>
      </View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
  },
  icon:   { marginRight: 14 },
  body:   { flex: 1 },
  label:  { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  detail: { fontSize: 13, color: '#888', marginTop: 2 },
});

// ─── Completion logic ─────────────────────────────────────────────────────────

function livestockStatus(s: SectionSummary['livestock']): StatusColor {
  return s.nonZeroCount > 0 ? 'green' : 'red';
}

function livestockDetail(s: SectionSummary['livestock']): string {
  if (s.totalTypes === 0) return 'No data entered';
  return `${s.nonZeroCount} of ${s.totalTypes} type${s.totalTypes !== 1 ? 's' : ''} with non-zero count`;
}

function milkStatus(s: SectionSummary['milk']): StatusColor {
  if (s.filledDays === 0) return 'red';
  if (s.filledDays < s.daysInMonth) return 'amber';
  return 'green';
}

function milkDetail(s: SectionSummary['milk']): string {
  return `${s.filledDays} of ${s.daysInMonth} days entered`;
}

function expensesDetail(s: SectionSummary['expenses']): string {
  if (s.count === 0) return 'No expenses recorded';
  return `${s.count} entr${s.count !== 1 ? 'ies' : 'y'}  ·  Total: ${s.total.toFixed(2)}`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SummaryScreen() {
  const { user } = useAuth();
  const now = new Date();

  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [summary,     setSummary]     = useState<SectionSummary | null>(null);
  const [isLoading,   setIsLoading]   = useState(true);
  const [loadError,   setLoadError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const r = await getOrCreateLocalReport(user.farmId!, year, month);
      const s = await getReportSectionSummary(r.id, year, month);
      setSummary(s);
    } catch (e: any) {
      setLoadError(e.message ?? 'Failed to load report data');
    } finally {
      setIsLoading(false);
    }
  }, [user?.farmId, year, month]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={styles.container}>
      <MonthYearSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2d6a4f" />
        </View>
      ) : loadError ? (
        <View style={styles.centered}>
          <Feather name="alert-triangle" size={32} color="#e53e3e" />
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : summary ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Section status card */}
          <Text style={styles.sectionHeading}>SECTION STATUS</Text>
          <View style={styles.card}>
            <StatusRow
              label="Livestock Returns"
              detail={livestockDetail(summary.livestock)}
              status={livestockStatus(summary.livestock)}
            />
            <StatusRow
              label="Daily Milk Production"
              detail={milkDetail(summary.milk)}
              status={milkStatus(summary.milk)}
            />
            <StatusRow
              label="Expenses"
              detail={expensesDetail(summary.expenses)}
              status="green"
            />
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            {(['green', 'amber', 'red', 'grey'] as StatusColor[]).map((c) => (
              <View key={c} style={styles.legendItem}>
                <Feather name={ICON[c]} size={14} color={COLOR[c]} />
                <Text style={styles.legendText}>
                  {c === 'green' ? 'Complete' : c === 'amber' ? 'Partial' : c === 'red' ? 'Missing' : 'N/A'}
                </Text>
              </View>
            ))}
          </View>

          <Text style={styles.hint}>
            Data is live as soon as it's entered — nothing to submit.
          </Text>
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f9' },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { marginTop: 12, color: '#e53e3e', textAlign: 'center', fontSize: 14 },
  retryBtn:  { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#2d6a4f', borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  scroll: { paddingBottom: 48 },

  sectionHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 0.8,
    marginTop: 20,
    marginBottom: 8,
    marginHorizontal: 16,
  },

  card: {
    marginHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },

  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 12,
    marginHorizontal: 16,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendText: { fontSize: 12, color: '#888' },

  hint: {
    textAlign: 'center',
    fontSize: 12,
    color: '#999',
    marginTop: 24,
    marginHorizontal: 24,
  },
});
