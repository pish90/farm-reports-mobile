import { Feather } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
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
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  addCasualLabourer,
  updateCasualLabourer,
  deactivateCasualLabourer,
  getCasualLabourers,
} from '../services/casualLabourerService';
import workSessionDraft from '../store/workSessionDraft';
import { useAuth } from '../store/AuthContext';
import { AttendanceStackParamList, CasualLabourerDto } from '../types';

type NavProp = NativeStackNavigationProp<AttendanceStackParamList, 'SelectCasuals'>;
type RoutePropType = RouteProp<AttendanceStackParamList, 'SelectCasuals'>;

export default function SelectCasualsScreen() {
  const { user }   = useAuth();
  const navigation = useNavigation<NavProp>();
  const route      = useRoute<RoutePropType>();

  const { currentSelection } = route.params;
  const selectedIds = new Set(currentSelection.map(c => c.id));

  const [labourers, setLabourers] = useState<CasualLabourerDto[]>([]);
  const [checked, setChecked]     = useState<Set<number>>(new Set(selectedIds));
  const [search, setSearch]       = useState('');
  const [loading, setLoading]     = useState(true);

  // ── Add modal ──────────────────────────────────────────────────────────────
  const [showAdd, setShowAdd]   = useState(false);
  const [addName, setAddName]   = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addPhoto, setAddPhoto] = useState<{ base64: string; mimeType: string } | null>(null);
  const [adding, setAdding]     = useState(false);

  // ── Edit modal ─────────────────────────────────────────────────────────────
  const [editTarget, setEditTarget] = useState<CasualLabourerDto | null>(null);
  const [editName, setEditName]     = useState('');
  const [editPhone, setEditPhone]   = useState('');
  const [editPhoto, setEditPhoto]   = useState<{ base64: string; mimeType: string } | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!user?.farmId) return;
      setLoading(true);
      getCasualLabourers(user.farmId)
        .then(data => setLabourers(data))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, [user?.farmId]),
  );

  const filtered = labourers.filter(l => l.name.toLowerCase().includes(search.toLowerCase()));

  function toggle(id: number) {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleDone() {
    const prevMap = new Map(currentSelection.map(c => [c.id, c.rateOverride]));
    const selected = labourers
      .filter(l => checked.has(l.id))
      .map(l => ({ id: l.id, name: l.name, rateOverride: prevMap.get(l.id) }));
    workSessionDraft.pendingCasuals = selected;
    navigation.goBack();
  }

  // ── Add casual ─────────────────────────────────────────────────────────────

  async function pickAddPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      setAddPhoto({ base64: result.assets[0].base64, mimeType: result.assets[0].mimeType ?? 'image/jpeg' });
    }
  }

  async function handleAdd() {
    const name = addName.trim();
    if (!name) { Alert.alert('Name required', "Please enter the casual labourer's name."); return; }
    setAdding(true);
    try {
      const created = await addCasualLabourer(user!.farmId!, {
        name,
        phone: addPhone.trim() || null,
        photoBase64: addPhoto?.base64 ?? null,
        photoMimeType: addPhoto?.mimeType ?? null,
      });
      setLabourers(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setChecked(prev => new Set([...prev, created.id]));
      setShowAdd(false);
      setAddName(''); setAddPhone(''); setAddPhoto(null);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to add casual');
    } finally {
      setAdding(false);
    }
  }

  // ── Edit casual ────────────────────────────────────────────────────────────

  function openEdit(labourer: CasualLabourerDto) {
    setEditTarget(labourer);
    setEditName(labourer.name);
    setEditPhone(labourer.phone ?? '');
    setEditPhoto(null);
  }

  async function pickEditPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      setEditPhoto({ base64: result.assets[0].base64, mimeType: result.assets[0].mimeType ?? 'image/jpeg' });
    }
  }

  async function handleEditSave() {
    if (!editTarget) return;
    const name = editName.trim();
    if (!name) { Alert.alert('Name required', "Please enter the casual labourer's name."); return; }
    setEditSaving(true);
    try {
      const updated = await updateCasualLabourer(user!.farmId!, editTarget.id, {
        name,
        phone: editPhone.trim() || null,
        photoBase64: editPhoto?.base64 ?? null,
        photoMimeType: editPhoto?.mimeType ?? null,
      });
      setLabourers(prev =>
        prev.map(l => l.id === updated.id ? updated : l).sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditTarget(null);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to update casual');
    } finally {
      setEditSaving(false);
    }
  }

  // ── Delete (deactivate) casual ─────────────────────────────────────────────

  function handleRemove(labourer: CasualLabourerDto) {
    Alert.alert(
      'Remove Casual',
      `Remove ${labourer.name} from the app?\n\nExisting work records are kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            try {
              await deactivateCasualLabourer(user!.farmId!, labourer.id);
              setLabourers(prev => prev.filter(l => l.id !== labourer.id));
              setChecked(prev => { const next = new Set(prev); next.delete(labourer.id); return next; });
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'Failed to remove casual');
            }
          },
        },
      ],
    );
  }

  function showCasualOptions(labourer: CasualLabourerDto) {
    Alert.alert(labourer.name, undefined, [
      { text: 'Edit Details',    onPress: () => openEdit(labourer) },
      { text: 'Remove from App', style: 'destructive', onPress: () => handleRemove(labourer) },
      { text: 'Cancel',          style: 'cancel' },
    ]);
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  function Avatar({ labourer }: { labourer: CasualLabourerDto }) {
    if (labourer.photoBase64) {
      return (
        <Image
          source={{ uri: `data:${labourer.photoMimeType ?? 'image/jpeg'};base64,${labourer.photoBase64}` }}
          style={styles.avatar}
        />
      );
    }
    return (
      <View style={styles.avatarPlaceholder}>
        <Text style={styles.avatarInitial}>{labourer.name[0].toUpperCase()}</Text>
      </View>
    );
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
          placeholder="Search casuals…"
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
          keyExtractor={l => String(l.id)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <TouchableOpacity style={styles.addNewRow} onPress={() => setShowAdd(true)} activeOpacity={0.8}>
              <View style={styles.addNewIcon}>
                <Feather name="user-plus" size={16} color="#7c3aed" />
              </View>
              <Text style={styles.addNewText}>Add new casual…</Text>
            </TouchableOpacity>
          }
          renderItem={({ item }) => {
            const isChecked = checked.has(item.id);
            return (
              <TouchableOpacity
                style={[styles.row, isChecked && styles.rowChecked]}
                onPress={() => toggle(item.id)}
                activeOpacity={0.75}
              >
                <View style={styles.rowLeft}>
                  <Avatar labourer={item} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.rowName}>{item.name}</Text>
                    {item.phone && <Text style={styles.rowPhone}>{item.phone}</Text>}
                  </View>
                </View>
                {/* Options button — separate from checkbox so it doesn't toggle selection */}
                <TouchableOpacity
                  onPress={() => showCasualOptions(item)}
                  hitSlop={8}
                  style={styles.optionsBtn}
                >
                  <Feather name="more-vertical" size={16} color="#aaa" />
                </TouchableOpacity>
                <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
                  {isChecked && <Feather name="check" size={14} color="#fff" />}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Done button */}
      <View style={styles.footer}>
        <Text style={styles.footerCount}>{checked.size} selected</Text>
        <TouchableOpacity style={styles.doneBtn} onPress={handleDone} activeOpacity={0.85}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>

      {/* ── Add casual modal ── */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={{ flex: 1 }}>
          <Pressable style={styles.backdrop} onPress={() => setShowAdd(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetWrap}>
            <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.handle} />
              <Text style={styles.sheetTitle}>Add Casual Labourer</Text>

              <TouchableOpacity style={styles.photoPickBtn} onPress={pickAddPhoto} activeOpacity={0.8}>
                {addPhoto ? (
                  <Image source={{ uri: `data:${addPhoto.mimeType};base64,${addPhoto.base64}` }} style={styles.photoPreview} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Feather name="camera" size={22} color="#aaa" />
                    <Text style={styles.photoPlaceholderText}>Add photo</Text>
                  </View>
                )}
              </TouchableOpacity>

              <Text style={styles.addLabel}>Name *</Text>
              <TextInput style={styles.addInput} value={addName} onChangeText={setAddName}
                placeholder="Full name" placeholderTextColor="#bbb" autoCapitalize="words" maxLength={100} />

              <Text style={[styles.addLabel, { marginTop: 14 }]}>Phone (optional)</Text>
              <TextInput style={styles.addInput} value={addPhone} onChangeText={setAddPhone}
                placeholder="+254…" placeholderTextColor="#bbb" keyboardType="phone-pad" maxLength={20} />

              <TouchableOpacity style={[styles.actionBtn, adding && { opacity: 0.6 }]}
                onPress={handleAdd} disabled={adding} activeOpacity={0.85}>
                {adding ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionBtnText}>Add Casual</Text>}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Edit casual modal ── */}
      <Modal visible={editTarget !== null} transparent animationType="slide" onRequestClose={() => setEditTarget(null)}>
        <View style={{ flex: 1 }}>
          <Pressable style={styles.backdrop} onPress={() => setEditTarget(null)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetWrap}>
            <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.handle} />
              <Text style={styles.sheetTitle}>Edit Casual Labourer</Text>

              <TouchableOpacity style={styles.photoPickBtn} onPress={pickEditPhoto} activeOpacity={0.8}>
                {editPhoto ? (
                  <Image source={{ uri: `data:${editPhoto.mimeType};base64,${editPhoto.base64}` }} style={styles.photoPreview} />
                ) : editTarget?.photoBase64 ? (
                  <Image source={{ uri: `data:${editTarget.photoMimeType ?? 'image/jpeg'};base64,${editTarget.photoBase64}` }} style={styles.photoPreview} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Feather name="camera" size={22} color="#aaa" />
                    <Text style={styles.photoPlaceholderText}>Change photo</Text>
                  </View>
                )}
              </TouchableOpacity>

              <Text style={styles.addLabel}>Name *</Text>
              <TextInput style={styles.addInput} value={editName} onChangeText={setEditName}
                placeholder="Full name" placeholderTextColor="#bbb" autoCapitalize="words" maxLength={100} />

              <Text style={[styles.addLabel, { marginTop: 14 }]}>Phone (optional)</Text>
              <TextInput style={styles.addInput} value={editPhone} onChangeText={setEditPhone}
                placeholder="+254…" placeholderTextColor="#bbb" keyboardType="phone-pad" maxLength={20} />

              <TouchableOpacity style={[styles.actionBtn, editSaving && { opacity: 0.6 }]}
                onPress={handleEditSave} disabled={editSaving} activeOpacity={0.85}>
                {editSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionBtnText}>Save Changes</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={styles.removeBtn}
                onPress={() => { setEditTarget(null); handleRemove(editTarget!); }} activeOpacity={0.85}>
                <Feather name="trash-2" size={15} color="#e53e3e" />
                <Text style={styles.removeBtnText}>Remove from App</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
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

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  list: { paddingBottom: 100 },

  addNewRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    marginHorizontal: 12, marginBottom: 8,
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: '#ede9fe', borderStyle: 'dashed',
  },
  addNewIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#f3e8ff', alignItems: 'center', justifyContent: 'center',
  },
  addNewText: { fontSize: 14, fontWeight: '600', color: '#7c3aed' },

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
    backgroundColor: '#e8f5ef', alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 16, fontWeight: '700', color: '#2d6a4f' },
  rowName:  { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  rowPhone: { fontSize: 12, color: '#888', marginTop: 2 },
  optionsBtn: { padding: 6, marginRight: 4 },
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

  // Shared modal styles
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetWrap: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  handle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e0e0e0', alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', textAlign: 'center', marginBottom: 18 },

  photoPickBtn:    { alignSelf: 'center', marginBottom: 18 },
  photoPreview:    { width: 80, height: 80, borderRadius: 40 },
  photoPlaceholder: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#e5e7eb', borderStyle: 'dashed',
  },
  photoPlaceholderText: { fontSize: 11, color: '#aaa', marginTop: 4 },

  addLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  addInput: {
    backgroundColor: '#f9fafb', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#1a1a1a',
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  actionBtn: {
    marginTop: 22, backgroundColor: '#7c3aed', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  actionBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  removeBtn: {
    marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fff1f1',
  },
  removeBtnText: { fontSize: 15, fontWeight: '600', color: '#e53e3e' },
});
