import { AppError } from '../errors.js';

export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
  }

  // Domain errors thrown as plain Error
  if (err instanceof Error) {
    return res.status(400).json({
      error: err.message || 'Bad request',
    });
  }

  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
}
