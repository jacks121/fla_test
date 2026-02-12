import { AppError } from '../errors.js';

export function createEventService({ plantService, statusService, transferService, eventRepo }) {
  function place({ trayId, locationId, actorId = 'emp-01' }) {
    if (!trayId) throw new AppError('盘子编号不能为空');
    if (!locationId) throw new AppError('上架位置不能为空');
    return eventRepo.createAndInsert({
      type: 'place', actorId,
      inputIds: [], outputIds: [],
      meta: { trayId, locationId },
    });
  }

  const handlers = {
    create: (payload) => plantService.create(payload),
    split: (payload) => plantService.split(payload),
    merge: (payload) => plantService.merge(payload),
    place: (payload) => place(payload),
    status: (payload) => statusService.updateStatus(payload),
    transfer: (payload) => transferService.transfer(payload),
  };

  function dispatch(type, payload) {
    const handler = handlers[type];
    if (!handler) throw new AppError('Invalid event type', 400, 'INVALID_EVENT_TYPE');
    return handler(payload);
  }

  return { dispatch, place };
}
