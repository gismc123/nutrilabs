// Deals API (/api/deals): JSON in and out with the NutriLabs session cookie.
// Kept apart from client.js so errors keep their code (NO_STORE and the like).
export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api/deals${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection.', 0, 'OFFLINE');
  }
  const json = await res.json().catch(() => null);
  if (res.status === 401) window.location.href = '/login';
  if (!res.ok || json?.error) {
    throw new ApiError(json?.error?.message || `Request failed (${res.status})`, res.status, json?.error?.code);
  }
  return json.data;
}

export const money = (n) => (n == null ? '' : `$${Number(n).toFixed(2)}`);

export function ago(date) {
  if (!date) return 'never';
  const mins = Math.round((Date.now() - new Date(date).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} hr ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function shortDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
