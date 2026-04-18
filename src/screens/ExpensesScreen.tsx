import { StyleSheet, Text, View } from 'react-native';

export default function ExpensesScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Expenses</Text>
      <Text style={styles.sub}>Coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  text: { fontSize: 22, fontWeight: '600', color: '#1a1a1a' },
  sub: { fontSize: 14, color: '#888', marginTop: 6 },
});
