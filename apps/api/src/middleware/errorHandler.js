// Internal error details never reach clients: messages can contain SQL, file
// paths or upstream responses. They are logged server-side instead.
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  // Body-parser errors (malformed JSON, oversized payload) are the client's fault.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ data: null, error: { message: 'Malformed JSON body', code: 'BAD_REQUEST' } });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ data: null, error: { message: 'Request body too large', code: 'PAYLOAD_TOO_LARGE' } });
  }

  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}:`, err.stack || err.message);

  res.status(500).json({
    data: null,
    error: { message: 'An unexpected error occurred', code: 'INTERNAL_ERROR' },
  });
}

export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
