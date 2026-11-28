import React, { useState, useEffect } from 'react';
import Header from './components/common/Header.jsx';
import Toast from './components/common/Toast.jsx';
import PlayerList from './components/PlayerPool/PlayerList.jsx';
import MatchSetup from './components/MatchSetup/MatchSetup.jsx';
import ScoringScreen from './components/Scoring/ScoringScreen.jsx';
import MatchSummary from './components/MatchSummary/MatchSummary.jsx';
import MatchList from './components/MatchList/MatchList.jsx';
import { getActiveMatch, getAllPlayers } from './db/operations.js';
import { initBackgroundSync, resetAllData } from './sync/sync.js';

const VALID_TABS = ['scoring', 'setup', 'players', 'matches', 'summary'];

function getTabFromHash() {
  if (typeof window === 'undefined') return 'scoring';
  const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return VALID_TABS.includes(raw) ? raw : null;
}

export default function App() {
  const [activeTab, setActiveTab] = useState(() => getTabFromHash() || 'scoring');
  const [activeMatch, setActiveMatch] = useState(null);
  const [viewingSummaryMatch, setViewingSummaryMatch] = useState(null);
  const [initialOpeners, setInitialOpeners] = useState(null);
  const [players, setPlayers] = useState([]);
  const [toast, setToast] = useState(null);

  const navigateTab = (newTab, options = {}) => {
    if (!VALID_TABS.includes(newTab)) return;
    const targetHash = `#/${newTab}`;
    if (window.location.hash !== targetHash) {
      if (options.replace) {
        window.history.replaceState(null, '', targetHash);
      } else {
        window.history.pushState(null, '', targetHash);
      }
    }
    setActiveTab(newTab);
  };

  const handleGoBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigateTab('scoring');
    }
  };

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
    const handlePopState = () => {
      const tab = getTabFromHash();
      if (tab) {
        setActiveTab(tab);
      } else {
        setActiveTab('scoring');
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);

    // Normalize initial URL hash if empty
    if (!window.location.hash) {
      const initial = getTabFromHash() || 'scoring';
      window.history.replaceState(null, '', `#/${initial}`);
    }

    refreshPlayers();
    checkActiveMatch();
    const cleanupSync = initBackgroundSync(async () => {
      await refreshPlayers();
      await checkActiveMatch();
    });

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
      cleanupSync();
    };
  }, []);

  // Redirect to match history if user reloads while on summary tab without in-memory match
  useEffect(() => {
    if (activeTab === 'summary' && !viewingSummaryMatch) {
      navigateTab('matches', { replace: true });
    }
  }, [activeTab, viewingSummaryMatch]);

  const handleMatchStarted = (match, openers) => {
    refreshPlayers();
    setActiveMatch(match);
    setInitialOpeners(openers);
    navigateTab('scoring');
    showToast('Match started', 'success');
  };

  const handleMatchCompleted = async (completedMatch, summary) => {
    await refreshPlayers();
    setActiveMatch(null);
    setViewingSummaryMatch(completedMatch);
    navigateTab('summary');
    showToast(summary || 'Match completed', 'success');
  };

  const handleSelectMatch = (m) => {
    refreshPlayers();
    if (m.status === 'innings1' || m.status === 'innings2') {
      setActiveMatch(m);
      navigateTab('scoring');
    } else {
      setViewingSummaryMatch(m);
      navigateTab('summary');
    }
  };

  const handleResetAll = async () => {
    const confirmed = window.confirm("Are you sure you want to clear all matches, players, and ball events? This will reset the app completely fresh.");
    if (!confirmed) return;
    try {
      await resetAllData();
      await refreshPlayers();
      setActiveMatch(null);
      setViewingSummaryMatch(null);
      navigateTab('setup');
      showToast('All records cleared successfully', 'info');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <Header
        activeTab={activeTab}
        setActiveTab={navigateTab}
        hasActiveMatch={Boolean(activeMatch && (activeMatch.status === 'innings1' || activeMatch.status === 'innings2'))}
        onResetAll={handleResetAll}
        onBack={handleGoBack}
      />

        <main className="flex-1 w-full max-w-6xl mx-auto p-2 sm:p-4 md:p-6 transition-opacity duration-150">
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
                      onClick={() => navigateTab('setup')}
                      className="w-full py-3.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-black text-sm rounded-2xl shadow-xs transition"
                    >
                      Start a Match
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateTab('matches')}
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
              onNewMatch={() => navigateTab('setup')}
              showToast={showToast}
            />
          )}

          {/* MATCH SUMMARY / SCORECARD TAB */}
          {activeTab === 'summary' && viewingSummaryMatch && (
            <MatchSummary
              match={viewingSummaryMatch}
              players={players}
              onBack={handleGoBack}
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
