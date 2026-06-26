import { Feather } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getEmployees } from '../services/employeeService';
import workSessionDraft from '../store/workSessionDraft';
import { useAuth } from '../store/AuthContext';
import { AttendanceStackParamList, EmployeeDto } from '../types';

type NavProp = NativeStackNavigationProp<AttendanceStackParamList, 'SelectCasuals'>;
type RoutePropType = RouteProp<AttendanceStackParamList, 'SelectCasuals'>;

export default function SelectCasualsScreen() {
  const { user }   = useAuth();
  const navigation = useNavigation<NavProp>();
  const route      = useRoute<RoutePropType>();

  const { currentSelection } = route.params;
  const selectedIds = new Set(currentSelection.map(c => c.id));

  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [checked, setChecked]     = useState<Set<number>>(new Set(selectedIds));
  const [search, setSearch]       = useState('');
  const [loading, setLoading]     = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!user?.farmId) return;
      setLoading(true);
      getEmployees(user.farmId)
        .then(data => setEmployees(data.filter(e => e.status === 'ACTIVE')))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, [user?.farmId]),
  );

  const filtered = employees.filter(e => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      e.fullName.toLowerCase().includes(q) ||
      e.lsNumber.toLowerCase().includes(q)
    );
  });

  function toggle(id: number) {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleDone() {
    const prevMap = new Map(currentSelection.map(c => [c.id, c.rateOverride]));
    const selected = employees
      .filter(e => checked.has(e.id))
      .map(e => ({ id: e.id, name: e.fullName, rateOverride: prevMap.get(e.id) }));
    workSessionDraft.pendingCasuals = selected;
    navigation.goBack();
  }

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchWrap}>
        <Feather name="search" size={15} color="#aaa" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or LS number…"
          placeholderTextColor="#bbb"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
            <Feather name="x" size={15} color="#aaa" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#7c3aed" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={e => String(e.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const isChecked = checked.has(item.id);
            const isSalaried = item.employmentType === 'SALARIED';
            const photoUri = item.photoBase64
              ? `data:${item.photoMimeType ?? 'image/jpeg'};base64,${item.photoBase64}`
              : null;
            return (
              <TouchableOpacity
                style={[styles.row, isChecked && styles.rowChecked]}
                onPress={() => toggle(item.id)}
                activeOpacity={0.75}
              >
                <View style={styles.rowLeft}>
                  <View style={[styles.avatarPlaceholder, { backgroundColor: isSalaried ? '#e8f5ef' : '#f3e8ff' }]}>
                    {photoUri
                      ? <Image source={{ uri: photoUri }} style={styles.avatar} />
                      : <Text style={[styles.avatarInitial, { color: isSalaried ? '#2d6a4f' : '#7c3aed' }]}>
                          {item.fullName[0].toUpperCase()}
                        </Text>}
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.rowName}>{item.fullName}</Text>
                    <Text style={[styles.rowLs, { color: isSalaried ? '#2d6a4f' : '#7c3aed' }]}>
                      {item.lsNumber}{isSalaried ? '' : '  ·  Casual'}
                    </Text>
                  </View>
                </View>
                <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
                  {isChecked && <Feather name="check" size={14} color="#fff" />}
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Feather name="users" size={40} color="#ccc" />
              <Text style={{ fontSize: 14, color: '#aaa', marginTop: 12 }}>
                {search ? 'No matching employees' : 'No active employees found'}
              </Text>
            </View>
          }
        />
      )}

      {/* Done button */}
      <View style={styles.footer}>
        <Text style={styles.footerCount}>{checked.size} selected</Text>
        <TouchableOpacity style={styles.doneBtn} onPress={handleDone} activeOpacity={0.85}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f9' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    margin: 12, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#eee',
  },
  searchInput: { flex: 1, fontSize: 15, color: '#1a1a1a' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },

  list: { paddingBottom: 100 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    marginHorizontal: 12, marginBottom: 6,
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: '#eee',
  },
  rowChecked: { borderColor: '#7c3aed', backgroundColor: '#faf5ff' },
  rowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  avatar:            { width: 40, height: 40, borderRadius: 20 },
  avatarPlaceholder: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarInitial: { fontSize: 16, fontWeight: '700' },
  rowName:  { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  rowLs:    { fontSize: 11, fontWeight: '600', marginTop: 2 },
  checkbox: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: '#ddd',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },

  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#eee',
  },
  footerCount: { fontSize: 14, fontWeight: '600', color: '#888' },
  doneBtn: {
    paddingHorizontal: 28, paddingVertical: 12,
    backgroundColor: '#7c3aed', borderRadius: 22,
  },
  doneBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
