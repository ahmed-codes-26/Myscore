import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

export default function Toast({ message, type = 'info', onClose }) {
  const toastRef = useRef(null);

  useEffect(() => {
    if (toastRef.current) {
      gsap.fromTo(
        toastRef.current,
        { opacity: 0, y: -15, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.25, ease: 'power2.out' }
      );
    }
  }, [message]);

  if (!message) return null;

  const bgColors = {
    info: 'bg-slate-900 border-slate-700 text-white',
    success: 'bg-red-600 border-red-700 text-white',
    warning: 'bg-red-700 border-red-800 text-white',
    danger: 'bg-red-800 border-red-900 text-white'
  };

  return (
    <div className="fixed top-5 right-5 z-50 pointer-events-none">
      <div
        ref={toastRef}
        className={`px-4 py-2.5 rounded-xl border shadow-xl flex items-center gap-2.5 text-xs font-bold pointer-events-auto ${
          bgColors[type] || bgColors.info
        }`}
      >
        <span>{message}</span>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-2 text-xs opacity-75 hover:opacity-100 p-0.5"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
