import { Router } from 'express';

export function createEventRoutes({ eventService, undoService, queryService }) {
  const router = Router();

  router.get('/api/events', (req, res) => {
    const { type, actorId, from, to } = req.query;
    const events = queryService.getEvents({ type, actorId, from, to });
    res.json(events);
  });

  router.post('/api/events/undo', (req, res, next) => {
    try {
      const actorId = req.user.id;
      const event = undoService.undo({ actorId });
      res.json(event);
    } catch (err) {
      res.status(400).json({ error: err.message || 'Bad request' });
    }
  });

  router.post('/api/events', (req, res, next) => {
    const { type, payload } = req.body || {};
    try {
      const actor = req.user.id;
      const event = eventService.dispatch(type, { ...payload, actorId: actor });
      res.json(event);
    } catch (err) {
      res.status(400).json({ error: err.message || 'Bad request' });
    }
  });

  return router;
}
