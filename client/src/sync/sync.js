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
    syncAll().catch(() => {});
  }, delay);
}

/**
 * Pulls all records from MongoDB Atlas down into client IndexedDB.
 * Does not overwrite un-synced local records (synced = 0).
 */
export async function pullSync() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { offline: true };
  }

  try {
    const res = await fetch('/api/sync/pull');
    if (!res.ok) return { success: false };

    const data = await res.json();
    if (!data.success) return { success: false };

    const { players = [], matches = [], events = [] } = data;
    let newItemsCount = 0;

    await db.transaction('rw', [db.players, db.matches, db.events], async () => {
      // Ingest players
      for (const p of players) {
        const local = await db.players.get(p._id);
        if (!local) {
          await db.players.put(p);
          newItemsCount++;
        } else if (local.synced === 1) {
          await db.players.put(p);
        }
      }

      // Ingest matches
      for (const m of matches) {
        const local = await db.matches.get(m._id);
        if (!local) {
          await db.matches.put(m);
          newItemsCount++;
        } else if (local.synced === 1) {
          await db.matches.put(m);
        }
      }

      // Ingest events
      for (const e of events) {
        const local = await db.events.get(e._id);
        if (!local) {
          await db.events.put(e);
          newItemsCount++;
        } else if (local.synced === 1) {
          await db.events.put(e);
        }
      }
    });

    const remaining = await getUnsyncedCounts();
    notifyListeners({
      isSyncing: false,
      lastSyncedAt: new Date().toISOString(),
      unsyncedCount: remaining.total,
      pulledNewCount: newItemsCount
    });

    return {
      success: true,
      counts: {
        players: players.length,
        matches: matches.length,
        events: events.length
      },
      newItemsCount
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Full sync: pushes local unsynced changes to server, then pulls cloud data.
 */
export async function syncAll() {
  await pushSync().catch(() => {});
  return await pullSync().catch(() => ({}));
}

/**
 * Initializes automatic background synchronization:
 * - Syncs on network reconnection (online event)
 * - Syncs when app tab returns to foreground
 * - Syncs periodically every 25 seconds
 * - Invokes onDataPulled callback when new cloud data arrives
 */
export function initBackgroundSync(onDataPulled) {
  if (typeof window === 'undefined') return () => {};

  const runFullSync = async () => {
    await pushSync().catch(() => {});
    const pullRes = await pullSync().catch(() => {});
    if (pullRes?.newItemsCount > 0 && typeof onDataPulled === 'function') {
      onDataPulled();
    }
  };

  const handleOnline = () => {
    runFullSync();
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      runFullSync();
    }
  };

  window.addEventListener('online', handleOnline);
  document.addEventListener('visibilitychange', handleVisibility);

  // Periodic background push & pull timer
  const interval = setInterval(() => {
    runFullSync();
  }, 25000);

  // Initial immediate full sync
  runFullSync();

  return () => {
    window.removeEventListener('online', handleOnline);
    document.removeEventListener('visibilitychange', handleVisibility);
    clearInterval(interval);
  };
}
