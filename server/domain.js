import { randomUUID } from 'node:crypto';
import { parseEvent } from './db.js';

function ts() {
  return new Date().toISOString();
}

export function createDomain(db) {
  const stmts = {
    findPlantById: db.prepare('SELECT * FROM plants WHERE id = ?'),
    findDishById: db.prepare('SELECT * FROM dishes WHERE id = ?'),
    dishExists: db.prepare('SELECT 1 FROM dishes WHERE id = ?'),
    insertPlant: db.prepare(
      'INSERT INTO plants (id, type, stage, status, dishId) VALUES (?, ?, ?, ?, ?)'
    ),
    insertDish: db.prepare('INSERT INTO dishes (id, plantId) VALUES (?, ?)'),
    insertEvent: db.prepare(
      'INSERT INTO events (id, type, actorId, ts, inputIds, outputIds, meta) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ),
    updatePlantStatus: db.prepare('UPDATE plants SET status = ? WHERE id = ?'),
    updatePlantDishId: db.prepare('UPDATE plants SET dishId = ? WHERE id = ?'),
    deleteDish: db.prepare('DELETE FROM dishes WHERE id = ?'),
    deletePlant: db.prepare('DELETE FROM plants WHERE id = ?'),
    maxPlantNum: db.prepare(
      "SELECT MAX(CAST(SUBSTR(id, 3) AS INTEGER)) as maxNum FROM plants WHERE id LIKE 'P-%'"
    ),
    maxDishNum: db.prepare(
      "SELECT MAX(CAST(SUBSTR(id, 3) AS INTEGER)) as maxNum FROM dishes WHERE id LIKE 'D-%'"
    ),
  };

  function nextPlantId() {
    return `P-${(stmts.maxPlantNum.get().maxNum || 0) + 1}`;
  }

  function nextDishId() {
    return `D-${(stmts.maxDishNum.get().maxNum || 0) + 1}`;
  }

  function persistEvent(event) {
    stmts.insertEvent.run(
      event.id, event.type, event.actorId, event.ts,
      JSON.stringify(event.inputIds),
      JSON.stringify(event.outputIds),
      JSON.stringify(event.meta)
    );
    return event;
  }

  function createEvent({ type, actorId, inputIds = [], outputIds = [], meta = {} }) {
    return persistEvent({ id: randomUUID(), type, actorId, ts: ts(), inputIds, outputIds, meta });
  }

  const split = db.transaction(({ parentDishId, trayId, count, actorId = 'emp-01' }) => {
    const parentDish = stmts.findDishById.get(parentDishId);
    if (!parentDish) throw new Error('父培养皿不存在');
    const parentPlant = stmts.findPlantById.get(parentDish.plantId);
    if (!parentPlant) throw new Error('父花苗不存在');
    if (!count || count < 1) throw new Error('数量需大于 0');
    if (count > 50) throw new Error('数量不能超过 50');

    const outputIds = [];
    for (let i = 0; i < count; i++) {
      const plantId = nextPlantId();
      const dishId = nextDishId();
      stmts.insertPlant.run(plantId, parentPlant.type, parentPlant.stage, '正常', dishId);
      stmts.insertDish.run(dishId, plantId);
      outputIds.push(plantId);
    }

    return createEvent({
      type: 'split', actorId,
      inputIds: [parentPlant.id], outputIds,
      meta: { trayId, count },
    });
  });

  const merge = db.transaction(({ parentDishIds, trayId, targetDishId, actorId = 'emp-01' }) => {
    if (!Array.isArray(parentDishIds) || parentDishIds.length === 0)
      throw new Error('父培养皿不能为空');
    if (targetDishId && parentDishIds.includes(targetDishId))
      throw new Error('目标培养皿不能与父培养皿相同');
    const parentPlantIds = parentDishIds.map((id) => {
      const dish = stmts.findDishById.get(id);
      if (!dish) throw new Error('父培养皿不存在');
      return dish.plantId;
    });
    const dishId = targetDishId || nextDishId();
    if (stmts.dishExists.get(dishId)) throw new Error('培养皿已被占用');

    const plantId = nextPlantId();
    stmts.insertPlant.run(plantId, '合并苗', '萌发', '正常', dishId);
    stmts.insertDish.run(dishId, plantId);

    return createEvent({
      type: 'merge', actorId,
      inputIds: parentPlantIds, outputIds: [plantId],
      meta: { trayId, targetDishId: dishId },
    });
  });

  function place({ trayId, locationId, actorId = 'emp-01' }) {
    if (!trayId) throw new Error('盘子编号不能为空');
    if (!locationId) throw new Error('上架位置不能为空');
    return createEvent({
      type: 'place', actorId,
      inputIds: [], outputIds: [],
      meta: { trayId, locationId },
    });
  }

  const updateStatus = db.transaction(({ dishId, status, actorId = 'emp-01' }) => {
    const dish = stmts.findDishById.get(dishId);
    if (!dish) throw new Error('培养皿不存在');
    const plant = stmts.findPlantById.get(dish.plantId);
    if (!plant) throw new Error('花苗不存在');
    const oldStatus = plant.status;
    stmts.updatePlantStatus.run(status, plant.id);
    return createEvent({
      type: 'status', actorId,
      inputIds: [plant.id], outputIds: [],
      meta: { status, oldStatus },
    });
  });

  const transfer = db.transaction(({ fromDishId, toDishId, actorId = 'emp-01' }) => {
    if (!fromDishId || !toDishId) throw new Error('缺少培养皿');
    const fromDish = stmts.findDishById.get(fromDishId);
    if (!fromDish) throw new Error('原培养皿不存在');
    if (stmts.dishExists.get(toDishId)) throw new Error('目标培养皿已占用');
    const plant = stmts.findPlantById.get(fromDish.plantId);
    if (!plant) throw new Error('花苗不存在');
    stmts.deleteDish.run(fromDishId);
    stmts.insertDish.run(toDishId, plant.id);
    stmts.updatePlantDishId.run(toDishId, plant.id);
    return createEvent({
      type: 'transfer', actorId,
      inputIds: [plant.id], outputIds: [],
      meta: { fromDishId, toDishId },
    });
  });

  const create = db.transaction(({ type, stage, count, trayId, actorId = 'emp-01' }) => {
    if (!type) throw new Error('缺少品种');
    if (!stage) throw new Error('缺少阶段');
    if (!count || count < 1) throw new Error('数量需大于 0');
    if (count > 50) throw new Error('数量不能超过 50');
    if (!trayId) throw new Error('缺少盘子编号');

    const outputIds = [];
    for (let i = 0; i < count; i++) {
      const plantId = nextPlantId();
      const dishId = nextDishId();
      stmts.insertPlant.run(plantId, type, stage, '正常', dishId);
      stmts.insertDish.run(dishId, plantId);
      outputIds.push(plantId);
    }

    return createEvent({
      type: 'create', actorId,
      inputIds: [], outputIds,
      meta: { plantType: type, stage, count, trayId },
    });
  });

  const undo = db.transaction(({ actorId }) => {
    if (!actorId) throw new Error('缺少操作人');

    const lastRow = db.prepare(
      'SELECT * FROM events WHERE actorId = ? ORDER BY rowid DESC LIMIT 1'
    ).get(actorId);
    if (!lastRow) throw new Error('没有可撤销的操作');

    const last = parseEvent(lastRow);
    if (last.type === 'undo') throw new Error('已撤销最近操作，不能连续撤销');

    const elapsed = Date.now() - new Date(last.ts).getTime();
    if (elapsed > 5 * 60 * 1000) throw new Error('操作已超过 5 分钟，无法撤销');

    switch (last.type) {
      case 'create':
      case 'split':
      case 'merge':
        for (const plantId of last.outputIds) {
          const plant = stmts.findPlantById.get(plantId);
          if (plant) {
            if (plant.dishId) stmts.deleteDish.run(plant.dishId);
            stmts.deletePlant.run(plantId);
          }
        }
        break;
      case 'status':
        if (last.meta.oldStatus && last.inputIds.length > 0) {
          stmts.updatePlantStatus.run(last.meta.oldStatus, last.inputIds[0]);
        }
        break;
      case 'transfer': {
        const { fromDishId, toDishId } = last.meta;
        const plantId = last.inputIds[0];
        if (plantId && fromDishId && toDishId) {
          stmts.deleteDish.run(toDishId);
          stmts.insertDish.run(fromDishId, plantId);
          stmts.updatePlantDishId.run(fromDishId, plantId);
        }
        break;
      }
      case 'place':
        break;
      default:
        throw new Error(`不支持撤销 ${last.type} 类型`);
    }

    return createEvent({
      type: 'undo', actorId,
      inputIds: [], outputIds: [],
      meta: { undoneEventId: last.id, undoneEventType: last.type },
    });
  });

  return { create, split, merge, place, updateStatus, transfer, undo };
}
