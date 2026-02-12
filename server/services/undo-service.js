import { AppError } from '../errors.js';

export function createUndoService({ plantRepo, dishRepo, eventRepo, db }) {
  const undo = db.transaction(({ actorId }) => {
    if (!actorId) throw new AppError('缺少操作人');

    const last = eventRepo.findLastByActor(actorId);
    if (!last) throw new AppError('没有可撤销的操作');
    if (last.type === 'undo') throw new AppError('已撤销最近操作，不能连续撤销');

    const elapsed = Date.now() - new Date(last.ts).getTime();
    if (elapsed > 5 * 60 * 1000) throw new AppError('操作已超过 5 分钟，无法撤销');

    switch (last.type) {
      case 'create':
      case 'split':
      case 'merge':
        for (const plantId of last.outputIds) {
          const plant = plantRepo.findById(plantId);
          if (plant) {
            if (plant.dishId) dishRepo.delete(plant.dishId);
            plantRepo.delete(plantId);
          }
        }
        break;
      case 'status':
        if (last.meta.oldStatus && last.inputIds.length > 0) {
          plantRepo.updateStatus(last.meta.oldStatus, last.inputIds[0]);
        }
        break;
      case 'transfer': {
        const { fromDishId, toDishId } = last.meta;
        const plantId = last.inputIds[0];
        if (plantId && fromDishId && toDishId) {
          dishRepo.delete(toDishId);
          dishRepo.insert({ id: fromDishId, plantId });
          plantRepo.updateDishId(fromDishId, plantId);
        }
        break;
      }
      case 'place':
        break;
      default:
        throw new AppError(`不支持撤销 ${last.type} 类型`);
    }

    return eventRepo.createAndInsert({
      type: 'undo', actorId,
      inputIds: [], outputIds: [],
      meta: { undoneEventId: last.id, undoneEventType: last.type },
    });
  });

  return { undo };
}
