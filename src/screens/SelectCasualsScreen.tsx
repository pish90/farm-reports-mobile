import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { getEmployee, getEmployees } from '../services/employeeService';
import workSessionDraft from '../store/workSessionDraft';
import { useAuth } from '../store/AuthContext';
import { AttendanceStackParamList, EmployeeDto } from '../types';

const PAGE_SIZE = 10;

type NavProp = NativeStackNavigationProp<AttendanceStackParamList, 'SelectCasuals'>;
type RoutePropType = RouteProp<AttendanceStackParamList, 'SelectCasuals'>;

export default function SelectCasualsScreen() {
  const { user }   = useAuth();
  const navigation = useNavigation<NavProp>();
  const route      = useRoute<RoutePropType>();

  const { currentSelection } = route.params;
  const selectedIds = new Set(currentSelection.map(c => c.id));

  const [employees, setEmployees]     = useState<EmployeeDto[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [checked, setChecked]         = useState<Set<number>>(new Set(selectedIds));
  const [search, setSearch]           = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const pageRef = useRef(0);
  const hasMore = employees.length < totalElements;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback((page: number) => {
    if (!user?.farmId) return;
    if (page === 0) setLoading(true); else setLoadingMore(true);
    getEmployees(user.farmId, { isCasual: true, status: 'ACTIVE', search: debouncedSearch || undefined, page, size: PAGE_SIZE })
      .then(res => {
        setTotalElements(res.totalElements);
        setEmployees(prev => page === 0 ? res.content : [...prev, ...res.content]);
        pageRef.current = page;
      })
      .catch(() => {})
      .finally(() => { setLoading(false); setLoadingMore(false); });
  }, [user?.farmId, debouncedSearch]);

  useFocusEffect(
    useCallback(() => { fetchPage(0); }, [fetchPage]),
  );

  function loadMore() {
    if (!hasMore || loadingMore || loading) return;
    fetchPage(pageRef.current + 1);
  }

  function toggle(id: number) {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const [finishing, setFinishing] = useState(false);

  async function handleDone() {
    if (!user?.farmId) return;
    setFinishing(true);
    const prevSelection = new Map(currentSelection.map(c => [c.id, c]));
    const loadedById = new Map(employees.map(e => [e.id, e]));
    try {
      // A previously-selected employee may not be in the currently-loaded pages
      // (e.g. selected earlier, on a page not yet scrolled to) — fetch those
      // individually rather than silently dropping them from the selection.
      const selected = await Promise.all(Array.from(checked).map(async id => {
        const loaded = loadedById.get(id);
        const emp = loaded ?? await getEmployee(user.farmId!, id);
        return { id: emp.id, name: emp.fullName, rateOverride: prevSelection.get(id)?.rateOverride };
      }));
      workSessionDraft.pendingCasuals = selected;
      navigation.goBack();
    } finally {
      setFinishing(false);
    }
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
          data={employees}
          keyExtractor={e => String(e.id)}
          contentContainerStyle={styles.list}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator size="small" color="#7c3aed" style={{ paddingVertical: 16 }} /> : null
          }
          renderItem={({ item }) => {
            const isChecked = checked.has(item.id);
            // Every row here is already casual-eligible (filtered server-side); the only
            // remaining distinction to show is whether they're also salaried (dual-type).
            const isDual = item.isSalaried && item.isCasual;
            const accentColor = isDual ? '#0f766e' : '#7c3aed';
            const accentBg = isDual ? '#ccfbf1' : '#f3e8ff';
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
                  <View style={[styles.avatarPlaceholder, { backgroundColor: accentBg }]}>
                    {photoUri
                      ? <Image source={{ uri: photoUri }} style={styles.avatar} />
                      : <Text style={[styles.avatarInitial, { color: accentColor }]}>
                          {item.fullName[0].toUpperCase()}
                        </Text>}
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.rowName}>{item.fullName}</Text>
                    <Text style={[styles.rowLs, { color: accentColor }]}>
                      {item.lsNumber}{isDual ? '  ·  Salaried + Casual' : ''}
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
        <TouchableOpacity
          style={styles.doneBtn}
          onPress={handleDone}
          activeOpacity={0.85}
          disabled={finishing}
        >
          {finishing
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.doneBtnText}>Done</Text>}
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
