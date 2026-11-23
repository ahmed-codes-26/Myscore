import React, { useState, useEffect } from 'react';
import { getPlayerCareerStats, makePlayerPermanent } from '../../db/operations.js';
import { exportPlayerStatsCSV } from '../../utils/csv.js';

export default function PlayerProfile({ player, onBack, onPlayerUpdated, showToast }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      if (!player?._id) return;
      try {
        const res = await getPlayerCareerStats(player._id);
        setStats(res);
      } catch (err) {
        console.error('Failed to load player stats:', err);
        showToast('Error calculating career stats', 'danger');
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [player]);

  const handleMakePermanent = async () => {
    try {
      await makePlayerPermanent(player._id);
      showToast(`${player.name} is now a Permanent Member`, 'success');
      onPlayerUpdated?.();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  if (loading) {
    return (
      <div className="max-w-md lg:max-w-5xl mx-auto p-12 text-center text-xs text-slate-500 font-bold">
        Loading career statistics...
      </div>
    );
  }

  const { batting, bowling, matchLogs, chronologicalLogs } = stats || {
    totalMatches: 0,
    batting: {},
    bowling: {},
    matchLogs: [],
    chronologicalLogs: []
  };

  // Run scoring breakdown
  const runsInFours = (batting.fours || 0) * 4;
  const runsInSixes = (batting.sixes || 0) * 6;
  const runsInSingles = Math.max(0, (batting.runs || 0) - (runsInFours + runsInSixes));
  const totalRuns = batting.runs || 0;

  const singlesPct = totalRuns > 0 ? Math.round((runsInSingles / totalRuns) * 100) : 0;
  const foursPct = totalRuns > 0 ? Math.round((runsInFours / totalRuns) * 100) : 0;
  const sixesPct = totalRuns > 0 ? Math.round((runsInSixes / totalRuns) * 100) : 0;

  // Donut chart SVG calculations (for desktop)
  const circumference = 2 * Math.PI * 38;
  const singlesStroke = totalRuns > 0 ? (runsInSingles / totalRuns) * circumference : 0;
  const foursStroke = totalRuns > 0 ? (runsInFours / totalRuns) * circumference : 0;
  const sixesStroke = totalRuns > 0 ? (runsInSixes / totalRuns) * circumference : 0;

  const foursOffset = singlesStroke;
  const sixesOffset = singlesStroke + foursStroke;

  // Line Chart: Match by match runs progression (last 8 matches for clear spacing)
  const chartMatches = chronologicalLogs.slice(-8);
  const maxMatchRuns = Math.max(...chartMatches.map(m => m.batting?.runs || 0), 10);
  const chartW = 460;
  const chartH = 150;
  const padX = 35;
  const padY = 25;

  const getPoints = (getValue, maxValue) => {
    if (chartMatches.length === 0) return '';
    if (chartMatches.length === 1) {
      const y = chartH - padY - ((getValue(chartMatches[0]) / maxValue) * (chartH - 2 * padY));
      return `${chartW / 2},${y}`;
    }
    const stepX = (chartW - 2 * padX) / (chartMatches.length - 1);
    return chartMatches
      .map((m, idx) => {
        const x = padX + idx * stepX;
        const val = getValue(m);
        const y = chartH - padY - ((val / maxValue) * (chartH - 2 * padY));
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const runsLinePoints = getPoints(m => m.batting?.runs || 0, maxMatchRuns);

  return (
    <div className="max-w-md lg:max-w-5xl mx-auto p-3 sm:p-5 space-y-4 sm:space-y-5 font-sans text-slate-900 pb-20">
      {/* Top Banner Card */}
      <div className="bg-white border-2 border-slate-300 rounded-3xl p-4 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="text-xs font-black text-slate-700 hover:text-red-600 flex items-center gap-2 transition active:scale-95 py-1 px-2.5 rounded-xl hover:bg-slate-100 group"
          >
            {/* Bold straight-line back arrow */}
            <svg
              className="w-4 h-4 text-slate-700 group-hover:text-red-600 shrink-0 transition"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="square"
              strokeLinejoin="miter"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>Back to Players</span>
          </button>

          {/* Action buttons (Export CSV & Guest Status) */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => exportPlayerStatsCSV(player, stats)}
              className="text-[11px] font-bold border-2 border-slate-300 hover:border-red-600 hover:text-red-600 px-2.5 py-1 rounded-xl transition flex items-center gap-1.5 text-slate-700 active:scale-95"
              title="Download career stats CSV"
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

            {player.isGuest === 1 && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] sm:text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                  Guest
                </span>
                <button
                  type="button"
                  onClick={handleMakePermanent}
                  className="text-[10px] sm:text-xs bg-red-600 hover:bg-red-700 text-white font-bold px-2.5 py-0.5 rounded-full transition shadow-xs"
                >
                  Make Permanent
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {player.name}
            </h2>
            <div className="inline-block mt-1">
              <span className="text-xs font-bold px-2.5 py-1 bg-red-50 text-red-700 rounded-lg border border-red-200">
                {player.role || 'Player'}
              </span>
            </div>
          </div>

          <div className="flex gap-2.5">
            <div className="flex-1 sm:flex-none bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-2.5 text-center min-w-[90px]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Matches</span>
              <span className="text-xl font-black font-mono text-slate-900">{stats?.totalMatches || 0}</span>
            </div>
            <div className="flex-1 sm:flex-none bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-2.5 text-center min-w-[90px]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Innings</span>
              <span className="text-xl font-black font-mono text-slate-900">{batting.innings || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Career Overview Stats: 2 Columns on mobile (spacious and clear!), 2 Columns on laptop */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Batting Card */}
        <div className="bg-white border-2 border-slate-300 rounded-3xl p-4 sm:p-5 shadow-sm space-y-3.5">
          <div className="flex items-center justify-between border-b-2 border-slate-100 pb-2.5">
            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900">
              Batting Career
            </h3>
            <span className="text-xs font-mono font-black text-red-600 bg-red-50 px-2.5 py-0.5 rounded-lg border border-red-200">
              SR {batting.strikeRate}
            </span>
          </div>

          {/* 2-Column Grid on Mobile for Maximum Breathing Room */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-center">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Runs</span>
              <span className="text-xl font-black font-mono text-slate-900 mt-0.5 block">{batting.runs || 0}</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Balls Faced</span>
              <span className="text-xl font-black font-mono text-slate-900 mt-0.5 block">{batting.balls || 0}</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Highest Score</span>
              <span className="text-xl font-black font-mono text-slate-900 mt-0.5 block">{batting.highestScore || 0}</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Average</span>
              <span className="text-xl font-black font-mono text-slate-900 mt-0.5 block">{batting.average}</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Fours (4s)</span>
              <span className="text-xl font-black font-mono text-slate-900 mt-0.5 block">{batting.fours || 0}</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Sixes (6s)</span>
              <span className="text-xl font-black font-mono text-slate-900 mt-0.5 block">{batting.sixes || 0}</span>
            </div>
          </div>
        </div>

        {/* Bowling Card */}
        <div className="bg-white border-2 border-slate-300 rounded-3xl p-4 sm:p-5 shadow-sm space-y-3.5">
          <div className="flex items-center justify-between border-b-2 border-slate-100 pb-2.5">
            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900">
              Bowling Career
            </h3>
            <span className="text-xs font-mono font-black text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200">
              Econ {bowling.economy}
            </span>
          </div>

          {/* 2-Column Grid on Mobile */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-center">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Wickets</span>
              <span className="text-xl font-black font-mono text-slate-900 mt-0.5 block">{bowling.wickets || 0}</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Overs Bowled</span>
              <span className="text-xl font-black font-mono text-slate-900 mt-0.5 block">{bowling.oversText || '0.0'}</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Best Figures</span>
              <span className="text-xl font-black font-mono text-slate-900 mt-0.5 block">{bowling.bestFigures || '0/0'}</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Runs Given</span>
              <span className="text-xl font-black font-mono text-slate-900 mt-0.5 block">{bowling.runs || 0}</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Average</span>
              <span className="text-xl font-black font-mono text-slate-900 mt-0.5 block">{bowling.average}</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Maidens</span>
              <span className="text-xl font-black font-mono text-slate-900 mt-0.5 block">{bowling.maidens || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Visual Analytics Section */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Runs Scoring Distribution (Segmented Bar + Desktop Donut) */}
        <div className="md:col-span-5 bg-white border-2 border-slate-300 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
          <div className="border-b-2 border-slate-100 pb-2">
            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900">
              Scoring Distribution
            </h3>
            <p className="text-[11px] text-slate-500">Run sources: Boundaries vs Running</p>
          </div>

          {totalRuns === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400 font-semibold">
              No runs scored yet to chart.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Clean Segmented Bar (Breathable on Mobile & Desktop) */}
              <div className="space-y-1.5">
                <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden flex shadow-2xs">
                  {sixesPct > 0 && (
                    <div style={{ width: `${sixesPct}%` }} className="bg-slate-900 h-full" title={`6s: ${sixesPct}%`} />
                  )}
                  {foursPct > 0 && (
                    <div style={{ width: `${foursPct}%` }} className="bg-red-600 h-full" title={`4s: ${foursPct}%`} />
                  )}
                  {singlesPct > 0 && (
                    <div style={{ width: `${singlesPct}%` }} className="bg-slate-400 h-full" title={`1s/2s/3s: ${singlesPct}%`} />
                  )}
                </div>
              </div>

              {/* 3 Spacious Stat Pills (Zero Clutter on Mobile) */}
              <div className="grid grid-cols-3 gap-2 text-center pt-1">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-2.5">
                  <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-slate-900">
                    <span className="w-2 h-2 rounded-full bg-slate-900 shrink-0" />
                    <span>6s</span>
                  </div>
                  <span className="text-base font-black font-mono text-slate-900 mt-0.5 block">{runsInSixes}</span>
                  <span className="text-[10px] text-slate-500 block">{sixesPct}% of runs</span>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-2.5">
                  <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-red-600">
                    <span className="w-2 h-2 rounded-full bg-red-600 shrink-0" />
                    <span>4s</span>
                  </div>
                  <span className="text-base font-black font-mono text-slate-900 mt-0.5 block">{runsInFours}</span>
                  <span className="text-[10px] text-slate-500 block">{foursPct}% of runs</span>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-2.5">
                  <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-slate-600">
                    <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                    <span>Singles</span>
                  </div>
                  <span className="text-base font-black font-mono text-slate-900 mt-0.5 block">{runsInSingles}</span>
                  <span className="text-[10px] text-slate-500 block">{singlesPct}% of runs</span>
                </div>
              </div>

              {/* Desktop Donut SVG (Hidden on Mobile to eliminate clutter) */}
              <div className="hidden md:flex justify-center pt-2">
                <div className="relative w-28 h-28 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="38" stroke="#f1f5f9" strokeWidth="12" fill="transparent" />
                    {singlesStroke > 0 && (
                      <circle
                        cx="50"
                        cy="50"
                        r="38"
                        stroke="#94a3b8"
                        strokeWidth="12"
                        fill="transparent"
                        strokeDasharray={`${singlesStroke} ${circumference}`}
                        strokeDashoffset="0"
                      />
                    )}
                    {foursStroke > 0 && (
                      <circle
                        cx="50"
                        cy="50"
                        r="38"
                        stroke="#dc2626"
                        strokeWidth="12"
                        fill="transparent"
                        strokeDasharray={`${foursStroke} ${circumference}`}
                        strokeDashoffset={-foursOffset}
                      />
                    )}
                    {sixesStroke > 0 && (
                      <circle
                        cx="50"
                        cy="50"
                        r="38"
                        stroke="#0f172a"
                        strokeWidth="12"
                        fill="transparent"
                        strokeDasharray={`${sixesStroke} ${circumference}`}
                        strokeDashoffset={-sixesOffset}
                      />
                    )}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-lg font-black font-mono text-slate-900">{totalRuns}</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Runs</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Performance Progression Curve */}
        <div className="md:col-span-7 bg-white border-2 border-slate-300 rounded-3xl p-4 sm:p-5 shadow-sm space-y-3">
          <div className="flex justify-between items-center border-b-2 border-slate-100 pb-2">
            <div>
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900">
                Performance Trend
              </h3>
              <p className="text-[11px] text-slate-500">Runs scored across recent matches</p>
            </div>
            <span className="text-xs font-bold text-red-600 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" /> Runs
            </span>
          </div>

          {chartMatches.length < 2 ? (
            <div className="py-12 text-center text-xs text-slate-400 font-medium px-4">
              Play at least 2 matches to view career performance progression curve.
            </div>
          ) : (
            <div className="pt-2">
              <div className="w-full">
                <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-36 sm:h-44">
                  {/* Subtle Grid Lines */}
                  <line x1={padX} y1={padY} x2={chartW - padX} y2={padY} stroke="#f1f5f9" strokeWidth="2" />
                  <line x1={padX} y1={chartH / 2} x2={chartW - padX} y2={chartH / 2} stroke="#f1f5f9" strokeWidth="2" />
                  <line x1={padX} y1={chartH - padY} x2={chartW - padX} y2={chartH - padY} stroke="#e2e8f0" strokeWidth="2" />

                  {/* Y Axis Bounds */}
                  <text x={padX - 8} y={padY + 4} textAnchor="end" className="text-[10px] fill-slate-400 font-mono font-bold">
                    {maxMatchRuns}
                  </text>
                  <text x={padX - 8} y={chartH - padY + 3} textAnchor="end" className="text-[10px] fill-slate-400 font-mono font-bold">
                    0
                  </text>

                  {/* Trend Line (Runs) */}
                  <polyline
                    fill="none"
                    stroke="#dc2626"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={runsLinePoints}
                  />

                  {/* Data Points */}
                  {chartMatches.map((m, idx) => {
                    const stepX = (chartW - 2 * padX) / (chartMatches.length - 1);
                    const x = padX + idx * stepX;
                    const r = m.batting?.runs || 0;
                    const y = chartH - padY - ((r / maxMatchRuns) * (chartH - 2 * padY));
                    return (
                      <g key={idx}>
                        <circle cx={x} cy={y} r="5" fill="#ffffff" stroke="#dc2626" strokeWidth="3" />
                        <text
                          x={x}
                          y={y - 9}
                          textAnchor="middle"
                          className="text-[11px] font-black font-mono fill-slate-900"
                        >
                          {r}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
              <div className="flex justify-between px-2 text-[10px] font-bold text-slate-400 uppercase pt-1">
                <span>Older</span>
                <span>Recent</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Match History: Clean Mobile Cards & Spacious Desktop Table */}
      <div className="bg-white border-2 border-slate-300 rounded-3xl p-4 sm:p-6 shadow-sm space-y-4">
        <div>
          <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900">
            Match History & Log
          </h3>
          <p className="text-[11px] text-slate-500">Every match played by {player.name}</p>
        </div>

        {matchLogs.length === 0 ? (
          <p className="text-center text-xs text-slate-400 py-8 font-medium">
            No matches recorded for {player.name} yet.
          </p>
        ) : (
          <>
            {/* MOBILE VIEW: Individual Match Cards (Zero horizontal column squishing!) */}
            <div className="block md:hidden space-y-3">
              {matchLogs.map((log) => (
                <div
                  key={log.matchId}
                  className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-3.5 space-y-2.5"
                >
                  {/* Match Header */}
                  <div className="flex justify-between items-start gap-2 border-b border-slate-200 pb-2">
                    <div>
                      <h4 className="font-black text-sm text-slate-900">vs {log.opponent}</h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {log.date ? new Date(log.date).toLocaleDateString() : 'Match'} • For {log.playerTeam}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-300 text-slate-700 shrink-0">
                      {log.result || log.status}
                    </span>
                  </div>

                  {/* Figures Pills */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {/* Batting */}
                    <div className="bg-white border border-slate-200 rounded-xl p-2.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Batting</span>
                      {log.batting.batted ? (
                        <div className="mt-0.5">
                          <p className="font-black font-mono text-slate-900 text-sm">
                            {log.batting.runs} <span className="text-xs font-normal text-slate-500">({log.batting.balls}b)</span>
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            {log.batting.isOut ? (log.batting.dismissal?.type || 'out') : 'not out'}
                            {log.batting.fours > 0 && ` • ${log.batting.fours}x4`}
                            {log.batting.sixes > 0 && ` • ${log.batting.sixes}x6`}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic mt-0.5">Did not bat</p>
                      )}
                    </div>

                    {/* Bowling */}
                    <div className="bg-white border border-slate-200 rounded-xl p-2.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Bowling</span>
                      {log.bowling.bowled ? (
                        <div className="mt-0.5">
                          <p className="font-black font-mono text-slate-900 text-sm">
                            {log.bowling.wickets}/{log.bowling.runs} <span className="text-xs font-normal text-slate-500">({log.bowling.oversText} ov)</span>
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            Econ {log.bowling.economy}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic mt-0.5">Did not bowl</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* DESKTOP VIEW: Spacious HTML Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200 text-xs font-bold text-slate-400 uppercase">
                    <th className="py-3 pr-3">Match & Opponent</th>
                    <th className="py-3 px-3 text-right">Batting</th>
                    <th className="py-3 px-3 text-right">Bowling</th>
                    <th className="py-3 pl-3 text-right">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {matchLogs.map((log) => (
                    <tr key={log.matchId} className="hover:bg-slate-50/60 transition">
                      <td className="py-3.5 pr-3">
                        <div className="font-bold text-slate-900">vs {log.opponent}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {log.date ? new Date(log.date).toLocaleDateString() : 'Match'} • For {log.playerTeam}
                        </div>
                      </td>

                      <td className="py-3.5 px-3 text-right font-mono">
                        {log.batting.batted ? (
                          <div>
                            <span className="font-black text-slate-900">{log.batting.runs}</span>
                            <span className="text-slate-500 ml-1">({log.batting.balls}b)</span>
                            <div className="text-[11px] text-slate-400 font-sans mt-0.5">
                              {log.batting.isOut ? (log.batting.dismissal?.type || 'out') : 'not out'}
                              {log.batting.fours > 0 && ` • ${log.batting.fours}x4`}
                              {log.batting.sixes > 0 && ` • ${log.batting.sixes}x6`}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic font-sans text-xs">DNB</span>
                        )}
                      </td>

                      <td className="py-3.5 px-3 text-right font-mono">
                        {log.bowling.bowled ? (
                          <div>
                            <span className="font-black text-slate-900">{log.bowling.wickets}/{log.bowling.runs}</span>
                            <span className="text-slate-500 ml-1">({log.bowling.oversText} ov)</span>
                            <div className="text-[11px] text-slate-400 font-sans mt-0.5">
                              Econ {log.bowling.economy}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic font-sans text-xs">—</span>
                        )}
                      </td>

                      <td className="py-3.5 pl-3 text-right">
                        <span className="text-xs font-bold text-slate-700">
                          {log.result || log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
