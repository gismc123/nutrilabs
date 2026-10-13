import { SCHEDULE, config } from './config.js';
import { fetchFeed } from './core/feed.js';
import { quoteItems } from './core/quote.js';
import { resolveStore } from './core/stores.js';
import { getState, logEvent, updateState } from './core/store.js';

const TICK_MS = 10 * 60 * 1000;
let running = false;

function localParts(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: config.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(date).map((p) => [p.type, p.value]));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

// Each day gets its own random start minute inside the job's window, so runs
// never happen at the same clock time twice.
function plannedStart(job, date) {
  const state = getState();
  const planned = state.jobs[job]?.planned;
  if (planned?.date === date) return planned.minute;
  const [fromH, toH] = SCHEDULE[job].startHour;
  const minute = fromH * 60 + Math.floor(Math.random() * (toH - fromH) * 60);
  updateState((s) => { (s.jobs[job] ??= {}).planned = { date, minute }; });
  return minute;
}

export async function runJob(job) {
  const { retailers } = SCHEDULE[job];
  const profiles = await fetchFeed();
  // The quote cache is shared, so an item several users need is fetched once.
  for (const profile of profiles) {
    if (!profile.items.length) continue;
    const stores = {};
    for (const r of retailers) stores[r] = await resolveStore(r, profile.stores?.[r]).catch(() => null);
    await quoteItems({
      items: profile.items,
      retailers: retailers.filter((r) => r === 'aldi' || r === 'samsclub' || stores[r]),
      stores,
      live: Object.fromEntries(retailers.map((r) => [r, true])),
    });
  }
}

async function tick() {
  if (running) return;
  const now = localParts();
  for (const job of Object.keys(SCHEDULE)) {
    const spec = SCHEDULE[job];
    if (!spec.days.includes(now.weekday)) continue;
    if (getState().jobs[job]?.lastRunDate === now.date) continue;
    if (now.minutes < plannedStart(job, now.date)) continue;
    // Only inside the early-morning window (2 h grace for a restart); a server
    // started mid-day never triggers a catch-up run.
    if (now.minutes > spec.startHour[1] * 60 + 120) continue;

    running = true;
    try {
      logEvent({ type: 'job-start', job });
      await runJob(job);
      updateState((s) => { (s.jobs[job] ??= {}).lastRunDate = now.date; });
      logEvent({ type: 'job-done', job });
    } catch (err) {
      // Not marked as run: the next tick retries (e.g. NutriLabs was restarting).
      logEvent({ type: 'job-error', job, message: err.message });
    } finally {
      running = false;
    }
    return; // one job per tick keeps scraped retailers from overlapping
  }
}

export function startScheduler() {
  if (!config.schedulerEnabled) return;
  setTimeout(tick, 60_000);
  setInterval(tick, TICK_MS);
}

export function scheduleStatus() {
  const state = getState();
  return Object.fromEntries(Object.entries(SCHEDULE).map(([job, spec]) => [job, {
    retailers: spec.retailers,
    days: spec.days.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]),
    window: `${spec.startHour[0]}:00–${spec.startHour[1]}:00 ${config.timeZone}`,
    lastRunDate: state.jobs[job]?.lastRunDate ?? null,
  }]));
}
