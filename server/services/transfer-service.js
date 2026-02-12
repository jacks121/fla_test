import { AppError } from '../errors.js';

export function createTransferService({ plantRepo, dishRepo, eventRepo, db }) {
  const transfer = db.transaction(({ fromDishId, toDishId, actorId = 'emp-01' }) => {
    if (!fromDishId || !toDishId) throw new AppError('缺少培养皿');
    const fromDish = dishRepo.findById(fromDishId);
    if (!fromDish) throw new AppError('原培养皿不存在');
    if (dishRepo.exists(toDishId)) throw new AppError('目标培养皿已占用');
    const plant = plantRepo.findById(fromDish.plantId);
    if (!plant) throw new AppError('花苗不存在');
    dishRepo.delete(fromDishId);
    dishRepo.insert({ id: toDishId, plantId: plant.id });
    plantRepo.updateDishId(toDishId, plant.id);
    return eventRepo.createAndInsert({
      type: 'transfer', actorId,
      inputIds: [plant.id], outputIds: [],
      meta: { fromDishId, toDishId },
    });
  });

  return { transfer };
}
