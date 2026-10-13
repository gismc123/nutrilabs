import { config } from '../config.js';

/**
 * Pull pricing profiles from NutriLabs: for each user with a store configured,
 * their store choices and the items on this week's and next week's grocery
 * lists. This HTTP feed is the pricer's only link to NutriLabs.
 */
export async function fetchFeed() {
  const res = await fetch(`${config.nutrilabsUrl}/api/pricer/feed`, {
    headers: { 'x-pricer-token': config.token },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`NutriLabs feed HTTP ${res.status}: ${body.error?.message ?? ''}`);
  return body.data.profiles;
}
