import { AppError } from '../errors.js';

export function createPlantService({ plantRepo, dishRepo, eventRepo, db }) {
  const create = db.transaction(({ type, stage, count, trayId, actorId = 'emp-01' }) => {
    if (!type) throw new AppError('缺少品种');
    if (!stage) throw new AppError('缺少阶段');
    if (!count || count < 1) throw new AppError('数量需大于 0');
    if (count > 50) throw new AppError('数量不能超过 50');
    if (!trayId) throw new AppError('缺少盘子编号');

    const outputIds = [];
    for (let i = 0; i < count; i++) {
      const plantId = plantRepo.nextId();
      const dishId = dishRepo.nextId();
      plantRepo.insert({ id: plantId, type, stage, status: '正常', dishId });
      dishRepo.insert({ id: dishId, plantId });
      outputIds.push(plantId);
    }

    return eventRepo.createAndInsert({
      type: 'create', actorId,
      inputIds: [], outputIds,
      meta: { plantType: type, stage, count, trayId },
    });
  });

  const split = db.transaction(({ parentDishId, trayId, count, actorId = 'emp-01' }) => {
    const parentDish = dishRepo.findById(parentDishId);
    if (!parentDish) throw new AppError('父培养皿不存在');
    const parentPlant = plantRepo.findById(parentDish.plantId);
    if (!parentPlant) throw new AppError('父花苗不存在');
    if (!trayId) throw new AppError('缺少盘子编号');
    if (!count || count < 1) throw new AppError('数量需大于 0');
    if (count > 50) throw new AppError('数量不能超过 50');

    const outputIds = [];
    for (let i = 0; i < count; i++) {
      const plantId = plantRepo.nextId();
      const dishId = dishRepo.nextId();
      plantRepo.insert({ id: plantId, type: parentPlant.type, stage: parentPlant.stage, status: '正常', dishId });
      dishRepo.insert({ id: dishId, plantId });
      outputIds.push(plantId);
    }

    return eventRepo.createAndInsert({
      type: 'split', actorId,
      inputIds: [parentPlant.id], outputIds,
      meta: { trayId, count },
    });
  });

  const merge = db.transaction(({ parentDishIds, trayId, targetDishId, actorId = 'emp-01' }) => {
    if (!Array.isArray(parentDishIds) || parentDishIds.length === 0)
      throw new AppError('父培养皿不能为空');
    if (!trayId) throw new AppError('缺少盘子编号');
    if (targetDishId && parentDishIds.includes(targetDishId))
      throw new AppError('目标培养皿不能与父培养皿相同');
    const parentPlantIds = parentDishIds.map((id) => {
      const dish = dishRepo.findById(id);
      if (!dish) throw new AppError('父培养皿不存在');
      return dish.plantId;
    });
    const dishId = targetDishId || dishRepo.nextId();
    if (dishRepo.exists(dishId)) throw new AppError('培养皿已被占用');

    const plantId = plantRepo.nextId();
    plantRepo.insert({ id: plantId, type: '合并苗', stage: '萌发', status: '正常', dishId });
    dishRepo.insert({ id: dishId, plantId });

    return eventRepo.createAndInsert({
      type: 'merge', actorId,
      inputIds: parentPlantIds, outputIds: [plantId],
      meta: { trayId, targetDishId: dishId },
    });
  });

  return { create, split, merge };
}
