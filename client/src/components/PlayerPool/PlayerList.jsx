import React, { useState, useEffect } from 'react';
import { getAllPlayers, makePlayerPermanent } from '../../db/operations.js';
import AddPlayerModal from './AddPlayerModal.jsx';
import PlayerProfile from './PlayerProfile.jsx';

export default function PlayerList({ onPlayerAdded, showToast }) {
  const [players, setPlayers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadPlayers = async () => {
    try {
      const list = await getAllPlayers();
      setPlayers(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlayers();
  }, []);

  const handleMakePermanent = async (e, player) => {
    e.stopPropagation();
    try {
      await makePlayerPermanent(player._id);
      await loadPlayers();
      onPlayerAdded?.();
      showToast(`${player.name} is now permanent`, 'success');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  const handlePlayerAdded = async (newPlayer) => {
    await loadPlayers();
    onPlayerAdded?.(newPlayer);
  };

  if (selectedPlayer) {
    return (
      <PlayerProfile
        player={selectedPlayer}
        onBack={() => {
          setSelectedPlayer(null);
          loadPlayers();
        }}
        onPlayerUpdated={() => {
          loadPlayers();
          setSelectedPlayer(prev => ({ ...prev, isGuest: 0 }));
        }}
        showToast={showToast}
      />
    );
  }

  const filtered = players.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
    (p.role && p.role.toLowerCase().includes(searchTerm.toLowerCase().trim()))
  );

  return (
    <div className="max-w-md lg:max-w-5xl mx-auto p-3 sm:p-5 space-y-4 font-sans text-slate-900 pb-20">
      {/* Top Header Card */}
      <div className="bg-white border-2 border-slate-300 rounded-3xl p-4 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Players</h2>
              <span className="text-xs font-bold px-2.5 py-0.5 bg-red-100 text-red-700 rounded-full">
                {players.length}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Tap any player to view career stats, charts, and match history.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="w-full sm:w-auto px-5 py-3 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-black text-xs sm:text-sm rounded-2xl shadow-xs transition text-center shrink-0"
          >
            + Add New Player
          </button>
        </div>

        {/* Search */}
        <div className="pt-2 border-t-2 border-slate-100">
          <input
            type="text"
            placeholder="Search players by name or role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border-2 border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 placeholder-slate-500 focus:outline-none focus:border-red-500 transition"
          />
        </div>
      </div>

      {/* Directory Content */}
      <div className="space-y-3">
        {loading ? (
          <div className="bg-white border-2 border-slate-300 rounded-2xl p-8 text-center text-xs text-slate-500 font-bold">
            Loading player directory...
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border-2 border-slate-300 rounded-2xl p-8 text-center space-y-2">
            <p className="text-xs font-bold text-slate-500">
              {players.length === 0 ? 'No players added yet.' : 'No matching players found.'}
            </p>
            {players.length === 0 && (
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="text-xs text-red-600 font-black hover:underline"
              >
                Click here to add your first player
              </button>
            )}
          </div>
        ) : (
          <>
            {/* MOBILE VIEW: Clean, spacious list cards */}
            <div className="block sm:hidden space-y-2.5">
              {filtered.map((player) => (
                <div
                  key={player._id}
                  onClick={() => setSelectedPlayer(player)}
                  className="bg-white border-2 border-slate-300 hover:border-red-500 active:bg-slate-50 rounded-2xl p-3.5 flex items-center justify-between transition cursor-pointer shadow-xs group"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 text-slate-800 font-black flex items-center justify-center text-sm shrink-0">
                      {player.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm text-slate-900 truncate group-hover:text-red-600 transition">
                        {player.name}
                      </h3>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {player.role || 'Player'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {player.isGuest === 1 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                        Guest
                      </span>
                    )}
                    {/* Bold straight-line arrow */}
                    <svg
                      className="w-4 h-4 text-slate-400 group-hover:text-red-600 shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.5"
                      strokeLinecap="square"
                      strokeLinejoin="miter"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>

            {/* TABLET / DESKTOP VIEW: Clean Table without redundant View Stats column */}
            <div className="hidden sm:block bg-white border-2 border-slate-300 rounded-3xl p-6 shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b-2 border-slate-200 text-xs font-bold text-slate-400 uppercase">
                      <th className="py-3 pr-3">Player</th>
                      <th className="py-3 px-3">Role / Description</th>
                      <th className="py-3 pl-3 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((player) => (
                      <tr
                        key={player._id}
                        onClick={() => setSelectedPlayer(player)}
                        className="hover:bg-red-50/50 cursor-pointer transition group"
                      >
                        <td className="py-3.5 pr-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 group-hover:border-red-300 text-slate-800 font-black flex items-center justify-center text-xs shrink-0 transition">
                              {player.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-bold text-slate-900 group-hover:text-red-600 transition">
                              {player.name}
                            </span>
                          </div>
                        </td>

                        <td className="py-3.5 px-3 text-slate-600 font-medium text-xs sm:text-sm">
                          {player.role || 'Player'}
                        </td>

                        <td className="py-3.5 pl-3 text-right">
                          <div className="inline-flex items-center gap-3">
                            {player.isGuest === 1 && (
                              <div className="inline-flex items-center gap-2">
                                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                                  Guest
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => handleMakePermanent(e, player)}
                                  className="text-xs text-red-600 font-bold hover:underline"
                                >
                                  Make Permanent
                                </button>
                              </div>
                            )}
                            {/* Bold straight-line arrow */}
                            <svg
                              className="w-4 h-4 text-slate-400 group-hover:text-red-600 group-hover:translate-x-0.5 shrink-0 transition"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3.5"
                              strokeLinecap="square"
                              strokeLinejoin="miter"
                            >
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Add Player Modal */}
      <AddPlayerModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onPlayerAdded={handlePlayerAdded}
        showToast={showToast}
      />
    </div>
  );
}
