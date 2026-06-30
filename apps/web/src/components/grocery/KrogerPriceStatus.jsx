export default function KrogerPriceStatus({ krogerConfigured, krogerPricesAvailable, generatedAt }) {
  if (!krogerConfigured) return null;

  if (!krogerPricesAvailable) {
    return (
      <p className="text-xs text-accent-600">
        Kroger prices not loaded — tap Refresh to fetch
      </p>
    );
  }

  const timeAgo = generatedAt ? formatTimeAgo(new Date(generatedAt)) : null;

  return (
    <p className="text-xs text-primary-600">
      Kroger prices updated {timeAgo ?? 'recently'}
    </p>
  );
}

function formatTimeAgo(date) {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
