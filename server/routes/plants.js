import { Router } from 'express';

export function createPlantRoutes({ queryService }) {
  const router = Router();

  router.get('/api/plants', (req, res) => {
    const q = (req.query.query || '').toString();
    const list = queryService.getPlants(q || undefined);
    res.json(list);
  });

  return router;
}
