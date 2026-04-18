import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  getSyncStatus,
  subscribeSyncStatus,
  SyncStatus,
  syncAllPending,
} from '../services/syncService';

interface SyncContextValue {
  syncStatus: SyncStatus;
  triggerSync: () => void;
}

const SyncContext = createContext<SyncContextValue>({
  syncStatus: 'idle',
  triggerSync: () => {},
});

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(getSyncStatus());

  useEffect(() => {
    return subscribeSyncStatus(setSyncStatus);
  }, []);

  function triggerSync() {
    syncAllPending().catch(() => {});
  }

  return (
    <SyncContext.Provider value={{ syncStatus, triggerSync }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSyncStatus(): SyncStatus {
  return useContext(SyncContext).syncStatus;
}

export function useTriggerSync(): () => void {
  return useContext(SyncContext).triggerSync;
}
