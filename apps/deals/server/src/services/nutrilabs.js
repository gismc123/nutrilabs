// Optional link to NutriLabs: read this and next week's grocery list from its
// existing read-only pricer feed. Nothing in NutriLabs changes for this.
import { config } from '../config.js';
import { prisma } from '../db.js';

export const nutrilabsConfigured = () => !!(config.nutrilabs.url && config.nutrilabs.token);

let cache = { at: 0, data: null };

export async function fetchFeed() {
  if (!nutrilabsConfigured()) return null;
  if (cache.data && Date.now() - cache.at < 5 * 60_000) return cache.data;
  const res = await fetch(`${config.nutrilabs.url}/api/pricer/feed`, {
    headers: { 'x-pricer-token': config.nutrilabs.token },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`NutriLabs feed returned HTTP ${res.status}`);
  const body = await res.json();
  cache = { at: Date.now(), data: body.data };
  return body.data;
}

export async function listProfiles() {
  const feed = await fetchFeed();
  return (feed?.profiles ?? []).map((p) => ({
    userId: p.userId,
    itemCount: p.items?.length ?? 0,
    preview: (p.items ?? []).slice(0, 5).map((i) => i.name),
    zip: p.stores?.kroger?.zip ?? null,
  }));
}

// Items for the profile chosen in Settings, or the only profile if there is one.
export async function fetchNutrilabsItems() {
  const feed = await fetchFeed();
  if (!feed) return null;
  const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
  const profiles = feed.profiles ?? [];
  const profile = profiles.find((p) => p.userId === cfg?.nutrilabsUserId) ?? (profiles.length === 1 ? profiles[0] : null);
  return profile ? profile.items.map((i) => ({ name: i.name, category: i.category })) : [];
}
