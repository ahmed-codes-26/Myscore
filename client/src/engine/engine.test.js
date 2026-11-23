import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeInningsState,
  undoLastEvent,
  createDeliveryEvent,
  createSwapEvent,
  createDeclareEvent
} from './engine.js';
import {
  DEFAULT_RULES,
  WICKET_TYPES,
  EXTRA_TYPES,
  EVENT_TYPES,
  INNINGS_STATUS
} from './constants.js';

const MATCH_ID = 'test-match-123';
const TEAM_P = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
const BOWL_P = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'];

describe('Normal Batting & Strike Rotation', () => {
  it('strike rotates on odd runs (1, 3, 5) and stays on even runs (0, 2, 4, 6)', () => {
    const rules = { ...DEFAULT_RULES, playersPerSide: 4, oversPerInnings: 2 };
    const events = [];

    // Dot ball (0 runs) -> strike stays
    events.push(createDeliveryEvent({ matchId: MATCH_ID, sequence: 1, runsOffBat: 0 }));
    let state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.strikerId, 'p1');
    assert.equal(state.nonStrikerId, 'p2');

    // 1 run (odd) -> strike swaps
    events.push(createDeliveryEvent({ matchId: MATCH_ID, sequence: 2, runsOffBat: 1 }));
    state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.strikerId, 'p2');
    assert.equal(state.nonStrikerId, 'p1');

    // 2 runs (even) -> strike stays
    events.push(createDeliveryEvent({ matchId: MATCH_ID, sequence: 3, runsOffBat: 2 }));
    state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.strikerId, 'p2');
    assert.equal(state.nonStrikerId, 'p1');

    // 3 runs (odd) -> strike swaps back to p1
    events.push(createDeliveryEvent({ matchId: MATCH_ID, sequence: 4, runsOffBat: 3 }));
    state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.strikerId, 'p1');
    assert.equal(state.nonStrikerId, 'p2');

    // 4 runs (even) -> strike stays
    events.push(createDeliveryEvent({ matchId: MATCH_ID, sequence: 5, runsOffBat: 4 }));
    state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.strikerId, 'p1');

    // 6 runs (even) -> strike stays
    events.push(createDeliveryEvent({ matchId: MATCH_ID, sequence: 6, runsOffBat: 6 }));
    // Wait, ball 6 is end of over! End of over swaps strike!
    state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.legalBalls, 6);
    // At end of over (6 legal balls), batsmen swap ends -> p2 is on strike for over 2
    assert.equal(state.strikerId, 'p2');
    assert.equal(state.nonStrikerId, 'p1');
  });

  it('end of over swaps strike after 6 legal balls', () => {
    const rules = { ...DEFAULT_RULES, playersPerSide: 4, oversPerInnings: 2 };
    const events = [];

    // Bowl 6 dot balls (even throughout)
    for (let i = 1; i <= 6; i++) {
      events.push(createDeliveryEvent({ matchId: MATCH_ID, sequence: i, runsOffBat: 0 }));
    }

    const state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.legalBalls, 6);
    assert.equal(state.currentOver, 1);
    assert.equal(state.strikerId, 'p2');
    assert.equal(state.nonStrikerId, 'p1');
    assert.equal(state.needBowlerSelection, true);
    assert.equal(state.previousBowlerId, 'b1');
  });

  it('end of over sets needBowlerSelection=true, then resets to false on next over delivery', () => {
    const rules = { ...DEFAULT_RULES, playersPerSide: 4, oversPerInnings: 3 };
    const events = [];

    // Over 1 (6 balls by b1)
    for (let i = 1; i <= 6; i++) {
      events.push(createDeliveryEvent({ matchId: MATCH_ID, sequence: i, bowlerId: 'b1', runsOffBat: 0 }));
    }

    let state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.legalBalls, 6);
    assert.equal(state.needBowlerSelection, true);
    assert.equal(state.previousBowlerId, 'b1');
    assert.equal(state.thisOverBalls.length, 6); // Over 1 balls preserved for display

    // Over 2 Ball 1 bowled by b2
    events.push(createDeliveryEvent({ matchId: MATCH_ID, sequence: 7, bowlerId: 'b2', runsOffBat: 1 }));
    state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.legalBalls, 7);
    assert.equal(state.needBowlerSelection, false); // Must be false after ball 1 of over 2
    assert.equal(state.currentBowlerId, 'b2');
    assert.equal(state.thisOverBalls.length, 1); // Cleared and started over 2

    // Over 2 Ball 2 bowled by b2
    events.push(createDeliveryEvent({ matchId: MATCH_ID, sequence: 8, bowlerId: 'b2', runsOffBat: 0 }));
    state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.legalBalls, 8);
    assert.equal(state.needBowlerSelection, false); // Still false on ball 2 of over 2
  });
});

describe('Swap Event (type: "swap")', () => {
  it('type: "swap" event flips striker and non-striker in normal mode', () => {
    const rules = { ...DEFAULT_RULES, playersPerSide: 4, oversPerInnings: 2 };
    const events = [
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 1, runsOffBat: 0 }),
      createSwapEvent({ matchId: MATCH_ID, sequence: 2, batsmanId: 'p1', nonStrikerId: 'p2' })
    ];

    const state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.strikerId, 'p2');
    assert.equal(state.nonStrikerId, 'p1');
  });

  it('swap after odd runs: compound rotation is correct', () => {
    const rules = { ...DEFAULT_RULES, playersPerSide: 4, oversPerInnings: 2 };
    const events = [
      // 1 run swaps strike to p2
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 1, runsOffBat: 1 }),
      // Scorer realizes umpire called short run / mistaken strike and taps Swap
      createSwapEvent({ matchId: MATCH_ID, sequence: 2, batsmanId: 'p2', nonStrikerId: 'p1' })
    ];

    const state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.strikerId, 'p1');
    assert.equal(state.nonStrikerId, 'p2');
  });

  it('swap is rejected in last-man mode (engine throws)', () => {
    const rules = { ...DEFAULT_RULES, playersPerSide: 2, oversPerInnings: 2, lastManBatsAlone: true };
    const events = [
      // p1 out -> last-man mode starts immediately (1 wicket = 2 - 1)
      createDeliveryEvent({
        matchId: MATCH_ID,
        sequence: 1,
        wicket: { type: WICKET_TYPES.BOWLED, playerOutId: 'p1' }
      }),
      // Attempting swap in last-man mode must throw
      createSwapEvent({ matchId: MATCH_ID, sequence: 2, batsmanId: 'p2', nonStrikerId: 'p1' })
    ];

    assert.throws(() => {
      computeInningsState(rules, events, TEAM_P, BOWL_P);
    }, /Cannot swap strike in last-man mode/);
  });
});

describe('Extras Variants', () => {
  it('wide: penalty applied per rules, ball is re-bowled (not legal), no strike change', () => {
    const rules = {
      ...DEFAULT_RULES,
      wide: { runs: 1, reBowled: true },
      playersPerSide: 4,
      oversPerInnings: 2
    };

    const events = [
      createDeliveryEvent({
        matchId: MATCH_ID,
        sequence: 1,
        extraType: EXTRA_TYPES.WIDE,
        extraRuns: 0
      })
    ];

    const state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.runs, 1);
    assert.equal(state.extras.wides, 1);
    assert.equal(state.legalBalls, 0); // re-bowled, not legal
    assert.equal(state.strikerId, 'p1'); // no strike change
  });

  it('wide with 0 penalty (group default): ball voided, re-bowled, 0 runs added', () => {
    const rules = {
      ...DEFAULT_RULES,
      wide: { runs: 0, reBowled: true },
      playersPerSide: 4,
      oversPerInnings: 2
    };

    const events = [
      createDeliveryEvent({
        matchId: MATCH_ID,
        sequence: 1,
        extraType: EXTRA_TYPES.WIDE,
        extraRuns: 0
      })
    ];

    const state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.runs, 0);
    assert.equal(state.extras.wides, 0);
    assert.equal(state.legalBalls, 0);
    assert.equal(state.strikerId, 'p1');
    assert.equal(state.thisOverBalls[0].text, 'wd');
  });

  it('no-ball: penalty applied, ball re-bowled, runs off bat credited to batsman', () => {
    const rules = {
      ...DEFAULT_RULES,
      noBall: { runs: 1, reBowled: true, freeHit: false },
      playersPerSide: 4,
      oversPerInnings: 2
    };

    const events = [
      createDeliveryEvent({
        matchId: MATCH_ID,
        sequence: 1,
        extraType: EXTRA_TYPES.NO_BALL,
        runsOffBat: 4,
        extraRuns: 0
      })
    ];

    const state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.runs, 5); // 1 penalty + 4 off bat
    assert.equal(state.extras.noBalls, 1);
    assert.equal(state.legalBalls, 0);
    const batsman = state.batsmanStats.get('p1');
    assert.equal(batsman.runs, 4);
    assert.equal(batsman.balls, 1); // NB counts as ball faced
    assert.equal(batsman.fours, 1);
  });
});

describe('Free Hit Rules', () => {
  it('free hit set after no-ball and persists through wide', () => {
    const rules = {
      ...DEFAULT_RULES,
      noBall: { runs: 1, reBowled: true, freeHit: true },
      playersPerSide: 4,
      oversPerInnings: 2
    };

    const events = [
      // Ball 1: No ball -> sets isFreeHitNext = true
      createDeliveryEvent({
        matchId: MATCH_ID,
        sequence: 1,
        extraType: EXTRA_TYPES.NO_BALL
      })
    ];

    let state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.isFreeHitNext, true);

    // Ball 2: Bowler bowls a wide on free hit -> free hit persists!
    events.push(createDeliveryEvent({
      matchId: MATCH_ID,
      sequence: 2,
      extraType: EXTRA_TYPES.WIDE
    }));

    state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.isFreeHitNext, true);

    // Ball 3: Legal delivery consumes free hit
    events.push(createDeliveryEvent({
      matchId: MATCH_ID,
      sequence: 3,
      runsOffBat: 2
    }));

    state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.isFreeHitNext, false);
  });

  it('only run-out is valid on free hit; other wickets rejected', () => {
    const rules = {
      ...DEFAULT_RULES,
      noBall: { runs: 1, reBowled: true, freeHit: true },
      playersPerSide: 4,
      oversPerInnings: 2
    };

    const events = [
      // Ball 1: No ball
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 1, extraType: EXTRA_TYPES.NO_BALL }),
      // Ball 2: Bowled on Free Hit -> invalid!
      createDeliveryEvent({
        matchId: MATCH_ID,
        sequence: 2,
        wicket: { type: WICKET_TYPES.BOWLED, playerOutId: 'p1' }
      })
    ];

    assert.throws(() => {
      computeInningsState(rules, events, TEAM_P, BOWL_P);
    }, /Invalid dismissal on Free Hit/);
  });
});

describe('Wickets & Dismissals (Bowled, Caught, Run Out)', () => {
  it('bowler credited for bowled and caught; NOT for run-out', () => {
    const rules = { ...DEFAULT_RULES, playersPerSide: 6, oversPerInnings: 5 };

    // Test bowled -> credited
    let events = [
      createDeliveryEvent({
        matchId: MATCH_ID,
        sequence: 1,
        wicket: { type: WICKET_TYPES.BOWLED, playerOutId: 'p1' },
        nextBatsmanId: 'p3'
      })
    ];
    let state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.bowlerStats.get('b1').wickets, 1);

    // Test caught -> credited
    events = [
      createDeliveryEvent({
        matchId: MATCH_ID,
        sequence: 1,
        wicket: { type: WICKET_TYPES.CAUGHT, playerOutId: 'p1' },
        nextBatsmanId: 'p3'
      })
    ];
    state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.bowlerStats.get('b1').wickets, 1);

    // Test run out -> NOT credited to bowler
    events = [
      createDeliveryEvent({
        matchId: MATCH_ID,
        sequence: 1,
        wicket: { type: WICKET_TYPES.RUN_OUT, playerOutId: 'p1' },
        nextBatsmanId: 'p3'
      })
    ];
    state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.bowlerStats.get('b1').wickets, 0);
  });

  it('next batsman replaces dismissed player at correct end', () => {
    const rules = { ...DEFAULT_RULES, playersPerSide: 4, oversPerInnings: 2 };
    const events = [
      // Striker p1 out, p3 enters as striker
      createDeliveryEvent({
        matchId: MATCH_ID,
        sequence: 1,
        wicket: { type: WICKET_TYPES.BOWLED, playerOutId: 'p1' },
        nextBatsmanId: 'p3'
      })
    ];

    const state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.strikerId, 'p3');
    assert.equal(state.nonStrikerId, 'p2');
    assert.equal(state.batsmanStats.get('p1').isOut, true);
  });
});

describe('Declare Batsman Feature', () => {
  it('declaring a player keeps stats saved, marks not-out, and sends replacement in', () => {
    const rules = { ...DEFAULT_RULES, playersPerSide: 4, oversPerInnings: 2 };
    const events = [
      // p1 scores 4 runs off 2 balls
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 1, runsOffBat: 4 }),
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 2, runsOffBat: 0 }),
      // p1 is not batting well, declare and replace with p3
      createDeclareEvent({
        matchId: MATCH_ID,
        sequence: 3,
        replacedBatsmanId: 'p1',
        incomingBatsmanId: 'p3',
        isStriker: true
      })
    ];

    const state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.strikerId, 'p3');
    assert.equal(state.nonStrikerId, 'p2');
    assert.equal(state.wickets, 0); // No wicket lost!

    const p1 = state.batsmanStats.get('p1');
    assert.equal(p1.runs, 4);
    assert.equal(p1.balls, 2);
    assert.equal(p1.isOut, false);
    assert.equal(p1.isDeclared, true);
  });

  it('declared batsman coming back resumes stats, does not restart', () => {
    const rules = { ...DEFAULT_RULES, playersPerSide: 4, oversPerInnings: 2 };
    const events = [
      // p1 scores 6 runs off 1 ball
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 1, runsOffBat: 6 }),
      // declare p1, bring in p3
      createDeclareEvent({ matchId: MATCH_ID, sequence: 2, replacedBatsmanId: 'p1', incomingBatsmanId: 'p3', isStriker: true }),
      // p3 bats and scores 2 runs
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 3, runsOffBat: 2 }),
      // Now p3 is also replaced, or p3 gets out and p1 comes back!
      createDeclareEvent({ matchId: MATCH_ID, sequence: 4, replacedBatsmanId: 'p3', incomingBatsmanId: 'p1', isStriker: true }),
      // p1 scores 4 more runs
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 5, runsOffBat: 4 })
    ];

    const state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    const p1 = state.batsmanStats.get('p1');
    // p1 had 6 from first ball, then 4 more = 10 runs!
    assert.equal(p1.runs, 10);
    assert.equal(p1.balls, 2);
    assert.equal(p1.isOut, false);
    assert.equal(p1.isDeclared, false);
  });

  it('undoing a declare event cleanly restores previous batsman to crease', () => {
    const rules = { ...DEFAULT_RULES, playersPerSide: 4, oversPerInnings: 2 };
    const events = [
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 1, runsOffBat: 2 }),
      createDeclareEvent({ matchId: MATCH_ID, sequence: 2, replacedBatsmanId: 'p1', incomingBatsmanId: 'p3', isStriker: true })
    ];

    let state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.strikerId, 'p3');

    // Undo declare
    undoLastEvent(events);

    state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.strikerId, 'p1');
    assert.equal(state.batsmanStats.get('p1').isDeclared, undefined);
  });
});

describe('Last-Man-Batting Rule', () => {
  it('triggers when wickets = playersPerSide - 1; nonStrikerId becomes null', () => {
    const rules = { ...DEFAULT_RULES, playersPerSide: 3, oversPerInnings: 2, lastManBatsAlone: true };
    const events = [
      // 1st wicket: p1 out, p3 in. Wickets = 1.
      createDeliveryEvent({
        matchId: MATCH_ID,
        sequence: 1,
        wicket: { type: WICKET_TYPES.BOWLED, playerOutId: 'p1' },
        nextBatsmanId: 'p3'
      }),
      // 2nd wicket: p2 out. Remaining batsman is only p3! Wickets = 2 = 3 - 1.
      createDeliveryEvent({
        matchId: MATCH_ID,
        sequence: 2,
        wicket: { type: WICKET_TYPES.BOWLED, playerOutId: 'p2' }
      })
    ];

    const state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.wickets, 2);
    assert.equal(state.isLastManMode, true);
    assert.equal(state.strikerId, 'p3');
    assert.equal(state.nonStrikerId, null);
    assert.equal(state.inningsStatus, INNINGS_STATUS.LIVE);
  });

  it('NO strike rotation on odd runs in last-man mode', () => {
    const rules = { ...DEFAULT_RULES, playersPerSide: 2, oversPerInnings: 2, lastManBatsAlone: true };
    const events = [
      // p1 out -> p2 enters last-man mode
      createDeliveryEvent({
        matchId: MATCH_ID,
        sequence: 1,
        wicket: { type: WICKET_TYPES.BOWLED, playerOutId: 'p1' }
      }),
      // p2 scores 1 run (odd)
      createDeliveryEvent({
        matchId: MATCH_ID,
        sequence: 2,
        runsOffBat: 1
      }),
      // p2 scores 3 runs (odd)
      createDeliveryEvent({
        matchId: MATCH_ID,
        sequence: 3,
        runsOffBat: 3
      })
    ];

    const state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.isLastManMode, true);
    assert.equal(state.strikerId, 'p2');
    assert.equal(state.nonStrikerId, null);
  });

  it('NO strike rotation at end of over in last-man mode', () => {
    const rules = { ...DEFAULT_RULES, playersPerSide: 2, oversPerInnings: 2, lastManBatsAlone: true };
    const events = [
      // Ball 1: p1 out -> p2 is lone batsman
      createDeliveryEvent({
        matchId: MATCH_ID,
        sequence: 1,
        wicket: { type: WICKET_TYPES.BOWLED, playerOutId: 'p1' }
      }),
      // Balls 2 through 6 of over 1
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 2, runsOffBat: 0 }),
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 3, runsOffBat: 0 }),
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 4, runsOffBat: 0 }),
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 5, runsOffBat: 0 }),
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 6, runsOffBat: 0 })
    ];

    const state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.legalBalls, 6);
    assert.equal(state.isLastManMode, true);
    // At end of over, lone batsman remains on strike!
    assert.equal(state.strikerId, 'p2');
    assert.equal(state.nonStrikerId, null);
  });

  it('last man dismissed -> innings ends (all out at playersPerSide wickets)', () => {
    const rules = { ...DEFAULT_RULES, playersPerSide: 2, oversPerInnings: 2, lastManBatsAlone: true };
    const events = [
      // 1st wicket -> last-man mode
      createDeliveryEvent({
        matchId: MATCH_ID,
        sequence: 1,
        wicket: { type: WICKET_TYPES.BOWLED, playerOutId: 'p1' }
      }),
      // 2nd wicket -> All out!
      createDeliveryEvent({
        matchId: MATCH_ID,
        sequence: 2,
        wicket: { type: WICKET_TYPES.BOWLED, playerOutId: 'p2' }
      })
    ];

    const state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.wickets, 2);
    assert.equal(state.inningsStatus, INNINGS_STATUS.ALL_OUT);
  });

  it('lastManBatsAlone = false -> innings ends at playersPerSide - 1 wickets', () => {
    const rules = { ...DEFAULT_RULES, playersPerSide: 3, oversPerInnings: 2, lastManBatsAlone: false };
    const events = [
      // 1st wicket: p1 out, p3 in
      createDeliveryEvent({
        matchId: MATCH_ID,
        sequence: 1,
        wicket: { type: WICKET_TYPES.BOWLED, playerOutId: 'p1' },
        nextBatsmanId: 'p3'
      }),
      // 2nd wicket: p2 out. With lastManBatsAlone = false, 2 = 3 - 1 wickets ends innings!
      createDeliveryEvent({
        matchId: MATCH_ID,
        sequence: 2,
        wicket: { type: WICKET_TYPES.BOWLED, playerOutId: 'p2' }
      })
    ];

    const state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.wickets, 2);
    assert.equal(state.isLastManMode, false);
    assert.equal(state.inningsStatus, INNINGS_STATUS.ALL_OUT);
  });

  it('edge case: playersPerSide = 1 bats alone from ball one', () => {
    const rules = { ...DEFAULT_RULES, playersPerSide: 1, oversPerInnings: 2, lastManBatsAlone: true };
    const events = [
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 1, runsOffBat: 1 })
    ];

    const state = computeInningsState(rules, events, ['p1'], BOWL_P);
    assert.equal(state.isLastManMode, true);
    assert.equal(state.strikerId, 'p1');
    assert.equal(state.nonStrikerId, null);
    assert.equal(state.inningsStatus, INNINGS_STATUS.LIVE);

    // 1 wicket ends innings
    events.push(createDeliveryEvent({
      matchId: MATCH_ID,
      sequence: 2,
      wicket: { type: WICKET_TYPES.BOWLED, playerOutId: 'p1' }
    }));

    const stateAfterWkt = computeInningsState(rules, events, ['p1'], BOWL_P);
    assert.equal(stateAfterWkt.wickets, 1);
    assert.equal(stateAfterWkt.inningsStatus, INNINGS_STATUS.ALL_OUT);
  });

  it('edge case: playersPerSide = 2 starts normal, enters last-man mode after first wicket', () => {
    const rules = { ...DEFAULT_RULES, playersPerSide: 2, oversPerInnings: 2, lastManBatsAlone: true };
    const events = [
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 1, runsOffBat: 0 })
    ];

    let state = computeInningsState(rules, events, ['p1', 'p2'], BOWL_P);
    assert.equal(state.isLastManMode, false);
    assert.equal(state.strikerId, 'p1');
    assert.equal(state.nonStrikerId, 'p2');

    // First wicket
    events.push(createDeliveryEvent({
      matchId: MATCH_ID,
      sequence: 2,
      wicket: { type: WICKET_TYPES.BOWLED, playerOutId: 'p1' }
    }));

    state = computeInningsState(rules, events, ['p1', 'p2'], BOWL_P);
    assert.equal(state.isLastManMode, true);
    assert.equal(state.strikerId, 'p2');
    assert.equal(state.nonStrikerId, null);
  });
});

describe('Undo (Soft-Delete) Mechanics', () => {
  it('undo sets isDeleted = 1 on last active event; state re-derived correctly', () => {
    const rules = { ...DEFAULT_RULES, playersPerSide: 4, oversPerInnings: 2 };
    const events = [
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 1, runsOffBat: 4 }),
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 2, runsOffBat: 2 })
    ];

    let state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.runs, 6);

    // Perform soft-delete undo
    const undone = undoLastEvent(events);
    assert.ok(undone);
    assert.equal(undone.sequence, 2);
    assert.equal(undone.isDeleted, 1);
    assert.equal(undone.synced, 0);

    // Recompute state with updated events
    state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.runs, 4);
    assert.equal(state.legalBalls, 1);
  });

  it('undo a synced event: isDeleted = 1 + synced = 0, record stays in array', () => {
    const rules = { ...DEFAULT_RULES, playersPerSide: 4, oversPerInnings: 2 };
    const ev1 = createDeliveryEvent({ matchId: MATCH_ID, sequence: 1, runsOffBat: 1 });
    ev1.synced = 1; // Simulated previously synced ball

    const events = [ev1];
    undoLastEvent(events);

    assert.equal(events.length, 1); // Record was NOT hard-deleted
    assert.equal(ev1.isDeleted, 1);
    assert.equal(ev1.synced, 0); // Marked unsynced for next sync push

    const state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.runs, 0);
  });

  it('undo across last-man boundary: non-striker restored, rotation resumes', () => {
    const rules = { ...DEFAULT_RULES, playersPerSide: 2, oversPerInnings: 2, lastManBatsAlone: true };
    const events = [
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 1, runsOffBat: 2 }),
      // Wicket entering last-man mode
      createDeliveryEvent({
        matchId: MATCH_ID,
        sequence: 2,
        wicket: { type: WICKET_TYPES.BOWLED, playerOutId: 'p1' }
      })
    ];

    let state = computeInningsState(rules, events, ['p1', 'p2'], BOWL_P);
    assert.equal(state.isLastManMode, true);
    assert.equal(state.nonStrikerId, null);

    // Undo the wicket
    undoLastEvent(events);

    state = computeInningsState(rules, events, ['p1', 'p2'], BOWL_P);
    assert.equal(state.wickets, 0);
    assert.equal(state.isLastManMode, false);
    assert.equal(state.strikerId, 'p1');
    assert.equal(state.nonStrikerId, 'p2');
  });

  it('undo a swap event: swap is reversed, striker/non-striker restored', () => {
    const rules = { ...DEFAULT_RULES, playersPerSide: 4, oversPerInnings: 2 };
    const events = [
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 1, runsOffBat: 0 }),
      createSwapEvent({ matchId: MATCH_ID, sequence: 2, batsmanId: 'p1', nonStrikerId: 'p2' })
    ];

    let state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.strikerId, 'p2');

    // Undo the swap
    undoLastEvent(events);

    state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.strikerId, 'p1');
    assert.equal(state.nonStrikerId, 'p2');
  });

  it('multiple sequential undos back to event 1', () => {
    const rules = { ...DEFAULT_RULES, playersPerSide: 4, oversPerInnings: 2 };
    const events = [
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 1, runsOffBat: 1 }),
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 2, runsOffBat: 2 }),
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 3, runsOffBat: 3 })
    ];

    let state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.runs, 6);

    undoLastEvent(events);
    state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.runs, 3);

    undoLastEvent(events);
    state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.runs, 1);

    undoLastEvent(events);
    state = computeInningsState(rules, events, TEAM_P, BOWL_P);
    assert.equal(state.runs, 0);
    assert.equal(state.legalBalls, 0);
  });
});

describe('Second Innings & Target Chasing', () => {
  it('target calculated correctly, innings ends immediately when target reached', () => {
    const rules = { ...DEFAULT_RULES, playersPerSide: 3, oversPerInnings: 2, lastManBatsAlone: true };
    const target = 15; // 1st innings made 14

    const events = [
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 1, runsOffBat: 6 }),
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 2, runsOffBat: 6 }),
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 3, runsOffBat: 3 }) // total 15 >= 15
    ];

    const state = computeInningsState(rules, events, TEAM_P, BOWL_P, { target });
    assert.equal(state.runs, 15);
    assert.equal(state.runsNeeded, 0);
    assert.equal(state.inningsStatus, INNINGS_STATUS.TARGET_CHASED);
  });

  it('tie when scores level at end of 2nd innings', () => {
    const rules = { ...DEFAULT_RULES, playersPerSide: 2, oversPerInnings: 1, lastManBatsAlone: true };
    const target = 11; // 1st innings made 10

    // 2nd innings bowls all 6 balls and scores exactly 10
    const events = [
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 1, runsOffBat: 4 }),
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 2, runsOffBat: 6 }),
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 3, runsOffBat: 0 }),
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 4, runsOffBat: 0 }),
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 5, runsOffBat: 0 }),
      createDeliveryEvent({ matchId: MATCH_ID, sequence: 6, runsOffBat: 0 })
    ];

    const state = computeInningsState(rules, events, ['p1', 'p2'], BOWL_P, { target });
    assert.equal(state.runs, 10);
    assert.equal(state.legalBalls, 6);
    assert.equal(state.inningsStatus, INNINGS_STATUS.OVERS_COMPLETE);
    // Runs = 10, target = 11 -> Match tied
  });
});
