import { AppError } from '../errors.js';

const VALID_STATUSES = ['正常', '感染', '变异'];

export function createStatusService({ plantRepo, dishRepo, eventRepo, db }) {
  const updateStatus = db.transaction(({ dishId, status, actorId = 'emp-01' }) => {
    if (!status || !VALID_STATUSES.includes(status))
      throw new AppError(`无效状态，允许值: ${VALID_STATUSES.join('、')}`);
    const dish = dishRepo.findById(dishId);
    if (!dish) throw new AppError('培养皿不存在');
    const plant = plantRepo.findById(dish.plantId);
    if (!plant) throw new AppError('花苗不存在');
    const oldStatus = plant.status;
    plantRepo.updateStatus(status, plant.id);
    return eventRepo.createAndInsert({
      type: 'status', actorId,
      inputIds: [plant.id], outputIds: [],
      meta: { status, oldStatus },
    });
  });

  return { updateStatus };
}
