import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import { addPlayer, checkPlayerNameConflict } from '../../db/operations.js';

export default function AddPlayerModal({ isOpen, onClose, onPlayerAdded, showToast }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [isGuest, setIsGuest] = useState(false);
  const [similarWarning, setSimilarWarning] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const modalRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setRole('');
      setIsGuest(false);
      setSimilarWarning(null);
      setSubmitting(false);

      if (modalRef.current) {
        gsap.fromTo(
          modalRef.current,
          { scale: 0.94, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.22, ease: 'power2.out' }
        );
      }
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e, force = false) => {
    if (e) e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      showToast('Player name is required', 'warning');
      return;
    }

    if (!force) {
      const conflict = await checkPlayerNameConflict(trimmed);
      if (conflict.error) {
        showToast(conflict.error, 'danger');
        return;
      }
      if (conflict.warning) {
        setSimilarWarning(conflict);
        return;
      }
    }

    setSubmitting(true);
    try {
      const created = await addPlayer({
        name: trimmed,
        role: role.trim(),
        isGuest: isGuest ? 1 : 0
      });
      showToast(`Added ${created.name}`, 'success');
      onPlayerAdded?.(created);
      onClose();
    } catch (err) {
      showToast(err.message, 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  const modalContent = (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[9999] w-screen h-screen min-h-screen min-w-full bg-black/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
    >
      <div
        ref={modalRef}
        className="my-auto bg-white border-2 border-slate-300 rounded-2xl w-full max-w-md p-5 sm:p-6 space-y-4 shadow-xl"
      >
        <div className="flex justify-between items-center pb-2 border-b-2 border-slate-100">
          <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
            Add New Player
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
            title="Close"
          >
            {/* Bold straight-line cross icon */}
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="square"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-4 pt-1">
          {/* Player Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Player Name *</label>
            <input
              type="text"
              required
              autoFocus
              placeholder="e.g. Ahmed Ali"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-50 border-2 border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-red-500 transition"
            />
          </div>

          {/* Role / Description (Clean input with no suggestion badges) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              Role / Description <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Right-arm Fast, All-rounder"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full bg-slate-50 border-2 border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:border-red-500 transition"
            />
          </div>

          {/* Guest Checkbox */}
          <div className="pt-2 border-t border-slate-100">
            <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isGuest}
                onChange={(e) => setIsGuest(e.target.checked)}
                className="w-4 h-4 rounded border-2 border-slate-300 text-red-600 focus:ring-0 accent-red-600"
              />
              <span>Mark as Guest (Excluded from career statistics)</span>
            </label>
          </div>

          {/* Similar Warning Dialog */}
          {similarWarning && (
            <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-3.5 space-y-2 text-xs text-red-800">
              <p className="font-bold">{similarWarning.warning}</p>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setSimilarWarning(null)}
                  className="px-3 py-1 bg-white border border-slate-300 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmit(null, true)}
                  className="px-3.5 py-1 bg-red-600 text-white font-black rounded-xl shadow-xs"
                >
                  Add Anyway
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-3 border-t-2 border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs font-black rounded-xl shadow-xs transition"
            >
              {submitting ? 'Creating...' : 'Create Player'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
}
