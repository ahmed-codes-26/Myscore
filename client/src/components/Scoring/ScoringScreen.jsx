import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import gsap from 'gsap';
import {
  computeInningsState,
  createDeliveryEvent,
  createSwapEvent,
  createDeclareEvent
} from '../../engine/engine.js';
import {
  getInningsEvents,
  addEvent,
  softDeleteLastEvent,
  updateMatch,
  getAllPlayers
} from '../../db/operations.js';
import {
  WICKET_TYPES,
  EXTRA_TYPES,
  EVENT_TYPES,
  INNINGS_STATUS
} from '../../engine/constants.js';
import { triggerHaptic } from '../../utils/helpers.js';
import CustomSelect from '../common/CustomSelect.jsx';

export default function ScoringScreen({
  match,
  players: initialPlayers = [],
  initialOpeners,
  onMatchCompleted,
  showToast
}) {
  const [events, setEvents] = useState([]);
  const [innings, setInnings] = useState(match?.status === 'innings2' ? 2 : 1);
  const [loading, setLoading] = useState(true);

  // Local player cache from Dexie
  const [dbPlayers, setDbPlayers] = useState([]);

  // Modals
  const [showWicketModal, setShowWicketModal] = useState(false);
  const [showBowlerModal, setShowBowlerModal] = useState(false);
  const [showDeclareModal, setShowDeclareModal] = useState(false);
  const [showNoBallModal, setShowNoBallModal] = useState(false);
  const [showInningsBreakModal, setShowInningsBreakModal] = useState(false);
  const [showSecondInningsOpenersModal, setShowSecondInningsOpenersModal] = useState(false);

  // Modal animated refs
  const wicketModalRef = useRef(null);
  const bowlerModalRef = useRef(null);
  const declareModalRef = useRef(null);
  const noBallModalRef = useRef(null);
  const inningsBreakModalRef = useRef(null);
  const secondInningsModalRef = useRef(null);

  // Declare batsman state
  const [declaringBatsmanId, setDeclaringBatsmanId] = useState('');
  const [declareReplacementId, setDeclareReplacementId] = useState('');

  // Wicket modal state
  const [wicketType, setWicketType] = useState(WICKET_TYPES.BOWLED);
  const [outBatsmanId, setOutBatsmanId] = useState('');
  const [fielderId, setFielderId] = useState('');
  const [nextBatsmanId, setNextBatsmanId] = useState('');

  // Next Bowler selection state
  const [selectedBowlerId, setSelectedBowlerId] = useState('');
  const [pendingNextBowlerId, setPendingNextBowlerId] = useState(null);
  const lastPromptedOverRef = useRef(-1);

  // 2nd innings openers state
  const [secondStrikerId, setSecondStrikerId] = useState('');
  const [secondNonStrikerId, setSecondNonStrikerId] = useState('');
  const [secondBowlerId, setSecondBowlerId] = useState('');

  // 1st innings runs for 2nd innings target
  const [firstInningsRuns, setFirstInningsRuns] = useState(null);

  // Load all players from Dexie to avoid "Unknown" player bug
  const refreshDbPlayers = useCallback(async () => {
    try {
      const list = await getAllPlayers();
      setDbPlayers(list);
    } catch (err) {
      console.error('Failed to load players from Dexie:', err);
    }
  }, []);

  useEffect(() => {
    refreshDbPlayers();
  }, [refreshDbPlayers]);

  // Combined player names map: match document -> initial props -> Dexie dbPlayers
  const playersMap = useMemo(() => {
    const map = new Map();

    match?.team1?.players?.forEach(p => map.set(p._id, p.name));
    match?.team2?.players?.forEach(p => map.set(p._id, p.name));

    initialPlayers.forEach(p => map.set(p._id, p.name));
    dbPlayers.forEach(p => map.set(p._id, p.name));

    return map;
  }, [match, initialPlayers, dbPlayers]);

  const getPlayerName = useCallback((id) => {
    if (!id) return '';
    return playersMap.get(id) || `Player ${id.slice(0, 4)}`;
  }, [playersMap]);

  // Determine batting and bowling rosters for current innings
  const { battingTeamName, bowlingTeamName, battingRoster, bowlingRoster } = useMemo(() => {
    if (!match) return { battingRoster: [], bowlingRoster: [] };
    const team1BatsFirst = match.battingFirstTeamKey === 'team1';
    const isFirstInnings = (innings === 1);

    const team1IsBatting = isFirstInnings ? team1BatsFirst : !team1BatsFirst;

    const battingTeam = team1IsBatting ? match.team1 : match.team2;
    const bowlingTeam = team1IsBatting ? match.team2 : match.team1;

    return {
      battingTeamName: battingTeam.name,
      bowlingTeamName: bowlingTeam.name,
      battingRoster: battingTeam.playerIds || [],
      bowlingRoster: bowlingTeam.playerIds || []
    };
  }, [match, innings]);

  // Determine openers
  const effectiveOpeners = useMemo(() => {
    const innKey = innings === 1 ? 'innings1' : 'innings2';
    const saved = match?.openers?.[innKey];
    if (saved?.openingStrikerId) return saved;

    if (innings === 1 && initialOpeners?.openingStrikerId) {
      return initialOpeners;
    }

    return {
      openingStrikerId: battingRoster[0] || null,
      openingNonStrikerId: (battingRoster.length > 1) ? (battingRoster[1] || null) : null,
      openingBowlerId: bowlingRoster[0] || null
    };
  }, [match, innings, initialOpeners, battingRoster, bowlingRoster]);

  // Filter events strictly for the active innings
  const currentInningsEvents = useMemo(() => {
    return (events || []).filter(e => e && e.innings === innings);
  }, [events, innings]);

  // Load events for current innings from Dexie
  const loadEvents = useCallback(async () => {
    if (!match?._id) return;
    try {
      const list = await getInningsEvents(match._id, innings);
      setEvents(list);

      if (innings === 2) {
        const inn1Events = await getInningsEvents(match._id, 1);
        const team1BatsFirst = match.battingFirstTeamKey === 'team1';
        const inn1Batting = team1BatsFirst ? match.team1.playerIds : match.team2.playerIds;
        const inn1Bowling = team1BatsFirst ? match.team2.playerIds : match.team1.playerIds;
        const inn1State = computeInningsState(match.rules, inn1Events, inn1Batting, inn1Bowling, {
          openingStrikerId: match?.openers?.innings1?.openingStrikerId || inn1Batting[0],
          openingNonStrikerId: match?.openers?.innings1?.openingNonStrikerId || inn1Batting[1],
          openingBowlerId: match?.openers?.innings1?.openingBowlerId || inn1Bowling[0]
        });
        setFirstInningsRuns(inn1State.runs);
      }
    } catch (err) {
      console.error('Error loading events:', err);
    } finally {
      setLoading(false);
    }
  }, [match, innings]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Compute live state via pure engine using current innings events
  const state = useMemo(() => {
    if (!match || !battingRoster.length || !bowlingRoster.length) return null;

    const target = (innings === 2 && firstInningsRuns !== null) ? firstInningsRuns + 1 : null;
    const playerNamesObj = Object.fromEntries(playersMap);

    try {
      return computeInningsState(
        match.rules,
        currentInningsEvents,
        battingRoster,
        bowlingRoster,
        {
          openingStrikerId: effectiveOpeners.openingStrikerId || battingRoster[0],
          openingNonStrikerId: (battingRoster.length > 1) ? (effectiveOpeners.openingNonStrikerId || battingRoster[1]) : null,
          openingBowlerId: effectiveOpeners.openingBowlerId || bowlingRoster[0],
          target,
          playerNames: playerNamesObj
        }
      );
    } catch (err) {
      console.error('Engine compute error:', err);
      return null;
    }
  }, [match, currentInningsEvents, battingRoster, bowlingRoster, effectiveOpeners, innings, firstInningsRuns, playersMap]);

  // Keep batsmen on pitch in stable roster order: the star moves, NOT the rows!
  const pitchBatsmen = useMemo(() => {
    if (!state) return [];
    const ids = [state.strikerId, state.nonStrikerId].filter(Boolean);
    // Sort stably by batting roster order so rows never jump
    ids.sort((a, b) => battingRoster.indexOf(a) - battingRoster.indexOf(b));
    return ids.map(id => ({
      id,
      stat: state.batsmanStats.get(id),
      isStriker: (id === state.strikerId)
    })).filter(b => b.stat);
  }, [state, battingRoster]);

  // GSAP animation for modals
  const animateModalIn = (ref) => {
    if (ref.current) {
      gsap.fromTo(
        ref.current,
        { scale: 0.92, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.22, ease: 'power2.out' }
      );
    }
  };

  useEffect(() => {
    if (showWicketModal) animateModalIn(wicketModalRef);
  }, [showWicketModal]);

  useEffect(() => {
    if (showBowlerModal) animateModalIn(bowlerModalRef);
  }, [showBowlerModal]);

  useEffect(() => {
    if (showDeclareModal) animateModalIn(declareModalRef);
  }, [showDeclareModal]);

  useEffect(() => {
    if (showNoBallModal) animateModalIn(noBallModalRef);
  }, [showNoBallModal]);

  useEffect(() => {
    if (showInningsBreakModal) animateModalIn(inningsBreakModalRef);
  }, [showInningsBreakModal]);

  useEffect(() => {
    if (showSecondInningsOpenersModal) animateModalIn(secondInningsModalRef);
  }, [showSecondInningsOpenersModal]);

  // Handle over completion or innings end triggers
  useEffect(() => {
    if (!state) return;

    if (state.inningsStatus !== INNINGS_STATUS.LIVE) {
      if (innings === 1) {
        setShowInningsBreakModal(true);
      } else if (currentInningsEvents.length > 0) {
        handleMatchCompleted();
      }
      return;
    }

    // Between-overs bowler selection prompt
    if (state.needBowlerSelection && currentInningsEvents.length > 0) {
      if (lastPromptedOverRef.current !== state.currentOver && !pendingNextBowlerId) {
        lastPromptedOverRef.current = state.currentOver;
        const eligible = bowlingRoster.filter(id => bowlingRoster.length <= 1 || id !== state.previousBowlerId);
        if (eligible.length > 0) {
          setSelectedBowlerId(eligible[0]);
        }
        setShowBowlerModal(true);
      }
    } else {
      if (showBowlerModal && !pendingNextBowlerId && !state.needBowlerSelection) {
        setShowBowlerModal(false);
      }
    }
  }, [state?.inningsStatus, state?.needBowlerSelection, state?.currentOver, pendingNextBowlerId, currentInningsEvents.length, bowlingRoster, innings]);

  // Animate button click with GSAP
  const handleKeypadPressAnimation = (e) => {
    if (e?.currentTarget) {
      gsap.fromTo(e.currentTarget, { scale: 0.94 }, { scale: 1, duration: 0.15, ease: 'power2.out' });
    }
  };

  // Record a delivery
  const handleRecordBall = async ({
    runsOffBat = 0,
    extraType = EXTRA_TYPES.NONE,
    extraRuns = 0,
    wicket = null,
    nextBatsman = null
  }, e = null) => {
    if (e) handleKeypadPressAnimation(e);
    triggerHaptic(10);
    if (!state || state.inningsStatus !== INNINGS_STATUS.LIVE) return;

    if (state.needBowlerSelection && !pendingNextBowlerId) {
      const eligible = bowlingRoster.filter(id => bowlingRoster.length <= 1 || id !== state.previousBowlerId);
      if (eligible.length > 0) {
        setSelectedBowlerId(eligible[0]);
      }
      setShowBowlerModal(true);
      showToast('Select bowler for the new over', 'warning');
      return;
    }

    const nextSeq = (currentInningsEvents.length > 0 ? currentInningsEvents[currentInningsEvents.length - 1].sequence : 0) + 1;
    const bowlerToUse = pendingNextBowlerId || state.currentBowlerId || effectiveOpeners.openingBowlerId;

    const deliveryEvent = createDeliveryEvent({
      matchId: match._id,
      innings,
      sequence: nextSeq,
      batsmanId: state.strikerId,
      nonStrikerId: state.isLastManMode ? null : state.nonStrikerId,
      bowlerId: bowlerToUse,
      runsOffBat,
      extraType,
      extraRuns,
      wicket,
      nextBatsmanId: nextBatsman,
      isFreeHit: state.isFreeHitNext
    });

    try {
      await addEvent(deliveryEvent);
      const updatedList = await getInningsEvents(match._id, innings);
      setEvents(updatedList);
      setPendingNextBowlerId(null);
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  // Manual strike swap (type: 'swap')
  const handleManualSwap = async () => {
    triggerHaptic(10);
    if (!state || state.isLastManMode || !state.nonStrikerId) return;

    const nextSeq = (currentInningsEvents.length > 0 ? currentInningsEvents[currentInningsEvents.length - 1].sequence : 0) + 1;
    const swapEvent = createSwapEvent({
      matchId: match._id,
      innings,
      sequence: nextSeq,
      batsmanId: state.strikerId,
      nonStrikerId: state.nonStrikerId
    });

    try {
      await addEvent(swapEvent);
      await loadEvents();
      showToast('Strike swapped', 'info');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  // Declare / Replace Batsman
  const handleOpenDeclareModal = (batsmanId) => {
    triggerHaptic(10);
    setDeclaringBatsmanId(batsmanId);

    const eligible = battingRoster.filter(id => {
      if (id === state.strikerId || id === state.nonStrikerId) return false;
      const stat = state.batsmanStats.get(id);
      return !stat?.isOut;
    });

    setDeclareReplacementId(eligible.length > 0 ? eligible[0] : '');
    setShowDeclareModal(true);
  };

  const handleConfirmDeclare = async () => {
    if (!declaringBatsmanId || !declareReplacementId) {
      showToast('Select a replacement batsman', 'warning');
      return;
    }

    const nextSeq = (currentInningsEvents.length > 0 ? currentInningsEvents[currentInningsEvents.length - 1].sequence : 0) + 1;
    const isStriker = (declaringBatsmanId === state.strikerId);

    const declareEvent = createDeclareEvent({
      matchId: match._id,
      innings,
      sequence: nextSeq,
      replacedBatsmanId: declaringBatsmanId,
      incomingBatsmanId: declareReplacementId,
      isStriker
    });

    try {
      await addEvent(declareEvent);
      setShowDeclareModal(false);
      await loadEvents();
      showToast(`${getPlayerName(declaringBatsmanId)} declared. ${getPlayerName(declareReplacementId)} is in.`, 'info');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  // Undo last event (soft-delete)
  const handleUndo = async (e = null) => {
    if (e) handleKeypadPressAnimation(e);
    triggerHaptic(15);
    try {
      const undone = await softDeleteLastEvent(match._id, innings);
      if (undone) {
        setPendingNextBowlerId(null);
        await updateMatch(match._id, {
          status: innings === 1 ? 'innings1' : 'innings2',
          result: null
        });
        await loadEvents();
        showToast('Undone', 'info');
      } else {
        showToast('Nothing to undo', 'info');
      }
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  // Open Wicket Modal (only Bowled, Caught, Run Out)
  const handleOpenWicketModal = (e = null) => {
    if (e) handleKeypadPressAnimation(e);
    triggerHaptic(12);
    setWicketType(WICKET_TYPES.BOWLED);
    setOutBatsmanId(state.strikerId);
    setFielderId('');

    const available = getAvailableBatsmen();
    setNextBatsmanId(available.length > 0 ? available[0] : '');
    setShowWicketModal(true);
  };

  const getAvailableBatsmen = () => {
    if (!state) return [];
    return battingRoster.filter(id => {
      if (id === state.strikerId || id === state.nonStrikerId) return false;
      const bStat = state.batsmanStats.get(id);
      return !bStat?.isOut;
    });
  };

  // Confirm Wicket
  const handleConfirmWicket = async () => {
    if (!state) return;

    const nextWickets = state.wickets + 1;
    const willEnterLastMan = Boolean(
      match.rules.lastManBatsAlone &&
      nextWickets === match.rules.playersPerSide - 1
    );

    const willBeAllOut = Boolean(
      nextWickets >= (match.rules.lastManBatsAlone ? match.rules.playersPerSide : match.rules.playersPerSide - 1)
    );

    let nextBId = null;
    if (!willEnterLastMan && !willBeAllOut) {
      nextBId = nextBatsmanId;
      if (!nextBId) {
        showToast('Please select next batsman', 'warning');
        return;
      }
    }

    const wicketObj = {
      type: wicketType,
      playerOutId: outBatsmanId || state.strikerId,
      fielderId: fielderId || null
    };

    setShowWicketModal(false);

    await handleRecordBall({
      runsOffBat: 0,
      wicket: wicketObj,
      nextBatsman: nextBId
    });

    if (willEnterLastMan) {
      showToast('Last-Man-Batting mode! Batsman bats alone.', 'warning');
    }
  };

  // Confirm Bowler change
  const handleConfirmBowler = () => {
    if (!selectedBowlerId) return;
    setPendingNextBowlerId(selectedBowlerId);
    setShowBowlerModal(false);
    showToast(`Next Bowler: ${getPlayerName(selectedBowlerId)}`, 'info');
  };

  // Start 2nd Innings
  const handleStartSecondInnings = () => {
    setShowInningsBreakModal(false);

    const team1BatsFirst = match.battingFirstTeamKey === 'team1';
    const inn2BattingRoster = team1BatsFirst ? match.team2.playerIds : match.team1.playerIds;
    const inn2BowlingRoster = team1BatsFirst ? match.team1.playerIds : match.team2.playerIds;

    setSecondStrikerId(inn2BattingRoster[0] || '');
    setSecondNonStrikerId(inn2BattingRoster.length > 1 ? (inn2BattingRoster[1] || '') : '');
    setSecondBowlerId(inn2BowlingRoster[0] || '');

    setShowSecondInningsOpenersModal(true);
  };

  const handleConfirmSecondInningsOpeners = async () => {
    const team1BatsFirst = match.battingFirstTeamKey === 'team1';
    const inn2BattingRoster = team1BatsFirst ? match.team2.playerIds : match.team1.playerIds;
    const isSoloBatting = inn2BattingRoster.length === 1;

    if (!secondStrikerId) {
      showToast('Select opening striker', 'warning');
      return;
    }
    if (!isSoloBatting && !secondNonStrikerId) {
      showToast('Select opening non-striker', 'warning');
      return;
    }
    if (!secondBowlerId) {
      showToast('Select opening bowler', 'warning');
      return;
    }

    setShowSecondInningsOpenersModal(false);

    // Compute 1st innings runs before switching
    const inn1Events = await getInningsEvents(match._id, 1);
    const inn1Batting = team1BatsFirst ? match.team1.playerIds : match.team2.playerIds;
    const inn1Bowling = team1BatsFirst ? match.team2.playerIds : match.team1.playerIds;
    const inn1State = computeInningsState(match.rules, inn1Events, inn1Batting, inn1Bowling, {
      openingStrikerId: match?.openers?.innings1?.openingStrikerId || inn1Batting[0],
      openingNonStrikerId: match?.openers?.innings1?.openingNonStrikerId || inn1Batting[1],
      openingBowlerId: match?.openers?.innings1?.openingBowlerId || inn1Bowling[0]
    });
    setFirstInningsRuns(inn1State.runs);

    setPendingNextBowlerId(null);
    lastPromptedOverRef.current = -1;

    const updatedOpeners = {
      ...(match.openers || {}),
      innings2: {
        openingStrikerId: secondStrikerId,
        openingNonStrikerId: !isSoloBatting ? secondNonStrikerId : null,
        openingBowlerId: secondBowlerId
      }
    };

    await updateMatch(match._id, {
      status: 'innings2',
      openers: updatedOpeners
    });

    const inn2Events = await getInningsEvents(match._id, 2);
    setEvents(inn2Events);
    setInnings(2);

    showToast('2nd Innings started', 'success');
  };

  const handleMatchCompleted = async () => {
    if (!state || innings !== 2 || currentInningsEvents.length === 0) return;

    let summary = '';
    const target = firstInningsRuns !== null ? firstInningsRuns + 1 : 0;

    if (state.runs >= target) {
      const wktsLeft = match.rules.playersPerSide - state.wickets;
      summary = `${battingTeamName} won by ${wktsLeft} wicket${wktsLeft === 1 ? '' : 's'}!`;
    } else if (state.runs === target - 1) {
      summary = 'Match Tied!';
    } else {
      const runsDiff = (target - 1) - state.runs;
      summary = `${bowlingTeamName} won by ${runsDiff} run${runsDiff === 1 ? '' : 's'}!`;
    }

    const completedMatch = {
      ...match,
      status: 'completed',
      result: { summary }
    };

    await updateMatch(match._id, {
      status: 'completed',
      result: { summary }
    });

    onMatchCompleted?.(completedMatch, summary);
  };

  if (loading || !state) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500 text-sm">
        Loading match...
      </div>
    );
  }

  const activeBowlerId = pendingNextBowlerId || state.currentBowlerId || effectiveOpeners.openingBowlerId;
  const bowler = state.bowlerStats.get(activeBowlerId) || null;

  // Replacement batsmen for declare modal
  const declareEligibleList = battingRoster.filter(id => {
    if (id === state.strikerId || id === state.nonStrikerId) return false;
    const stat = state.batsmanStats.get(id);
    return !stat?.isOut;
  });

  // Reusable 3x3 Keypad Markup - Uniform, spacious, equal width & height across all buttons
  const renderKeypadGrid = () => (
    <div className="grid grid-cols-3 gap-2.5 sm:gap-3 w-full">
      {/* Row 1: [ 0 ] [ 1 ] [ 2 ] */}
      {[0, 1, 2].map(num => (
        <button
          key={num}
          type="button"
          onClick={(e) => handleRecordBall({ runsOffBat: num }, e)}
          className="touch-btn h-[72px] sm:h-[80px] md:h-[84px] lg:h-[92px] w-full bg-white hover:bg-slate-50 text-slate-900 font-mono font-bold text-2xl sm:text-3xl rounded-2xl border-2 border-slate-300 shadow-xs flex items-center justify-center transition"
        >
          {num}
        </button>
      ))}

      {/* Row 2: [ 4 ] [ 6 ] [ wd ] */}
      <button
        type="button"
        onClick={(e) => handleRecordBall({ runsOffBat: 4 }, e)}
        className="touch-btn h-[72px] sm:h-[80px] md:h-[84px] lg:h-[92px] w-full bg-white hover:bg-red-50 text-red-600 font-mono font-black text-2xl sm:text-3xl rounded-2xl border-2 border-red-500 shadow-xs flex items-center justify-center transition"
      >
        4
      </button>
      <button
        type="button"
        onClick={(e) => handleRecordBall({ runsOffBat: 6 }, e)}
        className="touch-btn h-[72px] sm:h-[80px] md:h-[84px] lg:h-[92px] w-full bg-white hover:bg-red-50 text-red-600 font-mono font-black text-2xl sm:text-3xl rounded-2xl border-2 border-red-500 shadow-xs flex items-center justify-center transition"
      >
        6
      </button>
      <button
        type="button"
        onClick={(e) => handleRecordBall({ extraType: EXTRA_TYPES.WIDE }, e)}
        className="touch-btn h-[72px] sm:h-[80px] md:h-[84px] lg:h-[92px] w-full bg-white hover:bg-red-50 text-red-600 font-bold text-lg sm:text-xl rounded-2xl border-2 border-red-400 shadow-xs flex items-center justify-center transition"
      >
        wd
      </button>

      {/* Row 3: [ No Ball ] [ Wicket ] [ Undo ] */}
      <button
        type="button"
        onClick={(e) => {
          handleKeypadPressAnimation(e);
          setShowNoBallModal(true);
        }}
        className="touch-btn h-[72px] sm:h-[80px] md:h-[84px] lg:h-[92px] w-full bg-white hover:bg-red-50 text-red-600 font-bold text-xs sm:text-sm md:text-base rounded-2xl border-2 border-red-400 shadow-xs flex items-center justify-center transition text-center px-1"
      >
        No Ball
      </button>
      <button
        type="button"
        onClick={handleOpenWicketModal}
        className="touch-btn h-[72px] sm:h-[80px] md:h-[84px] lg:h-[92px] w-full bg-red-600 hover:bg-red-700 text-white font-black text-xs sm:text-sm md:text-base uppercase tracking-wider rounded-2xl shadow-sm flex items-center justify-center transition text-center px-1"
      >
        Wicket
      </button>
      <button
        type="button"
        onClick={handleUndo}
        className="touch-btn h-[72px] sm:h-[80px] md:h-[84px] lg:h-[92px] w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs sm:text-sm md:text-base rounded-2xl border-2 border-slate-300 shadow-xs flex items-center justify-center transition text-center px-1"
      >
        Undo
      </button>
    </div>
  );

  return (
    <div className="max-w-md md:max-w-4xl lg:max-w-5xl xl:max-w-6xl mx-auto p-3 sm:p-5 font-sans select-none text-slate-900 pb-[295px] md:pb-6">
      {/* Responsive layout: 1 Column on Mobile, 2 Columns Dashboard on Laptop (md+) */}
      <div className="md:grid md:grid-cols-12 md:gap-5 lg:gap-6 items-start">
        {/* ======================================================== */}
        {/* LEFT COLUMN: CARDS 1, 2, 3 (Score, Batting, Bowling) */}
        {/* ======================================================== */}
        <div className="md:col-span-7 space-y-3 sm:space-y-4">
          {/* CARD 1: SCORE CARD */}
          <div className="bg-white border-2 border-slate-300 rounded-3xl p-4 sm:p-5 shadow-sm space-y-2.5">
            {/* Top row: 1st/2nd tag & Batting Team Name */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 shrink-0">
                {innings === 1 ? '1st Innings' : '2nd Innings'}
              </span>
              <span
                className="text-sm sm:text-base font-black text-slate-900 truncate text-right max-w-[200px] sm:max-w-[280px]"
                title={battingTeamName}
              >
                {battingTeamName}
              </span>
            </div>

            {/* Big Centered Score: 79-2 & (7.2/10) */}
            <div className="text-center py-1 sm:py-2">
              <div className="text-5xl sm:text-6xl font-black font-mono tracking-tight text-slate-900">
                {state.runs}-{state.wickets}
              </div>
              <div className="text-sm sm:text-base font-bold text-slate-500 font-mono mt-1 whitespace-nowrap">
                ({state.oversText} / {match.rules.oversPerInnings} ov)
              </div>
            </div>

            {/* 2nd Innings Target Info */}
            {innings === 2 && state.target && (
              <div className="text-center text-xs sm:text-sm font-bold text-red-600 pt-2 border-t-2 border-slate-100 whitespace-nowrap overflow-hidden text-ellipsis">
                Target: {state.target} • Need {state.runsNeeded} off {state.ballsRemaining} balls
                {state.requiredRate && <span className="text-slate-500 ml-1 font-normal">(RRR {state.requiredRate})</span>}
              </div>
            )}

            {/* Free Hit Banner */}
            {state.isFreeHitNext && (
              <div className="text-center text-xs font-black uppercase tracking-wider py-1.5 rounded-xl bg-red-600 text-white animate-pulse">
                ⚡ Free Hit Delivery
              </div>
            )}

            {/* Last-Man-Batting mode notification */}
            {state.isLastManMode && (
              <div className="text-center text-xs font-bold py-1.5 px-3 rounded-xl bg-red-50 text-red-700 border-2 border-red-200">
                Last Man Bats Alone — Solo Batsman faces every delivery
              </div>
            )}
          </div>

          {/* CARD 2: BATTING CARD (Stable order, star moves!) */}
          <div className="bg-white border-2 border-slate-300 rounded-3xl p-4 sm:p-5 shadow-sm space-y-2.5">
            {/* Header: Batting | Run Ball */}
            <div className="flex items-center justify-between text-xs font-bold text-slate-400 pb-1.5 border-b-2 border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-slate-700">Batting</span>
                {!state.isLastManMode && state.nonStrikerId && (
                  <button
                    type="button"
                    onClick={handleManualSwap}
                    className="text-[10px] px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-bold transition active:scale-95"
                    title="Swap Strike"
                  >
                    Swap
                  </button>
                )}
              </div>
              <div className="flex gap-6 sm:gap-8 pr-1 font-mono">
                <span className="w-10 text-right">Run</span>
                <span className="w-10 text-right">Ball</span>
              </div>
            </div>

            {/* Stable Batsman Rows: Star moves, rows stay in order! */}
            {pitchBatsmen.map(({ id, stat, isStriker }) => (
              <div
                key={id}
                onClick={() => handleOpenDeclareModal(id)}
                className="flex items-center justify-between py-2 px-2.5 rounded-2xl hover:bg-slate-50 cursor-pointer active:bg-slate-100 transition border border-transparent hover:border-slate-200"
                title="Click to declare / replace batsman"
              >
                <div className="flex items-center gap-1 font-bold text-sm sm:text-base text-slate-900 min-w-0 pr-2">
                  {!state.isLastManMode ? (
                    isStriker ? (
                      <span className="text-red-600 font-black text-lg w-3.5 shrink-0">*</span>
                    ) : (
                      <span className="w-3.5 shrink-0" />
                    )
                  ) : null}
                  <span className="truncate">{getPlayerName(id)}</span>
                  {stat.isDeclared && (
                    <span className="text-[10px] text-red-600 font-semibold shrink-0">(Resumed)</span>
                  )}
                </div>
                <div className="flex gap-6 sm:gap-8 font-mono text-sm sm:text-base pr-1 shrink-0">
                  <span className="w-10 text-right font-black text-slate-900">{stat.runs}</span>
                  <span className="w-10 text-right font-medium text-slate-500">{stat.balls}</span>
                </div>
              </div>
            ))}

            <div className="text-[10px] sm:text-xs text-slate-400 text-center pt-1">
              Tap a batsman to declare & send replacement
            </div>
          </div>

          {/* CARD 3: BOWLING & OVER CARD */}
          <div className="bg-white border-2 border-slate-300 rounded-3xl p-4 sm:p-5 shadow-sm space-y-3">
            {/* Top row: Bowler Name & Figures */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setShowBowlerModal(true)}
                  className="font-bold text-sm sm:text-base text-slate-900 hover:text-red-600 transition truncate text-left"
                  title="Click to change bowler"
                >
                  <span className="truncate">{getPlayerName(activeBowlerId)}</span>
                  {pendingNextBowlerId && (
                    <span className="ml-1 text-[11px] text-red-600 font-normal shrink-0">(Next)</span>
                  )}
                </button>
              </div>
              {bowler && (
                <div className="font-mono text-xs sm:text-sm font-bold text-slate-900 shrink-0 whitespace-nowrap">
                  {bowler.runs}/{bowler.wickets}
                  <span className="text-slate-500 ml-1 font-medium">({bowler.oversText})</span>
                </div>
              )}
            </div>

            {/* Bottom row: Current over balls horizontal chip reel */}
            <div className="flex items-center gap-2 overflow-x-auto py-1 no-scrollbar">
              {state.thisOverBalls.length === 0 ? (
                <span className="text-xs text-slate-400 italic py-1">New over starting...</span>
              ) : (
                state.thisOverBalls.map((chip, idx) => (
                  <span
                    key={idx}
                    className={`min-w-8 h-8 px-2 rounded-full flex items-center justify-center font-mono text-xs font-bold border-2 shrink-0 ${
                      chip.chipClass === 'wicket'
                        ? 'bg-red-600 text-white border-red-600 shadow-xs'
                        : chip.chipClass === 'extra'
                        ? 'bg-red-50 text-red-700 border-red-300'
                        : chip.chipClass === 'four' || chip.chipClass === 'six'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-100 text-slate-800 border-slate-300'
                    }`}
                  >
                    {chip.text === '•' ? '0' : chip.text}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* RIGHT COLUMN: KEYPAD (Laptop View md+) & Insights */}
        {/* ======================================================== */}
        <div className="hidden md:block md:col-span-5 space-y-4">
          <div className="bg-white border-2 border-slate-300 rounded-3xl p-4 lg:p-5 shadow-sm space-y-3 sticky top-20">
            <div className="flex items-center justify-between pb-2 border-b-2 border-slate-100">
              <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                Scoring Keypad
              </span>
              <span className="text-[11px] font-semibold text-slate-400">
                Tap or click to record delivery
              </span>
            </div>

            {/* Desktop 3x3 Keypad */}
            {renderKeypadGrid()}

            {/* Desktop Match Insights */}
            <div className="pt-3 border-t-2 border-slate-100 grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Current Run Rate</span>
                <p className="font-mono font-black text-sm text-slate-900 mt-0.5">{state.currentRunRate}</p>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Extras Total</span>
                <p className="font-mono font-black text-sm text-slate-900 mt-0.5">
                  {state.extras.total} <span className="text-[10px] font-normal text-slate-500">({state.extras.wides}wd, {state.extras.noBalls}nb)</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MOBILE STICKY BOTTOM KEYPAD (Hidden on Laptop md+) */}
      {/* ======================================================== */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-slate-50/95 backdrop-blur-xs p-2.5 sm:p-3 border-t-2 border-slate-200 shadow-2xl">
        <div className="max-w-md mx-auto bg-white border-2 border-slate-300 rounded-3xl p-2.5 sm:p-3 shadow-sm space-y-2">
          {renderKeypadGrid()}
        </div>
      </div>

      {/* ======================================================== */}
      {/* NO-BALL RUNS PICKER MODAL (Centered exact middle) */}
      {/* ======================================================== */}
      {showNoBallModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div
            ref={noBallModalRef}
            className="my-auto bg-white border-2 border-slate-300 rounded-3xl w-full max-w-xs p-5 space-y-3 shadow-2xl"
          >
            <h3 className="text-sm font-black text-slate-900 text-center">
              Runs off Bat on No-Ball?
            </h3>
            <p className="text-xs text-slate-500 text-center">
              (+1 run penalty added automatically)
            </p>
            <div className="grid grid-cols-5 gap-2 pt-1">
              {[0, 1, 2, 4, 6].map(runs => (
                <button
                  key={runs}
                  type="button"
                  onClick={() => {
                    setShowNoBallModal(false);
                    handleRecordBall({ extraType: EXTRA_TYPES.NO_BALL, runsOffBat: runs });
                  }}
                  className="py-3 rounded-xl border-2 border-slate-300 font-mono font-black text-base hover:bg-red-50 hover:text-red-600 hover:border-red-400 active:scale-95 transition"
                >
                  +{runs}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowNoBallModal(false)}
              className="w-full py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* DECLARE BATSMAN MODAL (Centered exact middle) */}
      {/* ======================================================== */}
      {showDeclareModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div
            ref={declareModalRef}
            className="my-auto bg-white border-2 border-slate-300 rounded-3xl w-full max-w-sm p-6 space-y-4 shadow-2xl"
          >
            <div>
              <h3 className="text-base font-black text-slate-900">
                Declare {getPlayerName(declaringBatsmanId)}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Player will retire not out. Their runs and balls are saved. If they return later, their stats resume.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Choose Replacement Batsman</label>
              {declareEligibleList.length === 0 ? (
                <p className="text-xs text-red-600 font-semibold py-2">
                  No other batsmen available in squad!
                </p>
              ) : (
                <CustomSelect
                  value={declareReplacementId}
                  onChange={setDeclareReplacementId}
                  options={declareEligibleList.map(id => {
                    const bStat = state.batsmanStats.get(id);
                    const isResume = bStat?.isDeclared;
                    return {
                      value: id,
                      label: getPlayerName(id),
                      sublabel: isResume ? `(Resume: ${bStat.runs} runs)` : ''
                    };
                  })}
                />
              )}
            </div>

            <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDeclareModal(false)}
                className="px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-200 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={declareEligibleList.length === 0}
                onClick={handleConfirmDeclare}
                className="px-5 py-2.5 bg-red-600 text-white font-black rounded-xl text-xs hover:bg-red-700 disabled:opacity-50 transition shadow-xs"
              >
                Declare & Replace
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* WICKET MODAL (Centered exact middle) */}
      {/* ======================================================== */}
      {showWicketModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div
            ref={wicketModalRef}
            className="my-auto bg-white border-2 border-slate-300 rounded-3xl w-full max-w-sm p-6 space-y-4 shadow-2xl"
          >
            <h3 className="text-base font-black text-red-600">
              Record Wicket
            </h3>

            <div className="space-y-3.5 text-xs">
              {/* Dismissal Type: Only Bowled, Caught, Run Out */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700">How Out?</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    WICKET_TYPES.BOWLED,
                    WICKET_TYPES.CAUGHT,
                    WICKET_TYPES.RUN_OUT
                  ].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setWicketType(t)}
                      className={`py-2.5 px-1 rounded-xl text-xs font-black capitalize border-2 transition ${
                        wicketType === t
                          ? 'bg-red-600 text-white border-red-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                      }`}
                    >
                      {t === WICKET_TYPES.RUN_OUT ? 'Run Out' : t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Who is out? (Only choice needed if Run Out in normal mode) */}
              {!state.isLastManMode && wicketType === WICKET_TYPES.RUN_OUT && (
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Batsman Out</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setOutBatsmanId(state.strikerId)}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border-2 transition ${
                        outBatsmanId === state.strikerId
                          ? 'bg-red-50 text-red-600 border-red-500'
                          : 'bg-white text-slate-600 border-slate-300'
                      }`}
                    >
                      Striker: {getPlayerName(state.strikerId)}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOutBatsmanId(state.nonStrikerId)}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border-2 transition ${
                        outBatsmanId === state.nonStrikerId
                          ? 'bg-red-50 text-red-600 border-red-500'
                          : 'bg-white text-slate-600 border-slate-300'
                      }`}
                    >
                      Non-Striker: {getPlayerName(state.nonStrikerId)}
                    </button>
                  </div>
                </div>
              )}

              {/* Fielder Picker (with CustomSelect) */}
              {[WICKET_TYPES.CAUGHT, WICKET_TYPES.RUN_OUT].includes(wicketType) && (
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Fielder (Optional)</label>
                  <CustomSelect
                    value={fielderId}
                    onChange={setFielderId}
                    placeholder="None / Unassisted"
                    options={[
                      { value: '', label: 'None / Unassisted' },
                      ...bowlingRoster.map(id => ({
                        value: id,
                        label: getPlayerName(id)
                      }))
                    ]}
                  />
                </div>
              )}

              {/* Next Batsman (with CustomSelect) */}
              {match.rules.lastManBatsAlone && state.wickets + 1 === match.rules.playersPerSide - 1 ? (
                <div className="p-3 bg-red-50 border-2 border-red-200 rounded-2xl text-red-700">
                  <p className="font-black">Transitions to Last-Man-Batting mode!</p>
                  <p className="text-[11px] mt-0.5">
                    No new batsman to pick. The sole remaining batsman continues alone.
                  </p>
                </div>
              ) : state.wickets + 1 >= (match.rules.lastManBatsAlone ? match.rules.playersPerSide : match.rules.playersPerSide - 1) ? (
                <div className="p-3 bg-red-50 border-2 border-red-200 rounded-2xl text-red-700 font-black">
                  Innings ends with this wicket (All Out)!
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Next Batsman *</label>
                  <CustomSelect
                    value={nextBatsmanId}
                    onChange={setNextBatsmanId}
                    options={getAvailableBatsmen().map(id => {
                      const bStat = state.batsmanStats.get(id);
                      return {
                        value: id,
                        label: getPlayerName(id),
                        sublabel: bStat?.isDeclared ? `(Resume: ${bStat.runs})` : ''
                      };
                    })}
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowWicketModal(false)}
                className="px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-200 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmWicket}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 font-black text-white rounded-xl text-xs shadow-xs transition"
              >
                Confirm Wicket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* BOWLER SELECTION MODAL (Centered exact middle) */}
      {/* ======================================================== */}
      {showBowlerModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div
            ref={bowlerModalRef}
            className="my-auto bg-white border-2 border-slate-300 rounded-3xl w-full max-w-xs p-6 space-y-4 shadow-2xl"
          >
            <div>
              <h3 className="text-base font-black text-slate-900">
                {state.needBowlerSelection ? 'Over Finished! Select Next Bowler' : 'Change Bowler'}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Same bowler cannot bowl two consecutive overs unless only 1 bowler is playing.
              </p>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto no-scrollbar">
              {bowlingRoster.map(id => {
                const isPrevious = (bowlingRoster.length > 1 && id === state.previousBowlerId);
                const isSelected = (selectedBowlerId === id);
                const bStat = state.bowlerStats.get(id);

                return (
                  <button
                    key={id}
                    type="button"
                    disabled={isPrevious}
                    onClick={() => setSelectedBowlerId(id)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold flex justify-between items-center border-2 transition ${
                      isPrevious
                        ? 'opacity-40 cursor-not-allowed bg-slate-50 text-slate-400 border-slate-200'
                        : isSelected
                        ? 'bg-red-50 text-red-600 border-red-500 shadow-xs'
                        : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span>{getPlayerName(id)} {isPrevious ? '(Just Bowled)' : ''}</span>
                    {bStat && (
                      <span className="font-mono text-[11px] text-slate-500">
                        {bStat.runs}/{bStat.wickets} ({bStat.oversText})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
              {!state.needBowlerSelection && (
                <button
                  type="button"
                  onClick={() => setShowBowlerModal(false)}
                  className="px-4 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl text-xs hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={handleConfirmBowler}
                className="px-5 py-2.5 bg-red-600 text-white font-black rounded-xl text-xs hover:bg-red-700 transition shadow-xs"
              >
                Confirm Bowler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* INNINGS 1 BREAK MODAL (Centered exact middle) */}
      {/* ======================================================== */}
      {showInningsBreakModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div
            ref={inningsBreakModalRef}
            className="my-auto bg-white border-2 border-slate-300 rounded-3xl w-full max-w-sm p-6 space-y-4 shadow-2xl text-center"
          >
            <h3 className="text-xl font-black text-slate-900">
              1st Innings Complete!
            </h3>
            <div className="py-2">
              <span className="text-5xl font-black font-mono text-red-600">
                {state.runs}
              </span>
              <p className="text-xs font-bold text-slate-600 mt-1">
                {battingTeamName} scored {state.runs}/{state.wickets} in {state.oversText} overs.
              </p>
              <div className="mt-4 p-4 bg-red-50 rounded-2xl border-2 border-red-200">
                <span className="text-xs font-bold text-slate-700">Target for {bowlingTeamName}:</span>
                <p className="text-3xl font-black font-mono text-slate-900 mt-0.5">
                  {state.runs + 1} runs
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleStartSecondInnings}
              className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white font-black text-sm rounded-2xl shadow-sm transition active:scale-95"
            >
              Start 2nd Innings
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2ND INNINGS OPENERS MODAL (Centered exact middle) */}
      {/* ======================================================== */}
      {showSecondInningsOpenersModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div
            ref={secondInningsModalRef}
            className="my-auto bg-white border-2 border-slate-300 rounded-3xl w-full max-w-sm p-6 space-y-4 shadow-2xl"
          >
            <h3 className="text-lg font-black text-slate-900">
              2nd Innings Openers
            </h3>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Opening Striker *</label>
                <CustomSelect
                  value={secondStrikerId}
                  onChange={setSecondStrikerId}
                  options={bowlingRoster.map(id => ({
                    value: id,
                    label: getPlayerName(id)
                  }))}
                />
              </div>

              {bowlingRoster.length > 1 && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Opening Non-Striker *</label>
                  <CustomSelect
                    value={secondNonStrikerId}
                    onChange={setSecondNonStrikerId}
                    options={bowlingRoster.filter(id => id !== secondStrikerId).map(id => ({
                      value: id,
                      label: getPlayerName(id)
                    }))}
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Opening Bowler *</label>
                <CustomSelect
                  value={secondBowlerId}
                  onChange={setSecondBowlerId}
                  options={battingRoster.map(id => ({
                    value: id,
                    label: getPlayerName(id)
                  }))}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleConfirmSecondInningsOpeners}
              className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-black text-xs rounded-2xl shadow-xs transition active:scale-95"
            >
              Start Chasing
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
