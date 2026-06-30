import * as TablerIcons from '@tabler/icons-react';

export default function EmptyState({ icon, title, message, actionLabel, onAction }) {
  const iconName = icon
    ? `Icon${icon.charAt(0).toUpperCase()}${icon.slice(1)}`
    : null;
  const Icon = iconName ? TablerIcons[iconName] : null;

  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {Icon && <Icon size={48} stroke={1} className="text-neutral-300" />}
      <p className="text-base font-semibold text-neutral-700">{title}</p>
      {message && <p className="text-sm text-neutral-400 max-w-xs">{message}</p>}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
