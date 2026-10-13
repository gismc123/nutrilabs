function timeAgo(iso) {
  if (!iso) return null;
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function PriceStatus({ retailer, isLoading, error }) {
  if (error) return <p className="text-xs text-danger-600">Prices unavailable: {error.message}</p>;
  if (isLoading) return <p className="text-xs text-neutral-400">Loading store prices…</p>;
  if (!retailer) return null;

  const paused = retailer.pausedUntil && new Date(retailer.pausedUntil) > new Date();
  const updated = timeAgo(retailer.oldestUpdate);
  return (
    <p className="text-xs text-neutral-500">
      {retailer.store && <span className="font-medium text-neutral-700">{retailer.store} · </span>}
      {retailer.note}
      {updated && ` · oldest price ${updated}`}
      {retailer.method === 'scrape' && retailer.pricedCount < retailer.itemCount && (
        <span> · {retailer.itemCount - retailer.pricedCount} not priced yet</span>
      )}
      {paused && (
        <span className="text-accent-600"> · paused until {new Date(retailer.pausedUntil).toLocaleDateString()} after the site blocked a request</span>
      )}
    </p>
  );
}
