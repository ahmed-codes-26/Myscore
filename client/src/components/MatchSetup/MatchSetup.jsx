import React, { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import {
  getAllPlayers,
  quickAddGuest,
  createMatch
} from '../../db/operations.js';
import { DEFAULT_RULES } from '../../engine/constants.js';
import CustomSelect from '../common/CustomSelect.jsx';

export default function MatchSetup({ onMatchStarted, onPlayerAdded, showToast }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [players, setPlayers] = useState([]);
  const [team1Name, setTeam1Name] = useState('Team 1');
  const [team2Name, setTeam2Name] = useState('Team 2');
  const [oversPerInnings, setOversPerInnings] = useState(5);

  // Selected player IDs (teams formed directly by selection)
  const [team1PlayerIds, setTeam1PlayerIds] = useState([]);
  const [team2PlayerIds, setTeam2PlayerIds] = useState([]);
  const [battingFirstTeamKey, setBattingFirstTeamKey] = useState('team1');

  // Hardcoded default rules: 1 run wide, 1 run no-ball, both re-bowled, last man bats alone
  const defaultRules = {
    ...DEFAULT_RULES,
    wide: { runs: 1, reBowled: true },
    noBall: { runs: 1, reBowled: true },
    lastManBatsAlone: true
  };

  // Quick guest input per team
  const [quickGuestName, setQuickGuestName] = useState('');

  // Openers State
  const [openingStrikerId, setOpeningStrikerId] = useState('');
  const [openingNonStrikerId, setOpeningNonStrikerId] = useState('');
  const [openingBowlerId, setOpeningBowlerId] = useState('');

  const stepContentRef = useRef(null);

  const loadPlayers = async () => {
    const list = await getAllPlayers();
    setPlayers(list);
  };

  useEffect(() => {
    loadPlayers();
  }, []);

  // GSAP animation on step change
  useEffect(() => {
    if (stepContentRef.current) {
      gsap.fromTo(
        stepContentRef.current,
        { opacity: 0, y: 4 },
        { opacity: 1, y: 0, duration: 0.2, ease: 'power2.out' }
      );
    }
  }, [currentStep]);

  const handleTogglePlayerSelection = (teamKey, playerId) => {
    if (teamKey === 'team1') {
      if (team1PlayerIds.includes(playerId)) {
        setTeam1PlayerIds(team1PlayerIds.filter(id => id !== playerId));
      } else {
        setTeam1PlayerIds([...team1PlayerIds, playerId]);
      }
    } else {
      if (team2PlayerIds.includes(playerId)) {
        setTeam2PlayerIds(team2PlayerIds.filter(id => id !== playerId));
      } else {
        setTeam2PlayerIds([...team2PlayerIds, playerId]);
      }
    }
  };

  const handleQuickAddGuest = async (teamKey) => {
    const trimmed = quickGuestName.trim();
    if (!trimmed) return;

    try {
      const guest = await quickAddGuest(trimmed);
      await loadPlayers();
      onPlayerAdded?.(guest);
      setQuickGuestName('');
      if (teamKey === 'team1') {
        setTeam1PlayerIds(prev => [...prev, guest._id]);
      } else {
        setTeam2PlayerIds(prev => [...prev, guest._id]);
      }
      showToast(`Added guest ${trimmed}`, 'success');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  const getPlayerName = (id) => {
    const p = players.find(x => x._id === id);
    return p ? p.name : 'Player';
  };

  const battingPlayerIds = battingFirstTeamKey === 'team1' ? team1PlayerIds : team2PlayerIds;
  const bowlingPlayerIds = battingFirstTeamKey === 'team1' ? team2PlayerIds : team1PlayerIds;
  const battingTeamName = battingFirstTeamKey === 'team1' ? team1Name : team2Name;
  const bowlingTeamName = battingFirstTeamKey === 'team1' ? team2Name : team1Name;

  // Step progression & validation
  const validateStep = (step) => {
    if (step === 1) {
      if (!team1Name.trim() || !team2Name.trim()) {
        showToast('Please enter both team names', 'warning');
        return false;
      }
      if (team1Name.trim().toLowerCase() === team2Name.trim().toLowerCase()) {
        showToast('Team names must be different', 'warning');
        return false;
      }
      return true;
    }
    if (step === 2) {
      if (!oversPerInnings || oversPerInnings < 1) {
        showToast('Overs must be at least 1', 'warning');
        return false;
      }
      return true;
    }
    if (step === 3) {
      if (team1PlayerIds.length === 0) {
        showToast(`Select at least 1 player for ${team1Name}`, 'warning');
        return false;
      }
      return true;
    }
    if (step === 4) {
      if (team2PlayerIds.length === 0) {
        showToast(`Select at least 1 player for ${team2Name}`, 'warning');
        return false;
      }
      // Populate defaults for Step 5
      const currentBatting = battingFirstTeamKey === 'team1' ? team1PlayerIds : team2PlayerIds;
      const currentBowling = battingFirstTeamKey === 'team1' ? team2PlayerIds : team1PlayerIds;
      if (!openingStrikerId || !currentBatting.includes(openingStrikerId)) {
        setOpeningStrikerId(currentBatting[0] || '');
      }
      if (!openingNonStrikerId || !currentBatting.includes(openingNonStrikerId)) {
        setOpeningNonStrikerId(currentBatting.length > 1 ? (currentBatting[1] || '') : '');
      }
      if (!openingBowlerId || !currentBowling.includes(openingBowlerId)) {
        setOpeningBowlerId(currentBowling[0] || '');
      }
      return true;
    }
    return true;
  };

  const handleNextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(5, prev + 1));
    }
  };

  const handlePrevStep = () => {
    setCurrentStep(prev => Math.max(1, prev - 1));
  };

  const goToStep = (stepNumber) => {
    if (stepNumber < currentStep) {
      setCurrentStep(stepNumber);
      return;
    }
    for (let s = 1; s < stepNumber; s++) {
      if (!validateStep(s)) return;
    }
    setCurrentStep(stepNumber);
  };

  const handleConfirmOpenersAndStart = async () => {
    const isSoloBatting = battingPlayerIds.length === 1;

    if (!openingStrikerId) {
      showToast('Select opening striker', 'warning');
      return;
    }
    if (!isSoloBatting && !openingNonStrikerId) {
      showToast('Select opening non-striker', 'warning');
      return;
    }
    if (!isSoloBatting && openingStrikerId === openingNonStrikerId) {
      showToast('Striker and non-striker must be different', 'warning');
      return;
    }
    if (!openingBowlerId) {
      showToast('Select opening bowler', 'warning');
      return;
    }

    const calculatedPlayersPerSide = Math.max(team1PlayerIds.length, team2PlayerIds.length, 1);

    try {
      const matchDoc = {
        team1: {
          name: team1Name.trim(),
          playerIds: team1PlayerIds,
          players: team1PlayerIds.map(id => {
            const p = players.find(x => x._id === id);
            return { _id: id, name: p ? p.name : 'Player', isGuest: p?.isGuest || 0 };
          })
        },
        team2: {
          name: team2Name.trim(),
          playerIds: team2PlayerIds,
          players: team2PlayerIds.map(id => {
            const p = players.find(x => x._id === id);
            return { _id: id, name: p ? p.name : 'Player', isGuest: p?.isGuest || 0 };
          })
        },
        rules: {
          ...defaultRules,
          playersPerSide: calculatedPlayersPerSide,
          oversPerInnings: Number(oversPerInnings)
        },
        battingFirstTeamKey,
        openers: {
          innings1: {
            openingStrikerId,
            openingNonStrikerId: !isSoloBatting ? openingNonStrikerId : null,
            openingBowlerId
          }
        }
      };

      const match = await createMatch(matchDoc);

      onMatchStarted(match, {
        openingStrikerId,
        openingNonStrikerId: !isSoloBatting ? openingNonStrikerId : null,
        openingBowlerId
      });
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  return (
    <div className="max-w-md lg:max-w-4xl mx-auto p-3 sm:p-5 space-y-3 font-sans text-slate-900 pb-20">
      {/* Thin Rectangular Step Indicator Lines */}
      <div className="grid grid-cols-5 gap-2 px-1">
        {[1, 2, 3, 4, 5].map((stepNum) => {
          const isActive = currentStep === stepNum;
          const isCompleted = currentStep > stepNum;
          const isClickable = isCompleted || isActive;

          return (
            <button
              key={stepNum}
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && goToStep(stepNum)}
              title={`Step ${stepNum}`}
              className={`h-2 rounded-full transition-all duration-200 ${
                isActive
                  ? 'bg-red-600 shadow-xs ring-2 ring-red-200'
                  : isCompleted
                  ? 'bg-red-400 hover:bg-red-500 cursor-pointer'
                  : 'bg-slate-200 cursor-not-allowed'
              }`}
            />
          );
        })}
      </div>

      {/* Main Step Card */}
      <div className="bg-white border-2 border-slate-300 rounded-2xl p-4 sm:p-6 shadow-sm space-y-5">
        <div ref={stepContentRef} className="space-y-5 min-h-[300px] flex flex-col justify-between">
          <div>
            {/* STEP 1: TEAM NAMES */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Enter Team Names</h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-1">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Team 1 Name</label>
                    <input
                      type="text"
                      value={team1Name}
                      onChange={(e) => setTeam1Name(e.target.value)}
                      placeholder="e.g. Gladiators"
                      className="w-full bg-slate-50 border-2 border-slate-300 rounded-xl px-3.5 py-3 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-red-500 transition"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Team 2 Name</label>
                    <input
                      type="text"
                      value={team2Name}
                      onChange={(e) => setTeam2Name(e.target.value)}
                      placeholder="e.g. Warriors"
                      className="w-full bg-slate-50 border-2 border-slate-300 rounded-xl px-3.5 py-3 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-red-500 transition"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: OVERS & TOSS */}
            {currentStep === 2 && (
              <div className="space-y-5">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Overs & Toss</h2>

                {/* Overs Slider & Stepper */}
                <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-700">Overs per Innings</label>
                    <span className="text-sm font-black font-mono text-red-600 bg-red-100 px-3 py-0.5 rounded-lg border border-red-200">
                      {oversPerInnings} {oversPerInnings === 1 ? 'Over' : 'Overs'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setOversPerInnings(prev => Math.max(1, prev - 1))}
                      className="w-10 h-10 rounded-xl bg-white hover:bg-slate-100 active:scale-95 text-slate-800 font-black text-lg flex items-center justify-center transition border-2 border-slate-300 shrink-0 shadow-2xs"
                    >
                      −
                    </button>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      step="1"
                      value={oversPerInnings}
                      onChange={(e) => setOversPerInnings(Number(e.target.value))}
                      className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
                    />
                    <button
                      type="button"
                      onClick={() => setOversPerInnings(prev => Math.min(20, prev + 1))}
                      className="w-10 h-10 rounded-xl bg-white hover:bg-slate-100 active:scale-95 text-slate-800 font-black text-lg flex items-center justify-center transition border-2 border-slate-300 shrink-0 shadow-2xs"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Toss / Batting First */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700">Who Bats First?</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setBattingFirstTeamKey('team1')}
                      className={`py-3 px-3 text-xs sm:text-sm font-bold rounded-xl border-2 text-center transition truncate ${
                        battingFirstTeamKey === 'team1'
                          ? 'bg-red-600 text-white border-red-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                      }`}
                    >
                      {team1Name}
                    </button>
                    <button
                      type="button"
                      onClick={() => setBattingFirstTeamKey('team2')}
                      className={`py-3 px-3 text-xs sm:text-sm font-bold rounded-xl border-2 text-center transition truncate ${
                        battingFirstTeamKey === 'team2'
                          ? 'bg-red-600 text-white border-red-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                      }`}
                    >
                      {team2Name}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: TEAM 1 SQUAD */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="flex justify-between items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    Select {team1Name} Squad
                  </h2>
                  <span className="text-xs font-black px-3 py-1 rounded-full bg-red-100 text-red-700 shrink-0">
                    {team1PlayerIds.length} Selected
                  </span>
                </div>

                {/* Quick Add Guest for Team 1 (Zero overflow) */}
                <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-2.5 sm:p-3 flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Guest name..."
                    value={quickGuestName}
                    onChange={(e) => setQuickGuestName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleQuickAddGuest('team1');
                      }
                    }}
                    className="min-w-0 flex-1 bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-red-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleQuickAddGuest('team1')}
                    className="shrink-0 whitespace-nowrap px-3.5 sm:px-4 py-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs font-bold rounded-xl transition"
                  >
                    Add Guest
                  </button>
                </div>

                {/* Player List for Team 1 */}
                <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-2 max-h-80 overflow-y-auto no-scrollbar space-y-1.5">
                  {players.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-8">No players in pool yet.</p>
                  ) : (
                    players.map(p => {
                      const isSelected = team1PlayerIds.includes(p._id);
                      const isTakenOther = team2PlayerIds.includes(p._id);
                      return (
                        <button
                          type="button"
                          key={p._id}
                          disabled={isTakenOther}
                          onClick={() => handleTogglePlayerSelection('team1', p._id)}
                          className={`w-full text-left py-3 px-3.5 rounded-xl text-xs sm:text-sm min-h-[46px] flex justify-between items-center transition border-2 ${
                            isSelected
                              ? 'bg-red-50 text-red-700 border-red-500 font-bold shadow-xs'
                              : isTakenOther
                              ? 'opacity-30 cursor-not-allowed text-slate-400 border-transparent bg-slate-100'
                              : 'text-slate-800 bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <span className="truncate">{p.name} {p.isGuest ? '(Guest)' : ''}</span>
                          {isSelected && (
                            <svg
                              className="w-5 h-5 text-red-600 shrink-0"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3.5"
                              strokeLinecap="square"
                              strokeLinejoin="miter"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* STEP 4: TEAM 2 SQUAD */}
            {currentStep === 4 && (
              <div className="space-y-4">
                <div className="flex justify-between items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    Select {team2Name} Squad
                  </h2>
                  <span className="text-xs font-black px-3 py-1 rounded-full bg-red-100 text-red-700 shrink-0">
                    {team2PlayerIds.length} Selected
                  </span>
                </div>

                {/* Quick Add Guest for Team 2 (Zero overflow) */}
                <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-2.5 sm:p-3 flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Guest name..."
                    value={quickGuestName}
                    onChange={(e) => setQuickGuestName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleQuickAddGuest('team2');
                      }
                    }}
                    className="min-w-0 flex-1 bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-red-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleQuickAddGuest('team2')}
                    className="shrink-0 whitespace-nowrap px-3.5 sm:px-4 py-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs font-bold rounded-xl transition"
                  >
                    Add Guest
                  </button>
                </div>

                {/* Player List for Team 2 */}
                <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-2 max-h-80 overflow-y-auto no-scrollbar space-y-1.5">
                  {players.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-8">No players in pool yet.</p>
                  ) : (
                    players.map(p => {
                      const isSelected = team2PlayerIds.includes(p._id);
                      const isTakenOther = team1PlayerIds.includes(p._id);
                      return (
                        <button
                          type="button"
                          key={p._id}
                          disabled={isTakenOther}
                          onClick={() => handleTogglePlayerSelection('team2', p._id)}
                          className={`w-full text-left py-3 px-3.5 rounded-xl text-xs sm:text-sm min-h-[46px] flex justify-between items-center transition border-2 ${
                            isSelected
                              ? 'bg-red-50 text-red-700 border-red-500 font-bold shadow-xs'
                              : isTakenOther
                              ? 'opacity-30 cursor-not-allowed text-slate-400 border-transparent bg-slate-100'
                              : 'text-slate-800 bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <span className="truncate">{p.name} {p.isGuest ? '(Guest)' : ''}</span>
                          {isSelected && (
                            <svg
                              className="w-5 h-5 text-red-600 shrink-0"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3.5"
                              strokeLinecap="square"
                              strokeLinejoin="miter"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* STEP 5: OPENERS */}
            {currentStep === 5 && (
              <div className="space-y-5">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Select Openers</h2>

                {/* Openers Selection Dropdowns */}
                <div className="space-y-3.5 pt-1">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">
                      Opening Striker ({battingTeamName}) *
                    </label>
                    <CustomSelect
                      value={openingStrikerId}
                      onChange={setOpeningStrikerId}
                      options={battingPlayerIds.map(id => ({
                        value: id,
                        label: getPlayerName(id)
                      }))}
                    />
                  </div>

                  {battingPlayerIds.length > 1 && (
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">
                        Opening Non-Striker ({battingTeamName}) *
                      </label>
                      <CustomSelect
                        value={openingNonStrikerId}
                        onChange={setOpeningNonStrikerId}
                        options={battingPlayerIds.map(id => ({
                          value: id,
                          label: getPlayerName(id)
                        }))}
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">
                      Opening Bowler ({bowlingTeamName}) *
                    </label>
                    <CustomSelect
                      value={openingBowlerId}
                      onChange={setOpeningBowlerId}
                      options={bowlingPlayerIds.map(id => ({
                        value: id,
                        label: getPlayerName(id)
                      }))}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Navigation Buttons (Back & Next / Start) */}
          <div className="flex items-center justify-between gap-3 pt-5 border-t-2 border-slate-100 mt-4">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={handlePrevStep}
                className="px-4 sm:px-6 py-2.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-bold text-xs sm:text-sm rounded-xl transition border border-slate-300"
              >
                ← Back
              </button>
            ) : (
              <div />
            )}

            {currentStep < 5 ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="px-5 sm:px-7 py-2.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-black text-xs sm:text-sm rounded-xl shadow-xs transition"
              >
                Next →
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConfirmOpenersAndStart}
                className="px-6 sm:px-8 py-3 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-black text-sm sm:text-base rounded-2xl shadow-sm transition"
              >
                Start Match
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
