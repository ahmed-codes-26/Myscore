import React, { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import Header from './components/common/Header.jsx';
import Toast from './components/common/Toast.jsx';
import PlayerList from './components/PlayerPool/PlayerList.jsx';
import MatchSetup from './components/MatchSetup/MatchSetup.jsx';
import ScoringScreen from './components/Scoring/ScoringScreen.jsx';
import MatchSummary from './components/MatchSummary/MatchSummary.jsx';
import MatchList from './components/MatchList/MatchList.jsx';
import { getActiveMatch, getAllPlayers } from './db/operations.js';
import { initBackgroundSync } from './sync/sync.js';

export default function App() {
  const [activeTab, setActiveTab] = useState('scoring');
  const [activeMatch, setActiveMatch] = useState(null);
  const [viewingSummaryMatch, setViewingSummaryMatch] = useState(null);
  const [initialOpeners, setInitialOpeners] = useState(null);
  const [players, setPlayers] = useState([]);
  const [toast, setToast] = useState(null);

  const mainContentRef = useRef(null);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 2800);
  };

  const refreshPlayers = async () => {
    try {
      const list = await getAllPlayers();
      setPlayers(list);
    } catch (err) {
      console.error(err);
    }
  };

  const checkActiveMatch = async () => {
    try {
      const current = await getActiveMatch();
      if (current && (current.status === 'innings1' || current.status === 'innings2')) {
        setActiveMatch(current);
      } else {
        setActiveMatch(null);
      }
    } catch (err) {
      console.error(err);
      setActiveMatch(null);
    }
  };

  useEffect(() => {
    refreshPlayers();
    checkActiveMatch();
    const cleanupSync = initBackgroundSync(async () => {
      await refreshPlayers();
      await checkActiveMatch();
    });
    return () => {
      cleanupSync();
    };
  }, []);

  // GSAP Tab transition animation (smooth opacity fade, no layout shift)
  useEffect(() => {
    if (mainContentRef.current) {
      gsap.fromTo(
        mainContentRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.18, ease: 'power2.out' }
      );
    }
  }, [activeTab]);

  const handleMatchStarted = (match, openers) => {
    refreshPlayers();
    setActiveMatch(match);
    setInitialOpeners(openers);
    setActiveTab('scoring');
    showToast('Match started', 'success');
  };

  const handleMatchCompleted = async (completedMatch, summary) => {
    await refreshPlayers();
    setActiveMatch(null);
    setViewingSummaryMatch(completedMatch);
    setActiveTab('summary');
    showToast(summary || 'Match completed', 'success');
  };

  const handleSelectMatch = (m) => {
    refreshPlayers();
    if (m.status === 'innings1' || m.status === 'innings2') {
      setActiveMatch(m);
      setActiveTab('scoring');
    } else {
      setViewingSummaryMatch(m);
      setActiveTab('summary');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        hasActiveMatch={Boolean(activeMatch && (activeMatch.status === 'innings1' || activeMatch.status === 'innings2'))}
      />

      <main ref={mainContentRef} className="flex-1">
        {/* SCORING / LIVE MATCH TAB */}
        {activeTab === 'scoring' && (
          activeMatch ? (
            <ScoringScreen
              match={activeMatch}
              players={players}
              initialOpeners={initialOpeners}
              onMatchCompleted={handleMatchCompleted}
              showToast={showToast}
            />
          ) : (
            <div className="max-w-md mx-auto p-4 pt-16 text-center space-y-4 font-sans text-slate-900">
              <div className="bg-white border-2 border-slate-300 rounded-3xl p-8 shadow-sm space-y-5">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-red-50 border-2 border-red-200 flex items-center justify-center text-red-600 shadow-xs">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900">No Live Match</h2>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1">
                    There is currently no match in progress.
                  </p>
                </div>
                <div className="space-y-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('setup')}
                    className="w-full py-3.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-black text-sm rounded-2xl shadow-xs transition"
                  >
                    Start a Match
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('matches')}
                    className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
                  >
                    View Match History
                  </button>
                </div>
              </div>
            </div>
          )
        )}

        {/* NEW MATCH SETUP TAB */}
        {activeTab === 'setup' && (
          <MatchSetup
            onMatchStarted={handleMatchStarted}
            onPlayerAdded={refreshPlayers}
            showToast={showToast}
          />
        )}

        {/* PLAYERS TAB */}
        {activeTab === 'players' && (
          <PlayerList
            onPlayerAdded={refreshPlayers}
            showToast={showToast}
          />
        )}

        {/* MATCHES LIST TAB */}
        {activeTab === 'matches' && (
          <MatchList
            onSelectMatch={handleSelectMatch}
            onNewMatch={() => setActiveTab('setup')}
            showToast={showToast}
          />
        )}

        {/* MATCH SUMMARY / SCORECARD TAB */}
        {activeTab === 'summary' && viewingSummaryMatch && (
          <MatchSummary
            match={viewingSummaryMatch}
            players={players}
            onBack={() => setActiveTab('matches')}
            showToast={showToast}
          />
        )}
      </main>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
