import { Router } from 'express';

export function createDishRoutes({ queryService }) {
  const router = Router();

  router.get('/api/dishes', (req, res) => {
    const q = (req.query.query || '').toString();
    const list = queryService.getDishes(q || undefined);
    res.json(list);
  });

  return router;
}
