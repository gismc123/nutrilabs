export function errorHandler(err, req, res, next) {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    console.error(err);
  } else {
    console.error(`[${new Date().toISOString()}] ${err.message}`);
  }

  const status = err.statusCode ?? 500;
  res.status(status).json({
    data: null,
    error: {
      message: isDev ? err.message : 'An unexpected error occurred',
      code: err.code ?? 'INTERNAL_ERROR',
      ...(isDev && { stack: err.stack }),
    },
  });
}

export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
