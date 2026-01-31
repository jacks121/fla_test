function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function eventId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return uid('evt');
}

function ts() {
  return new Date().toISOString();
}

export function createStore(initial) {
  const state = initial;
  const history = [];

  function pushEvent(evt) {
    state.events.unshift(evt);
    history.push(evt);
    return evt;
  }

  function getPlantByDish(dishId) {
    const dish = state.dishes.get(dishId);
    if (!dish) return null;
    return state.plants.get(dish.plantId) || null;
  }

  function split({ parentDishId, childDishIds, actor = 'emp-01', meta = {} }) {
    if (!parentDishId) throw new Error('缺少父培养皿');
    const parentPlant = getPlantByDish(parentDishId);
    if (!parentPlant) throw new Error('父花苗不存在');
    if (!Array.isArray(childDishIds) || childDishIds.length === 0)
      throw new Error('请提供子培养皿');

    const outputs = [];
    childDishIds.forEach((dishId) => {
      if (!dishId) throw new Error('子培养皿编号无效');
      if (state.dishes.has(dishId)) throw new Error(`培养皿已被占用: ${dishId}`);
      const plantId = uid('P');
      const plant = {
        id: plantId,
        type: parentPlant.type,
        stage: parentPlant.stage,
        status: '正常',
        dishId,
      };
      state.plants.set(plantId, plant);
      state.dishes.set(dishId, { id: dishId, plantId });
      outputs.push(plantId);
    });
    return pushEvent({
      id: eventId(),
      type: 'split',
      actor,
      ts: ts(),
      inputIds: [parentPlant.id],
      outputIds: outputs,
      meta,
    });
  }

  function merge({ parentDishIds, outputs = 1, childDishIds = [], actor = 'emp-01', meta = {} }) {
    if (!Array.isArray(parentDishIds) || parentDishIds.length === 0) {
      throw new Error('缺少父培养皿');
    }
    const parentPlantIds = parentDishIds.map((d) => {
      const plant = getPlantByDish(d);
      if (!plant) throw new Error('父花苗不存在');
      return plant.id;
    });
    const outIds = [];
    const targetDishes = childDishIds.length ? childDishIds : Array.from({ length: outputs }).map(() => uid('D'));
    targetDishes.forEach((dishId) => {
      if (!dishId) throw new Error('输出培养皿无效');
      if (state.dishes.has(dishId)) throw new Error(`培养皿已被占用: ${dishId}`);
      const plantId = uid('P');
      state.plants.set(plantId, {
        id: plantId,
        type: '合并苗',
        stage: '萌发',
        status: '正常',
        dishId,
      });
      state.dishes.set(dishId, { id: dishId, plantId });
      outIds.push(plantId);
    });
    return pushEvent({
      id: eventId(),
      type: 'merge',
      actor,
      ts: ts(),
      inputIds: parentPlantIds,
      outputIds: outIds,
      meta,
    });
  }

  function place({ locationId, dishIds, actor = 'emp-01', meta = {} }) {
    if (!state.locations.has(locationId)) throw new Error('位置不存在');
    if (!Array.isArray(dishIds) || dishIds.length === 0) throw new Error('缺少培养皿');
    const valid = dishIds.every((d) => state.dishes.has(d));
    if (!valid) throw new Error('存在无效培养皿');
    return pushEvent({
      id: eventId(),
      type: 'place',
      actor,
      ts: ts(),
      inputIds: dishIds,
      outputIds: [],
      meta: { ...meta, locationId },
    });
  }

  function updateStatus({ dishId, status, actor = 'emp-01', meta = {} }) {
    const plant = getPlantByDish(dishId);
    if (!plant) throw new Error('花苗不存在');
    plant.status = status;
    return pushEvent({
      id: eventId(),
      type: 'status',
      actor,
      ts: ts(),
      inputIds: [plant.id],
      outputIds: [],
      meta: { ...meta, status },
    });
  }

  function transfer({ fromDishId, toDishId, actor = 'emp-01', meta = {} }) {
    if (!fromDishId || !toDishId) throw new Error('缺少培养皿');
    const plant = getPlantByDish(fromDishId);
    if (!plant) throw new Error('花苗不存在');
    state.dishes.set(toDishId, { id: toDishId, plantId: plant.id });
    state.dishes.delete(fromDishId);
    plant.dishId = toDishId;
    return pushEvent({
      id: eventId(),
      type: 'transfer',
      actor,
      ts: ts(),
      inputIds: [plant.id],
      outputIds: [],
      meta: { ...meta, fromDishId, toDishId },
    });
  }

  function undoLast(n = 1) {
    for (let i = 0; i < n; i++) {
      const evt = history.pop();
      if (!evt) break;
      state.events = state.events.filter((e) => e.id !== evt.id);
    }
  }

  return {
    state,
    split,
    merge,
    place,
    updateStatus,
    transfer,
    undoLast,
    getPlantByDish,
  };
}
