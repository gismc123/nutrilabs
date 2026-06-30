import { IconUser, IconUsers } from '@tabler/icons-react';

export default function HouseholdBadge({ mode, profiles = [], onToggle }) {
  if (mode === 'DAD_MODE') {
    const childNames = profiles
      .filter((p) => p.role === 'CHILD')
      .map((p) => p.name)
      .join(', ');

    return (
      <button
        onClick={onToggle}
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-accent-100 text-accent-600 hover:bg-accent-200 transition-colors"
      >
        <IconUsers size={14} />
        <span>Dad mode{childNames ? ` — ${childNames}` : ''}</span>
      </button>
    );
  }

  return (
    <button
      onClick={onToggle}
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition-colors"
    >
      <IconUser size={14} />
      <span>Solo day</span>
    </button>
  );
}
