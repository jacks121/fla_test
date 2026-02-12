// server/app.js
import express from 'express';
import cors from 'cors';

import { createAuth } from './auth.js';
import { createPlantRepo } from './repos/plant-repo.js';
import { createDishRepo } from './repos/dish-repo.js';
import { createEventRepo } from './repos/event-repo.js';
import { createPlantService } from './services/plant-service.js';
import { createStatusService } from './services/status-service.js';
import { createTransferService } from './services/transfer-service.js';
import { createUndoService } from './services/undo-service.js';
import { createEventService } from './services/event-service.js';
import { createQueryService } from './services/query-service.js';
import { createRateLimiter } from './middleware/rate-limiter.js';
import { createAuthRoutes } from './routes/auth.js';
import { createEventRoutes } from './routes/events.js';
import { createPlantRoutes } from './routes/plants.js';
import { createDishRoutes } from './routes/dishes.js';
import { createMetaRoutes } from './routes/meta.js';
import { createAdminRoutes } from './routes/admin.js';
import { errorHandler } from './middleware/error-handler.js';

export function createApp({ db, distDir }) {
  const app = express();
  const auth = createAuth(db);

  // Repos
  const plantRepo = createPlantRepo(db);
  const dishRepo = createDishRepo(db);
  const eventRepo = createEventRepo(db);

  // Services
  const plantService = createPlantService({ plantRepo, dishRepo, eventRepo, db });
  const statusService = createStatusService({ plantRepo, dishRepo, eventRepo, db });
  const transferService = createTransferService({ plantRepo, dishRepo, eventRepo, db });
  const undoService = createUndoService({ plantRepo, dishRepo, eventRepo, db });
  const eventService = createEventService({ plantService, statusService, transferService, eventRepo });
  const queryService = createQueryService({ plantRepo, dishRepo, eventRepo });

  // Middleware
  const rateLimiter = createRateLimiter();

  app.use(cors());
  app.use(express.json());

  // Serve static files BEFORE auth middleware
  if (distDir) {
    app.use(express.static(distDir));
  }

  // Health check (no auth)
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Auth routes (login uses rate limiter, no auth required)
  app.use(createAuthRoutes({ auth, rateLimiter }));

  // Auth middleware for all subsequent routes
  app.use(auth.authenticate);

  // Protected routes
  app.use(createEventRoutes({ eventService, undoService, queryService }));
  app.use(createPlantRoutes({ queryService }));
  app.use(createDishRoutes({ queryService }));
  app.use(createMetaRoutes({ db }));
  app.use(createAdminRoutes({ db, requireAdmin: auth.requireAdmin }));

  // Global error handler (must be registered last)
  app.use(errorHandler);

  return app;
}
