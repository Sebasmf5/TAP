import { useCallback, useEffect, useState } from 'react';
import { ApiClientError, apiRequest } from '../api/http-client.ts';
import {
  enqueueOfflineAttendance,
  isLikelyNetworkError,
  listOfflineAttendance,
  syncOfflineAttendanceQueue,
  type OfflineAttendanceItem,
  type OfflineAttendanceKind,
  type OfflineSyncSummary,
} from './attendance-queue.ts';

export function useOfflineAttendance(options?: {
  onSynced?: (summary: OfflineSyncSummary) => void;
}) {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [pendingItems, setPendingItems] = useState<OfflineAttendanceItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncSummary, setLastSyncSummary] = useState<OfflineSyncSummary | null>(null);

  const refreshQueue = useCallback(async () => {
    const list = await listOfflineAttendance();
    setPendingItems(list);
  }, []);

  const syncNow = useCallback(async (): Promise<OfflineSyncSummary | null> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return null;
    }
    setSyncing(true);
    try {
      const summary = await syncOfflineAttendanceQueue(async (item) => {
        try {
          await apiRequest(item.endpoint, {
            method: 'POST',
            skipAuthRefresh: item.kind === 'public_checkin',
            body: item.payload,
          });
          return { status: 'ok' };
        } catch (err) {
          if (err instanceof ApiClientError) {
            // 409 (ya registrado) se considera sincronizado; otros 4xx se descartan para no atascar la cola
            return err.status === 409 ? { status: 'ok' } : { status: 'discard' };
          }
          if (isLikelyNetworkError(err)) {
            return { status: 'retry' };
          }
          return { status: 'retry' };
        }
      });
      setLastSyncSummary(summary);
      await refreshQueue();
      if (summary.syncedCount > 0) {
        options?.onSynced?.(summary);
      }
      return summary;
    } finally {
      setSyncing(false);
    }
  }, [options, refreshQueue]);

  useEffect(() => {
    let active = true;
    void listOfflineAttendance().then((list) => {
      if (active) setPendingItems(list);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void syncNow();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncNow]);

  const queueAttendance = useCallback(
    async (params: {
      kind: OfflineAttendanceKind;
      endpoint: string;
      payload: Record<string, unknown>;
      maskedLabel: string;
    }) => {
      const item = await enqueueOfflineAttendance(params);
      await refreshQueue();
      return item;
    },
    [refreshQueue],
  );

  return {
    isOnline,
    pendingItems,
    pendingCount: pendingItems.length,
    syncing,
    lastSyncSummary,
    queueAttendance,
    syncNow,
    refreshQueue,
  };
}
