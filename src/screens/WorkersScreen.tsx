import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { WorkerDto, addWorker, deactivateWorker, getWorkers } from '../services/workerService';
import { useAuth } from '../store/AuthContext';

// ─── Worker row ───────────────────────────────────────────────────────────────

interface RowProps {
  worker: WorkerDto;
  onDelete: (worker: WorkerDto) => void;
}

function WorkerRow({ worker, onDelete }: RowProps) {
  return (
    <View style={rowStyles.row}>
      <View style={rowStyles.avatar}>
        <Feather name="user" size={16} color="#2d6a4f" />
      </View>
      <Text style={rowStyles.name}>{worker.name}</Text>
      <TouchableOpacity
        style={rowStyles.deleteBtn}
        onPress={() => onDelete(worker)}
        hitSlop={8}
      >
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e8f5ef',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  name: { flex: 1, fontSize: 15, color: '#1a1a1a' },
  deleteBtn: { padding: 6 },
});

// ─── Add Worker modal ─────────────────────────────────────────────────────────

interface AddModalProps {
  visible: boolean;
  onAdd: (name: string) => Promise<void>;
  onCancel: () => void;
}

function AddWorkerModal({ visible, onAdd, onCancel }: AddModalProps) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onAdd(trimmed);
      setName('');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setName('');
    onCancel();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.sheet}>
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
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  cancelText: { fontSize: 15, color: '#555', fontWeight: '600' },
  addBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#2d6a4f',
    alignItems: 'center',
  },
  addBtnDisabled: { opacity: 0.5 },
  addText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function WorkersScreen() {
  const { user } = useAuth();

  const [workers,    setWorkers]    = useState<WorkerDto[]>([]);
  const [isLoaded,   setIsLoaded]   = useState(false);
  const [loadError,  setLoadError]  = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setIsLoaded(false);
    setLoadError(null);
    try {
      const ws = await getWorkers(user.farmId);
      setWorkers(ws);
    } catch (e: any) {
      setLoadError(e.message ?? 'Failed to load workers');
    } finally {
      setIsLoaded(true);
    }
  }, [user?.farmId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = useCallback(async (name: string) => {
    if (!user) return;
    await addWorker(user.farmId, name);
    setModalVisible(false);
    await load();
  }, [user?.farmId, load]);

  const handleDelete = useCallback((worker: WorkerDto) => {
    Alert.alert(
      'Remove Worker',
      `Remove ${worker.name} from this farm? Their historical data will be preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            try {
              await deactivateWorker(user.farmId, worker.id);
              await load();
            } catch {
              Alert.alert('Error', 'Failed to remove worker. Please try again.');
            }
          },
        },
      ],
    );
  }, [user?.farmId, load]);

  const renderItem = useCallback(
    ({ item }: { item: WorkerDto }) => (
      <WorkerRow worker={item} onDelete={handleDelete} />
    ),
    [handleDelete],
  );

  return (
    <View style={styles.container}>
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
      ) : (
        <FlatList
          data={workers}
          renderItem={renderItem}
          keyExtractor={(w) => String(w.id)}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="users" size={44} color="#ccc" />
              <Text style={styles.emptyText}>No workers yet</Text>
              <Text style={styles.emptyHint}>Tap + to add the first worker</Text>
            </View>
          }
          contentContainerStyle={workers.length === 0 ? styles.emptyContainer : undefined}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)} activeOpacity={0.85}>
        <Feather name="plus" size={28} color="#fff" />
      </TouchableOpacity>

      <AddWorkerModal
        visible={modalVisible}
        onAdd={handleAdd}
        onCancel={() => setModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f9' },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { marginTop: 12, color: '#e53e3e', textAlign: 'center', fontSize: 14 },
  retryBtn:  { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#2d6a4f', borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  empty:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 64 },
  emptyText:   { fontSize: 16, fontWeight: '600', color: '#aaa', marginTop: 14 },
  emptyHint:   { fontSize: 13, color: '#bbb', marginTop: 4 },
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
