import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { syncAllPending } from '../../services/syncService';
import { useSyncStatus } from '../../store/SyncContext';

export default function SyncStatusBadge() {
  const status = useSyncStatus();

  if (status === 'idle') return null;

  if (status === 'syncing') {
    return <ActivityIndicator size="small" color="#d97706" style={styles.badge} />;
  }

  // error — tap to retry
  return (
    <TouchableOpacity
      onPress={() => syncAllPending().catch(() => {})}
      style={styles.badge}
      hitSlop={8}
    >
      <Feather name="wifi-off" size={18} color="#e53e3e" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  badge: { marginRight: 8 },
});
