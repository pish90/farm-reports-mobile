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
  LocalReport,
  SectionSummary,
  getLocalReport,
  getOrCreateLocalReport,
  getReportSectionSummary,
  updateReportDraft,
  updateReportSubmitted,
} from '../db/reportRepository';
import apiClient from '../services/apiClient';
import { syncReport } from '../services/syncService';
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

function formatDate(iso: string | null): string {
  if (!iso) return '';
  // SQLite stores UTC as "YYYY-MM-DD HH:MM:SS"
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

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

  const [report,      setReport]      = useState<LocalReport | null>(null);
  const [summary,     setSummary]     = useState<SectionSummary | null>(null);
  const [isLoading,   setIsLoading]   = useState(true);
  const [loadError,   setLoadError]   = useState<string | null>(null);
  const [isSubmitting,  setIsSubmitting]  = useState(false);
  const [submitError,   setSubmitError]   = useState<string | null>(null);
  const [isReopening,   setIsReopening]   = useState(false);
  const [reopenError,   setReopenError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setLoadError(null);
    setSubmitError(null);
    try {
      const r = await getOrCreateLocalReport(user.farmId!, year, month);
      setReport(r);
      const s = await getReportSectionSummary(r.id, year, month);
      setSummary(s);
    } catch (e: any) {
      setLoadError(e.message ?? 'Failed to load report data');
    } finally {
      setIsLoading(false);
    }
  }, [user?.farmId, year, month]);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit() {
    if (!report || !user) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      // 1. Push all pending sections to the server
      await syncReport(report.id);

      // 2. Get updated local report (now has server_report_id)
      const updated = await getLocalReport(report.id);
      if (!updated?.server_report_id) {
        throw new Error('Could not reach the server. Please check your connection and try again.');
      }

      // 3. Submit on the server
      await apiClient.post(`/reports/${updated.server_report_id}/submit`, {});

      // 4. Mark local report as submitted
      await updateReportSubmitted(report.id, user.userName);

      // 5. Reload to reflect new status
      const final = await getLocalReport(report.id);
      setReport(final);
    } catch (e: any) {
      const msg =
        e.response?.data?.message ??
        e.message ??
        'Submit failed. Please try again.';
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReopen() {
    if (!report || !user) return;
    setIsReopening(true);
    setReopenError(null);
    try {
      if (report.server_report_id) {
        await apiClient.post(`/reports/${report.server_report_id}/reopen`, {});
      }
      await updateReportDraft(report.id);
      const updated = await getLocalReport(report.id);
      setReport(updated);
    } catch (e: any) {
      const msg = e.response?.data?.message ?? e.message ?? 'Reopen failed. Please try again.';
      setReopenError(msg);
    } finally {
      setIsReopening(false);
    }
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const isSubmitted = report?.status === 'submitted';
  const canSubmit =
    !isSubmitted &&
    !!summary &&
    summary.livestock.nonZeroCount > 0 &&
    summary.milk.filledDays > 0 &&
    !isSubmitting;

  // ── Submitted view ─────────────────────────────────────────────────────────
  if (!isLoading && isSubmitted && report) {
    return (
      <View style={styles.container}>
        <MonthYearSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Feather name="check" size={48} color="#fff" />
          </View>
          <Text style={styles.successTitle}>Report Submitted</Text>
          <Text style={styles.successSub}>
            {formatDate(report.submitted_at)}
          </Text>
          {report.submitted_by ? (
            <Text style={styles.successBy}>by {report.submitted_by}</Text>
          ) : null}

          <View style={styles.lockedNote}>
            <Feather name="lock" size={14} color="#888" style={{ marginRight: 6 }} />
            <Text style={styles.lockedText}>This report is locked and read-only.</Text>
          </View>

          {user?.role === 'ADMIN' && (
            <>
              {reopenError ? (
                <View style={[styles.lockedNote, { marginTop: 12, borderColor: '#fed7d7', backgroundColor: '#fff5f5' }]}>
                  <Text style={[styles.lockedText, { color: '#e53e3e' }]}>{reopenError}</Text>
                </View>
              ) : null}
              <TouchableOpacity
                style={styles.reopenBtn}
                onPress={handleReopen}
                disabled={isReopening}
                activeOpacity={0.8}
              >
                {isReopening ? (
                  <ActivityIndicator size="small" color="#2d6a4f" />
                ) : (
                  <>
                    <Feather name="unlock" size={16} color="#2d6a4f" style={{ marginRight: 8 }} />
                    <Text style={styles.reopenText}>Reopen Report</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  }

  // ── Normal view ────────────────────────────────────────────────────────────
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

          {/* Submit button */}
          {submitError ? (
            <View style={styles.errorCard}>
              <Feather name="alert-circle" size={16} color="#e53e3e" style={{ marginRight: 8 }} />
              <Text style={styles.errorCardText}>{submitError}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Feather name="send" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.submitText}>Submit Report</Text>
              </>
            )}
          </TouchableOpacity>

          {!canSubmit && !isSubmitted && (
            <Text style={styles.hint}>
              Livestock and milk sections must have data before submitting.
            </Text>
          )}
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

  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 20,
    padding: 12,
    backgroundColor: '#fff5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fed7d7',
  },
  errorCardText: { flex: 1, fontSize: 13, color: '#e53e3e' },

  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 16,
    backgroundColor: '#2d6a4f',
    borderRadius: 12,
  },
  submitBtnDisabled: { backgroundColor: '#a0b8ad' },
  submitText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  hint: {
    textAlign: 'center',
    fontSize: 12,
    color: '#999',
    marginTop: 10,
    marginHorizontal: 24,
  },

  // Submitted view
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  successIcon: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#2d6a4f',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  successTitle: { fontSize: 24, fontWeight: '700', color: '#1a1a1a', textAlign: 'center' },
  successSub:   { fontSize: 14, color: '#666', marginTop: 8, textAlign: 'center' },
  successBy:    { fontSize: 14, color: '#888', marginTop: 4, textAlign: 'center' },
  lockedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 32,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  lockedText: { fontSize: 13, color: '#888' },
  reopenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#2d6a4f',
  },
  reopenText: { fontSize: 15, fontWeight: '600', color: '#2d6a4f' },
});
