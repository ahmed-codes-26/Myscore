import React, { useState, useEffect } from 'react';
import { subscribeSyncStatus, syncAll, getUnsyncedCounts } from '../../sync/sync.js';

export default function Header({ activeTab, setActiveTab, hasActiveMatch }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [syncInfo, setSyncInfo] = useState({
    isSyncing: false,
    unsyncedCount: 0,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true
  });

  useEffect(() => {
    // Initial counts
    getUnsyncedCounts().then(counts => {
      setSyncInfo(prev => ({ ...prev, unsyncedCount: counts.total }));
    });

    const unsubscribe = subscribeSyncStatus(status => {
      setSyncInfo(prev => ({
        ...prev,
        isSyncing: status.isSyncing,
        unsyncedCount: status.unsyncedCount !== undefined ? status.unsyncedCount : prev.unsyncedCount
      }));
    });

    const handleOnline = () => setSyncInfo(prev => ({ ...prev, isOnline: true }));
    const handleOffline = () => setSyncInfo(prev => ({ ...prev, isOnline: false }));

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const navigateTo = (tab) => {
    setActiveTab(tab);
    setIsMenuOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white border-b-2 border-slate-200 px-4 py-2.5 shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <button
            onClick={() => setActiveTab(hasActiveMatch ? 'scoring' : 'matches')}
            className="text-left focus:outline-none"
          >
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
              MyScore
            </h1>
          </button>

          {/* Desktop Navigation Links with Animated Bottom Border */}
          <nav className="hidden md:flex items-center gap-6">
            <button
              type="button"
              onClick={() => setActiveTab('scoring')}
              className={`relative py-2 text-xs sm:text-sm font-bold transition group flex items-center gap-1.5 ${
                activeTab === 'scoring' ? 'text-red-600' : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <span>Live Match</span>
              {hasActiveMatch && (
                <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
              )}
              {/* Bottom animated border: 100% when active, 0 to 100% on hover */}
              <span
                className={`absolute bottom-0 left-0 h-0.5 bg-red-600 transition-all duration-300 ${
                  activeTab === 'scoring' ? 'w-full' : 'w-0 group-hover:w-full'
                }`}
              />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('setup')}
              className={`relative py-2 text-xs sm:text-sm font-bold transition group ${
                activeTab === 'setup' ? 'text-red-600' : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <span>New Match</span>
              <span
                className={`absolute bottom-0 left-0 h-0.5 bg-red-600 transition-all duration-300 ${
                  activeTab === 'setup' ? 'w-full' : 'w-0 group-hover:w-full'
                }`}
              />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('players')}
              className={`relative py-2 text-xs sm:text-sm font-bold transition group ${
                activeTab === 'players' ? 'text-red-600' : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <span>Players</span>
              <span
                className={`absolute bottom-0 left-0 h-0.5 bg-red-600 transition-all duration-300 ${
                  activeTab === 'players' ? 'w-full' : 'w-0 group-hover:w-full'
                }`}
              />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('matches')}
              className={`relative py-2 text-xs sm:text-sm font-bold transition group ${
                activeTab === 'matches' ? 'text-red-600' : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <span>Matches</span>
              <span
                className={`absolute bottom-0 left-0 h-0.5 bg-red-600 transition-all duration-300 ${
                  activeTab === 'matches' ? 'w-full' : 'w-0 group-hover:w-full'
                }`}
              />
            </button>
          </nav>

          {/* Sync Status Badge (Desktop) */}
          <div className="hidden md:flex items-center gap-2">
            <button
              type="button"
              onClick={() => syncAll()}
              disabled={syncInfo.isSyncing || !syncInfo.isOnline}
              title={syncInfo.isOnline ? 'Tap to sync with cloud server' : 'Offline mode'}
              className="text-xs font-bold border-2 border-slate-200 hover:border-red-600 px-3 py-1.5 rounded-xl transition flex items-center gap-2 text-slate-700 hover:text-red-600 disabled:opacity-60 disabled:hover:border-slate-200 disabled:hover:text-slate-700"
            >
              {syncInfo.isSyncing ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" />
                  </svg>
                  <span>Syncing...</span>
                </>
              ) : !syncInfo.isOnline ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  <span>Offline</span>
                </>
              ) : syncInfo.unsyncedCount > 0 ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                  <span>{syncInfo.unsyncedCount} Unsynced • Sync</span>
                </>
              ) : (
                <>
                  {/* Straight-line bold checkmark */}
                  <svg className="w-3.5 h-3.5 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="square">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>Cloud Synced</span>
                </>
              )}
            </button>
          </div>

          {/* Hamburger button (Mobile Drawer) */}
          <button
            type="button"
            onClick={() => setIsMenuOpen(true)}
            aria-label="Open menu"
            className="md:hidden p-2 rounded-xl text-slate-800 hover:bg-slate-100 transition active:scale-95 border border-slate-200"
          >
            <svg
              className="w-5 h-5 text-slate-900"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth="2.5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </header>

      {/* Slide-out Side Drawer (GPU Hardware Accelerated, Zero Lag) */}
      <div
        className={`fixed inset-0 z-50 transition-opacity duration-200 ${
          isMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Solid Backdrop (no heavy backdrop-blur filter) */}
        <div
          className="fixed inset-0 bg-black/60"
          onClick={() => setIsMenuOpen(false)}
        />

        {/* Panel (CSS transform hardware accelerated via will-change-transform) */}
        <div
          className={`relative ml-auto w-72 max-w-[85vw] bg-white h-full shadow-2xl flex flex-col z-10 border-l-4 border-red-600 overflow-hidden transform transition-transform duration-250 ease-out will-change-transform ${
            isMenuOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          {/* Red Brand Header */}
          <div className="bg-red-600 text-white px-5 py-4 flex items-center justify-between shadow-xs">
            <span className="text-xl font-black tracking-tight">MyScore</span>
            <button
              type="button"
              onClick={() => setIsMenuOpen(false)}
              className="w-8 h-8 rounded-lg bg-red-700 hover:bg-red-800 flex items-center justify-center text-white text-sm font-bold transition"
            >
              ✕
            </button>
          </div>

          {/* Menu options: Pure Red & White */}
          <nav className="flex-1 p-5 space-y-2.5 overflow-y-auto">
            <button
              type="button"
              onClick={() => navigateTo('scoring')}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold transition flex items-center justify-between border-2 ${
                activeTab === 'scoring'
                  ? 'bg-red-600 text-white border-red-600 shadow-xs'
                  : 'bg-white text-slate-800 border-slate-200 hover:border-red-400 hover:text-red-600'
              }`}
            >
              <span>Live Match</span>
              {hasActiveMatch ? (
                <span className={`w-2.5 h-2.5 rounded-full ${activeTab === 'scoring' ? 'bg-white' : 'bg-red-600'} animate-pulse`} />
              ) : (
                <span className="text-[11px] font-normal opacity-60">None</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => navigateTo('setup')}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold transition border-2 ${
                activeTab === 'setup'
                  ? 'bg-red-600 text-white border-red-600 shadow-xs'
                  : 'bg-white text-slate-800 border-slate-200 hover:border-red-400 hover:text-red-600'
              }`}
            >
              New Match
            </button>

            <button
              type="button"
              onClick={() => navigateTo('players')}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold transition border-2 ${
                activeTab === 'players'
                  ? 'bg-red-600 text-white border-red-600 shadow-xs'
                  : 'bg-white text-slate-800 border-slate-200 hover:border-red-400 hover:text-red-600'
              }`}
            >
              Players
            </button>

            <button
              type="button"
              onClick={() => navigateTo('matches')}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold transition border-2 ${
                activeTab === 'matches'
                  ? 'bg-red-600 text-white border-red-600 shadow-xs'
                  : 'bg-white text-slate-800 border-slate-200 hover:border-red-400 hover:text-red-600'
              }`}
            >
              Matches
            </button>
          </nav>

          {/* Mobile Drawer Cloud Sync Footer */}
          <div className="p-4 bg-slate-50 border-t-2 border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span className="uppercase tracking-wider text-[10px] text-slate-400">Cloud Sync</span>
              <span className="flex items-center gap-1.5">
                {!syncInfo.isOnline ? (
                  'Offline'
                ) : syncInfo.isSyncing ? (
                  'Syncing...'
                ) : syncInfo.unsyncedCount > 0 ? (
                  `${syncInfo.unsyncedCount} Unsaved`
                ) : (
                  'Synced'
                )}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                syncAll();
                setIsMenuOpen(false);
              }}
              disabled={syncInfo.isSyncing || !syncInfo.isOnline}
              className="w-full py-2 px-3 rounded-xl bg-white border-2 border-slate-300 hover:border-red-600 hover:text-red-600 text-slate-800 text-xs font-black transition text-center disabled:opacity-50"
            >
              {syncInfo.isSyncing ? 'Syncing in Progress...' : 'Sync Now with Server'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
