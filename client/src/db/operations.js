import { db } from './db.js';
import { generateUUID, levenshteinDistance } from '../utils/helpers.js';
import { computeInningsState } from '../engine/engine.js';
import { triggerSync } from '../sync/sync.js';

// --- Player Operations ---

export async function getAllPlayers() {
  const players = await db.players.toArray();
  return players.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

/**
 * Checks for duplicate or similar player names
 */
export async function checkPlayerNameConflict(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return { error: 'Name cannot be empty' };

  const all = await db.players.toArray();
  const lower = trimmed.toLowerCase();

  // Exact duplicate check
  const exact = all.find(p => p.name.trim().toLowerCase() === lower);
  if (exact) {
    return { error: `Player "${exact.name}" already exists.` };
  }

  // Similar names check (Levenshtein distance <= 2)
  const similar = all.filter(p => levenshteinDistance(p.name, trimmed) <= 2);
  if (similar.length > 0) {
    return {
      warning: `Similar player name found: "${similar[0].name}". Do you still want to add this player?`,
      similarPlayer: similar[0]
    };
  }

  return { success: true };
}

export async function addPlayer({ name, role = '', isGuest = 0 }) {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    throw new Error('Player name cannot be empty');
  }

  const conflict = await checkPlayerNameConflict(trimmed);
  if (conflict.error) {
    throw new Error(conflict.error);
  }

  const now = new Date().toISOString();
  const player = {
    _id: generateUUID(),
    name: trimmed,
    role: (role || '').trim(),
    isGuest: isGuest ? 1 : 0,
    createdAt: now,
    updatedAt: now,
    synced: 0
  };

  await db.players.add(player);
  triggerSync();
  return player;
}

export async function quickAddGuest(name) {
  return addPlayer({ name, isGuest: 1 });
}

export async function makePlayerPermanent(playerId) {
  const now = new Date().toISOString();
  await db.players.update(playerId, {
    isGuest: 0,
    updatedAt: now,
    synced: 0
  });
  triggerSync();
}

/**
 * Calculates complete career statistics and match logs for a player.
 */
export async function getPlayerCareerStats(playerId) {
  const allMatches = await db.matches.toArray();
  const playerMatches = allMatches.filter(m =>
    m.team1?.playerIds?.includes(playerId) || m.team2?.playerIds?.includes(playerId)
  );

  const batting = {
    innings: 0,
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    highestScore: 0,
    timesOut: 0,
    strikeRate: '0.00',
    average: '0.00'
  };

  const bowling = {
    innings: 0,
    legalBalls: 0,
    oversText: '0.0',
    runs: 0,
    wickets: 0,
    maidens: 0,
    economy: '0.00',
    average: '0.00',
    bestFigures: '0/0'
  };

  const matchLogs = [];

  for (const match of playerMatches) {
    const isTeam1 = match.team1?.playerIds?.includes(playerId);
    const playerTeam = isTeam1 ? match.team1 : match.team2;
    const opponentTeam = isTeam1 ? match.team2 : match.team1;

    const team1BatsFirst = match.battingFirstTeamKey === 'team1';
    const inn1Batting = team1BatsFirst ? match.team1.playerIds : match.team2.playerIds;
    const inn1Bowling = team1BatsFirst ? match.team2.playerIds : match.team1.playerIds;

    const allEvents = await db.events
      .where('matchId')
      .equals(match._id)
      .and(e => e.isDeleted === 0)
      .toArray();

    const inn1Events = allEvents.filter(e => e.innings === 1).sort((a, b) => a.sequence - b.sequence);
    const inn2Events = allEvents.filter(e => e.innings === 2).sort((a, b) => a.sequence - b.sequence);

    const state1 = computeInningsState(match.rules, inn1Events, inn1Batting, inn1Bowling);
    const state2 = (inn2Events.length > 0 || match.status === 'completed' || match.status === 'innings2')
      ? computeInningsState(match.rules, inn2Events, inn1Bowling, inn1Batting, { target: state1.runs + 1 })
      : null;

    let matchBatting = { batted: false, runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false, dismissal: null };
    let matchBowling = { bowled: false, oversText: '0.0', legalBalls: 0, runs: 0, wickets: 0, maidens: 0, economy: '0.00' };

    const checkState = (st, isPlayerTeamBatting) => {
      if (!st) return;
      if (isPlayerTeamBatting) {
        const bStat = st.batsmanStats.get(playerId);
        if (bStat && (bStat.balls > 0 || bStat.runs > 0 || bStat.isOut)) {
          matchBatting = {
            batted: true,
            runs: bStat.runs,
            balls: bStat.balls,
            fours: bStat.fours,
            sixes: bStat.sixes,
            isOut: bStat.isOut,
            dismissal: bStat.dismissal
          };
        }
      } else {
        const bwStat = st.bowlerStats.get(playerId);
        if (bwStat && (bwStat.legalBalls > 0 || bwStat.runs > 0)) {
          matchBowling = {
            bowled: true,
            oversText: bwStat.oversText,
            legalBalls: bwStat.legalBalls,
            runs: bwStat.runs,
            wickets: bwStat.wickets,
            maidens: bwStat.maidens,
            economy: bwStat.economy
          };
        }
      }
    };

    const playerBatsFirst = (isTeam1 && team1BatsFirst) || (!isTeam1 && !team1BatsFirst);
    checkState(state1, playerBatsFirst);
    checkState(state2, !playerBatsFirst);

    if (matchBatting.batted) {
      batting.innings += 1;
      batting.runs += matchBatting.runs;
      batting.balls += matchBatting.balls;
      batting.fours += matchBatting.fours;
      batting.sixes += matchBatting.sixes;
      if (matchBatting.runs > batting.highestScore) {
        batting.highestScore = matchBatting.runs;
      }
      if (matchBatting.isOut) {
        batting.timesOut += 1;
      }
    }

    if (matchBowling.bowled) {
      bowling.innings += 1;
      bowling.legalBalls += matchBowling.legalBalls;
      bowling.runs += matchBowling.runs;
      bowling.wickets += matchBowling.wickets;
      bowling.maidens += matchBowling.maidens;

      const [bestW, bestR] = (bowling.bestFigures || '0/999').split('/').map(Number);
      if (
        matchBowling.wickets > bestW ||
        (matchBowling.wickets === bestW && matchBowling.runs < bestR && matchBowling.legalBalls > 0)
      ) {
        bowling.bestFigures = `${matchBowling.wickets}/${matchBowling.runs}`;
      }
    }

    matchLogs.push({
      matchId: match._id,
      date: match.createdAt,
      matchTitle: `${match.team1.name} vs ${match.team2.name}`,
      playerTeam: playerTeam.name,
      opponent: opponentTeam.name,
      status: match.status,
      result: match.result?.summary || match.status,
      batting: matchBatting,
      bowling: matchBowling
    });
  }

  // Calculate Batting averages & strike rate
  if (batting.balls > 0) {
    batting.strikeRate = ((batting.runs / batting.balls) * 100).toFixed(1);
  }
  if (batting.timesOut > 0) {
    batting.average = (batting.runs / batting.timesOut).toFixed(1);
  } else if (batting.runs > 0) {
    batting.average = batting.runs.toFixed(1);
  }

  // Calculate Bowling economy & averages
  if (bowling.legalBalls > 0) {
    const totalOvers = Math.floor(bowling.legalBalls / 6);
    const remBalls = bowling.legalBalls % 6;
    bowling.oversText = `${totalOvers}.${remBalls}`;
    bowling.economy = ((bowling.runs / bowling.legalBalls) * 6).toFixed(2);
  }
  if (bowling.wickets > 0) {
    bowling.average = (bowling.runs / bowling.wickets).toFixed(1);
  }

  const chronologicalLogs = [...matchLogs].sort((a, b) => new Date(a.date) - new Date(b.date));
  const recentLogs = [...matchLogs].sort((a, b) => new Date(b.date) - new Date(a.date));

  return {
    totalMatches: playerMatches.length,
    batting,
    bowling,
    matchLogs: recentLogs,
    chronologicalLogs
  };
}

// --- Match Operations ---

export async function createMatch(matchData) {
  const now = new Date().toISOString();
  const match = {
    _id: generateUUID(),
    team1: matchData.team1,
    team2: matchData.team2,
    rules: matchData.rules,
    battingFirstTeamKey: matchData.battingFirstTeamKey || 'team1',
    status: 'innings1',
    result: null,
    createdAt: now,
    updatedAt: now,
    synced: 0
  };

  await db.matches.add(match);
  triggerSync();
  return match;
}

export async function getMatch(matchId) {
  return db.matches.get(matchId);
}

export async function getAllMatches() {
  const matches = await db.matches.toArray();
  return matches.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getActiveMatch() {
  const all = await getAllMatches();
  return all.find(m => m.status === 'innings1' || m.status === 'innings2') || null;
}

export async function updateMatch(matchId, updates) {
  const now = new Date().toISOString();
  await db.matches.update(matchId, {
    ...updates,
    updatedAt: now,
    synced: 0
  });
  triggerSync();
}

// --- Event Operations (Event-Sourced Scoring) ---

export async function addEvent(eventData) {
  const now = new Date().toISOString();
  const event = {
    _id: eventData._id || generateUUID(),
    matchId: eventData.matchId,
    innings: eventData.innings || 1,
    sequence: eventData.sequence,
    type: eventData.type,
    isDeleted: 0,
    synced: 0,
    timestamp: now,
    ...eventData
  };

  await db.events.add(event);
  triggerSync();
  return event;
}

export async function getInningsEvents(matchId, innings = 1) {
  const list = await db.events
    .where('matchId')
    .equals(matchId)
    .and(e => e.innings === innings && e.isDeleted === 0)
    .toArray();

  return list.sort((a, b) => a.sequence - b.sequence);
}

export async function getAllMatchEvents(matchId) {
  const list = await db.events
    .where('matchId')
    .equals(matchId)
    .and(e => e.isDeleted === 0)
    .toArray();

  return list.sort((a, b) => {
    if (a.innings !== b.innings) return a.innings - b.innings;
    return a.sequence - b.sequence;
  });
}

export async function softDeleteLastEvent(matchId, innings = 1) {
  const events = await getInningsEvents(matchId, innings);
  if (!events || events.length === 0) return null;

  const lastEvent = events[events.length - 1];
  const now = new Date().toISOString();

  await db.events.update(lastEvent._id, {
    isDeleted: 1,
    synced: 0,
    updatedAt: now
  });
  triggerSync();

  return lastEvent;
}
