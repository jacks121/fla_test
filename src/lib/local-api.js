// local-api.js — localStorage-based API adapter with the same interface as createApi()

const KEYS = {
  plants: 'fla_local_plants',
  dishes: 'fla_local_dishes',
  events: 'fla_local_events',
  meta: 'fla_local_meta',
  counters: 'fla_local_counters',
};

const VALID_STATUSES = ['正常', '感染', '变异'];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function fail(msg) {
  const e = new Error(msg);
  e.status = 400;
  throw e;
}

function nextPlantId() {
  const counters = load(KEYS.counters, { plant: 0, dish: 0 });
  counters.plant += 1;
  save(KEYS.counters, counters);
  return `P-${counters.plant}`;
}

function nextDishId() {
  const counters = load(KEYS.counters, { plant: 0, dish: 0 });
  counters.dish += 1;
  save(KEYS.counters, counters);
  return `D-${counters.dish}`;
}

function createEvent({ type, actorId, inputIds = [], outputIds = [], meta = {} }) {
  const events = load(KEYS.events, []);
  const event = {
    id: crypto.randomUUID(),
    type,
    actorId,
    ts: new Date().toISOString(),
    inputIds,
    outputIds,
    meta,
  };
  events.push(event);
  save(KEYS.events, events);
  return event;
}

// ---------------------------------------------------------------------------
// Seed data — initialised on first access
// ---------------------------------------------------------------------------

function ensureSeed() {
  if (localStorage.getItem(KEYS.meta)) return;

  const plants = Array.from({ length: 10 }, (_, i) => ({
    id: `P-${i + 1}`,
    type: i % 2 === 0 ? '品种A' : '品种B',
    stage: '萌发',
    status: '正常',
    dishId: `D-${i + 1}`,
  }));

  const dishes = plants.map((p) => ({ id: p.dishId, plantId: p.id }));

  const meta = {
    locations: [
      { id: 'rack-A1', label: 'A架-1层-1位' },
      { id: 'rack-A2', label: 'A架-2层-2位' },
      { id: 'rack-B1', label: 'B架-1层-1位' },
    ],
    trays: [
      { id: 'T-01', label: '盘-01' },
      { id: 'T-02', label: '盘-02' },
      { id: 'T-03', label: '盘-03' },
      { id: 'T-04', label: '盘-04' },
    ],
    statusEnum: ['正常', '感染', '变异'],
    stages: ['萌发', '生长', '分化'],
    types: ['品种A', '品种B', '合并苗'],
  };

  save(KEYS.plants, plants);
  save(KEYS.dishes, dishes);
  save(KEYS.events, []);
  save(KEYS.meta, meta);
  save(KEYS.counters, { plant: 10, dish: 10 });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createLocalApi() {
  ensureSeed();

  return {
    // -----------------------------------------------------------------------
    // login
    // -----------------------------------------------------------------------
    async login({ username, password }) {
      return {
        token: 'local-token',
        user: { id: username, name: username, role: 'admin' },
      };
    },

    // -----------------------------------------------------------------------
    // getMeta
    // -----------------------------------------------------------------------
    async getMeta(token) {
      return load(KEYS.meta, {});
    },

    // -----------------------------------------------------------------------
    // getDishes
    // -----------------------------------------------------------------------
    async getDishes(query, token) {
      const dishes = load(KEYS.dishes, []);
      if (!query) return dishes;
      return dishes.filter((d) => d.id.includes(query));
    },

    // -----------------------------------------------------------------------
    // getEvents
    // -----------------------------------------------------------------------
    async getEvents(params, token) {
      let events = load(KEYS.events, []);
      if (params) {
        if (params.type) events = events.filter((e) => e.type === params.type);
        if (params.actorId) events = events.filter((e) => e.actorId === params.actorId);
        if (params.from) events = events.filter((e) => e.ts >= params.from);
        if (params.to) events = events.filter((e) => e.ts <= params.to);
      }
      // newest first
      return events.slice().reverse();
    },

    // -----------------------------------------------------------------------
    // postEvent
    // -----------------------------------------------------------------------
    async postEvent({ type, actorId, payload }, token) {
      ensureSeed();

      const plants = load(KEYS.plants, []);
      const dishes = load(KEYS.dishes, []);

      const findPlant = (id) => plants.find((p) => p.id === id);
      const findDish = (id) => dishes.find((d) => d.id === id);
      const dishExists = (id) => dishes.some((d) => d.id === id);

      switch (type) {
        // -------------------------------------------------------------------
        // create
        // -------------------------------------------------------------------
        case 'create': {
          const { type: plantType, stage, count, trayId } = payload;
          if (!plantType) fail('缺少品种');
          if (!stage) fail('缺少阶段');
          if (!count || count < 1) fail('数量需大于 0');
          if (count > 50) fail('数量不能超过 50');
          if (!trayId) fail('缺少盘子编号');

          const outputIds = [];
          for (let i = 0; i < count; i++) {
            const plantId = nextPlantId();
            const dishId = nextDishId();
            plants.push({ id: plantId, type: plantType, stage, status: '正常', dishId });
            dishes.push({ id: dishId, plantId });
            outputIds.push(plantId);
          }
          save(KEYS.plants, plants);
          save(KEYS.dishes, dishes);

          return createEvent({
            type: 'create', actorId,
            inputIds: [], outputIds,
            meta: { plantType, stage, count, trayId },
          });
        }

        // -------------------------------------------------------------------
        // split
        // -------------------------------------------------------------------
        case 'split': {
          const { parentDishId, trayId, count } = payload;
          const parentDish = findDish(parentDishId);
          if (!parentDish) fail('父培养皿不存在');
          const parentPlant = findPlant(parentDish.plantId);
          if (!parentPlant) fail('父花苗不存在');
          if (!trayId) fail('缺少盘子编号');
          if (!count || count < 1) fail('数量需大于 0');
          if (count > 50) fail('数量不能超过 50');

          const outputIds = [];
          for (let i = 0; i < count; i++) {
            const plantId = nextPlantId();
            const dishId = nextDishId();
            plants.push({
              id: plantId,
              type: parentPlant.type,
              stage: parentPlant.stage,
              status: '正常',
              dishId,
            });
            dishes.push({ id: dishId, plantId });
            outputIds.push(plantId);
          }
          save(KEYS.plants, plants);
          save(KEYS.dishes, dishes);

          return createEvent({
            type: 'split', actorId,
            inputIds: [parentPlant.id], outputIds,
            meta: { trayId, count },
          });
        }

        // -------------------------------------------------------------------
        // merge
        // -------------------------------------------------------------------
        case 'merge': {
          const { parentDishIds, trayId, targetDishId } = payload;
          if (!Array.isArray(parentDishIds) || parentDishIds.length === 0)
            fail('父培养皿不能为空');
          if (!trayId) fail('缺少盘子编号');
          if (targetDishId && parentDishIds.includes(targetDishId))
            fail('目标培养皿不能与父培养皿相同');

          const parentPlantIds = parentDishIds.map((id) => {
            const dish = findDish(id);
            if (!dish) fail('父培养皿不存在');
            return dish.plantId;
          });

          const dishId = targetDishId || nextDishId();
          if (dishExists(dishId)) fail('培养皿已被占用');

          const plantId = nextPlantId();
          plants.push({ id: plantId, type: '合并苗', stage: '萌发', status: '正常', dishId });
          dishes.push({ id: dishId, plantId });
          save(KEYS.plants, plants);
          save(KEYS.dishes, dishes);

          return createEvent({
            type: 'merge', actorId,
            inputIds: parentPlantIds, outputIds: [plantId],
            meta: { trayId, targetDishId: dishId },
          });
        }

        // -------------------------------------------------------------------
        // place
        // -------------------------------------------------------------------
        case 'place': {
          const { trayId, locationId } = payload;
          if (!trayId) fail('盘子编号不能为空');
          if (!locationId) fail('上架位置不能为空');

          return createEvent({
            type: 'place', actorId,
            inputIds: [], outputIds: [],
            meta: { trayId, locationId },
          });
        }

        // -------------------------------------------------------------------
        // status
        // -------------------------------------------------------------------
        case 'status': {
          const { dishId, status } = payload;
          if (!status || !VALID_STATUSES.includes(status))
            fail(`无效状态，允许值: ${VALID_STATUSES.join('、')}`);
          const dish = findDish(dishId);
          if (!dish) fail('培养皿不存在');
          const plant = findPlant(dish.plantId);
          if (!plant) fail('花苗不存在');

          const oldStatus = plant.status;
          plant.status = status;
          save(KEYS.plants, plants);

          return createEvent({
            type: 'status', actorId,
            inputIds: [plant.id], outputIds: [],
            meta: { status, oldStatus },
          });
        }

        // -------------------------------------------------------------------
        // transfer
        // -------------------------------------------------------------------
        case 'transfer': {
          const { fromDishId, toDishId } = payload;
          if (!fromDishId || !toDishId) fail('缺少培养皿');
          const fromDish = findDish(fromDishId);
          if (!fromDish) fail('原培养皿不存在');
          if (dishExists(toDishId)) fail('目标培养皿已占用');
          const plant = findPlant(fromDish.plantId);
          if (!plant) fail('花苗不存在');

          // Remove old dish, create new dish, update plant
          const dishIdx = dishes.findIndex((d) => d.id === fromDishId);
          dishes.splice(dishIdx, 1);
          dishes.push({ id: toDishId, plantId: plant.id });
          plant.dishId = toDishId;
          save(KEYS.plants, plants);
          save(KEYS.dishes, dishes);

          return createEvent({
            type: 'transfer', actorId,
            inputIds: [plant.id], outputIds: [],
            meta: { fromDishId, toDishId },
          });
        }

        default:
          fail('Invalid event type');
      }
    },

    // -----------------------------------------------------------------------
    // undo
    // -----------------------------------------------------------------------
    async undo(token) {
      ensureSeed();

      const user = load('fla_user', null);
      const actorId = user && (typeof user === 'string' ? user : user.id);
      if (!actorId) fail('缺少操作人');

      const events = load(KEYS.events, []);
      // Find the last event by this actor (events stored oldest-first)
      let last = null;
      for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].actorId === actorId) { last = events[i]; break; }
      }

      if (!last) fail('没有可撤销的操作');
      if (last.type === 'undo') fail('已撤销最近操作，不能连续撤销');

      const elapsed = Date.now() - new Date(last.ts).getTime();
      if (elapsed > 5 * 60 * 1000) fail('操作已超过 5 分钟，无法撤销');

      const plants = load(KEYS.plants, []);
      const dishes = load(KEYS.dishes, []);

      switch (last.type) {
        case 'create':
        case 'split':
        case 'merge': {
          for (const plantId of last.outputIds) {
            const pIdx = plants.findIndex((p) => p.id === plantId);
            if (pIdx !== -1) {
              const plant = plants[pIdx];
              if (plant.dishId) {
                const dIdx = dishes.findIndex((d) => d.id === plant.dishId);
                if (dIdx !== -1) dishes.splice(dIdx, 1);
              }
              plants.splice(pIdx, 1);
            }
          }
          break;
        }
        case 'status': {
          if (last.meta.oldStatus && last.inputIds.length > 0) {
            const plant = plants.find((p) => p.id === last.inputIds[0]);
            if (plant) plant.status = last.meta.oldStatus;
          }
          break;
        }
        case 'transfer': {
          const { fromDishId, toDishId } = last.meta;
          const plantId = last.inputIds[0];
          if (plantId && fromDishId && toDishId) {
            const dIdx = dishes.findIndex((d) => d.id === toDishId);
            if (dIdx !== -1) dishes.splice(dIdx, 1);
            dishes.push({ id: fromDishId, plantId });
            const plant = plants.find((p) => p.id === plantId);
            if (plant) plant.dishId = fromDishId;
          }
          break;
        }
        case 'place':
          // nothing to reverse
          break;
        default:
          fail(`不支持撤销 ${last.type} 类型`);
      }

      save(KEYS.plants, plants);
      save(KEYS.dishes, dishes);

      return createEvent({
        type: 'undo', actorId,
        inputIds: [], outputIds: [],
        meta: { undoneEventId: last.id, undoneEventType: last.type },
      });
    },

    // -----------------------------------------------------------------------
    // logout
    // -----------------------------------------------------------------------
    async logout(token) {
      return { ok: true };
    },
  };
}
