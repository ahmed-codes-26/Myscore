import express from 'express';
import { Player } from '../models/Player.js';
import { Match } from '../models/Match.js';
import { Event } from '../models/Event.js';
import { isDBConnected } from '../db.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

const router = express.Router();

/**
 * POST /api/sync/push
 * Ingests a batch of players, matches, and events from IndexedDB.
 * Applies upserts so repeated pushes are safe and idempotent.
 * Converts client 0/1 integers to Mongoose Booleans.
 */
router.post('/push', requireAdmin, async (req, res) => {
  if (!isDBConnected()) {
    return res.status(503).json({
      error: 'Database unavailable. Server is running without MongoDB Atlas connection.',
      db: 'disconnected'
    });
  }

  const { players = [], matches = [], events = [] } = req.body;
  const now = new Date();

  const results = {
    playersSynced: 0,
    matchesSynced: 0,
    eventsSynced: 0
  };

  try {
    // 1. Sync Players
    if (Array.isArray(players) && players.length > 0) {
      const playerOps = players.map(p => ({
        updateOne: {
          filter: { _id: p._id },
          update: {
            $set: {
              name: p.name,
              role: p.role || '',
              isGuest: Boolean(p.isGuest === 1 || p.isGuest === true),
              syncedAt: now
            },
            $setOnInsert: {
              createdAt: p.createdAt ? new Date(p.createdAt) : now
            }
          },
          upsert: true
        }
      }));
      const pRes = await Player.bulkWrite(playerOps, { ordered: false });
      results.playersSynced = (pRes.upsertedCount || 0) + (pRes.modifiedCount || 0) + (pRes.matchedCount || 0);
    }

    // 2. Sync Matches
    if (Array.isArray(matches) && matches.length > 0) {
      const matchOps = matches.map(m => ({
        updateOne: {
          filter: { _id: m._id },
          update: {
            $set: {
              team1: m.team1,
              team2: m.team2,
              rules: m.rules,
              battingFirstTeamKey: m.battingFirstTeamKey,
              status: m.status,
              openers: m.openers || {},
              result: m.result || null,
              syncedAt: now
            },
            $setOnInsert: {
              createdAt: m.createdAt ? new Date(m.createdAt) : now
            }
          },
          upsert: true
        }
      }));
      const mRes = await Match.bulkWrite(matchOps, { ordered: false });
      results.matchesSynced = (mRes.upsertedCount || 0) + (mRes.modifiedCount || 0) + (mRes.matchedCount || 0);
    }

    // 3. Sync Events
    if (Array.isArray(events) && events.length > 0) {
      const eventOps = events.map(e => ({
        updateOne: {
          filter: { _id: e._id },
          update: {
            $set: {
              matchId: e.matchId,
              innings: e.innings,
              sequence: e.sequence,
              type: e.type,
              isDeleted: Boolean(e.isDeleted === 1 || e.isDeleted === true),
              isLegal: e.isLegal,
              ballInOver: e.ballInOver,
              runsOffBat: e.runsOffBat ?? 0,
              extraType: e.extraType ?? null,
              extraRuns: e.extraRuns ?? 0,
              strikerId: e.strikerId ?? null,
              nonStrikerId: e.nonStrikerId ?? null,
              bowlerId: e.bowlerId ?? null,
              wicket: e.wicket ?? null,
              declaringBatsmanId: e.declaringBatsmanId ?? null,
              replacementBatsmanId: e.replacementBatsmanId ?? null,
              timestamp: e.timestamp ? new Date(e.timestamp) : now,
              syncedAt: now
            }
          },
          upsert: true
        }
      }));
      const eRes = await Event.bulkWrite(eventOps, { ordered: false });
      results.eventsSynced = (eRes.upsertedCount || 0) + (eRes.modifiedCount || 0) + (eRes.matchedCount || 0);
    }

    return res.json({
      success: true,
      syncedAt: now.toISOString(),
      counts: results
    });
  } catch (err) {
    console.error('[Sync Error]', err);
    return res.status(500).json({
      error: 'Sync push failed',
      details: err.message
    });
  }
});

export default router;
