import { useEffect, useRef } from 'react';
import { IconX } from '@tabler/icons-react';

export default function BottomSheet({ isOpen, onClose, title, children }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) panelRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className="
          relative bg-white w-full outline-none
          rounded-t-2xl max-h-[90vh] overflow-y-auto
          md:rounded-2xl md:w-full md:max-w-[480px] md:max-h-[80vh]
          animate-in slide-in-from-bottom-4
        "
      >
        {/* Mobile drag handle */}
        <div className="md:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-neutral-300" />
        </div>

        {/* Desktop close button */}
        <button
          onClick={onClose}
          className="hidden md:flex absolute top-4 right-4 items-center justify-center w-8 h-8 rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
          aria-label="Close"
        >
          <IconX size={18} />
        </button>

        <div className="px-5 pt-2 pb-5">
          {title && (
            <h2 className="text-base font-semibold text-neutral-900 mb-4 pr-8">{title}</h2>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
