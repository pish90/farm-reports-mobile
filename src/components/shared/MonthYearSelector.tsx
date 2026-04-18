import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface Props {
  year: number;
  month: number; // 1-based
  onChange: (year: number, month: number) => void;
  maxYear?: number;
  maxMonth?: number;
}

export default function MonthYearSelector({ year, month, onChange, maxYear, maxMonth }: Props) {
  const now = new Date();
  const capYear  = maxYear  ?? now.getFullYear();
  const capMonth = maxMonth ?? (now.getMonth() + 1);
  const isAtMax  = year === capYear && month === capMonth;

  function prev() {
    if (month === 1) onChange(year - 1, 12);
    else onChange(year, month - 1);
  }

  function next() {
    if (isAtMax) return;
    if (month === 12) onChange(year + 1, 1);
    else onChange(year, month + 1);
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={prev} style={styles.btn} hitSlop={12}>
        <Feather name="chevron-left" size={22} color="#2d6a4f" />
      </TouchableOpacity>
      <Text style={styles.label}>{MONTHS[month - 1]} {year}</Text>
      <TouchableOpacity onPress={next} style={styles.btn} disabled={isAtMax} hitSlop={12}>
        <Feather name="chevron-right" size={22} color={isAtMax ? '#ccc' : '#2d6a4f'} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  btn: { padding: 8 },
  label: { fontSize: 17, fontWeight: '600', color: '#1a1a1a', minWidth: 180, textAlign: 'center' },
});
