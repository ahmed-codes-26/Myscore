/**
 * MyScore Cricket Scorer Constants & Default Rules
 */

export const WICKET_TYPES = {
  BOWLED: 'bowled',
  CAUGHT: 'caught',
  RUN_OUT: 'runout'
};

export const BOWLER_CREDITED_WICKETS = new Set([
  WICKET_TYPES.BOWLED,
  WICKET_TYPES.CAUGHT
]);

export const EXTRA_TYPES = {
  NONE: 'none',
  WIDE: 'wide',
  NO_BALL: 'noball'
};

export const EVENT_TYPES = {
  DELIVERY: 'delivery',
  SWAP: 'swap',
  DECLARE: 'declare'
};

export const INNINGS_STATUS = {
  LIVE: 'live',
  ALL_OUT: 'allOut',
  OVERS_COMPLETE: 'oversComplete',
  TARGET_CHASED: 'targetChased'
};

/**
 * Default match rules:
 * 1 run for wide, 1 run for no-ball, both re-bowled.
 * Byes removed.
 * Last man bats alone = ON.
 */
export const DEFAULT_RULES = {
  oversPerInnings: 5,
  playersPerSide: 6,
  wide: {
    runs: 1,
    reBowled: true
  },
  noBall: {
    runs: 1,
    reBowled: true,
    freeHit: false
  },
  byesEnabled: false,
  legByesEnabled: false,
  lastManBatsAlone: true
};
