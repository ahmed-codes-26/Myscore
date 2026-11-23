import React, { useState, useEffect } from 'react';
import { computeInningsState } from '../../engine/engine.js';
import { getInningsEvents, makePlayerPermanent } from '../../db/operations.js';
import { exportMatchScorecardCSV } from '../../utils/csv.js';

export default function MatchSummary({ match, players, onBack, showToast }) {
  const [inn1State, setInn1State] = useState(null);
  const [inn2State, setInn2State] = useState(null);
  const [activeTab, setActiveTab] = useState(1);
  const [loading, setLoading] = useState(true);

  const getPlayerName = (id) => {
    const p = players.find(x => x._id === id);
    return p ? p.name : `Player ${id?.slice(0, 4) || ''}`;
  };

  const getPlayer = (id) => {
    return players.find(x => x._id === id);
  };

  useEffect(() => {
    const loadScorecards = async () => {
      if (!match) return;
      try {
        const team1BatsFirst = match.battingFirstTeamKey === 'team1';

        // Innings 1
        const inn1Batting = team1BatsFirst ? match.team1.playerIds : match.team2.playerIds;
        const inn1Bowling = team1BatsFirst ? match.team2.playerIds : match.team1.playerIds;
        const inn1Events = await getInningsEvents(match._id, 1);
        const state1 = computeInningsState(match.rules, inn1Events, inn1Batting, inn1Bowling);
        setInn1State(state1);

        // Innings 2 (if any)
        const inn2Batting = inn1Bowling;
        const inn2Bowling = inn1Batting;
        const inn2Events = await getInningsEvents(match._id, 2);
        if (inn2Events.length > 0 || match.status === 'completed' || match.status === 'innings2') {
          const state2 = computeInningsState(match.rules, inn2Events, inn2Batting, inn2Bowling, {
            target: state1.runs + 1
          });
          setInn2State(state2);
        }
      } catch (err) {
        console.error('Error loading scorecards:', err);
      } finally {
        setLoading(false);
      }
    };

    loadScorecards();
  }, [match]);

  const handleMakePermanent = async (playerId) => {
    try {
      await makePlayerPermanent(playerId);
      showToast('Player made permanent', 'success');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  if (loading || !inn1State) {
    return (
      <div className="p-12 text-center text-xs text-slate-500 font-bold">Loading scorecard...</div>
    );
  }

  const team1BatsFirst = match.battingFirstTeamKey === 'team1';
  const inn1BattingTeam = team1BatsFirst ? match.team1.name : match.team2.name;
  const inn2BattingTeam = team1BatsFirst ? match.team2.name : match.team1.name;

  const currentState = activeTab === 1 ? inn1State : inn2State;
  const currentBattingTeam = activeTab === 1 ? inn1BattingTeam : inn2BattingTeam;

  return (
    <div className="max-w-md lg:max-w-4xl mx-auto p-3 sm:p-5 space-y-4 font-sans text-slate-900 pb-20">
      {/* Top Banner */}
      <div className="bg-white border-2 border-slate-300 rounded-3xl p-4 sm:p-6 shadow-sm space-y-3">
        <div className="flex justify-between items-center">
          <button
            onClick={onBack}
            className="text-xs font-black text-slate-700 hover:text-red-600 flex items-center gap-1 transition"
          >
            ← Back to Matches
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => exportMatchScorecardCSV(match, inn1State, inn2State, players)}
              className="text-[11px] font-bold border-2 border-slate-300 hover:border-red-600 hover:text-red-600 px-2.5 py-1 rounded-xl transition flex items-center gap-1.5 text-slate-700 active:scale-95"
              title="Download scorecard CSV"
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="square"
                strokeLinejoin="miter"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Export CSV</span>
            </button>
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {match.status}
            </span>
          </div>
        </div>

        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900">
            {match.team1.name} <span className="text-red-600 font-bold">vs</span> {match.team2.name}
          </h2>
          {match.result?.summary && (
            <p className="text-sm font-black text-red-600 mt-1">
              🏆 {match.result.summary}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 pt-3 border-t-2 border-slate-100 text-xs">
          <div className="bg-slate-50 rounded-2xl p-3 border-2 border-slate-200">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{inn1BattingTeam} (1st)</span>
            <p className="text-xl sm:text-2xl font-black font-mono text-slate-900 mt-0.5">
              {inn1State.runs}/{inn1State.wickets}
              <span className="text-xs text-slate-500 ml-1 font-normal">({inn1State.oversText} ov)</span>
            </p>
          </div>

          <div className="bg-slate-50 rounded-2xl p-3 border-2 border-slate-200">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{inn2BattingTeam} (2nd)</span>
            <p className="text-xl sm:text-2xl font-black font-mono text-slate-900 mt-0.5">
              {inn2State ? `${inn2State.runs}/${inn2State.wickets}` : 'Yet to Bat'}
              {inn2State && <span className="text-xs text-slate-500 ml-1 font-normal">({inn2State.oversText} ov)</span>}
            </p>
          </div>
        </div>
      </div>

      {/* Innings Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab(1)}
          className={`flex-1 py-2 px-3 rounded-2xl border-2 transition text-center ${
            activeTab === 1
              ? 'bg-red-600 text-white border-red-600 shadow-sm'
              : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
          }`}
        >
          <span className="block text-xs font-black truncate">1st Innings</span>
          <span className={`block text-[11px] font-semibold truncate ${activeTab === 1 ? 'text-red-100' : 'text-slate-500'}`}>
            {inn1BattingTeam}
          </span>
        </button>
        {inn2State && (
          <button
            onClick={() => setActiveTab(2)}
            className={`flex-1 py-2 px-3 rounded-2xl border-2 transition text-center ${
              activeTab === 2
                ? 'bg-red-600 text-white border-red-600 shadow-sm'
                : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
            }`}
          >
            <span className="block text-xs font-black truncate">2nd Innings</span>
            <span className={`block text-[11px] font-semibold truncate ${activeTab === 2 ? 'text-red-100' : 'text-slate-500'}`}>
              {inn2BattingTeam}
            </span>
          </button>
        )}
      </div>

      {/* Scorecard Table (Responsive & Spacious on Desktop) */}
      {currentState && (
        <div className="bg-white border-2 border-slate-300 rounded-3xl p-4 sm:p-6 shadow-sm space-y-6">
          {/* Batting Section */}
          <div className="space-y-3">
            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-800">
              Batting — {currentBattingTeam}
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200 text-[10px] sm:text-xs font-bold text-slate-400 uppercase">
                    <th className="py-2 pr-2 font-bold">Batter</th>
                    <th className="py-2 px-1 text-right font-mono w-10 sm:w-12">R</th>
                    <th className="py-2 px-1 text-right font-mono w-10 sm:w-12">B</th>
                    <th className="py-2 px-1 text-right font-mono w-8 sm:w-10">4s</th>
                    <th className="py-2 pl-1 text-right font-mono w-8 sm:w-10">6s</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Array.from(currentState.batsmanStats.values()).map(b => {
                    const playerObj = getPlayer(b.id);
                    return (
                      <tr key={b.id} className="hover:bg-slate-50/60 transition">
                        <td className="py-2.5 pr-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-slate-900">{getPlayerName(b.id)}</span>
                            {playerObj?.isGuest === 1 && (
                              <button
                                onClick={() => handleMakePermanent(b.id)}
                                className="text-[10px] text-red-600 font-bold hover:underline"
                              >
                                (Guest - Make Permanent)
                              </button>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {b.isOut ? (b.dismissal?.description || 'out') : b.balls > 0 ? (b.isDeclared ? 'declared (not out)' : 'not out') : 'did not bat'}
                          </p>
                        </td>
                        <td className="py-2.5 px-1 text-right font-mono font-black text-slate-900">{b.runs}</td>
                        <td className="py-2.5 px-1 text-right font-mono text-slate-500">{b.balls}</td>
                        <td className="py-2.5 px-1 text-right font-mono text-slate-500">{b.fours}</td>
                        <td className="py-2.5 pl-1 text-right font-mono text-slate-500">{b.sixes}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Extras line */}
            <div className="pt-2 border-t-2 border-slate-100 flex justify-between text-xs sm:text-sm font-semibold text-slate-600">
              <span>Extras (wd {currentState.extras.wides}, nb {currentState.extras.noBalls})</span>
              <span className="font-mono font-black text-slate-900">{currentState.extras.total}</span>
            </div>
            <div className="flex justify-between text-xs sm:text-sm font-black text-slate-900">
              <span>Total Score</span>
              <span className="font-mono">{currentState.runs}/{currentState.wickets} ({currentState.oversText} ov)</span>
            </div>
          </div>

          {/* Bowling Section */}
          <div className="pt-4 border-t-2 border-slate-100 space-y-3">
            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-800">
              Bowling
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200 text-[10px] sm:text-xs font-bold text-slate-400 uppercase">
                    <th className="py-2 pr-2 font-bold">Bowler</th>
                    <th className="py-2 px-1 text-right font-mono w-10 sm:w-12">O</th>
                    <th className="py-2 px-1 text-right font-mono w-8 sm:w-10">M</th>
                    <th className="py-2 px-1 text-right font-mono w-9 sm:w-11">R</th>
                    <th className="py-2 px-1 text-right font-mono w-8 sm:w-10">W</th>
                    <th className="py-2 pl-1 text-right font-mono w-12 sm:w-14">Econ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Array.from(currentState.bowlerStats.values())
                    .filter(bw => bw.legalBalls > 0 || bw.runs > 0)
                    .map(bw => (
                      <tr key={bw.id} className="hover:bg-slate-50/60 transition">
                        <td className="py-2.5 pr-2 font-bold text-slate-900 truncate max-w-[120px] sm:max-w-none">
                          {getPlayerName(bw.id)}
                        </td>
                        <td className="py-2.5 px-1 text-right font-mono text-slate-500">{bw.oversText}</td>
                        <td className="py-2.5 px-1 text-right font-mono text-slate-500">{bw.maidens}</td>
                        <td className="py-2.5 px-1 text-right font-mono text-slate-500">{bw.runs}</td>
                        <td className="py-2.5 px-1 text-right font-mono font-black text-slate-900">{bw.wickets}</td>
                        <td className="py-2.5 pl-1 text-right font-mono text-slate-500">{bw.economy}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
