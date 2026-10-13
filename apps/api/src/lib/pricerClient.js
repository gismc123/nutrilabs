// HTTP client for the standalone pricer service (apps/pricer). NutriLabs only
// talks to it over HTTP, so either side can be deployed or tested alone.
const PRICER_URL = process.env.PRICER_URL ?? 'http://pricer:4010';

export async function pricerGet(path, params = {}) {
  const url = new URL(path, PRICER_URL);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
  let res;
  try {
    // Meijer store lookups go through a real browser and can take ~60 s.
    res = await fetch(url, { headers: { 'x-pricer-token': process.env.PRICER_TOKEN ?? '' }, signal: AbortSignal.timeout(150_000) });
  } catch (err) {
    throw Object.assign(new Error(`Price service unavailable (${err.name === 'TimeoutError' ? 'timed out' : err.message})`), { status: 503 });
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error ?? `Price service HTTP ${res.status}`), { status: res.status });
  return body.data;
}

export async function pricerPost(path, payload) {
  let res;
  try {
    res = await fetch(new URL(path, PRICER_URL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-pricer-token': process.env.PRICER_TOKEN ?? '' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(150_000),
    });
  } catch (err) {
    throw Object.assign(new Error(`Price service unavailable (${err.name === 'TimeoutError' ? 'timed out' : err.message})`), { status: 503 });
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error ?? `Price service HTTP ${res.status}`), { status: res.status });
  return body.data;
}
