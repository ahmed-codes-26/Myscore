import React, { useState, useEffect } from 'react';
import { getAllMatches } from '../../db/operations.js';

export default function MatchList({ onSelectMatch, onNewMatch, showToast }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadMatches = async () => {
    try {
      const list = await getAllMatches();
      setMatches(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMatches();
  }, []);

  return (
    <div className="max-w-md lg:max-w-4xl mx-auto p-3 sm:p-5 space-y-4 font-sans text-slate-900 pb-20">
      <div className="bg-white border-2 border-slate-300 rounded-3xl p-4 sm:p-6 shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Matches</h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              All matches recorded offline in your local device.
            </p>
          </div>
          <button
            onClick={onNewMatch}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-black text-xs sm:text-sm rounded-xl transition shadow-xs"
          >
            + New Match
          </button>
        </div>

        {loading ? (
          <p className="text-center text-xs text-slate-400 py-8">Loading matches...</p>
        ) : matches.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <p className="text-xs sm:text-sm text-slate-500">No matches found in your local history.</p>
            <button
              onClick={onNewMatch}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-xs font-black text-white rounded-xl shadow-xs transition"
            >
              Start First Match
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t-2 border-slate-100">
            {matches.map(m => {
              const isActive = (m.status === 'innings1' || m.status === 'innings2');
              const dateStr = new Date(m.createdAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });

              return (
                <div
                  key={m._id}
                  onClick={() => onSelectMatch(m)}
                  className="p-3.5 bg-slate-50 hover:bg-red-50/50 border-2 border-slate-200 hover:border-red-300 rounded-2xl flex flex-col justify-between gap-2.5 cursor-pointer transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-sm sm:text-base text-slate-900 truncate">
                      {m.team1.name} <span className="text-red-600 font-bold">vs</span> {m.team2.name}
                    </span>
                    {isActive ? (
                      <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded-full font-black animate-pulse shrink-0">
                        LIVE
                      </span>
                    ) : (
                      <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-bold uppercase shrink-0">
                        {m.status}
                      </span>
                    )}
                  </div>

                  {m.result?.summary ? (
                    <p className="text-xs font-bold text-red-600 bg-white p-2 rounded-xl border border-red-200 truncate">
                      {m.result.summary}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500">Match in progress...</p>
                  )}

                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 pt-1 border-t border-slate-200/60">
                    <span>{m.rules.oversPerInnings} ov • {m.rules.playersPerSide} per side</span>
                    <span>{dateStr}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
