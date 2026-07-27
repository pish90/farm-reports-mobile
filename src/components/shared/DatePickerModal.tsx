import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function formatDate(d: Date): string { return d.toISOString().split('T')[0]; }
function getDaysInMonth(year: number, month: number) { return new Date(year, month, 0).getDate(); }
function getFirstDow(year: number, month: number) { return new Date(year, month - 1, 1).getDay(); }

interface Props {
  visible: boolean;
  value: string; // YYYY-MM-DD
  onSelect: (date: string) => void;
  onClose: () => void;
  accentColor?: string;
  allowFuture?: boolean;
}

export default function DatePickerModal({ visible, value, onSelect, onClose, accentColor = '#2d6a4f', allowFuture = true }: Props) {
  const initial = new Date((value || formatDate(new Date())) + 'T00:00:00');
  const [year, setYear]   = useState(initial.getFullYear());
  const [month, setMonth] = useState(initial.getMonth() + 1);
  const selected          = value;
  const today             = formatDate(new Date());

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  const daysInMonth = getDaysInMonth(year, month);
  const firstDow    = getFirstDow(year, month);
  const cells: Array<number | null> = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Select Date</Text>

        <View style={styles.navRow}>
          <TouchableOpacity onPress={prevMonth} hitSlop={12} style={styles.navBtn}>
            <Feather name="chevron-left" size={22} color={accentColor} />
          </TouchableOpacity>
          <Text style={styles.navLabel}>{MONTHS[month - 1]} {year}</Text>
          <TouchableOpacity onPress={nextMonth} hitSlop={12} style={styles.navBtn}>
            <Feather name="chevron-right" size={22} color={accentColor} />
          </TouchableOpacity>
        </View>

        <View style={styles.dowRow}>
          {DAY_LABELS.map(l => <Text key={l} style={styles.dowLabel}>{l}</Text>)}
        </View>

        <View style={styles.grid}>
          {cells.map((day, idx) => {
            if (!day) return <View key={`e-${idx}`} style={styles.cell} />;
            const iso        = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const isSelected = iso === selected;
            const isToday    = iso === today;
            const isDisabled = !allowFuture && iso > today;
            return (
              <TouchableOpacity
                key={day}
                style={[
                  styles.cell,
                  isSelected && { backgroundColor: accentColor, borderRadius: 999 },
                  !isSelected && isToday && { borderWidth: 2, borderColor: accentColor, borderRadius: 999 },
                  isDisabled && styles.cellDisabled,
                ]}
                onPress={() => { if (!isDisabled) { onSelect(iso); onClose(); } }}
                disabled={isDisabled}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.cellText,
                  isSelected && styles.cellTextSelected,
                  !isSelected && isToday && { color: accentColor, fontWeight: '700' },
                  isDisabled && styles.cellTextDisabled,
                ]}>
                  {day}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const CELL = `${100 / 7}%` as const;
const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  handle:   { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e0e0e0', alignSelf: 'center', marginTop: 12, marginBottom: 10 },
  title:    { fontSize: 16, fontWeight: '700', color: '#1a1a1a', textAlign: 'center', marginBottom: 14 },
  navRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  navBtn:   { padding: 4 },
  navLabel: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  dowRow:   { flexDirection: 'row', marginBottom: 4 },
  dowLabel: { width: CELL, textAlign: 'center', fontSize: 11, fontWeight: '600', color: '#aaa', paddingVertical: 4 },
  grid:     { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: CELL, aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center',
    padding: 3,
  },
  cellDisabled:     { opacity: 0.3 },
  cellText:         { fontSize: 14, fontWeight: '500', color: '#1a1a1a' },
  cellTextSelected: { color: '#fff', fontWeight: '700' },
  cellTextDisabled: { color: '#aaa' },
  cancelBtn:  { marginTop: 14, paddingVertical: 13, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600', color: '#666' },
});
