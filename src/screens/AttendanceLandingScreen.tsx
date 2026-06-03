import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AttendanceStackParamList } from '../types';

export default function AttendanceLandingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AttendanceStackParamList>>();

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Attendance</Text>
      <Text style={styles.subheading}>Select a section to record attendance</Text>

      <View style={styles.cards}>
        <TouchableOpacity
          style={[styles.card, styles.cardSalaried]}
          onPress={() => navigation.navigate('SalariedAttendance')}
          activeOpacity={0.85}
        >
          <View style={[styles.iconWrap, { backgroundColor: '#e8f5ef' }]}>
            <Feather name="users" size={32} color="#2d6a4f" />
          </View>
          <Text style={[styles.cardTitle, { color: '#2d6a4f' }]}>Salaried</Text>
          <Text style={styles.cardDesc}>Monthly attendance calendar for permanent staff</Text>
          <Feather name="chevron-right" size={20} color="#2d6a4f" style={styles.cardArrow} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, styles.cardCasual]}
          onPress={() => navigation.navigate('CasualHome')}
          activeOpacity={0.85}
        >
          <View style={[styles.iconWrap, { backgroundColor: '#f3e8ff' }]}>
            <Feather name="user-check" size={32} color="#7c3aed" />
          </View>
          <Text style={[styles.cardTitle, { color: '#7c3aed' }]}>Casuals</Text>
          <Text style={styles.cardDesc}>Record daily work sessions by activity and rate</Text>
          <Feather name="chevron-right" size={20} color="#7c3aed" style={styles.cardArrow} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7f9',
    paddingHorizontal: 20,
    paddingTop: 32,
  },
  heading: {
    fontSize: 26, fontWeight: '800', color: '#1a1a1a', marginBottom: 6,
  },
  subheading: {
    fontSize: 14, color: '#888', marginBottom: 32,
  },
  cards: {
    gap: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardSalaried: { borderColor: '#d1fae5' },
  cardCasual:   { borderColor: '#ede9fe' },
  iconWrap: {
    width: 56, height: 56, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 20, fontWeight: '800', marginBottom: 6,
  },
  cardDesc: {
    fontSize: 13, color: '#666', lineHeight: 18, marginBottom: 12,
  },
  cardArrow: {
    alignSelf: 'flex-end',
  },
});
