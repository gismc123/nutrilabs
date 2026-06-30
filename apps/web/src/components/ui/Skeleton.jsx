export default function Skeleton({ width, height, className = '' }) {
  return (
    <div
      className={`rounded-md bg-neutral-200 animate-pulse ${className}`}
      style={{ width: width || '100%', height: height || '1rem' }}
    />
  );
}

export function SkeletonText({ className = '' }) {
  return <Skeleton width="100%" height="1rem" className={className} />;
}

export function SkeletonCard({ className = '' }) {
  return <Skeleton width="100%" height="6rem" className={`rounded-xl ${className}`} />;
}

export function SkeletonGrid({ className = '' }) {
  return (
    <div className={`grid grid-cols-3 gap-4 ${className}`}>
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
