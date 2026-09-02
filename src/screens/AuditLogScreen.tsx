import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auditService } from '../services/auditService';
import { AuditActionType, AuditLog } from '../types';

const PAGE_SIZE = 10;

const ACTION_OPTIONS: { label: string; value: AuditActionType | '' }[] = [
  { label: 'All Actions', value: '' },
  { label: 'Login', value: 'LOGIN' },
  { label: 'Login Failed', value: 'LOGIN_FAILED' },
  { label: 'Password Changed', value: 'PASSWORD_CHANGED' },
  { label: 'Password Reset', value: 'PASSWORD_RESET' },
  { label: 'Report Created', value: 'REPORT_CREATED' },
  { label: 'Report Submitted', value: 'REPORT_SUBMITTED' },
  { label: 'Report Reopened', value: 'REPORT_REOPENED' },
  { label: 'Attendance Updated', value: 'ATTENDANCE_UPDATED' },
  { label: 'Livestock Updated', value: 'LIVESTOCK_UPDATED' },
  { label: 'Milk Updated', value: 'MILK_UPDATED' },
  { label: 'Expenses Updated', value: 'EXPENSES_UPDATED' },
  { label: 'Worker Added', value: 'WORKER_ADDED' },
  { label: 'Worker Deactivated', value: 'WORKER_DEACTIVATED' },
  { label: 'Excel Exported', value: 'EXCEL_EXPORTED' },
];

type ActionColors = { bg: string; text: string };

function actionStyle(action: AuditActionType): ActionColors {
  switch (action) {
    case 'LOGIN':              return { bg: '#D8F3DC', text: '#1B4332' };
    case 'LOGIN_FAILED':       return { bg: '#FEE2E2', text: '#991B1B' };
    case 'PASSWORD_CHANGED':   return { bg: '#DBEAFE', text: '#1E40AF' };
    case 'PASSWORD_RESET':     return { bg: '#FEF3C7', text: '#92400E' };
    case 'REPORT_SUBMITTED':   return { bg: '#D8F3DC', text: '#1B4332' };
    case 'REPORT_REOPENED':    return { bg: '#FEF3C7', text: '#92400E' };
    case 'REPORT_CREATED':     return { bg: '#D8F3DC', text: '#1B4332' };
    case 'WORKER_ADDED':       return { bg: '#DBEAFE', text: '#1E40AF' };
    case 'WORKER_DEACTIVATED': return { bg: '#FEE2E2', text: '#991B1B' };
    case 'EXCEL_EXPORTED':     return { bg: '#EDE9FE', text: '#5B21B6' };
    default:                   return { bg: '#F3F4F6', text: '#374151' };
  }
}

function formatAction(action: AuditActionType): string {
  return action
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function roleColor(role: string | null): string {
  switch (role) {
    case 'ADMIN':              return '#DC2626';
    case 'MANAGER':            return '#2563EB';
    case 'OPERATIONS_MANAGER': return '#7C3AED';
    default:                   return '#6B7280';
  }
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function AuditItem({ log }: { log: AuditLog }) {
  const colors = actionStyle(log.action);
  return (
    <View style={styles.item}>
      <View style={styles.itemHeader}>
        <View style={[styles.actionBadge, { backgroundColor: colors.bg }]}>
          <Text style={[styles.actionText, { color: colors.text }]}>{formatAction(log.action)}</Text>
        </View>
        <Text style={styles.timestamp}>{formatTimestamp(log.timestamp)}</Text>
      </View>

      <View style={styles.itemMeta}>
        {log.userName ? (
          <Text style={styles.metaText}>
            <Text style={styles.metaLabel}>User: </Text>
            <Text style={[styles.metaValue, { color: roleColor(log.userRole) }]}>
              {log.userName}
            </Text>
            {log.userRole ? (
              <Text style={styles.roleText}> ({log.userRole.replace('_', ' ')})</Text>
            ) : null}
          </Text>
        ) : null}

        {log.farmName ? (
          <Text style={styles.metaText}>
            <Text style={styles.metaLabel}>Farm: </Text>
            <Text style={styles.metaValue}>{log.farmName}</Text>
          </Text>
        ) : null}

        {log.description ? (
          <Text style={styles.description}>{log.description}</Text>
        ) : null}

        {log.entityType && log.entityId ? (
          <Text style={styles.entity}>{log.entityType} #{log.entityId}</Text>
        ) : null}
      </View>

      {log.ipAddress ? (
        <Text style={styles.ip}>{log.ipAddress}</Text>
      ) : null}
    </View>
  );
}

export default function AuditLogScreen() {
  const [logs,         setLogs]         = useState<AuditLog[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [filterOpen,   setFilterOpen]   = useState(false);

  // Filters (applied on "Apply")
  const [actionFilter, setActionFilter] = useState<AuditActionType | ''>('');
  const [startDate,    setStartDate]    = useState('');
  const [endDate,      setEndDate]      = useState('');

  // Pending filter values inside the modal
  const [pendingAction, setPendingAction] = useState<AuditActionType | ''>('');
  const [pendingStart,  setPendingStart]  = useState('');
  const [pendingEnd,    setPendingEnd]    = useState('');

  const pageRef = useRef(0);
  const hasMore = logs.length < totalElements;

  const fetch = useCallback(async (opts: {
    page: number; action: AuditActionType | ''; start: string; end: string; refresh?: boolean;
  }) => {
    const { page, action, start, end, refresh } = opts;
    if (page === 0) {
      if (refresh) setRefreshing(true); else setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError(null);

    try {
      const params: Parameters<typeof auditService.getAuditLogs>[0] = {
        page, size: PAGE_SIZE,
      };
      if (action) params.action    = action;
      if (start)  params.startDate = start;
      if (end)    params.endDate   = end;

      const res = await auditService.getAuditLogs(params);
      setTotalElements(res.totalElements);
      setLogs((prev) => page === 0 ? res.content : [...prev, ...res.content]);
      pageRef.current = page;
    } catch {
      setError('Failed to load audit logs.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetch({ page: 0, action: actionFilter, start: startDate, end: endDate });
  }, [actionFilter, startDate, endDate]);

  function onRefresh() {
    fetch({ page: 0, action: actionFilter, start: startDate, end: endDate, refresh: true });
  }

  function loadMore() {
    if (!hasMore || loadingMore) return;
    fetch({ page: pageRef.current + 1, action: actionFilter, start: startDate, end: endDate });
  }

  function openFilter() {
    setPendingAction(actionFilter);
    setPendingStart(startDate);
    setPendingEnd(endDate);
    setFilterOpen(true);
  }

  function applyFilter() {
    setActionFilter(pendingAction);
    setStartDate(pendingStart);
    setEndDate(pendingEnd);
    setFilterOpen(false);
  }

  function clearFilter() {
    setPendingAction('');
    setPendingStart('');
    setPendingEnd('');
  }

  const hasActiveFilters = !!(actionFilter || startDate || endDate);

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.title}>Audit Log</Text>
          {totalElements > 0 && !loading && (
            <Text style={styles.subtitle}>{totalElements.toLocaleString()} events</Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.filterBtn, hasActiveFilters && styles.filterBtnActive]}
          onPress={openFilter}
        >
          <Feather name="filter" size={15} color={hasActiveFilters ? '#fff' : '#2d6a4f'} />
          <Text style={[styles.filterBtnText, hasActiveFilters && styles.filterBtnTextActive]}>
            Filter{hasActiveFilters ? ' •' : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Active filter chips */}
      {hasActiveFilters && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {actionFilter ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>{formatAction(actionFilter)}</Text>
            </View>
          ) : null}
          {startDate ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>From {startDate}</Text>
            </View>
          ) : null}
          {endDate ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>To {endDate}</Text>
            </View>
          ) : null}
          <TouchableOpacity style={styles.clearChip} onPress={() => {
            setActionFilter(''); setStartDate(''); setEndDate('');
          }}>
            <Text style={styles.clearChipText}>Clear all</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Content */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2d6a4f" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Feather name="alert-triangle" size={32} color="#e53e3e" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={onRefresh}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : logs.length === 0 ? (
        <View style={styles.centered}>
          <Feather name="inbox" size={40} color="#ccc" />
          <Text style={styles.emptyText}>No audit events found.</Text>
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <AuditItem log={item} />}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2d6a4f" />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator size="small" color="#2d6a4f" style={{ paddingVertical: 16 }} />
            ) : hasMore ? null : logs.length > PAGE_SIZE ? (
              <Text style={styles.endText}>All events loaded</Text>
            ) : null
          }
        />
      )}

      {/* Filter modal */}
      <Modal visible={filterOpen} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter Audit Log</Text>
              <TouchableOpacity onPress={() => setFilterOpen(false)}>
                <Feather name="x" size={22} color="#555" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Action */}
              <Text style={styles.filterLabel}>Action</Text>
              <View style={styles.actionGrid}>
                {ACTION_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.actionChip,
                      pendingAction === opt.value && styles.actionChipActive,
                    ]}
                    onPress={() => setPendingAction(opt.value)}
                  >
                    <Text
                      style={[
                        styles.actionChipText,
                        pendingAction === opt.value && styles.actionChipTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Date range */}
              <Text style={[styles.filterLabel, { marginTop: 20 }]}>Date Range</Text>
              <View style={styles.dateRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dateLabel}>From (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.dateInput}
                    value={pendingStart}
                    onChangeText={setPendingStart}
                    placeholder="2026-01-01"
                    placeholderTextColor="#bbb"
                    keyboardType="default"
                    maxLength={10}
                  />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.dateLabel}>To (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.dateInput}
                    value={pendingEnd}
                    onChangeText={setPendingEnd}
                    placeholder="2026-12-31"
                    placeholderTextColor="#bbb"
                    keyboardType="default"
                    maxLength={10}
                  />
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.clearBtn} onPress={clearFilter}>
                <Text style={styles.clearBtnText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyBtn} onPress={applyFilter}>
                <Text style={styles.applyBtnText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f9' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
  },
  title:    { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  subtitle: { fontSize: 12, color: '#888', marginTop: 1 },

  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#e8f5ef', borderRadius: 20,
  },
  filterBtnActive:     { backgroundColor: '#2d6a4f' },
  filterBtnText:       { fontSize: 13, fontWeight: '600', color: '#2d6a4f' },
  filterBtnTextActive: { color: '#fff' },

  chipRow:    { paddingHorizontal: 16, paddingBottom: 8, gap: 6, flexDirection: 'row' },
  chip:       { backgroundColor: '#d1fae5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  chipText:   { fontSize: 12, color: '#065f46', fontWeight: '500' },
  clearChip:  { backgroundColor: '#fee2e2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  clearChipText: { fontSize: 12, color: '#991b1b', fontWeight: '500' },

  list:      { padding: 12, paddingTop: 4 },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { marginTop: 12, color: '#e53e3e', textAlign: 'center', fontSize: 14 },
  emptyText: { marginTop: 12, color: '#aaa', fontSize: 14 },
  endText:   { textAlign: 'center', color: '#bbb', fontSize: 12, paddingVertical: 16 },

  retryBtn:  { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#2d6a4f', borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  // List item
  item: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  itemHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 8,
  },
  actionBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  actionText:  { fontSize: 12, fontWeight: '600' },
  timestamp:   { fontSize: 11, color: '#999' },

  itemMeta:   { gap: 2 },
  metaText:   { fontSize: 13, color: '#444' },
  metaLabel:  { color: '#888' },
  metaValue:  { fontWeight: '600' },
  roleText:   { color: '#888' },
  description:{ fontSize: 13, color: '#555', marginTop: 4 },
  entity:     { fontSize: 11, color: '#aaa', marginTop: 2 },
  ip:         { fontSize: 10, color: '#ccc', marginTop: 6, fontFamily: 'monospace' },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  modalTitle:  { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  modalBody:   { paddingHorizontal: 20, paddingTop: 16 },
  modalFooter: {
    flexDirection: 'row', gap: 12,
    paddingHorizontal: 20, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },

  filterLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 10 },

  actionGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionChip:         {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  actionChipActive:   { backgroundColor: '#2d6a4f', borderColor: '#2d6a4f' },
  actionChipText:     { fontSize: 12, color: '#374151' },
  actionChipTextActive: { color: '#fff', fontWeight: '600' },

  dateRow:   { flexDirection: 'row', marginBottom: 8 },
  dateLabel: { fontSize: 12, color: '#888', marginBottom: 4 },
  dateInput: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#1a1a1a', backgroundColor: '#fafafa',
  },

  clearBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 10,
    borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center',
  },
  clearBtnText: { fontSize: 15, fontWeight: '600', color: '#555' },
  applyBtn:     { flex: 2, paddingVertical: 13, borderRadius: 10, backgroundColor: '#2d6a4f', alignItems: 'center' },
  applyBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
