import { Router } from 'express';
import { seedMeta } from '../seed.js';

export function createMetaRoutes({ db }) {
  const router = Router();

  router.get('/api/meta', (_req, res) => {
    const locations = db.prepare('SELECT * FROM locations').all();
    const trays = db.prepare('SELECT * FROM trays').all();
    res.json({
      locations,
      trays,
      statusEnum: seedMeta.statusEnum,
      stages: seedMeta.stages,
      types: seedMeta.types,
    });
  });

  return router;
}
