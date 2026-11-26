import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/deals.js';
import { ErrorBox, Icon } from './ui.jsx';

// Coupon refresh: when it last ran, what is scheduled, and a way to run or
// schedule one. The server allows one refresh every 4 hours, nightly included.

function dayLabel(d) {
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(d) - start(new Date())) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function when(date) {
  if (!date) return '';
  const d = new Date(date);
  return `${dayLabel(d)} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

function span(ms) {
  const mins = Math.max(1, Math.round(ms / 60_000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

function relative(date, now) {
  const ms = new Date(date) - now;
  return ms >= 0 ? `in ${span(ms)}` : `${span(-ms)} ago`;
}

function secondsText(s) {
  if (s <= 0) return 'almost done';
  if (s < 60) return `about ${s} seconds left`;
  const m = Math.round(s / 60);
  return `about ${m} minute${m === 1 ? '' : 's'} left`;
}

// "YYYY-MM-DDTHH:mm" in local time, for datetime-local inputs.
function localInput(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function useNow(ms) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const RESULT = {
  ok: { text: 'finished', cls: 'text-emerald-700' },
  partial: { text: 'finished with some coupons missing', cls: 'text-amber-700' },
  session_expired: { text: 'finished (public coupons only)', cls: 'text-amber-700' },
  failed: { text: 'failed', cls: 'text-red-700' },
};

export default function CouponRefreshCard() {
  const qc = useQueryClient();
  const now = useNow(1000);
  const status = useQuery({
    queryKey: ['deals-refresh'],
    queryFn: () => api('/refresh'),
    // Poll fast while something is happening, slowly otherwise.
    refetchInterval: (q) => (q.state.data?.running || q.state.data?.scheduled?.due ? 4000 : 60_000),
  });
  const d = status.data;
  const [scheduling, setScheduling] = useState(false);
  const [at, setAt] = useState('');

  // When a refresh finishes, reload every Deals screen so new coupons show.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && d && !d.running) qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('deals-') });
    wasRunning.current = Boolean(d?.running);
  }, [d, qc]);

  const schedule = useMutation({
    mutationFn: (runAt) => api('/refresh', { method: 'POST', body: runAt ? { runAt } : {} }),
    onSuccess: () => { setScheduling(false); setAt(''); status.refetch(); },
  });
  const cancel = useMutation({
    mutationFn: (id) => api(`/refresh/${id}`, { method: 'DELETE' }),
    onSuccess: () => status.refetch(),
  });

  if (status.isLoading) return <section className="kd-card p-4 text-sm text-slate-500">Loading coupon refresh...</section>;
  if (status.error) return <ErrorBox error={status.error} onRetry={() => status.refetch()} />;

  const earliest = new Date(d.earliestAllowed);
  const tooSoon = earliest > now;
  const last = d.lastRun;
  const running = d.running;
  const scheduled = d.scheduled;
  const result = last && RESULT[last.status];

  let progress = null;
  if (running) {
    const total = d.typicalDurationSec * 1000;
    const elapsed = now - new Date(running.startedAt);
    progress = { pct: Math.min(95, Math.max(3, (elapsed / total) * 100)), left: Math.round((total - elapsed) / 1000) };
  }

  // Whole minutes only (the input has no seconds), rounded up so the default is allowed.
  const minAt = new Date(Math.ceil((tooSoon ? earliest.getTime() : now.getTime() + 5 * 60_000) / 60_000) * 60_000);
  const atDate = at ? new Date(at) : null;
  const atInvalid = atDate && (Number.isNaN(atDate.getTime()) || atDate < earliest || atDate < now);

  return (
    <section className="kd-card space-y-3 p-4" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold">Coupon refresh</h2>
        <span className="text-xs text-slate-500">Once every {d.minGapHours} hours</span>
      </div>

      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-xs text-slate-500">Last refresh</dt>
          <dd>
            {last ? (
              <>
                <span className="font-semibold">{when(last.startedAt)}</span> ({relative(last.startedAt, now)})
                {result && <span className={`block text-xs ${result.cls}`}>{result.text}{last.coupons != null ? `, ${last.coupons} coupons` : ''}</span>}
              </>
            ) : 'Never'}
          </dd>
        </div>

        {running && (
          <div className="rounded-xl bg-primary-50 p-3 ring-1 ring-primary-100">
            <dt className="flex items-center gap-2 font-semibold text-primary-900">
              <Icon name="refresh" className="h-4 w-4 animate-spin" /> Refreshing now
            </dt>
            <dd className="mt-1 text-primary-900">
              Started {when(running.startedAt)}, {secondsText(progress.left)}
              {progress.left < -60 && '. Taking longer than usual.'}
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.pct)} aria-label="Refresh progress">
                <div className="h-full rounded-full bg-primary-600 transition-all duration-1000" style={{ width: `${progress.pct}%` }} />
              </div>
              <span className="mt-1 block text-xs text-primary-700">Usually takes about {Math.round(d.typicalDurationSec / 60) || 1} minute{Math.round(d.typicalDurationSec / 60) > 1 ? 's' : ''}. This page updates when it is done.</span>
            </dd>
          </div>
        )}

        {scheduled && (
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">Scheduled</dt>
            <dd className="flex items-center justify-between gap-2">
              <span>
                <span className="font-semibold">{scheduled.due ? 'Starting within a minute' : when(scheduled.runAt)}</span>
                {!scheduled.due && <> ({relative(scheduled.runAt, now)})</>}
              </span>
              {d.isAdmin && !scheduled.due && (
                <button className="kd-btn-ghost min-h-9 shrink-0 px-3 text-xs" onClick={() => cancel.mutate(scheduled.id)} disabled={cancel.isPending}>Cancel</button>
              )}
            </dd>
          </div>
        )}

        <div>
          <dt className="text-xs text-slate-500">Nightly refresh</dt>
          <dd>
            {when(d.nextNightly.runAt)} ({relative(d.nextNightly.runAt, now)})
            {d.nextNightly.skipReason && <span className="block text-xs text-slate-500">Will be skipped: {d.nextNightly.skipReason}</span>}
          </dd>
        </div>
      </dl>

      {!d.timer.seen && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
          The server timer has not checked in for a few minutes, so nightly and scheduled refreshes may not start. On the server, check: systemctl --user status nutrilabs-deals-coupons.timer
        </p>
      )}

      {d.isAdmin ? (
        !running && !scheduled && (
          <div className="space-y-2">
            <button className="kd-btn-primary w-full" onClick={() => schedule.mutate(null)} disabled={tooSoon || schedule.isPending}>
              <Icon name="refresh" className="h-5 w-5" />
              {schedule.isPending ? 'Starting...' : 'Refresh coupons now'}
            </button>
            {tooSoon && (
              <p className="text-sm text-slate-600">
                Next refresh allowed <span className="font-semibold">{when(earliest)}</span> ({relative(earliest, now)}). You can schedule one for then or later.
              </p>
            )}
            {!scheduling ? (
              <button className="kd-btn-ghost w-full" onClick={() => { setScheduling(true); setAt(localInput(minAt)); }}>
                Schedule for later
              </button>
            ) : (
              <form className="space-y-2 rounded-xl bg-slate-50 p-3" onSubmit={(e) => { e.preventDefault(); if (!atInvalid && atDate) schedule.mutate(atDate.toISOString()); }}>
                <label htmlFor="refresh-at" className="block text-xs font-semibold text-slate-600">Refresh at</label>
                <input
                  id="refresh-at" type="datetime-local" className="kd-input" value={at}
                  min={localInput(minAt)} onChange={(e) => setAt(e.target.value)}
                />
                {atInvalid && <p className="text-xs text-red-700">Pick a time after {when(tooSoon ? earliest : now)}.</p>}
                <div className="flex gap-2">
                  <button className="kd-btn-primary flex-1" disabled={!atDate || atInvalid || schedule.isPending}>Schedule</button>
                  <button type="button" className="kd-btn-ghost flex-1" onClick={() => setScheduling(false)}>Never mind</button>
                </div>
              </form>
            )}
          </div>
        )
      ) : (
        <p className="text-xs text-slate-500">Only the NutriLabs admin can start or schedule a refresh.</p>
      )}
      <ErrorBox error={schedule.error || cancel.error} />
    </section>
  );
}
