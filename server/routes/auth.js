import { Router } from 'express';

export function createAuthRoutes({ auth, rateLimiter }) {
  const router = Router();

  router.post('/api/login', rateLimiter, (req, res, next) => {
    const { username, password } = req.body || {};
    try {
      const session = auth.login({ username, password });
      res.json(session);
    } catch (err) {
      res.status(400).json({ error: err.message || 'Bad credentials' });
    }
  });

  router.post('/api/logout', (req, res) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    auth.logout(token);
    res.json({ ok: true });
  });

  return router;
}
