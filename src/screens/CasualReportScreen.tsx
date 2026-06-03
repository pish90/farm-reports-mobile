import { Feather } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
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
import { useFocusEffect } from '@react-navigation/native';
import { getAllSummaries, recordPayment } from '../services/casualLabourerService';
import { useAuth } from '../store/AuthContext';
import { CasualLabourerReportDto } from '../types';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ksh(amount: number): string {
  return `Ksh ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Record Payment Modal ──────────────────────────────────────────────────────

interface RecordPaymentModalProps {
  visible: boolean;
  labourer: CasualLabourerReportDto | null;
  farmId: number;
  onRecorded: () => void;
  onClose: () => void;
}

function RecordPaymentModal({ visible, labourer, farmId, onRecorded, onClose }: RecordPaymentModalProps) {
  const today = new Date().toISOString().split('T')[0];
  const [amount, setAmount] = useState('');
  const [note, setNote]     = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) { Alert.alert('Invalid amount', 'Please enter a positive amount.'); return; }
    setSaving(true);
    try {
      await recordPayment(farmId, labourer!.labourerId, {
        paymentDate: today,
        amount: parsed,
        note: note.trim() || null,
      });
      setAmount(''); setNote('');
      onRecorded();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.payModalWrap}
        >
      <View style={styles.payModal}>
        <View style={styles.handle} />
        <Text style={styles.payModalTitle}>Record Payment</Text>
        {labourer && <Text style={styles.payModalSub}>{labourer.name}</Text>}

        <Text style={styles.inputLabel}>Amount (Ksh)</Text>
        <TextInput
          style={styles.payInput}
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholder="e.g. 500"
          placeholderTextColor="#bbb"
          selectTextOnFocus
          maxLength={10}
        />

        <Text style={[styles.inputLabel, { marginTop: 14 }]}>Note (optional)</Text>
        <TextInput
          style={styles.payInput}
          value={note}
          onChangeText={setNote}
          placeholder="e.g. Week 1 advance"
          placeholderTextColor="#bbb"
          maxLength={200}
        />

        <View style={styles.payActions}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.confirmBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmBtnText}>Record</Text>}
          </TouchableOpacity>
        </View>
      </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Labourer row (expandable) ────────────────────────────────────────────────

interface LabourerRowProps {
  item: CasualLabourerReportDto;
  onPay: (item: CasualLabourerReportDto) => void;
}

function LabourerRow({ item, onPay }: LabourerRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasBalance = item.balance > 0;

  return (
    <View style={styles.card}>
      {/* Summary header */}
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={() => setExpanded(e => !e)}
        activeOpacity={0.8}
      >
        <View style={styles.cardLeft}>
          <Text style={styles.cardName}>{item.name}</Text>
          {item.phone && <Text style={styles.cardPhone}>{item.phone}</Text>}
        </View>
        <View style={styles.cardRight}>
          {hasBalance && (
            <TouchableOpacity
              style={styles.payBtn}
              onPress={() => onPay(item)}
              hitSlop={6}
            >
              <Feather name="dollar-sign" size={12} color="#fff" />
              <Text style={styles.payBtnText}>Pay</Text>
            </TouchableOpacity>
          )}
          <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#aaa" style={{ marginLeft: 8 }} />
        </View>
      </TouchableOpacity>

      {/* Summary figures */}
      <View style={styles.figureRow}>
        <View style={styles.figure}>
          <Text style={styles.figureLabel}>EARNED</Text>
          <Text style={styles.figureValue}>{ksh(item.allTimeEarned)}</Text>
        </View>
        <View style={styles.figureDivider} />
        <View style={styles.figure}>
          <Text style={styles.figureLabel}>PAID</Text>
          <Text style={[styles.figureValue, { color: '#2d6a4f' }]}>{ksh(item.allTimePaid)}</Text>
        </View>
        <View style={styles.figureDivider} />
        <View style={styles.figure}>
          <Text style={styles.figureLabel}>BALANCE</Text>
          <Text style={[styles.figureValue, hasBalance && { color: '#c2410c' }]}>{ksh(item.balance)}</Text>
        </View>
      </View>

      {/* Breakdown */}
      {expanded && item.workEntries.length > 0 && (
        <View style={styles.breakdown}>
          <Text style={styles.breakdownHeader}>Work History</Text>
          {item.workEntries.map((e, idx) => (
            <View key={`${e.sessionId}-${idx}`} style={styles.breakdownRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.breakdownDate}>{formatDate(e.sessionDate)}</Text>
                <Text style={styles.breakdownActivity}>{e.activity}</Text>
              </View>
              <Text style={styles.breakdownAmount}>{ksh(e.amount)}</Text>
            </View>
          ))}
        </View>
      )}

      {expanded && item.workEntries.length === 0 && (
        <Text style={styles.noEntries}>No work sessions recorded yet.</Text>
      )}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CasualReportScreen() {
  const { user } = useAuth();

  const [data, setData]         = useState<CasualLabourerReportDto[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [payTarget, setPayTarget] = useState<CasualLabourerReportDto | null>(null);

  function load() {
    if (!user?.farmId) return;
    setLoading(true);
    setError(null);
    getAllSummaries(user.farmId)
      .then(d => setData(d))
      .catch(e => setError(e.message ?? 'Failed to load report'))
      .finally(() => setLoading(false));
  }

  useFocusEffect(useCallback(load, [user?.farmId]));

  const totals = data.reduce(
    (acc, d) => ({
      earned: acc.earned + d.allTimeEarned,
      paid:   acc.paid   + d.allTimePaid,
      balance: acc.balance + d.balance,
    }),
    { earned: 0, paid: 0, balance: 0 },
  );

  return (
    <View style={styles.container}>
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
        <>
          {/* Totals banner */}
          {data.length > 0 && (
            <View style={styles.totalsBanner}>
              <View style={styles.figure}>
                <Text style={[styles.figureLabel, { color: '#c8d5f0' }]}>TOTAL EARNED</Text>
                <Text style={[styles.figureValue, { color: '#fff', fontSize: 14 }]}>{ksh(totals.earned)}</Text>
              </View>
              <View style={[styles.figureDivider, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
              <View style={styles.figure}>
                <Text style={[styles.figureLabel, { color: '#c8d5f0' }]}>TOTAL PAID</Text>
                <Text style={[styles.figureValue, { color: '#fff', fontSize: 14 }]}>{ksh(totals.paid)}</Text>
              </View>
              <View style={[styles.figureDivider, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
              <View style={styles.figure}>
                <Text style={[styles.figureLabel, { color: '#c8d5f0' }]}>OUTSTANDING</Text>
                <Text style={[styles.figureValue, { color: '#fde68a', fontSize: 14 }]}>{ksh(totals.balance)}</Text>
              </View>
            </View>
          )}

          <FlatList
            data={data}
            keyExtractor={d => String(d.labourerId)}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Feather name="users" size={40} color="#ddd" />
                <Text style={styles.emptyText}>No casuals found.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <LabourerRow item={item} onPay={setPayTarget} />
            )}
          />
        </>
      )}

      <RecordPaymentModal
        visible={payTarget !== null}
        labourer={payTarget}
        farmId={user?.farmId ?? 0}
        onRecorded={load}
        onClose={() => setPayTarget(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f9' },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { marginTop: 12, color: '#e53e3e', textAlign: 'center', fontSize: 14 },

  totalsBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#7c3aed',
    paddingVertical: 14, paddingHorizontal: 16,
  },

  list: { padding: 12, paddingBottom: 40 },
  emptyWrap: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#bbb', marginTop: 14 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1, borderColor: '#ede9fe',
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10,
  },
  cardLeft:  { flex: 1 },
  cardRight: { flexDirection: 'row', alignItems: 'center' },
  cardName:  { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  cardPhone: { fontSize: 12, color: '#888', marginTop: 2 },

  payBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#2d6a4f', borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  payBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  figureRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0f0',
  },
  figure:        { flex: 1, alignItems: 'center' },
  figureLabel:   { fontSize: 9, fontWeight: '700', color: '#aaa', letterSpacing: 0.8, marginBottom: 3 },
  figureValue:   { fontSize: 12, fontWeight: '700', color: '#1a1a1a' },
  figureDivider: { width: StyleSheet.hairlineWidth, height: 30, backgroundColor: '#eee' },

  breakdown: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 },
  breakdownHeader: { fontSize: 11, fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  breakdownRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f5f5f5',
  },
  breakdownDate:     { fontSize: 12, color: '#888' },
  breakdownActivity: { fontSize: 13, fontWeight: '600', color: '#333', marginTop: 2 },
  breakdownAmount:   { fontSize: 13, fontWeight: '700', color: '#7c3aed' },
  noEntries:         { fontSize: 13, color: '#ccc', textAlign: 'center', padding: 12 },

  // Payment modal
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  payModalWrap: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  payModal: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  handle:       { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e0e0e0', alignSelf: 'center', marginBottom: 16 },
  payModalTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', textAlign: 'center' },
  payModalSub:   { fontSize: 13, color: '#888', textAlign: 'center', marginBottom: 18, marginTop: 4 },
  inputLabel:    { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  payInput: {
    backgroundColor: '#f9fafb', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#1a1a1a',
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  payActions:    { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn:     { flex: 1, paddingVertical: 13, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  cancelBtnText: { fontSize: 15, color: '#555', fontWeight: '600' },
  confirmBtn:    { flex: 1, paddingVertical: 13, borderRadius: 10, backgroundColor: '#2d6a4f', alignItems: 'center' },
  confirmBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});
