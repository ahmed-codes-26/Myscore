/**
 * Pure Framework-Independent Cricket Scoring Engine
 *
 * Computes the complete innings state from match rules and an ordered list of events.
 * Event-sourced: Totals are never stored; always derived from non-deleted events.
 */

import {
  DEFAULT_RULES,
  WICKET_TYPES,
  BOWLER_CREDITED_WICKETS,
  EXTRA_TYPES,
  EVENT_TYPES,
  INNINGS_STATUS
} from './constants.js';

/**
 * Derives the complete innings state from rules and non-deleted events.
 *
 * @param {Object} rawRules - Match configuration rules
 * @param {Array<Object>} events - Ordered array of event objects (delivery and swap)
 * @param {Array<string>} teamPlayerIds - Batting team player IDs (length = playersPerSide)
 * @param {Array<string>} bowlingPlayerIds - Bowling team player IDs
 * @param {Object} [options] - Initial openers, target, etc.
 * @returns {Object} Full innings state
 */
export function computeInningsState(rawRules, events = [], teamPlayerIds = [], bowlingPlayerIds = [], options = {}) {
  const rules = mergeRules(rawRules);
  const { playersPerSide, oversPerInnings, lastManBatsAlone } = rules;
  const maxLegalBalls = oversPerInnings * 6;

  // Filter out soft-deleted events
  const activeEvents = (events || []).filter(e => e && e.isDeleted !== 1 && e.isDeleted !== true);

  // Initialize batsmen stats
  const batsmanStats = new Map();
  teamPlayerIds.forEach((id) => {
    batsmanStats.set(id, {
      id,
      name: options.playerNames?.[id] || '',
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      isOut: false,
      dismissal: null
    });
  });

  // Initialize bowler stats
  const bowlerStats = new Map();
  bowlingPlayerIds.forEach((id) => {
    bowlerStats.set(id, {
      id,
      name: options.playerNames?.[id] || '',
      legalBalls: 0,
      oversText: '0.0',
      maidens: 0,
      runs: 0,
      wickets: 0,
      wides: 0,
      noBalls: 0,
      ballsInCurrentOver: 0,
      runsInCurrentOver: 0
    });
  });

  // Determine openers
  let strikerId = options.openingStrikerId || teamPlayerIds[0] || null;
  let nonStrikerId = (playersPerSide === 1)
    ? null
    : (options.openingNonStrikerId || (teamPlayerIds[1] || null));
  let currentBowlerId = options.openingBowlerId || bowlingPlayerIds[0] || null;
  let previousBowlerId = null;

  let totalRuns = 0;
  let wickets = 0;
  let legalBalls = 0;
  let needBowlerSelection = false;
  let needBatsmanSelection = false;
  let isFreeHitNext = false;
  let isLastManMode = Boolean(lastManBatsAlone && (wickets === playersPerSide - 1));

  // If playersPerSide = 1, single batsman bats alone from ball one
  if (playersPerSide === 1 && lastManBatsAlone) {
    isLastManMode = true;
    nonStrikerId = null;
  }

  const extras = {
    wides: 0,
    noBalls: 0,
    byes: 0,
    legByes: 0,
    total: 0
  };

  const fallOfWickets = [];
  const thisOverBalls = [];
  let isNewOverStarting = false;
  let inningsStatus = INNINGS_STATUS.LIVE;

  // Replay all active events in sequence
  for (let i = 0; i < activeEvents.length; i++) {
    const event = activeEvents[i];

    if (inningsStatus !== INNINGS_STATUS.LIVE) {
      // Innings already terminated (target chased / all out / overs complete)
      break;
    }

    if (event.type === EVENT_TYPES.SWAP) {
      // Manual strike swap event
      if (isLastManMode) {
        throw new Error('Cannot swap strike in last-man mode: lone batsman faces every delivery.');
      }
      if (!strikerId || !nonStrikerId) {
        throw new Error('Cannot swap strike when two batsmen are not on pitch.');
      }
      // Swap striker and non-striker
      const temp = strikerId;
      strikerId = nonStrikerId;
      nonStrikerId = temp;
      continue;
    }

    if (event.type === EVENT_TYPES.DECLARE) {
      // Batsman declared/retired not-out and replaced
      const replacedId = event.replacedBatsmanId;
      const incomingId = event.incomingBatsmanId;

      const replaced = batsmanStats.get(replacedId);
      if (replaced) {
        replaced.isDeclared = true;
        replaced.isOut = false; // Not out!
      }

      const incoming = batsmanStats.get(incomingId);
      if (incoming) {
        incoming.isDeclared = false; // Resumes with existing stats if already batted!
      }

      if (event.isStriker || replacedId === strikerId) {
        strikerId = incomingId;
      } else {
        nonStrikerId = incomingId;
      }
      continue;
    }

    // Default to DELIVERY - clear pending bowler selection since a ball is being bowled
    needBowlerSelection = false;
    if (isNewOverStarting) {
      thisOverBalls.length = 0;
      isNewOverStarting = false;
    }
    const runsOffBat = Number(event.runsOffBat) || 0;
    const extraType = event.extraType || EXTRA_TYPES.NONE;
    const extraRuns = Number(event.extraRuns) || 0;
    const isWicket = Boolean(event.wicket);

    // Validate extras configuration
    if (extraType === EXTRA_TYPES.BYE && !rules.byesEnabled) {
      throw new Error('Byes are disabled for this match.');
    }
    if (extraType === EXTRA_TYPES.LEG_BYE && !rules.legByesEnabled) {
      throw new Error('Leg-byes are disabled for this match.');
    }

    // Free hit validation: on free hit, only run out is valid
    if (isFreeHitNext && isWicket) {
      if (event.wicket.type !== WICKET_TYPES.RUN_OUT) {
        throw new Error(`Invalid dismissal on Free Hit: only run out is permitted, received ${event.wicket.type}.`);
      }
    }

    // Update bowler if provided on delivery
    if (event.bowlerId) {
      currentBowlerId = event.bowlerId;
    }

    let isLegal = true;
    let penalty = 0;
    let bRuns = 0;
    let bowlerRunsConceded = 0;

    if (extraType === EXTRA_TYPES.WIDE) {
      isLegal = !rules.wide.reBowled;
      penalty = Number(rules.wide.runs) || 0;
      const wideTotal = penalty + extraRuns;
      extras.wides += wideTotal;
      extras.total += wideTotal;
      bowlerRunsConceded = wideTotal;
      totalRuns += wideTotal;
    } else if (extraType === EXTRA_TYPES.NO_BALL) {
      isLegal = !rules.noBall.reBowled;
      penalty = Number(rules.noBall.runs) || 0;
      const nbExtra = penalty + extraRuns;
      extras.noBalls += nbExtra;
      extras.total += nbExtra;
      bRuns = runsOffBat;
      bowlerRunsConceded = nbExtra + bRuns;
      totalRuns += nbExtra + bRuns;
    } else if (extraType === EXTRA_TYPES.BYE) {
      isLegal = true;
      const byeTotal = runsOffBat + extraRuns;
      extras.byes += byeTotal;
      extras.total += byeTotal;
      totalRuns += byeTotal;
      bowlerRunsConceded = 0; // Byes do not count against the bowler
    } else if (extraType === EXTRA_TYPES.LEG_BYE) {
      isLegal = true;
      const legByeTotal = runsOffBat + extraRuns;
      extras.legByes += legByeTotal;
      extras.total += legByeTotal;
      totalRuns += legByeTotal;
      bowlerRunsConceded = 0; // Leg-byes do not count against the bowler
    } else {
      // Normal ball
      isLegal = true;
      bRuns = runsOffBat;
      bowlerRunsConceded = bRuns;
      totalRuns += bRuns;
    }

    // Update striker stats
    const striker = batsmanStats.get(strikerId);
    if (striker) {
      striker.runs += bRuns;
      if (extraType !== EXTRA_TYPES.WIDE) {
        striker.balls += 1;
      }
      if (bRuns === 4) striker.fours += 1;
      if (bRuns === 6) striker.sixes += 1;
    }

    // Update bowler stats
    const bowler = bowlerStats.get(currentBowlerId);
    if (bowler) {
      bowler.runs += bowlerRunsConceded;
      bowler.runsInCurrentOver += bowlerRunsConceded;
      if (extraType === EXTRA_TYPES.WIDE) {
        bowler.wides += 1;
      }
      if (extraType === EXTRA_TYPES.NO_BALL) {
        bowler.noBalls += 1;
      }
      if (isLegal) {
        bowler.legalBalls += 1;
        bowler.ballsInCurrentOver += 1;
      }
    }

    if (isLegal) {
      legalBalls += 1;
    }

    // Ball chip description
    const chip = formatBallChip(runsOffBat, extraType, extraRuns, isWicket);
    thisOverBalls.push(chip);

    // Process Wicket
    let wicketFell = false;
    if (isWicket) {
      wicketFell = true;
      wickets += 1;
      const outPlayerId = event.wicket.playerOutId || strikerId;
      const outBatsman = batsmanStats.get(outPlayerId);

      if (outBatsman) {
        outBatsman.isOut = true;
        outBatsman.dismissal = {
          type: event.wicket.type,
          bowlerId: BOWLER_CREDITED_WICKETS.has(event.wicket.type) ? currentBowlerId : null,
          fielderId: event.wicket.fielderId || null
        };
      }

      if (bowler && BOWLER_CREDITED_WICKETS.has(event.wicket.type)) {
        bowler.wickets += 1;
      }

      fallOfWickets.push({
        wicketNum: wickets,
        runs: totalRuns,
        oversText: formatOvers(legalBalls),
        batsmanId: outPlayerId
      });

      // Check if innings ends on wickets
      const wicketLimit = lastManBatsAlone ? playersPerSide : Math.max(1, playersPerSide - 1);
      if (wickets >= wicketLimit) {
        inningsStatus = INNINGS_STATUS.ALL_OUT;
      } else {
        // Check Last-Man-Batting transition
        if (lastManBatsAlone && wickets === playersPerSide - 1) {
          isLastManMode = true;
          // Surviving batsman continues alone as striker
          if (outPlayerId === strikerId) {
            strikerId = nonStrikerId;
          }
          nonStrikerId = null;
          needBatsmanSelection = false;
        } else {
          // Normal mode: incoming batsman takes place of dismissed batsman
          needBatsmanSelection = true;
          if (event.nextBatsmanId) {
            if (outPlayerId === strikerId) {
              strikerId = event.nextBatsmanId;
            } else {
              nonStrikerId = event.nextBatsmanId;
            }
            needBatsmanSelection = false;
          }
        }
      }
    }

    // Check target chased (2nd innings)
    const target = (typeof options.target === 'number') ? options.target : null;
    if (target !== null && totalRuns >= target) {
      inningsStatus = INNINGS_STATUS.TARGET_CHASED;
    } else if (legalBalls >= maxLegalBalls && inningsStatus === INNINGS_STATUS.LIVE) {
      inningsStatus = INNINGS_STATUS.OVERS_COMPLETE;
    }

    // Strike rotation (only if innings is still live)
    const isOverComplete = isLegal && legalBalls > 0 && (legalBalls % 6 === 0);

    if (inningsStatus === INNINGS_STATUS.LIVE) {
      if (isLastManMode) {
        // Under Last-Man-Batting: NO strike rotation at all!
        // Odd runs do not change anything. End of over changes nothing.
        // He faces every ball.
        if (isOverComplete) {
          handleOverEnd(bowler);
          previousBowlerId = currentBowlerId;
          needBowlerSelection = true;
          isNewOverStarting = true;
        }
      } else {
        // Normal mode strike rotation:
        // 1. Odd physical runs swap striker and non-striker
        const physicalRuns = (extraType === EXTRA_TYPES.BYE || extraType === EXTRA_TYPES.LEG_BYE)
          ? (runsOffBat + extraRuns)
          : (extraType === EXTRA_TYPES.NO_BALL || extraType === EXTRA_TYPES.WIDE ? extraRuns : runsOffBat);

        const oddRuns = (physicalRuns % 2 === 1);
        if (oddRuns && !wicketFell) {
          const temp = strikerId;
          strikerId = nonStrikerId;
          nonStrikerId = temp;
        }

        // 2. End of over swaps strike
        if (isOverComplete) {
          handleOverEnd(bowler);
          previousBowlerId = currentBowlerId;
          needBowlerSelection = true;
          isNewOverStarting = true;

          // End of over rotation
          const temp = strikerId;
          strikerId = nonStrikerId;
          nonStrikerId = temp;
        }
      }
    } else if (isOverComplete) {
      handleOverEnd(bowler);
    }

    // Update free hit status for next delivery
    if (rules.noBall.freeHit) {
      if (extraType === EXTRA_TYPES.NO_BALL) {
        isFreeHitNext = true;
      } else if (isFreeHitNext && isLegal) {
        isFreeHitNext = false;
      }
      // If wide on free hit, isFreeHitNext remains true (persists)
    } else {
      isFreeHitNext = false;
    }
  }

  // Finalize bowler figures
  bowlerStats.forEach((b) => {
    b.oversText = formatOvers(b.legalBalls);
    b.economy = b.legalBalls > 0 ? Number(((b.runs / b.legalBalls) * 6).toFixed(2)) : 0;
  });

  // Calculate run rates & 2nd innings chase stats
  const target = (typeof options.target === 'number') ? options.target : null;
  const runsNeeded = target !== null ? Math.max(0, target - totalRuns) : null;
  const ballsRemaining = Math.max(0, maxLegalBalls - legalBalls);
  const currentRunRate = legalBalls > 0 ? Number(((totalRuns / legalBalls) * 6).toFixed(2)) : 0;
  const requiredRate = (target !== null && ballsRemaining > 0)
    ? Number(((runsNeeded / ballsRemaining) * 6).toFixed(2))
    : null;

  const currentOver = Math.floor(legalBalls / 6);
  const ballInOver = (legalBalls % 6) + 1;

  return {
    runs: totalRuns,
    wickets,
    legalBalls,
    oversText: formatOvers(legalBalls),
    currentOver,
    ballInOver: ballInOver > 6 ? 1 : ballInOver,

    strikerId,
    nonStrikerId: isLastManMode ? null : nonStrikerId,
    isLastManMode,

    currentBowlerId,
    previousBowlerId,

    needBowlerSelection,
    needBatsmanSelection,
    isFreeHitNext,

    batsmanStats,
    bowlerStats,

    extras,
    thisOverBalls: [...thisOverBalls],
    fallOfWickets,

    inningsStatus,

    target,
    runsNeeded,
    ballsRemaining,
    requiredRate,
    currentRunRate
  };
}

/**
 * Soft-deletes the last active event (for undo).
 * Sets isDeleted = 1 and synced = 0.
 *
 * @param {Array<Object>} events - Array of events
 * @returns {Object|null} The soft-deleted event, or null if none found
 */
export function undoLastEvent(events) {
  if (!events || events.length === 0) return null;

  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev && ev.isDeleted !== 1 && ev.isDeleted !== true) {
      ev.isDeleted = 1;
      ev.synced = 0;
      return ev;
    }
  }

  return null;
}

/**
 * Creates a delivery event object.
 */
export function createDeliveryEvent({
  matchId,
  innings = 1,
  sequence,
  batsmanId,
  nonStrikerId = null,
  bowlerId,
  runsOffBat = 0,
  extraType = EXTRA_TYPES.NONE,
  extraRuns = 0,
  wicket = null,
  nextBatsmanId = null,
  isFreeHit = false
}) {
  return {
    _id: generateUUID(),
    matchId,
    innings,
    sequence,
    type: EVENT_TYPES.DELIVERY,
    isDeleted: 0,
    synced: 0,
    batsmanId,
    nonStrikerId,
    bowlerId,
    runsOffBat: Number(runsOffBat) || 0,
    extraType: extraType || EXTRA_TYPES.NONE,
    extraRuns: Number(extraRuns) || 0,
    wicket: wicket ? { ...wicket } : null,
    nextBatsmanId: nextBatsmanId || null,
    isFreeHit: Boolean(isFreeHit),
    timestamp: new Date().toISOString()
  };
}

/**
 * Creates a swap event object.
 */
export function createSwapEvent({
  matchId,
  innings = 1,
  sequence,
  batsmanId,
  nonStrikerId
}) {
  return {
    _id: generateUUID(),
    matchId,
    innings,
    sequence,
    type: EVENT_TYPES.SWAP,
    isDeleted: 0,
    synced: 0,
    batsmanId,
    nonStrikerId,
    timestamp: new Date().toISOString()
  };
}

/**
 * Creates a declare event object (retire not-out / replace batsman).
 */
export function createDeclareEvent({
  matchId,
  innings = 1,
  sequence,
  replacedBatsmanId,
  incomingBatsmanId,
  isStriker = true
}) {
  return {
    _id: generateUUID(),
    matchId,
    innings,
    sequence,
    type: EVENT_TYPES.DECLARE,
    isDeleted: 0,
    synced: 0,
    replacedBatsmanId,
    incomingBatsmanId,
    isStriker: Boolean(isStriker),
    timestamp: new Date().toISOString()
  };
}

// Helpers
function handleOverEnd(bowler) {
  if (bowler) {
    if (bowler.ballsInCurrentOver >= 6 && bowler.runsInCurrentOver === 0) {
      bowler.maidens += 1;
    }
    bowler.ballsInCurrentOver = 0;
    bowler.runsInCurrentOver = 0;
  }
}

function mergeRules(raw = {}) {
  return {
    ...DEFAULT_RULES,
    ...raw,
    wide: { ...DEFAULT_RULES.wide, ...(raw.wide || {}) },
    noBall: { ...DEFAULT_RULES.noBall, ...(raw.noBall || {}) }
  };
}

export function formatOvers(balls) {
  const o = Math.floor(balls / 6);
  const b = balls % 6;
  return `${o}.${b}`;
}

function formatBallChip(runsOffBat, extraType, extraRuns, isWicket) {
  if (isWicket) {
    return { text: runsOffBat > 0 ? `W+${runsOffBat}` : 'W', chipClass: 'wicket' };
  }
  if (extraType === EXTRA_TYPES.WIDE) {
    return { text: extraRuns > 0 ? `${extraRuns}wd` : 'wd', chipClass: 'extra' };
  }
  if (extraType === EXTRA_TYPES.NO_BALL) {
    return { text: runsOffBat > 0 ? `nb+${runsOffBat}` : 'nb', chipClass: 'extra' };
  }
  if (extraType === EXTRA_TYPES.BYE) {
    return { text: `${runsOffBat + extraRuns}b`, chipClass: 'extra' };
  }
  if (extraType === EXTRA_TYPES.LEG_BYE) {
    return { text: `${runsOffBat + extraRuns}lb`, chipClass: 'extra' };
  }
  if (runsOffBat === 0) return { text: '•', chipClass: 'dot' };
  if (runsOffBat === 4) return { text: '4', chipClass: 'four' };
  if (runsOffBat === 6) return { text: '6', chipClass: 'six' };
  return { text: `${runsOffBat}`, chipClass: 'run' };
}

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
