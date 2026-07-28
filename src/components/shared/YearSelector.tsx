import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  year: number;
  onChange: (year: number) => void;
  maxYear?: number;
}

export default function YearSelector({ year, onChange, maxYear }: Props) {
  const capYear = maxYear ?? new Date().getFullYear();
  const isAtMax = year === capYear;

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => onChange(year - 1)} style={styles.btn} hitSlop={12}>
        <Feather name="chevron-left" size={22} color="#2d6a4f" />
      </TouchableOpacity>
      <Text style={styles.label}>{year}</Text>
      <TouchableOpacity onPress={() => !isAtMax && onChange(year + 1)} style={styles.btn} disabled={isAtMax} hitSlop={12}>
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
  label: { fontSize: 17, fontWeight: '600', color: '#1a1a1a', minWidth: 80, textAlign: 'center' },
});
