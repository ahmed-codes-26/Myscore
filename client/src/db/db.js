import Dexie from 'dexie';

export const db = new Dexie('CricketScorerDB');

// Version 1 schema
// Important: Never index booleans in Dexie. Use 0/1 integers for indexed flags!
db.version(1).stores({
  players: '_id, name, isGuest, updatedAt, synced',
  matches: '_id, status, updatedAt, synced',
  events:  '_id, matchId, innings, sequence, isDeleted, synced'
});
