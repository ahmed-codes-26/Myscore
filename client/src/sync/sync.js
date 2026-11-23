import { db } from '../db/db.js';

let isSyncing = false;
let syncListeners = new Set();
let failureCount = 0;

/**
 * Subscribe to sync state changes.
 * Callback receives { isSyncing, lastSyncedAt, error, unsyncedCount }
 */
export function subscribeSyncStatus(callback) {
  syncListeners.add(callback);
  return () => syncListeners.delete(callback);
}

function notifyListeners(status) {
  syncListeners.forEach(fn => {
    try {
      fn(status);
    } catch (e) {
      console.error(e);
    }
  });
}

/**
 * Counts all records currently waiting to be synced to the server.
 */
export async function getUnsyncedCounts() {
  try {
    const [players, matches, events] = await Promise.all([
      db.players.where('synced').equals(0).count(),
      db.matches.where('synced').equals(0).count(),
      db.events.where('synced').equals(0).count()
    ]);
    return {
      players,
      matches,
      events,
      total: players + matches + events
    };
  } catch (err) {
    return { players: 0, matches: 0, events: 0, total: 0 };
  }
}

/**
 * Pushes unsynced IndexedDB records to the Express backend.
 * One-way sync: phone -> server.
 * Soft-deleted events are pushed with isDeleted: 1 so the server marks them deleted.
 */
export async function pushSync() {
  if (isSyncing) return { inProgress: true };

  // Check network status
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { offline: true };
  }

  isSyncing = true;
  notifyListeners({ isSyncing: true });

  try {
    // 1. Gather unsynced records
    const [unsyncedPlayers, unsyncedMatches, unsyncedEvents] = await Promise.all([
      db.players.where('synced').equals(0).toArray(),
      db.matches.where('synced').equals(0).toArray(),
      db.events.where('synced').equals(0).toArray()
    ]);

    const totalToSync = unsyncedPlayers.length + unsyncedMatches.length + unsyncedEvents.length;

    if (totalToSync === 0) {
      failureCount = 0;
      isSyncing = false;
      notifyListeners({ isSyncing: false, unsyncedCount: 0 });
      return { success: true, count: 0 };
    }

    // 2. Post to /api/sync/push
    const response = await fetch('/api/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        players: unsyncedPlayers,
        matches: unsyncedMatches,
        events: unsyncedEvents
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Server responded with ${response.status}`);
    }

    const data = await response.json();

    // 3. Mark pushed records as synced = 1 in IndexedDB
    const playerIds = unsyncedPlayers.map(p => p._id);
    const matchIds = unsyncedMatches.map(m => m._id);
    const eventIds = unsyncedEvents.map(e => e._id);

    await db.transaction('rw', [db.players, db.matches, db.events], async () => {
      if (playerIds.length > 0) {
        await db.players.where('_id').anyOf(playerIds).modify({ synced: 1 });
      }
      if (matchIds.length > 0) {
        await db.matches.where('_id').anyOf(matchIds).modify({ synced: 1 });
      }
      if (eventIds.length > 0) {
        await db.events.where('_id').anyOf(eventIds).modify({ synced: 1 });
      }
    });

    failureCount = 0;
    const remaining = await getUnsyncedCounts();

    notifyListeners({
      isSyncing: false,
      lastSyncedAt: new Date().toISOString(),
      unsyncedCount: remaining.total,
      syncedCounts: data.counts
    });

    return {
      success: true,
      count: totalToSync,
      counts: data.counts
    };
  } catch (err) {
    failureCount++;
    notifyListeners({
      isSyncing: false,
      error: err.message
    });
    // Return quiet failure; app continues working offline without interruption
    return { success: false, error: err.message };
  } finally {
    isSyncing = false;
  }
}

/**
 * Triggers a sync attempt with debounce.
 */
let debounceTimer = null;
export function triggerSync(delay = 1000) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    pushSync().catch(() => {});
  }, delay);
}

/**
 * Initializes automatic background synchronization:
 * - Syncs on network reconnection (online event)
 * - Syncs when app tab returns to foreground
 * - Syncs periodically every 25 seconds
 */
export function initBackgroundSync() {
  if (typeof window === 'undefined') return () => {};

  const handleOnline = () => {
    pushSync().catch(() => {});
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      pushSync().catch(() => {});
    }
  };

  window.addEventListener('online', handleOnline);
  document.addEventListener('visibilitychange', handleVisibility);

  // Periodic background push timer
  const interval = setInterval(() => {
    pushSync().catch(() => {});
  }, 25000);

  // Initial push
  pushSync().catch(() => {});

  return () => {
    window.removeEventListener('online', handleOnline);
    document.removeEventListener('visibilitychange', handleVisibility);
    clearInterval(interval);
  };
}
