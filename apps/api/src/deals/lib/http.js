// Small helpers shared by every route: async errors and a uniform JSON shape.
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  constructor(status, message, code = 'ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function errorHandler(err, req, res, _next) {
  if (err?.name === 'ZodError') {
    return res.status(400).json({ data: null, error: { message: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), code: 'INVALID' } });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ data: null, error: { message: 'Request too large', code: 'TOO_LARGE' } });
  }
  const status = err?.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ data: null, error: { message: status >= 500 ? 'Something went wrong on the server' : err.message, code: err.code || 'ERROR' } });
}

export const ok = (res, data) => res.json({ data, error: null });
