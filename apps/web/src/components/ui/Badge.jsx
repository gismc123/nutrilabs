const VARIANT_CLASSES = {
  default: 'bg-neutral-100 text-neutral-700',
  success: 'bg-primary-100 text-primary-600',
  warning: 'bg-accent-100 text-accent-600',
  danger: 'bg-danger-100 text-danger-700',
  info: 'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
};

export default function Badge({ label, variant = 'default' }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.default
      }`}
    >
      {label}
    </span>
  );
}
