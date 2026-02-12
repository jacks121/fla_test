import { createPlantRepo } from './repos/plant-repo.js';
import { createDishRepo } from './repos/dish-repo.js';
import { createEventRepo } from './repos/event-repo.js';
import { createPlantService } from './services/plant-service.js';
import { createStatusService } from './services/status-service.js';
import { createTransferService } from './services/transfer-service.js';
import { createUndoService } from './services/undo-service.js';
import { createEventService } from './services/event-service.js';

export function createDomain(db) {
  const plantRepo = createPlantRepo(db);
  const dishRepo = createDishRepo(db);
  const eventRepo = createEventRepo(db);

  const plantService = createPlantService({ plantRepo, dishRepo, eventRepo, db });
  const statusService = createStatusService({ plantRepo, dishRepo, eventRepo, db });
  const transferService = createTransferService({ plantRepo, dishRepo, eventRepo, db });
  const undoService = createUndoService({ plantRepo, dishRepo, eventRepo, db });
  const eventService = createEventService({ plantService, statusService, transferService, eventRepo });

  return {
    create: plantService.create,
    split: plantService.split,
    merge: plantService.merge,
    place: eventService.place,
    updateStatus: statusService.updateStatus,
    transfer: transferService.transfer,
    undo: undoService.undo,
  };
}
