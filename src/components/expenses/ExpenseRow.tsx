import { Feather } from '@expo/vector-icons';
import { useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { LocalExpenseRecord } from '../../db/reportRepository';

function formatDate(iso: string): string {
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

interface Props {
  expense: LocalExpenseRecord;
  onEdit: (expense: LocalExpenseRecord) => void;
  onDelete: (expense: LocalExpenseRecord) => void;
  onViewReceipt?: (uri: string) => void;
}

export default function ExpenseRow({ expense, onEdit, onDelete, onViewReceipt }: Props) {
  const swipeRef = useRef<Swipeable>(null);

  function handleDelete() {
    swipeRef.current?.close();
    onDelete(expense);
  }

  function renderRightActions(progress: Animated.AnimatedInterpolation<number>) {
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [80, 0],
      extrapolate: 'clamp',
    });
    return (
      <Animated.View style={[styles.deleteAction, { transform: [{ translateX }] }]}>
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
          <Feather name="trash-2" size={18} color="#fff" />
          <Text style={styles.deleteLabel}>Delete</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <Swipeable ref={swipeRef} renderRightActions={renderRightActions} overshootRight={false}>
      <TouchableOpacity style={styles.row} onPress={() => onEdit(expense)} activeOpacity={0.7}>
        <View style={styles.entryBadge}>
          <Text style={styles.entryNo}>{expense.entry_no}</Text>
        </View>

        <View style={styles.body}>
          <Text style={styles.supplier} numberOfLines={1}>
            {expense.supplier_contractor || '—'}
          </Text>
          {expense.description ? (
            <Text style={styles.description} numberOfLines={1}>{expense.description}</Text>
          ) : null}
          <Text style={styles.meta} numberOfLines={1}>
            {formatDate(expense.date)}
            {expense.category_name ? `  ·  ${expense.category_name}` : ''}
            {expense.business_unit_name ? `  ·  ${expense.business_unit_name}` : ''}
          </Text>
        </View>

        {expense.receipt_image_uri ? (
          <TouchableOpacity
            onPress={() => onViewReceipt?.(expense.receipt_image_uri!)}
            hitSlop={8}
            style={styles.receiptIcon}
          >
            <Feather name="camera" size={14} color="#52B788" />
          </TouchableOpacity>
        ) : null}
        <Text style={styles.cost}>{expense.cost.toFixed(2)}</Text>
        <Feather name="chevron-right" size={16} color="#ccc" style={styles.chevron} />
      </TouchableOpacity>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e8e8e8',
    minHeight: 60,
  },
  entryBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e8f5ef',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  entryNo: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2d6a4f',
    fontVariant: ['tabular-nums'],
  },
  body: { flex: 1 },
  supplier:    { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  description: { fontSize: 13, color: '#555', marginTop: 1 },
  meta:        { fontSize: 12, color: '#888', marginTop: 2 },
  cost: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
    fontVariant: ['tabular-nums'],
    marginLeft: 8,
  },
  receiptIcon: { marginLeft: 6 },
  chevron: { marginLeft: 4 },
  deleteAction: {
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e53e3e',
  },
  deleteBtn: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  deleteLabel: { fontSize: 12, fontWeight: '600', color: '#fff' },
});
