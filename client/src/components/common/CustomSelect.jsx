import React, { useState, useRef, useEffect } from 'react';

export default function CustomSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select an option',
  className = '',
  buttonClassName = '',
  disabled = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Normalize options: can be array of strings or array of { value, label, sublabel }
  const normalizedOptions = options.map(opt => {
    if (typeof opt === 'object' && opt !== null) {
      return {
        value: opt.value,
        label: opt.label || opt.value,
        sublabel: opt.sublabel || ''
      };
    }
    return { value: opt, label: String(opt), sublabel: '' };
  });

  const selectedOption = normalizedOptions.find(o => String(o.value) === String(value));

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('touchstart', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isOpen]);

  const handleSelect = (val) => {
    onChange?.(val);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative w-full text-left font-sans ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full bg-white border-2 rounded-xl px-3 py-2 text-xs font-bold flex items-center justify-between gap-2 transition shadow-xs focus:outline-none ${
          isOpen
            ? 'border-red-500 ring-2 ring-red-100 text-slate-900'
            : 'border-slate-300 text-slate-800 hover:border-slate-400'
        } ${disabled ? 'opacity-40 cursor-not-allowed bg-slate-50' : 'cursor-pointer'} ${buttonClassName}`}
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : placeholder}
          {selectedOption?.sublabel && (
            <span className="ml-1 text-[10px] text-slate-400 font-normal">
              {selectedOption.sublabel}
            </span>
          )}
        </span>

        {/* Custom Red Chevron */}
        <svg
          className={`w-4 h-4 text-red-600 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth="2.5"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border-2 border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-56 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
          {normalizedOptions.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-400 text-center">
              No options available
            </div>
          ) : (
            <div className="p-1 space-y-0.5">
              {normalizedOptions.map((opt) => {
                const isSelected = String(opt.value) === String(value);
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition ${
                      isSelected
                        ? 'bg-red-50 text-red-600 font-bold'
                        : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span className="truncate">
                      {opt.label}
                      {opt.sublabel && (
                        <span className="ml-1 text-[10px] text-slate-400 font-normal">
                          {opt.sublabel}
                        </span>
                      )}
                    </span>
                    {isSelected && (
                      <span className="text-red-600 font-black text-xs">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
