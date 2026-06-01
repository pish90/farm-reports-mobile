import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRoute } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  addCasualLabourer,
  deactivateCasualLabourer,
  getCasualLabourers,
} from '../services/casualLabourerService';
import { WorkerDto, addWorker, deactivateWorker, getWorkers } from '../services/workerService';
import { useAuth } from '../store/AuthContext';
import { CasualLabourerDto } from '../types';

// ─── Tab toggle ───────────────────────────────────────────────────────────────

type Tab = 'workers' | 'casual';

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <View style={tabStyles.bar}>
      <TouchableOpacity
        style={[tabStyles.tab, active === 'workers' && tabStyles.tabActive]}
        onPress={() => onChange('workers')}
        activeOpacity={0.75}
      >
        <Feather name="users" size={14} color={active === 'workers' ? '#2d6a4f' : '#999'} />
        <Text style={[tabStyles.label, active === 'workers' && tabStyles.labelActive]}>Workers</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[tabStyles.tab, active === 'casual' && tabStyles.tabActive]}
        onPress={() => onChange('casual')}
        activeOpacity={0.75}
      >
        <Feather name="user-check" size={14} color={active === 'casual' ? '#2d6a4f' : '#999'} />
        <Text style={[tabStyles.label, active === 'casual' && tabStyles.labelActive]}>Casual</Text>
      </TouchableOpacity>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e8e8e8',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#2d6a4f' },
  label: { fontSize: 14, fontWeight: '600', color: '#999' },
  labelActive: { color: '#2d6a4f' },
});

// ─── Worker row ───────────────────────────────────────────────────────────────

function WorkerRow({ worker, onDelete }: { worker: WorkerDto; onDelete: (w: WorkerDto) => void }) {
  return (
    <View style={rowStyles.row}>
      <View style={rowStyles.avatar}>
        <Feather name="user" size={16} color="#2d6a4f" />
      </View>
      <Text style={rowStyles.name}>{worker.name}</Text>
      <TouchableOpacity style={rowStyles.deleteBtn} onPress={() => onDelete(worker)} hitSlop={8}>
        <Feather name="trash-2" size={18} color="#e53e3e" />
      </TouchableOpacity>
    </View>
  );
}

// ─── Casual labourer row ──────────────────────────────────────────────────────

function CasualRow({ labourer, onDelete }: { labourer: CasualLabourerDto; onDelete: (l: CasualLabourerDto) => void }) {
  const photoUri = labourer.photoBase64
    ? `data:${labourer.photoMimeType ?? 'image/jpeg'};base64,${labourer.photoBase64}`
    : null;

  return (
    <View style={rowStyles.row}>
      <View style={rowStyles.avatar}>
        {photoUri
          ? <Image source={{ uri: photoUri }} style={rowStyles.photo} />
          : <Feather name="user" size={16} color="#7c3aed" />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={rowStyles.name}>{labourer.name}</Text>
        {labourer.phone ? <Text style={rowStyles.sub}>{labourer.phone}</Text> : null}
      </View>
      <Text style={rowStyles.rate}>Ksh {labourer.defaultDailyRate}/day</Text>
      <TouchableOpacity style={rowStyles.deleteBtn} onPress={() => onDelete(labourer)} hitSlop={8}>
        <Feather name="trash-2" size={18} color="#e53e3e" />
      </TouchableOpacity>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e8e8e8',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f3e8ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  photo: { width: 36, height: 36, borderRadius: 18 },
  name: { fontSize: 15, color: '#1a1a1a', fontWeight: '500' },
  sub: { fontSize: 12, color: '#888', marginTop: 1 },
  rate: { fontSize: 13, color: '#2d6a4f', fontWeight: '600', marginRight: 12 },
  deleteBtn: { padding: 6 },
});

// ─── Add Worker modal ─────────────────────────────────────────────────────────

function AddWorkerModal({
  visible, onAdd, onCancel,
}: { visible: boolean; onAdd: (name: string) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try { await onAdd(trimmed); setName(''); } finally { setSaving(false); }
  }

  function handleCancel() { setName(''); onCancel(); }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.sheet} elevation={10}>
          <Text style={modalStyles.title}>Add Worker</Text>
          <TextInput
            style={modalStyles.input}
            placeholder="Full name"
            placeholderTextColor="#bbb"
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={100}
            returnKeyType="done"
            onSubmitEditing={handleAdd}
          />
          <View style={modalStyles.actions}>
            <TouchableOpacity style={modalStyles.cancelBtn} onPress={handleCancel}>
              <Text style={modalStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[modalStyles.addBtn, (!name.trim() || saving) && modalStyles.addBtnDisabled]}
              onPress={handleAdd}
              disabled={!name.trim() || saving}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={modalStyles.addText}>Add</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Add Casual Labourer modal ────────────────────────────────────────────────

function AddCasualLabourerModal({
  visible, onAdd, onCancel,
}: {
  visible: boolean;
  onAdd: (params: {
    name: string; phone: string | null; defaultDailyRate: number;
    photoBase64: string | null; photoMimeType: string | null;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName]     = useState('');
  const [phone, setPhone]   = useState('');
  const [rate, setRate]     = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoMimeType, setPhotoMimeType] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setName(''); setPhone(''); setRate('');
    setPhotoUri(null); setPhotoBase64(null); setPhotoMimeType(null);
  }

  async function pickPhoto(source: 'camera' | 'library') {
    let result: ImagePicker.ImagePickerResult;

    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission required', 'Camera access is needed to take a photo.'); return; }
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission required', 'Photo library access is needed.'); return; }
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });
    }

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPhotoUri(asset.uri);
      setPhotoBase64(asset.base64 ?? null);
      const mime = asset.mimeType ?? 'image/jpeg';
      setPhotoMimeType(mime);
    }
  }

  function showPhotoOptions() {
    Alert.alert('Add Photo', 'Choose a source', [
      { text: 'Take photo', onPress: () => pickPhoto('camera') },
      { text: 'Choose from library', onPress: () => pickPhoto('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function handleSave() {
    const trimmedName = name.trim();
    const parsedRate  = parseFloat(rate);
    if (!trimmedName || isNaN(parsedRate) || parsedRate <= 0) return;
    setSaving(true);
    try {
      await onAdd({
        name: trimmedName,
        phone: phone.trim() || null,
        defaultDailyRate: parsedRate,
        photoBase64,
        photoMimeType,
      });
      reset();
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() { reset(); onCancel(); }

  const canSave = name.trim().length > 0 && parseFloat(rate) > 0 && !saving;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleCancel}>
      <View style={casualModalStyles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={[casualModalStyles.sheet]} elevation={10}>
              <Text style={casualModalStyles.title}>New labourer</Text>
              <Text style={casualModalStyles.subtitle}>Add a worker with a default daily rate.</Text>

              {/* Photo picker */}
              <View style={casualModalStyles.photoRow}>
                <TouchableOpacity onPress={showPhotoOptions} activeOpacity={0.8} style={casualModalStyles.avatarWrap}>
                  {photoUri
                    ? <Image source={{ uri: photoUri }} style={casualModalStyles.avatar} />
                    : <Feather name="camera" size={28} color="#aaa" />}
                </TouchableOpacity>
                <TouchableOpacity style={casualModalStyles.photoBtn} onPress={showPhotoOptions} activeOpacity={0.8}>
                  <Feather name="camera" size={16} color="#555" />
                  <Text style={casualModalStyles.photoBtnText}>
                    {photoUri ? 'Change photo' : 'Take photo'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Name */}
              <Text style={casualModalStyles.label}>Name</Text>
              <TextInput
                style={casualModalStyles.input}
                placeholder="Samuel Kamau"
                placeholderTextColor="#bbb"
                value={name}
                onChangeText={setName}
                maxLength={100}
                autoFocus
              />

              {/* Phone */}
              <Text style={casualModalStyles.label}>Phone (optional)</Text>
              <TextInput
                style={casualModalStyles.input}
                placeholder=""
                placeholderTextColor="#bbb"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                maxLength={20}
              />

              {/* Daily rate */}
              <Text style={casualModalStyles.label}>Default daily rate</Text>
              <TextInput
                style={casualModalStyles.input}
                placeholder="130"
                placeholderTextColor="#bbb"
                value={rate}
                onChangeText={setRate}
                keyboardType="numeric"
                maxLength={8}
              />
              <Text style={casualModalStyles.hint}>You can override this on any day.</Text>

              {/* Actions */}
              <View style={casualModalStyles.actions}>
                <TouchableOpacity style={casualModalStyles.cancelBtn} onPress={handleCancel}>
                  <Text style={casualModalStyles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[casualModalStyles.saveBtn, !canSave && casualModalStyles.saveBtnDisabled]}
                  onPress={handleSave}
                  disabled={!canSave}
                >
                  {saving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={casualModalStyles.saveText}>Save</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const casualModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    zIndex: 10,
  },
  title:    { fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#888', marginBottom: 20 },

  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24 },
  avatarWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fafafa',
  },
  photoBtnText: { fontSize: 14, color: '#444', fontWeight: '500' },

  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1a1a1a',
    backgroundColor: '#fafafa',
    marginBottom: 16,
  },
  hint: { fontSize: 12, color: '#aaa', marginTop: -10, marginBottom: 24 },

  actions: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  cancelText: { fontSize: 15, color: '#555', fontWeight: '600' },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#c0392b',
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    zIndex: 10,
  },
  title: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1a1a1a',
    backgroundColor: '#fafafa',
    marginBottom: 20,
  },
  actions: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: '#ddd', alignItems: 'center',
  },
  cancelText: { fontSize: 15, color: '#555', fontWeight: '600' },
  addBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#2d6a4f', alignItems: 'center',
  },
  addBtnDisabled: { opacity: 0.5 },
  addText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function WorkersScreen() {
  const { user } = useAuth();
  const route = useRoute();
  const routeParams = route.params as { farmId?: number } | undefined;
  const farmId = routeParams?.farmId ?? user?.farmId!;

  const [activeTab, setActiveTab] = useState<Tab>('workers');

  const [workers,  setWorkers]  = useState<WorkerDto[]>([]);
  const [casuals,  setCasuals]  = useState<CasualLabourerDto[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showAddWorker,  setShowAddWorker]  = useState(false);
  const [showAddCasual,  setShowAddCasual]  = useState(false);

  const load = useCallback(async () => {
    if (!farmId) return;
    setIsLoaded(false);
    setLoadError(null);
    try {
      const [ws, cs] = await Promise.all([
        getWorkers(farmId),
        getCasualLabourers(farmId),
      ]);
      setWorkers(ws);
      setCasuals(cs);
    } catch (e: any) {
      setLoadError(e.message ?? 'Failed to load workers');
    } finally {
      setIsLoaded(true);
    }
  }, [farmId]);

  useEffect(() => { load(); }, [load]);

  const handleAddWorker = useCallback(async (name: string) => {
    if (!farmId) return;
    await addWorker(farmId, name);
    setShowAddWorker(false);
    await load();
  }, [farmId, load]);

  const handleDeleteWorker = useCallback((worker: WorkerDto) => {
    Alert.alert(
      'Remove Worker',
      `Remove ${worker.name} from this farm? Their historical data will be preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            try { await deactivateWorker(farmId, worker.id); await load(); }
            catch { Alert.alert('Error', 'Failed to remove worker. Please try again.'); }
          },
        },
      ],
    );
  }, [farmId, load]);

  const handleAddCasual = useCallback(async (params: {
    name: string; phone: string | null; defaultDailyRate: number;
    photoBase64: string | null; photoMimeType: string | null;
  }) => {
    if (!farmId) return;
    await addCasualLabourer(farmId, params);
    setShowAddCasual(false);
    await load();
  }, [farmId, load]);

  const handleDeleteCasual = useCallback((labourer: CasualLabourerDto) => {
    Alert.alert(
      'Remove Casual Labourer',
      `Remove ${labourer.name}? Their attendance history will be preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            try { await deactivateCasualLabourer(farmId, labourer.id); await load(); }
            catch { Alert.alert('Error', 'Failed to remove labourer. Please try again.'); }
          },
        },
      ],
    );
  }, [farmId, load]);

  const isEmpty = activeTab === 'workers' ? workers.length === 0 : casuals.length === 0;

  return (
    <View style={styles.container}>
      <TabBar active={activeTab} onChange={setActiveTab} />

      {loadError ? (
        <View style={styles.centered}>
          <Feather name="alert-triangle" size={32} color="#e53e3e" />
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : !isLoaded ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2d6a4f" />
        </View>
      ) : activeTab === 'workers' ? (
        <FlatList
          data={workers}
          keyExtractor={(w) => String(w.id)}
          renderItem={({ item }) => <WorkerRow worker={item} onDelete={handleDeleteWorker} />}
          ListEmptyComponent={<EmptyState icon="users" text="No workers yet" hint="Tap + to add the first worker" />}
          contentContainerStyle={workers.length === 0 ? styles.emptyContainer : undefined}
        />
      ) : (
        <FlatList
          data={casuals}
          keyExtractor={(l) => String(l.id)}
          renderItem={({ item }) => <CasualRow labourer={item} onDelete={handleDeleteCasual} />}
          ListEmptyComponent={<EmptyState icon="user-check" text="No casual labourers yet" hint="Tap + to add the first one" />}
          contentContainerStyle={casuals.length === 0 ? styles.emptyContainer : undefined}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => activeTab === 'workers' ? setShowAddWorker(true) : setShowAddCasual(true)}
        activeOpacity={0.85}
      >
        <Feather name="plus" size={28} color="#fff" />
      </TouchableOpacity>

      <AddWorkerModal
        visible={showAddWorker}
        onAdd={handleAddWorker}
        onCancel={() => setShowAddWorker(false)}
      />
      <AddCasualLabourerModal
        visible={showAddCasual}
        onAdd={handleAddCasual}
        onCancel={() => setShowAddCasual(false)}
      />
    </View>
  );
}

function EmptyState({ icon, text, hint }: { icon: keyof typeof Feather.glyphMap; text: string; hint: string }) {
  return (
    <View style={styles.empty}>
      <Feather name={icon} size={44} color="#ccc" />
      <Text style={styles.emptyText}>{text}</Text>
      <Text style={styles.emptyHint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#f5f7f9' },
  centered:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText:      { marginTop: 12, color: '#e53e3e', textAlign: 'center', fontSize: 14 },
  retryBtn:       { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#2d6a4f', borderRadius: 8 },
  retryText:      { color: '#fff', fontWeight: '600', fontSize: 14 },
  empty:          { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 64 },
  emptyText:      { fontSize: 16, fontWeight: '600', color: '#aaa', marginTop: 14 },
  emptyHint:      { fontSize: 13, color: '#bbb', marginTop: 4 },
  emptyContainer: { flex: 1 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#2d6a4f',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
});
