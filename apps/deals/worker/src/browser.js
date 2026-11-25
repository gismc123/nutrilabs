// Playwright session for Kroger, ported from the technique in rkoh46/kroger-cli-aio
// (audited in apps/deals/AUDIT.md). Key facts carried over:
//  * Kroger's edge (Akamai) resets headless and plain HTTP clients, so the window
//    is always headed, on the real desktop display.
//  * Never override the user agent: a mismatch with the client hints makes the
//    edge reject the page's own API calls.
//  * The password is only ever typed by the owner into Kroger's own field in the
//    window. This process never reads, logs, or stores it.
import { chromium } from 'playwright';

export const PROFILE_DIR = process.env.PROFILE_DIR || '/profile';
export const DOMAIN = (process.env.KROGER_DOMAIN || 'kroger.com').toLowerCase().replace(/^www\./, '');

// Kroger banner sites mount the coupon app under /savings; kroger.com does not.
const PREFIXED = new Set([
  'ralphs.com', 'dillons.com', 'kingsoopers.com', 'qfc.com', 'bakersplus.com', 'citymarket.com',
  'frysfood.com', 'food4less.com', 'fredmeyer.com', 'marianos.com', 'metromarket.net',
  'picknsave.com', 'smithsfoodanddrug.com',
]);
export const PREFIX = PREFIXED.has(DOMAIN) ? '/savings' : '';
export const ORIGIN = `https://www.${DOMAIN}`;
export const COUPONS_URL = `${ORIGIN}${PREFIX}/cl/coupons`;

export class SessionError extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch() {
  return chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
    args: ['--no-sandbox'],
  });
}

// 'signed_in' | 'signed_out' | 'unknown', read from the coupon card buttons.
export async function signedInState(page) {
  let labels = [];
  try {
    labels = await page.evaluate(() => Array.from(document.querySelectorAll('.CouponActionButton, [data-testid*="CouponActionButton"]'))
      .map((b) => (b.innerText || '').trim()));
  } catch {
    return 'unknown';
  }
  if (labels.some((s) => s === 'Clip' || s === 'Unclip' || s === 'Clipped')) return 'signed_in';
  if (labels.some((s) => /sign in/i.test(s))) return 'signed_out';
  return 'unknown';
}

async function dismissCookieBanner(page) {
  for (const sel of ['#onetrust-accept-btn-handler', 'button#close-pc-btn-handler', "button:has-text('Allow All')", "button:has-text('Continue')"]) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.isVisible({ timeout: 1000 })) {
        await loc.click({ timeout: 1500 });
        await page.waitForTimeout(400);
        return;
      }
    } catch { /* not present */ }
  }
}

// Open the coupons page and wait until the cards render, retrying through the
// edge's intermittent resets (they self-heal after a reload).
export async function openCoupons(page) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await page.goto(COUPONS_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    } catch {
      await sleep(3000);
      continue;
    }
    await dismissCookieBanner(page);
    const deadline = Date.now() + 40_000;
    while (Date.now() < deadline) {
      if ((await signedInState(page)) !== 'unknown') return;
      await sleep(1000);
    }
    await sleep(3000);
  }
}

// Watch the page's own coupon API traffic: the first GET gives the x-* headers
// to replay, and every URL + response is kept for discovery.
export function watchAtlas(page) {
  const seen = { headers: null, requests: [], responses: [] };
  page.on('request', (r) => {
    if (!r.url().includes('savings-coupons')) return;
    seen.requests.push({ method: r.method(), url: r.url() });
    if (!seen.headers && r.method() === 'GET') {
      seen.headers = Object.fromEntries(Object.entries(r.headers()).filter(([k]) => k.toLowerCase().startsWith('x-')));
    }
  });
  page.on('response', async (r) => {
    if (!r.url().includes('savings-coupons') || r.request().method() !== 'GET') return;
    if (seen.responses.length >= 6) return;
    try {
      seen.responses.push({ url: r.url(), status: r.status(), body: await r.text() });
    } catch { /* body gone after navigation */ }
  });
  return seen;
}

// One session: launch, open the coupons page, report state. The caller closes it.
export async function openSession() {
  const context = await launch();
  const page = context.pages()[0] ?? (await context.newPage());
  const atlas = watchAtlas(page);
  await openCoupons(page);
  const deadline = Date.now() + 20_000;
  while (!atlas.headers && Date.now() < deadline) await sleep(500);
  return { context, page, atlas, state: await signedInState(page) };
}

// Visible login. The owner types email and password into Kroger's own form.
// We only poll the URL and the card buttons, never the form fields.
export async function runLogin(log) {
  const context = await launch();
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await openCoupons(page);
    if ((await signedInState(page)) === 'signed_in') {
      log('Already signed in. Nothing to do.');
      return true;
    }
    await page.goto(`${ORIGIN}/signin?redirectUrl=${encodeURIComponent(`${PREFIX}/cl/coupons`)}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await dismissCookieBanner(page);
    log('A Chromium window is open on the Kroger sign-in page.');
    log('Type your email and password into that window and press Sign In.');
    log('Solve any CAPTCHA or code prompt there too. You have 10 minutes.');
    const deadline = Date.now() + 10 * 60_000;
    while (Date.now() < deadline) {
      await sleep(2000);
      if (page.isClosed()) return false;
      if (page.url().includes('/cl/coupons') && (await signedInState(page)) === 'signed_in') {
        log('Signed in. The session is saved in the browser profile for nightly runs.');
        await sleep(3000); // let the session cookies settle before closing
        return true;
      }
    }
    log('Sign-in did not finish in time. Run login again.');
    return false;
  } finally {
    await context.close().catch(() => {});
  }
}
