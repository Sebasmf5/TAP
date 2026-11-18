import type { PublicCheckinEventInfo } from '@tap/contracts';

export type OfflineAttendanceKind = 'kiosk_scan' | 'staff_manual' | 'public_checkin';

export interface OfflineAttendanceItem {
  readonly id: string;
  readonly kind: OfflineAttendanceKind;
  readonly endpoint: string;
  readonly payload: Record<string, unknown>;
  readonly maskedLabel: string;
  readonly queuedAt: string;
}

const DB_NAME = 'tap_offline_db';
const DB_VERSION = 1;
const QUEUE_STORE = 'pending_attendance';
const EVENT_CACHE_STORE = 'public_event_cache';

const memoryFallbackQueue: OfflineAttendanceItem[] = [];
const memoryEventCache = new Map<string, PublicCheckinEventInfo>();

function openOfflineDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(EVENT_CACHE_STORE)) {
          db.createObjectStore(EVENT_CACHE_STORE, { keyPath: 'code' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function isLikelyNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }
  if (error instanceof TypeError) {
    return true;
  }
  if (error instanceof Error && /network|failed to fetch|load failed/i.test(error.message)) {
    return true;
  }
  return false;
}

export function maskIdentifierForQueue(raw: string): string {
  const clean = raw.trim();
  if (clean.length <= 4) return `•••${clean}`;
  return `•••${clean.slice(-4)}`;
}

export async function enqueueOfflineAttendance(
  input: Omit<OfflineAttendanceItem, 'id' | 'queuedAt'>,
): Promise<OfflineAttendanceItem> {
  const item: OfflineAttendanceItem = {
    ...input,
    id: crypto.randomUUID(),
    queuedAt: new Date().toISOString(),
  };

  const db = await openOfflineDb();
  if (!db) {
    memoryFallbackQueue.push(item);
    return item;
  }

  return new Promise((resolve) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).put(item);
    tx.oncomplete = () => {
      db.close();
      resolve(item);
    };
    tx.onerror = () => {
      db.close();
      memoryFallbackQueue.push(item);
      resolve(item);
    };
  });
}

export async function listOfflineAttendance(): Promise<OfflineAttendanceItem[]> {
  const db = await openOfflineDb();
  if (!db) {
    return [...memoryFallbackQueue];
  }

  return new Promise((resolve) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const req = tx.objectStore(QUEUE_STORE).getAll();
    req.onsuccess = () => {
      db.close();
      const rows = (req.result as OfflineAttendanceItem[] | undefined) ?? [];
      rows.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
      resolve(rows);
    };
    req.onerror = () => {
      db.close();
      resolve([...memoryFallbackQueue]);
    };
  });
}

export async function removeOfflineAttendance(id: string): Promise<void> {
  const idx = memoryFallbackQueue.findIndex((item) => item.id === id);
  if (idx >= 0) {
    memoryFallbackQueue.splice(idx, 1);
  }

  const db = await openOfflineDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      resolve();
    };
  });
}

export interface OfflineSyncSummary {
  readonly syncedCount: number;
  readonly failedNetworkCount: number;
  readonly discardedInvalidCount: number;
  readonly remainingCount: number;
}

export async function syncOfflineAttendanceQueue(
  sendFn: (item: OfflineAttendanceItem) => Promise<{ status: 'ok' | 'discard' | 'retry' }>,
): Promise<OfflineSyncSummary> {
  const items = await listOfflineAttendance();
  let syncedCount = 0;
  let failedNetworkCount = 0;
  let discardedInvalidCount = 0;

  for (const item of items) {
    const outcome = await sendFn(item);
    if (outcome.status === 'ok') {
      await removeOfflineAttendance(item.id);
      syncedCount += 1;
    } else if (outcome.status === 'discard') {
      await removeOfflineAttendance(item.id);
      discardedInvalidCount += 1;
    } else {
      failedNetworkCount += 1;
    }
  }

  const remaining = await listOfflineAttendance();
  return {
    syncedCount,
    failedNetworkCount,
    discardedInvalidCount,
    remainingCount: remaining.length,
  };
}

export async function cachePublicEventInfo(
  code: string,
  info: PublicCheckinEventInfo,
): Promise<void> {
  const key = code.trim().toUpperCase();
  memoryEventCache.set(key, info);

  const db = await openOfflineDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    const tx = db.transaction(EVENT_CACHE_STORE, 'readwrite');
    tx.objectStore(EVENT_CACHE_STORE).put({ code: key, info });
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      resolve();
    };
  });
}

export async function getCachedPublicEventInfo(
  code: string,
): Promise<PublicCheckinEventInfo | null> {
  const key = code.trim().toUpperCase();
  const db = await openOfflineDb();
  if (!db) {
    return memoryEventCache.get(key) ?? null;
  }

  return new Promise((resolve) => {
    const tx = db.transaction(EVENT_CACHE_STORE, 'readonly');
    const req = tx.objectStore(EVENT_CACHE_STORE).get(key);
    req.onsuccess = () => {
      db.close();
      const row = req.result as { code: string; info: PublicCheckinEventInfo } | undefined;
      resolve(row?.info ?? memoryEventCache.get(key) ?? null);
    };
    req.onerror = () => {
      db.close();
      resolve(memoryEventCache.get(key) ?? null);
    };
  });
}
