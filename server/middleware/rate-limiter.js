const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 5;

export function createRateLimiter() {
  const attempts = new Map();

  // Clean up expired entries every 5 minutes
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of attempts) {
      if (now - record.start > RATE_LIMIT_WINDOW) {
        attempts.delete(ip);
      }
    }
  }, 5 * 60 * 1000);
  cleanupInterval.unref();

  return function rateLimiter(req, res, next) {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();
    const record = attempts.get(ip);

    if (!record || now - record.start > RATE_LIMIT_WINDOW) {
      attempts.set(ip, { start: now, count: 1 });
      return next();
    }

    record.count++;
    if (record.count > RATE_LIMIT_MAX) {
      return res.status(429).json({ error: '登录尝试过多，请稍后再试' });
    }
    next();
  };
}
