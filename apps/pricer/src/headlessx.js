import { config } from './config.js';

export class BlockedError extends Error {
  constructor(retailer, reason) {
    super(`${retailer} blocked the request: ${reason}`);
    this.retailer = retailer;
    this.reason = reason;
  }
}

// Text that only appears on bot-challenge pages. Walmart/Sam's also embed a
// hidden "Robot or human?" dialog on normal pages, so adapters call this only
// when a page yielded no products.
const BLOCK_MARKERS = [
  [/robot or human\?/i, 'PerimeterX "Robot or human?" challenge'],
  [/let us know you.?re (?:human|not a robot)/i, 'PerimeterX human check'],
  [/press (?:&amp;|&|and) hold|activate and hold/i, 'press-and-hold challenge'],
  [/access denied|errors\.edgesuite\.net/i, 'Akamai access denied'],
  [/just a moment\.\.\.|cf-challenge|cf_chl_/i, 'Cloudflare challenge'],
  [/pardon our interruption/i, 'bot interruption page'],
];

export function detectBlock(html) {
  for (const [re, reason] of BLOCK_MARKERS) if (re.test(html)) return reason;
  return null;
}

/** Load a page in HeadlessX's stealth (Camoufox) browser and return its HTML. */
export async function fetchPage(retailer, url, { waitForSelector } = {}) {
  if (!config.headlessx.apiKey) throw new Error('HEADLESSX_API_KEY is not set');
  const res = await fetch(`${config.headlessx.url}/api/operators/website/scrape/html-js`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': config.headlessx.apiKey },
    body: JSON.stringify({ url, stealth: true, timeout: config.headlessx.timeoutMs, ...(waitForSelector && { waitForSelector }) }),
    signal: AbortSignal.timeout(config.headlessx.timeoutMs + 90_000),
  });
  const body = await res.json().catch(() => ({}));
  if (body.error?.code === 'CLOUDFLARE_CHALLENGE_DETECTED') throw new BlockedError(retailer, 'Cloudflare challenge');
  if (!res.ok) {
    // A selector that never appears usually means the results never rendered.
    if (/waitForSelector: Timeout/i.test(body.error?.message ?? '')) return { html: '', timedOut: true };
    throw new Error(`HeadlessX ${res.status}: ${body.error?.message ?? 'scrape failed'}`);
  }
  return { html: body.html ?? '', timedOut: false };
}

/** Load a JSON endpoint through the browser (for sites that block plain requests). */
export async function fetchJsonViaBrowser(retailer, url) {
  const { html } = await fetchPage(retailer, url);
  const pre = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/) ?? html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
  const raw = (pre ? pre[1] : html).replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  try {
    return JSON.parse(raw);
  } catch {
    const reason = detectBlock(html);
    if (reason) throw new BlockedError(retailer, reason);
    throw new Error(`${retailer}: expected JSON from ${url}`);
  }
}

export async function headlessxHealth() {
  try {
    const res = await fetch(`${config.headlessx.url}/api/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}
