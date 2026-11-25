// Fetch wrapper: JSON in and out, session cookie, uniform errors.
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
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection.', 0, 'OFFLINE');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.error) {
    const err = new ApiError(json?.error?.message || `Request failed (${res.status})`, res.status, json?.error?.code);
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('kd:signed-out'));
    throw err;
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
