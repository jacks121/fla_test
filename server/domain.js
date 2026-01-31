import { randomUUID } from 'node:crypto';

function ts() {
  return new Date().toISOString();
}

function nextId(prefix, items) {
  const max = items.reduce((acc, item) => {
    if (!item.id?.startsWith(prefix + '-')) return acc;
    const num = Number(item.id.split('-')[1]);
    return Number.isFinite(num) ? Math.max(acc, num) : acc;
  }, 0);
  return `${prefix}-${max + 1}`;
}

export function createDomain(db) {
  function createEvent({ type, actorId, inputIds = [], outputIds = [], meta = {} }) {
    return {
      id: randomUUID(),
      type,
      actorId,
      ts: ts(),
      inputIds,
      outputIds,
      meta,
    };
  }

  function split({ parentDishId, trayId, count }) {
    const parentDish = db.data.dishes.find((d) => d.id === parentDishId);
    if (!parentDish) throw new Error('父培养皿不存在');
    const parentPlant = db.data.plants.find((p) => p.id === parentDish.plantId);
    if (!parentPlant) throw new Error('父花苗不存在');
    if (!count || count < 1) throw new Error('数量需大于 0');
    const outputIds = [];
    for (let i = 0; i < count; i++) {
      const plantId = nextId('P', db.data.plants);
      const dishId = nextId('D', db.data.dishes);
      db.data.plants.push({
        id: plantId,
        type: parentPlant.type,
        stage: parentPlant.stage,
        status: '正常',
        dishId,
      });
      db.data.dishes.push({ id: dishId, plantId });
      outputIds.push(plantId);
    }
    return createEvent({
      type: 'split',
      actorId: 'emp-01',
      inputIds: [parentPlant.id],
      outputIds,
      meta: { trayId, count },
    });
  }

  function merge({ parentDishIds, trayId, targetDishId }) {
    if (!Array.isArray(parentDishIds) || parentDishIds.length === 0)
      throw new Error('父培养皿不能为空');
    const parentPlantIds = parentDishIds.map((id) => {
      const dish = db.data.dishes.find((d) => d.id === id);
      if (!dish) throw new Error('父培养皿不存在');
      return dish.plantId;
    });
    const dishId = targetDishId || nextId('D', db.data.dishes);
    if (db.data.dishes.some((d) => d.id === dishId)) throw new Error('培养皿已被占用');
    const plantId = nextId('P', db.data.plants);
    db.data.plants.push({
      id: plantId,
      type: '合并苗',
      stage: '萌发',
      status: '正常',
      dishId,
    });
    db.data.dishes.push({ id: dishId, plantId });
    return createEvent({
      type: 'merge',
      actorId: 'emp-01',
      inputIds: parentPlantIds,
      outputIds: [plantId],
      meta: { trayId, targetDishId: dishId },
    });
  }

  function place({ trayId, locationId }) {
    if (!trayId) throw new Error('盘子编号不能为空');
    if (!locationId) throw new Error('上架位置不能为空');
    return createEvent({
      type: 'place',
      actorId: 'emp-01',
      inputIds: [],
      outputIds: [],
      meta: { trayId, locationId },
    });
  }

  function updateStatus({ dishId, status }) {
    const dish = db.data.dishes.find((d) => d.id === dishId);
    if (!dish) throw new Error('培养皿不存在');
    const plant = db.data.plants.find((p) => p.id === dish.plantId);
    if (!plant) throw new Error('花苗不存在');
    plant.status = status;
    return createEvent({
      type: 'status',
      actorId: 'emp-01',
      inputIds: [plant.id],
      outputIds: [],
      meta: { status },
    });
  }

  function transfer({ fromDishId, toDishId }) {
    const fromDish = db.data.dishes.find((d) => d.id === fromDishId);
    if (!fromDish) throw new Error('原培养皿不存在');
    if (db.data.dishes.some((d) => d.id === toDishId)) throw new Error('目标培养皿已占用');
    const plant = db.data.plants.find((p) => p.id === fromDish.plantId);
    if (!plant) throw new Error('花苗不存在');
    fromDish.id = toDishId;
    plant.dishId = toDishId;
    return createEvent({
      type: 'transfer',
      actorId: 'emp-01',
      inputIds: [plant.id],
      outputIds: [],
      meta: { fromDishId, toDishId },
    });
  }

  return {
    split,
    merge,
    place,
    updateStatus,
    transfer,
  };
}
