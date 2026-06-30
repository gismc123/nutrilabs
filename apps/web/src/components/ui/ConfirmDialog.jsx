import { useUiStore } from '../../store/uiStore.js';

export default function ConfirmDialog() {
  const confirmDialog = useUiStore((s) => s.confirmDialog);
  const closeConfirm = useUiStore((s) => s.closeConfirm);

  if (!confirmDialog?.open) return null;

  const { title, message, onConfirm } = confirmDialog;

  const handleConfirm = () => {
    onConfirm?.();
    closeConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={closeConfirm}
        aria-hidden="true"
      />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-base font-semibold text-neutral-900 mb-2">{title}</h2>
        <p className="text-sm text-neutral-500 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={closeConfirm}
            className="px-4 py-2 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-danger-600 rounded-lg hover:bg-danger-700 transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
