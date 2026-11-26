import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import fetch from 'node-fetch';
import { parseMeasure } from './themealdb.js';
import { safeImageUrl } from '../lib/security.js';

const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

// ── SSRF guard ───────────────────────────────────────────────────────────────
// The server fetches URLs users paste, so it must never reach the LAN, the Docker
// network or cloud metadata. Every address a hostname resolves to is checked at
// connect time (so DNS rebinding can't swap in a private IP after validation).

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80') || v6.startsWith('ff');
}

function guardedLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const bad = addresses.find((a) => isPrivateIp(a.address));
    if (bad) return callback(Object.assign(new Error('That address is on a private network'), { code: 'BLOCKED_ADDRESS' }));
    if (options.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
}

const agents = {
  'http:': new http.Agent({ lookup: guardedLookup }),
  'https:': new https.Agent({ lookup: guardedLookup }),
};

export class ImportError extends Error {
  constructor(message, code = 'IMPORT_FAILED') {
    super(message);
    this.code = code;
  }
}

function checkUrl(raw) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    throw new ImportError('That doesn\'t look like a web address', 'INVALID_URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new ImportError('Only http and https links can be imported', 'INVALID_URL');
  if (url.username || url.password) throw new ImportError('Links with a username or password can\'t be imported', 'INVALID_URL');
  if (url.port && !['80', '443'].includes(url.port)) throw new ImportError('Only links on the standard web ports can be imported', 'INVALID_URL');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && isPrivateIp(host)) throw new ImportError('That address is on a private network', 'BLOCKED_ADDRESS');
  if (/^(localhost|.*\.local|.*\.internal|.*\.lan)$/i.test(host)) throw new ImportError('That address is on a private network', 'BLOCKED_ADDRESS');
  return url;
}

/** Fetch a page's HTML, following redirects by hand so each hop is checked. */
export async function fetchPage(rawUrl) {
  let url = checkUrl(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res;
    try {
      res = await fetch(url.href, {
        redirect: 'manual',
        agent: agents[url.protocol],
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
    } catch (err) {
      if (err.code === 'BLOCKED_ADDRESS' || err.cause?.code === 'BLOCKED_ADDRESS') throw new ImportError('That address is on a private network', 'BLOCKED_ADDRESS');
      if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new ImportError('The website took too long to respond', 'FETCH_FAILED');
      throw new ImportError(`Couldn't reach that website (${err.code ?? err.message})`, 'FETCH_FAILED');
    }

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) throw new ImportError('The website redirected nowhere', 'FETCH_FAILED');
      url = checkUrl(new URL(location, url).href);
      continue;
    }
    // Many big recipe sites refuse server-side fetches outright; the browser
    // bookmarklet or pasted text are the way in for those.
    if ([401, 402, 403, 429, 503].includes(res.status)) {
      throw new ImportError('This website blocks automatic imports', 'BLOCKED_BY_SITE');
    }
    if (!res.ok) throw new ImportError(`The website returned HTTP ${res.status}`, 'FETCH_FAILED');
    const type = res.headers.get('content-type') ?? '';
    if (type && !/html|xml/i.test(type)) throw new ImportError('That link isn\'t a web page', 'NOT_HTML');
    if (Number(res.headers.get('content-length')) > MAX_BYTES) throw new ImportError('That page is too large to import', 'TOO_LARGE');

    // Read with a size cap.
    const chunks = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > MAX_BYTES) throw new ImportError('That page is too large to import', 'TOO_LARGE');
      chunks.push(chunk);
    }
    return { html: Buffer.concat(chunks).toString('utf8'), finalUrl: url.href };
  }
  throw new ImportError('Too many redirects', 'FETCH_FAILED');
}

// ── HTML helpers ─────────────────────────────────────────────────────────────

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', frac12: '½', frac14: '¼', frac34: '¾', deg: '°', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', eacute: 'é', egrave: 'è', ntilde: 'ñ' };

export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Strip tags and decode entities, collapsing whitespace. */
export function cleanText(s) {
  return decodeEntities(decodeEntities(String(s ?? '').replace(/<[^>]*>/g, ' '))).replace(/\s+/g, ' ').trim();
}

function metaContent(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  return tag ? decodeEntities(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? '') || null : null;
}

/** Readable page text for the AI fallback: drop scripts, styles, nav and footer. */
export function pageText(html, maxChars = 14_000) {
  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|aside|form|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/li|\/h\d|\/div|\/tr)[^>]*>/gi, '\n');
  return cleanText(body.replace(/\n/g, ' ⏎ ')).replace(/( ?⏎ ?)+/g, '\n').slice(0, maxChars);
}

// ── schema.org Recipe (JSON-LD) ──────────────────────────────────────────────

const isRecipeType = (t) => (Array.isArray(t) ? t : [t]).some((x) => typeof x === 'string' && /(^|\/)Recipe$/i.test(x));

function findRecipeNode(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findRecipeNode(n, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (isRecipeType(node['@type'])) return node;
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
    const hit = findRecipeNode(node[key], depth + 1);
    if (hit) return hit;
  }
  return null;
}

/** Recipe node from JSON-LD text a browser sent (bookmarklet). Untrusted: only parsed, never executed. */
export function recipeFromJsonLd(raw) {
  try {
    return findRecipeNode(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function extractJsonLdRecipe(html) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [, raw] of blocks) {
    let data;
    try {
      data = JSON.parse(raw.trim());
    } catch {
      // Some sites emit raw control characters inside strings.
      try { data = JSON.parse(raw.trim().replace(/[\u0000-\u001f]+/g, ' ')); } catch { continue; }
    }
    const recipe = findRecipeNode(data);
    if (recipe) return recipe;
  }
  return null;
}

/** ISO-8601 duration ("PT1H30M") → minutes. */
export function durationMinutes(value) {
  const m = String(value ?? '').match(/^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
  if (!m) return null;
  const mins = (Number(m[1] ?? 0) * 1440) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0) + Number(m[4] ?? 0) / 60;
  return mins > 0 ? Math.round(mins) : null;
}

function firstNumber(value) {
  const list = Array.isArray(value) ? value : [value];
  for (const v of list) {
    const n = typeof v === 'number' ? v : Number(String(v ?? '').match(/\d+(?:\.\d+)?/)?.[0]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function imageOf(image) {
  const list = Array.isArray(image) ? image : [image];
  for (const img of list) {
    const url = typeof img === 'string' ? img : img?.url ?? img?.contentUrl;
    const safe = url && safeImageUrl(String(url).trim());
    if (safe) return safe;
  }
  return null;
}

function instructionLines(value, depth = 0) {
  if (!value || depth > 4) return [];
  if (typeof value === 'string') {
    // A single blob: split on line breaks or numbered steps.
    const text = decodeEntities(value).replace(/<\/(p|li)>|<br\s*\/?>/gi, '\n');
    return text.split(/\n+|(?=\b\d+\.\s)/).map(cleanText).filter(Boolean);
  }
  if (Array.isArray(value)) return value.flatMap((v) => instructionLines(v, depth + 1));
  if (typeof value === 'object') {
    if (value.itemListElement) {
      const steps = instructionLines(value.itemListElement, depth + 1);
      return value.name && /Section/i.test(String(value['@type'])) ? [`${cleanText(value.name)}:`, ...steps] : steps;
    }
    return instructionLines(value.text ?? value.name ?? '', depth + 1);
  }
  return [];
}

const textList = (v) => (Array.isArray(v) ? v : v ? String(v).split(',') : []).map(cleanText).filter(Boolean);

export function mealTypeFrom(categories, name) {
  const s = `${categories.join(' ')} ${name}`.toLowerCase();
  if (/breakfast|brunch|pancake|waffle|oatmeal|granola|omelet|muffin/.test(s)) return 'BREAKFAST';
  if (/dessert|snack|appetizer|cookie|cake|bar\b|dip\b|smoothie/.test(s)) return 'SNACK';
  if (/lunch|sandwich|salad|wrap|soup/.test(s)) return 'LUNCH';
  return 'DINNER';
}

const SPICY_RE = /\b(chil(e|i|li)|jalape|habanero|cayenne|sriracha|hot sauce|chipotle|serrano)/i;

export function parseIngredientLine(line) {
  const text = cleanText(line);
  if (!text) return null;
  const { quantity, unit, note, isOptional } = parseMeasure(text);
  // parseMeasure lowercases; keep the original wording when nothing was parsed off the front.
  const name = (quantity == null && unit == null ? text : note) ?? text;
  return { name: name.slice(0, 200), quantity, unit, isOptional, original: text };
}

/** schema.org Recipe → NutriLabs recipe fields (not saved). */
export function mapSchemaRecipe(node, pageUrl) {
  const categories = textList(node.recipeCategory);
  const cuisines = textList(node.recipeCuisine);
  const name = cleanText(node.name ?? node.headline).slice(0, 200);
  const ingredients = (node.recipeIngredient ?? node.ingredients ?? [])
    .map(parseIngredientLine).filter(Boolean).slice(0, 100);
  const steps = instructionLines(node.recipeInstructions);
  const n = node.nutrition ?? {};
  const macro = (v) => { const x = firstNumber(v); return x != null ? Math.round(x) : null; };

  return {
    name,
    description: cleanText(node.description).slice(0, 2000) || null,
    mealType: mealTypeFrom(categories, name),
    servings: Math.min(100, Math.max(1, Math.round(firstNumber(node.recipeYield) ?? 4))),
    prepTimeMinutes: durationMinutes(node.totalTime) ?? (((durationMinutes(node.prepTime) ?? 0) + (durationMinutes(node.cookTime) ?? 0)) || null),
    calories: macro(n.calories),
    proteinG: macro(n.proteinContent),
    carbsG: macro(n.carbohydrateContent),
    fatG: macro(n.fatContent),
    instructions: steps.map((s, i) => (/^\d+[.)]|:$/.test(s) ? s : `${i + 1}. ${s}`)).join('\n').slice(0, 20000) || null,
    imageUrl: imageOf(node.image),
    tags: [...new Set([...cuisines, ...categories].map((t) => t.toLowerCase().slice(0, 50)))].slice(0, 10),
    isKidFriendly: !ingredients.some((i) => SPICY_RE.test(i.name)),
    ingredients,
    sourceUrl: pageUrl,
  };
}

export { metaContent };
