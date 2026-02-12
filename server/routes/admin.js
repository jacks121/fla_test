import { Router } from 'express';

export function createAdminRoutes({ db, requireAdmin }) {
  const router = Router();

  router.get('/api/admin/users', requireAdmin, (_req, res) => {
    const users = db.prepare('SELECT id, username, role FROM users').all();
    res.json(users);
  });

  return router;
}
