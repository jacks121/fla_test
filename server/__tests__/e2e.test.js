// server/__tests__/e2e.test.js
// 端到端集成测试 — 覆盖 functional-spec.md 中的全部业务场景
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createDb } from '../db.js';
import { hashPassword } from '../password.js';
import { randomUUID } from 'node:crypto';

// ============================================================
// 工具函数
// ============================================================

function setup() {
  const db = createDb({ memory: true });
  const app = createApp({ db });
  return { db, app };
}

async function loginAs(app, username, password) {
  const res = await request(app).post('/api/login').send({ username, password });
  return res;
}

async function setupWithToken(role = 'operator') {
  const { db, app } = setup();
  const username = role === 'admin' ? 'admin' : 'demo';
  const password = role === 'admin' ? 'admin' : 'demo';
  const login = await loginAs(app, username, password);
  return { db, app, token: login.body.token, user: login.body.user };
}

function postEvent(app, token, type, payload) {
  return request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${token}`)
    .send({ type, payload });
}

function undo(app, token) {
  return request(app)
    .post('/api/events/undo')
    .set('Authorization', `Bearer ${token}`);
}

// ============================================================
// 1. 认证流程
// ============================================================

describe('E2E: 认证流程', () => {
  it('正确的用户名密码登录成功', async () => {
    const { app } = setup();
    const res = await loginAs(app, 'demo', 'demo');
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.name).toBe('demo');
    expect(res.body.user.role).toBe('operator');
  });

  it('admin 用户登录返回 admin 角色', async () => {
    const { app } = setup();
    const res = await loginAs(app, 'admin', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
    expect(res.body.user.id).toBe('admin-001');
  });

  it('错误密码登录失败', async () => {
    const { app } = setup();
    const res = await loginAs(app, 'demo', 'wrong');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/账号或口令错误/);
  });

  it('不存在的用户登录失败（通用错误消息）', async () => {
    const { app } = setup();
    const res = await loginAs(app, 'nobody', 'pass');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/账号或口令错误/);
  });

  it('空凭据登录失败', async () => {
    const { app } = setup();
    const res = await request(app).post('/api/login').send({});
    expect(res.status).toBe(400);
  });

  it('未认证请求被拒绝 (401)', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/plants');
    expect(res.status).toBe(401);
  });

  it('无效 token 被拒绝 (401)', async () => {
    const { app } = setup();
    const res = await request(app)
      .get('/api/plants')
      .set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
  });

  it('登出后令牌失效', async () => {
    const { app, token } = await setupWithToken();
    // 先确认 token 有效
    const before = await request(app)
      .get('/api/plants')
      .set('Authorization', `Bearer ${token}`);
    expect(before.status).toBe(200);

    // 登出
    const logout = await request(app)
      .post('/api/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(logout.status).toBe(200);

    // 再次请求应该 401
    const after = await request(app)
      .get('/api/plants')
      .set('Authorization', `Bearer ${token}`);
    expect(after.status).toBe(401);
  });

  it('管理员专属接口 — admin 可访问', async () => {
    const { app, token } = await setupWithToken('admin');
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
    // 不暴露密码哈希
    for (const user of res.body) {
      expect(user.passwordHash).toBeUndefined();
    }
  });

  it('管理员专属接口 — operator 被拒绝 (403)', async () => {
    const { app, token } = await setupWithToken('operator');
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('会话过期后请求被拒绝', async () => {
    const { app, db, token } = await setupWithToken();
    // 手动将会话设为过期
    db.prepare('UPDATE sessions SET expiresAt = ?').run('2020-01-01T00:00:00.000Z');
    const res = await request(app)
      .get('/api/plants')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('健康检查接口无需认证', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ============================================================
// 2. 创建操作
// ============================================================

describe('E2E: 创建操作', () => {
  it('正常创建指定数量花苗', async () => {
    const { db, app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'create', {
      type: '品种A', stage: '萌发', count: 3, trayId: 'T-01',
    });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('create');
    expect(res.body.outputIds).toHaveLength(3);

    // 数据库中新增了 3 株花苗和 3 个培养皿
    const plants = db.prepare('SELECT * FROM plants').all();
    expect(plants.length).toBe(13); // 10 种子 + 3
    const dishes = db.prepare('SELECT * FROM dishes').all();
    expect(dishes.length).toBe(13);
  });

  it('验证自增 ID 正确 (P-11, P-12, P-13)', async () => {
    const { db, app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'create', {
      type: '品种B', stage: '生长', count: 3, trayId: 'T-02',
    });
    expect(res.body.outputIds).toEqual(['P-11', 'P-12', 'P-13']);

    // 对应培养皿 D-11, D-12, D-13
    for (let i = 11; i <= 13; i++) {
      const dish = db.prepare('SELECT * FROM dishes WHERE id = ?').get(`D-${i}`);
      expect(dish).toBeTruthy();
      expect(dish.plantId).toBe(`P-${i}`);
    }
  });

  it('验证品种/阶段/状态正确', async () => {
    const { db, app, token } = await setupWithToken();
    await postEvent(app, token, 'create', {
      type: '品种B', stage: '分化', count: 1, trayId: 'T-01',
    });
    const plant = db.prepare('SELECT * FROM plants WHERE id = ?').get('P-11');
    expect(plant.type).toBe('品种B');
    expect(plant.stage).toBe('分化');
    expect(plant.status).toBe('正常'); // 默认状态
  });

  it('验证事件元数据包含正确信息', async () => {
    const { app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'create', {
      type: '品种A', stage: '萌发', count: 2, trayId: 'T-03',
    });
    expect(res.body.meta.plantType).toBe('品种A');
    expect(res.body.meta.stage).toBe('萌发');
    expect(res.body.meta.count).toBe(2);
    expect(res.body.meta.trayId).toBe('T-03');
  });

  it('缺少品种报错', async () => {
    const { app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'create', {
      stage: '萌发', count: 1, trayId: 'T-01',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/缺少品种/);
  });

  it('缺少阶段报错', async () => {
    const { app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'create', {
      type: '品种A', count: 1, trayId: 'T-01',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/缺少阶段/);
  });

  it('缺少盘子编号报错', async () => {
    const { app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'create', {
      type: '品种A', stage: '萌发', count: 1,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/缺少盘子编号/);
  });

  it('数量为 0 报错', async () => {
    const { app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'create', {
      type: '品种A', stage: '萌发', count: 0, trayId: 'T-01',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/数量/);
  });

  it('数量超过 50 报错', async () => {
    const { app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'create', {
      type: '品种A', stage: '萌发', count: 51, trayId: 'T-01',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/数量不能超过 50/);
  });

  it('actorId 由服务端从会话获取，客户端值被忽略', async () => {
    const { app, token } = await setupWithToken();
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'create',
        actorId: 'fake-attacker',
        payload: { type: '品种A', stage: '萌发', count: 1, trayId: 'T-01' },
      });
    expect(res.status).toBe(200);
    expect(res.body.actorId).toBe('user-001'); // demo 用户的 ID
    expect(res.body.actorId).not.toBe('fake-attacker');
  });
});

// ============================================================
// 3. 拆分操作
// ============================================================

describe('E2E: 拆分操作', () => {
  it('正常拆分，子代继承品种和阶段', async () => {
    const { db, app, token } = await setupWithToken();
    // P-1 是品种A, 萌发
    const res = await postEvent(app, token, 'split', {
      parentDishId: 'D-1', trayId: 'T-01', count: 2,
    });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('split');
    expect(res.body.outputIds).toHaveLength(2);
    expect(res.body.inputIds).toContain('P-1');

    // 验证子代继承品种和阶段
    for (const plantId of res.body.outputIds) {
      const plant = db.prepare('SELECT * FROM plants WHERE id = ?').get(plantId);
      expect(plant.type).toBe('品种A');
      expect(plant.stage).toBe('萌发');
      expect(plant.status).toBe('正常');
    }
  });

  it('拆分后父皿和父苗保持不变', async () => {
    const { db, app, token } = await setupWithToken();
    const parentBefore = db.prepare('SELECT * FROM plants WHERE id = ?').get('P-1');
    await postEvent(app, token, 'split', {
      parentDishId: 'D-1', trayId: 'T-01', count: 2,
    });
    const parentAfter = db.prepare('SELECT * FROM plants WHERE id = ?').get('P-1');
    expect(parentAfter).toEqual(parentBefore);
    const parentDish = db.prepare('SELECT * FROM dishes WHERE id = ?').get('D-1');
    expect(parentDish).toBeTruthy();
    expect(parentDish.plantId).toBe('P-1');
  });

  it('父培养皿不存在报错', async () => {
    const { app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'split', {
      parentDishId: 'D-NOPE', trayId: 'T-01', count: 1,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/父培养皿不存在/);
  });

  it('数量超限报错 (> 50)', async () => {
    const { app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'split', {
      parentDishId: 'D-1', trayId: 'T-01', count: 51,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/数量不能超过 50/);
  });

  it('缺少盘子编号报错', async () => {
    const { app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'split', {
      parentDishId: 'D-1', count: 2,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/缺少盘子编号/);
  });

  it('拆分品种B父代，子代也是品种B', async () => {
    const { db, app, token } = await setupWithToken();
    // P-2 是品种B (交替生成的种子数据)
    const res = await postEvent(app, token, 'split', {
      parentDishId: 'D-2', trayId: 'T-01', count: 1,
    });
    expect(res.status).toBe(200);
    const childPlant = db.prepare('SELECT * FROM plants WHERE id = ?').get(res.body.outputIds[0]);
    expect(childPlant.type).toBe('品种B');
  });
});

// ============================================================
// 4. 合并操作
// ============================================================

describe('E2E: 合并操作', () => {
  it('正常合并多个父皿', async () => {
    const { db, app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'merge', {
      parentDishIds: ['D-1', 'D-2', 'D-3'], trayId: 'T-02',
    });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('merge');
    expect(res.body.outputIds).toHaveLength(1);
    expect(res.body.inputIds).toHaveLength(3); // 三个父花苗

    // 产物品种为"合并苗"
    const mergedPlant = db.prepare('SELECT * FROM plants WHERE id = ?').get(res.body.outputIds[0]);
    expect(mergedPlant.type).toBe('合并苗');
    expect(mergedPlant.stage).toBe('萌发');
    expect(mergedPlant.status).toBe('正常');
  });

  it('合并时指定目标皿 ID', async () => {
    const { db, app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'merge', {
      parentDishIds: ['D-1', 'D-2'], trayId: 'T-02', targetDishId: 'D-100',
    });
    expect(res.status).toBe(200);
    const dish = db.prepare('SELECT * FROM dishes WHERE id = ?').get('D-100');
    expect(dish).toBeTruthy();
    expect(res.body.meta.targetDishId).toBe('D-100');
  });

  it('自动生成目标皿 ID（不指定 targetDishId）', async () => {
    const { db, app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'merge', {
      parentDishIds: ['D-1', 'D-2'], trayId: 'T-02',
    });
    expect(res.status).toBe(200);
    // 自动生成的 ID 应该是 D-11（种子 D-1 ~ D-10 后的下一个）
    expect(res.body.meta.targetDishId).toBe('D-11');
    const dish = db.prepare('SELECT * FROM dishes WHERE id = ?').get('D-11');
    expect(dish).toBeTruthy();
  });

  it('目标皿已占用报错', async () => {
    const { app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'merge', {
      parentDishIds: ['D-1', 'D-2'], trayId: 'T-02', targetDishId: 'D-3',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/培养皿已被占用/);
  });

  it('目标皿不能与父皿重复', async () => {
    const { app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'merge', {
      parentDishIds: ['D-1', 'D-2'], trayId: 'T-02', targetDishId: 'D-1',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/目标培养皿不能与父培养皿相同/);
  });

  it('父皿为空数组报错', async () => {
    const { app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'merge', {
      parentDishIds: [], trayId: 'T-02',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/父培养皿不能为空/);
  });

  it('父皿不存在报错', async () => {
    const { app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'merge', {
      parentDishIds: ['D-NOPE'], trayId: 'T-02',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/父培养皿不存在/);
  });

  it('缺少盘子编号报错', async () => {
    const { app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'merge', {
      parentDishIds: ['D-1', 'D-2'],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/缺少盘子编号/);
  });

  it('合并后父皿不被删除', async () => {
    const { db, app, token } = await setupWithToken();
    await postEvent(app, token, 'merge', {
      parentDishIds: ['D-1', 'D-2'], trayId: 'T-02',
    });
    // 父皿仍然存在
    expect(db.prepare('SELECT * FROM dishes WHERE id = ?').get('D-1')).toBeTruthy();
    expect(db.prepare('SELECT * FROM dishes WHERE id = ?').get('D-2')).toBeTruthy();
  });
});

// ============================================================
// 5. 上架操作
// ============================================================

describe('E2E: 上架操作', () => {
  it('正常记录放置事件', async () => {
    const { app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'place', {
      trayId: 'T-01', locationId: 'rack-A1',
    });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('place');
    expect(res.body.meta.trayId).toBe('T-01');
    expect(res.body.meta.locationId).toBe('rack-A1');
  });

  it('上架不修改花苗数据', async () => {
    const { db, app, token } = await setupWithToken();
    const plantsBefore = db.prepare('SELECT * FROM plants ORDER BY id').all();
    const dishesBefore = db.prepare('SELECT * FROM dishes ORDER BY id').all();

    await postEvent(app, token, 'place', {
      trayId: 'T-01', locationId: 'rack-A1',
    });

    const plantsAfter = db.prepare('SELECT * FROM plants ORDER BY id').all();
    const dishesAfter = db.prepare('SELECT * FROM dishes ORDER BY id').all();
    expect(plantsAfter).toEqual(plantsBefore);
    expect(dishesAfter).toEqual(dishesBefore);
  });

  it('缺少盘子编号报错', async () => {
    const { app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'place', {
      locationId: 'rack-A1',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/盘子编号/);
  });

  it('缺少位置 ID 报错', async () => {
    const { app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'place', {
      trayId: 'T-01',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/上架位置/);
  });

  it('可多次上架同一盘子到不同位置', async () => {
    const { app, token } = await setupWithToken();
    const res1 = await postEvent(app, token, 'place', {
      trayId: 'T-01', locationId: 'rack-A1',
    });
    expect(res1.status).toBe(200);
    const res2 = await postEvent(app, token, 'place', {
      trayId: 'T-01', locationId: 'rack-B1',
    });
    expect(res2.status).toBe(200);
  });
});

// ============================================================
// 6. 状态更新
// ============================================================

describe('E2E: 状态更新', () => {
  it('正常更新状态为"感染"', async () => {
    const { db, app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'status', {
      dishId: 'D-1', status: '感染',
    });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('status');

    const plant = db.prepare("SELECT * FROM plants WHERE dishId = 'D-1'").get();
    expect(plant.status).toBe('感染');
  });

  it('正常更新状态为"变异"', async () => {
    const { db, app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'status', {
      dishId: 'D-1', status: '变异',
    });
    expect(res.status).toBe(200);
    const plant = db.prepare("SELECT * FROM plants WHERE dishId = 'D-1'").get();
    expect(plant.status).toBe('变异');
  });

  it('保存旧状态到事件 meta', async () => {
    const { app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'status', {
      dishId: 'D-1', status: '感染',
    });
    expect(res.body.meta.oldStatus).toBe('正常');
    expect(res.body.meta.status).toBe('感染');
  });

  it('无效状态值报错', async () => {
    const { app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'status', {
      dishId: 'D-1', status: '无效状态',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/无效状态/);
  });

  it('培养皿不存在报错', async () => {
    const { app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'status', {
      dishId: 'D-NOPE', status: '感染',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/培养皿不存在/);
  });

  it('缺少状态值报错', async () => {
    const { app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'status', {
      dishId: 'D-1',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/无效状态/);
  });

  it('连续更新状态，旧状态正确追踪', async () => {
    const { db, app, token } = await setupWithToken();
    // 正常 -> 感染
    const res1 = await postEvent(app, token, 'status', {
      dishId: 'D-1', status: '感染',
    });
    expect(res1.body.meta.oldStatus).toBe('正常');

    // 感染 -> 变异
    const res2 = await postEvent(app, token, 'status', {
      dishId: 'D-1', status: '变异',
    });
    expect(res2.body.meta.oldStatus).toBe('感染');

    const plant = db.prepare("SELECT * FROM plants WHERE dishId = 'D-1'").get();
    expect(plant.status).toBe('变异');
  });
});

// ============================================================
// 7. 转移操作
// ============================================================

describe('E2E: 转移操作', () => {
  it('正常转移花苗到新皿', async () => {
    const { db, app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'transfer', {
      fromDishId: 'D-1', toDishId: 'ND-001',
    });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('transfer');
    expect(res.body.meta.fromDishId).toBe('D-1');
    expect(res.body.meta.toDishId).toBe('ND-001');

    // 旧皿被删除
    expect(db.prepare('SELECT * FROM dishes WHERE id = ?').get('D-1')).toBeUndefined();
    // 新皿存在
    const newDish = db.prepare('SELECT * FROM dishes WHERE id = ?').get('ND-001');
    expect(newDish).toBeTruthy();
    expect(newDish.plantId).toBe('P-1');
    // 花苗的 dishId 更新
    const plant = db.prepare('SELECT * FROM plants WHERE id = ?').get('P-1');
    expect(plant.dishId).toBe('ND-001');
    // 花苗本身不变
    expect(plant.type).toBe('品种A');
    expect(plant.stage).toBe('萌发');
    expect(plant.status).toBe('正常');
  });

  it('旧皿不存在报错', async () => {
    const { app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'transfer', {
      fromDishId: 'D-NOPE', toDishId: 'ND-001',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/原培养皿不存在/);
  });

  it('新皿已存在报错', async () => {
    const { app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'transfer', {
      fromDishId: 'D-1', toDishId: 'D-2',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/目标培养皿已占用/);
  });

  it('缺少参数报错', async () => {
    const { app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'transfer', {
      fromDishId: 'D-1',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/缺少培养皿/);
  });
});

// ============================================================
// 8. 撤销操作
// ============================================================

describe('E2E: 撤销操作', () => {
  it('撤销创建操作 — 删除已创建的花苗和培养皿', async () => {
    const { db, app, token } = await setupWithToken();
    const createRes = await postEvent(app, token, 'create', {
      type: '品种A', stage: '萌发', count: 3, trayId: 'T-01',
    });
    expect(createRes.status).toBe(200);
    expect(db.prepare('SELECT COUNT(*) as c FROM plants').get().c).toBe(13);

    const undoRes = await undo(app, token);
    expect(undoRes.status).toBe(200);
    expect(undoRes.body.type).toBe('undo');
    expect(undoRes.body.meta.undoneEventType).toBe('create');

    // 花苗和培养皿被删除，恢复到 10
    expect(db.prepare('SELECT COUNT(*) as c FROM plants').get().c).toBe(10);
    expect(db.prepare('SELECT COUNT(*) as c FROM dishes').get().c).toBe(10);
  });

  it('撤销拆分操作 — 删除子代', async () => {
    const { db, app, token } = await setupWithToken();
    const splitRes = await postEvent(app, token, 'split', {
      parentDishId: 'D-1', trayId: 'T-01', count: 2,
    });
    expect(splitRes.status).toBe(200);
    expect(db.prepare('SELECT COUNT(*) as c FROM dishes').get().c).toBe(12);

    const undoRes = await undo(app, token);
    expect(undoRes.status).toBe(200);
    expect(undoRes.body.meta.undoneEventType).toBe('split');

    // 子代被删除
    for (const plantId of splitRes.body.outputIds) {
      expect(db.prepare('SELECT * FROM plants WHERE id = ?').get(plantId)).toBeUndefined();
    }
    expect(db.prepare('SELECT COUNT(*) as c FROM dishes').get().c).toBe(10);
  });

  it('撤销合并操作 — 删除合并产物', async () => {
    const { db, app, token } = await setupWithToken();
    const mergeRes = await postEvent(app, token, 'merge', {
      parentDishIds: ['D-1', 'D-2'], trayId: 'T-02',
    });
    expect(mergeRes.status).toBe(200);
    expect(db.prepare('SELECT COUNT(*) as c FROM dishes').get().c).toBe(11);

    const undoRes = await undo(app, token);
    expect(undoRes.status).toBe(200);
    expect(undoRes.body.meta.undoneEventType).toBe('merge');

    // 合并产物被删除
    const mergedPlant = db.prepare('SELECT * FROM plants WHERE id = ?').get(mergeRes.body.outputIds[0]);
    expect(mergedPlant).toBeUndefined();
    expect(db.prepare('SELECT COUNT(*) as c FROM dishes').get().c).toBe(10);
  });

  it('撤销状态更新 — 恢复旧状态', async () => {
    const { db, app, token } = await setupWithToken();
    await postEvent(app, token, 'status', {
      dishId: 'D-1', status: '感染',
    });
    expect(db.prepare("SELECT status FROM plants WHERE dishId = 'D-1'").get().status).toBe('感染');

    const undoRes = await undo(app, token);
    expect(undoRes.status).toBe(200);
    expect(undoRes.body.meta.undoneEventType).toBe('status');
    expect(db.prepare("SELECT status FROM plants WHERE dishId = 'D-1'").get().status).toBe('正常');
  });

  it('撤销转移操作 — 恢复旧皿', async () => {
    const { db, app, token } = await setupWithToken();
    await postEvent(app, token, 'transfer', {
      fromDishId: 'D-1', toDishId: 'ND-001',
    });
    expect(db.prepare('SELECT * FROM dishes WHERE id = ?').get('D-1')).toBeUndefined();
    expect(db.prepare('SELECT * FROM dishes WHERE id = ?').get('ND-001')).toBeTruthy();

    const undoRes = await undo(app, token);
    expect(undoRes.status).toBe(200);
    expect(undoRes.body.meta.undoneEventType).toBe('transfer');

    // 旧皿恢复，新皿删除
    expect(db.prepare('SELECT * FROM dishes WHERE id = ?').get('D-1')).toBeTruthy();
    expect(db.prepare('SELECT * FROM dishes WHERE id = ?').get('ND-001')).toBeUndefined();
    expect(db.prepare('SELECT * FROM plants WHERE id = ?').get('P-1').dishId).toBe('D-1');
  });

  it('不可连续撤销', async () => {
    const { app, token } = await setupWithToken();
    await postEvent(app, token, 'split', {
      parentDishId: 'D-1', trayId: 'T-01', count: 1,
    });
    const undo1 = await undo(app, token);
    expect(undo1.status).toBe(200);

    const undo2 = await undo(app, token);
    expect(undo2.status).toBe(400);
    expect(undo2.body.error).toMatch(/不能连续撤销/);
  });

  it('超时不可撤销 (> 5 分钟)', async () => {
    const { db, app, token } = await setupWithToken();
    await postEvent(app, token, 'split', {
      parentDishId: 'D-1', trayId: 'T-01', count: 1,
    });

    // 手动将事件时间设为 6 分钟前
    const sixMinAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    db.prepare('UPDATE events SET ts = ?').run(sixMinAgo);

    const undoRes = await undo(app, token);
    expect(undoRes.status).toBe(400);
    expect(undoRes.body.error).toMatch(/超过 5 分钟/);
  });

  it('没有操作时撤销报错', async () => {
    const { app, db } = setup();
    // 创建新用户，该用户没有任何操作
    db.prepare('INSERT INTO users (id, username, passwordHash, role) VALUES (?, ?, ?, ?)').run(
      'new-user-001', 'newuser', hashPassword('pass'), 'operator'
    );
    const login = await loginAs(app, 'newuser', 'pass');
    const undoRes = await undo(app, login.body.token);
    expect(undoRes.status).toBe(400);
    expect(undoRes.body.error).toMatch(/没有可撤销的操作/);
  });

  it('只能撤销自己的操作', async () => {
    const { app, db } = setup();
    // demo 用户创建事件
    const demoLogin = await loginAs(app, 'demo', 'demo');
    await postEvent(app, demoLogin.body.token, 'create', {
      type: '品种A', stage: '萌发', count: 1, trayId: 'T-01',
    });

    // admin 用户尝试撤销（admin 没有自己的操作）
    const adminLogin = await loginAs(app, 'admin', 'admin');
    const undoRes = await undo(app, adminLogin.body.token);
    expect(undoRes.status).toBe(400);
    expect(undoRes.body.error).toMatch(/没有可撤销的操作/);

    // demo 的花苗仍然在
    expect(db.prepare('SELECT COUNT(*) as c FROM plants').get().c).toBe(11);
  });

  it('撤销上架操作 — 无实际数据操作（place 撤销为空操作）', async () => {
    const { db, app, token } = await setupWithToken();
    await postEvent(app, token, 'place', {
      trayId: 'T-01', locationId: 'rack-A1',
    });

    const plantsBefore = db.prepare('SELECT * FROM plants ORDER BY id').all();
    const undoRes = await undo(app, token);
    expect(undoRes.status).toBe(200);
    expect(undoRes.body.meta.undoneEventType).toBe('place');

    // 数据没有变化
    const plantsAfter = db.prepare('SELECT * FROM plants ORDER BY id').all();
    expect(plantsAfter).toEqual(plantsBefore);
  });
});

// ============================================================
// 9. 事件查询
// ============================================================

describe('E2E: 事件查询', () => {
  it('按类型过滤事件', async () => {
    const { app, token } = await setupWithToken();
    // 创建不同类型的事件
    await postEvent(app, token, 'create', {
      type: '品种A', stage: '萌发', count: 1, trayId: 'T-01',
    });
    await postEvent(app, token, 'place', {
      trayId: 'T-01', locationId: 'rack-A1',
    });
    await postEvent(app, token, 'status', {
      dishId: 'D-1', status: '感染',
    });

    // 过滤 place 类型
    const res = await request(app)
      .get('/api/events?type=place')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every(e => e.type === 'place')).toBe(true);

    // 过滤 create 类型
    const res2 = await request(app)
      .get('/api/events?type=create')
      .set('Authorization', `Bearer ${token}`);
    expect(res2.body.every(e => e.type === 'create')).toBe(true);
  });

  it('按操作人过滤事件', async () => {
    const { app, token } = await setupWithToken();
    await postEvent(app, token, 'place', {
      trayId: 'T-01', locationId: 'rack-A1',
    });

    const res = await request(app)
      .get('/api/events?actorId=user-001')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every(e => e.actorId === 'user-001')).toBe(true);
  });

  it('按时间范围过滤事件', async () => {
    const { app, token } = await setupWithToken();
    await postEvent(app, token, 'place', {
      trayId: 'T-01', locationId: 'rack-A1',
    });

    const now = new Date();
    const from = new Date(now.getTime() - 60000).toISOString(); // 1 分钟前
    const to = new Date(now.getTime() + 60000).toISOString();   // 1 分钟后

    const res = await request(app)
      .get(`/api/events?from=${from}&to=${to}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);

    // 使用过去的时间范围应该返回空
    const pastFrom = '2020-01-01T00:00:00.000Z';
    const pastTo = '2020-01-02T00:00:00.000Z';
    const res2 = await request(app)
      .get(`/api/events?from=${pastFrom}&to=${pastTo}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res2.status).toBe(200);
    expect(res2.body).toEqual([]);
  });

  it('无过滤条件返回全部事件', async () => {
    const { app, token } = await setupWithToken();
    await postEvent(app, token, 'create', {
      type: '品种A', stage: '萌发', count: 1, trayId: 'T-01',
    });
    await postEvent(app, token, 'place', {
      trayId: 'T-01', locationId: 'rack-A1',
    });

    const res = await request(app)
      .get('/api/events')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });

  it('事件按时间倒序排列', async () => {
    const { app, token } = await setupWithToken();
    await postEvent(app, token, 'create', {
      type: '品种A', stage: '萌发', count: 1, trayId: 'T-01',
    });
    // 短暂延迟确保时间戳不同
    await new Promise(r => setTimeout(r, 10));
    await postEvent(app, token, 'place', {
      trayId: 'T-01', locationId: 'rack-A1',
    });

    const res = await request(app)
      .get('/api/events')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.length).toBe(2);
    // 最新的在前
    expect(res.body[0].type).toBe('place');
    expect(res.body[1].type).toBe('create');
  });
});

// ============================================================
// 10. 数据查询接口
// ============================================================

describe('E2E: 数据查询接口', () => {
  it('GET /api/plants 返回全部花苗', async () => {
    const { app, token } = await setupWithToken();
    const res = await request(app)
      .get('/api/plants')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(10);
    // 验证数据结构
    const p = res.body[0];
    expect(p).toHaveProperty('id');
    expect(p).toHaveProperty('type');
    expect(p).toHaveProperty('stage');
    expect(p).toHaveProperty('status');
    expect(p).toHaveProperty('dishId');
  });

  it('GET /api/plants?query= 支持搜索', async () => {
    const { app, token } = await setupWithToken();
    const res = await request(app)
      .get('/api/plants?query=P-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('GET /api/dishes 返回全部培养皿', async () => {
    const { app, token } = await setupWithToken();
    const res = await request(app)
      .get('/api/dishes')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(10);
    const d = res.body[0];
    expect(d).toHaveProperty('id');
    expect(d).toHaveProperty('plantId');
  });

  it('GET /api/dishes?query= 支持搜索', async () => {
    const { app, token } = await setupWithToken();
    const res = await request(app)
      .get('/api/dishes?query=D-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('GET /api/meta 返回元数据', async () => {
    const { app, token } = await setupWithToken();
    const res = await request(app)
      .get('/api/meta')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.locations.length).toBe(3);
    expect(res.body.trays.length).toBe(4);
  });

  it('无效的事件类型报错', async () => {
    const { app, token } = await setupWithToken();
    const res = await postEvent(app, token, 'invalid_type', {});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid event type/);
  });
});

// ============================================================
// 11. 复合业务流程
// ============================================================

describe('E2E: 复合业务流程', () => {
  it('创建 -> 拆分 -> 合并 完整流程', async () => {
    const { db, app, token } = await setupWithToken();

    // 1. 创建 2 株花苗
    const createRes = await postEvent(app, token, 'create', {
      type: '品种A', stage: '生长', count: 2, trayId: 'T-01',
    });
    expect(createRes.status).toBe(200);
    const [p11, p12] = createRes.body.outputIds;

    // 2. 获取对应的培养皿 ID
    const d11 = db.prepare('SELECT * FROM plants WHERE id = ?').get(p11).dishId;
    const d12 = db.prepare('SELECT * FROM plants WHERE id = ?').get(p12).dishId;

    // 3. 拆分 D-11
    const splitRes = await postEvent(app, token, 'split', {
      parentDishId: d11, trayId: 'T-02', count: 2,
    });
    expect(splitRes.status).toBe(200);

    // 4. 合并 D-12 和拆分后的一个子代
    const childDishId = db.prepare('SELECT * FROM plants WHERE id = ?')
      .get(splitRes.body.outputIds[0]).dishId;
    const mergeRes = await postEvent(app, token, 'merge', {
      parentDishIds: [d12, childDishId], trayId: 'T-03',
    });
    expect(mergeRes.status).toBe(200);
    const mergedPlant = db.prepare('SELECT * FROM plants WHERE id = ?')
      .get(mergeRes.body.outputIds[0]);
    expect(mergedPlant.type).toBe('合并苗');
    expect(mergedPlant.stage).toBe('萌发');
  });

  it('创建 -> 状态更新 -> 转移 -> 撤销转移 完整流程', async () => {
    const { db, app, token } = await setupWithToken();

    // 1. 创建
    const createRes = await postEvent(app, token, 'create', {
      type: '品种B', stage: '分化', count: 1, trayId: 'T-01',
    });
    const plantId = createRes.body.outputIds[0];
    const dishId = db.prepare('SELECT dishId FROM plants WHERE id = ?').get(plantId).dishId;

    // 2. 更新状态
    await postEvent(app, token, 'status', {
      dishId, status: '变异',
    });
    expect(db.prepare('SELECT status FROM plants WHERE id = ?').get(plantId).status).toBe('变异');

    // 3. 转移
    const newDishId = 'ND-TEST-001';
    await postEvent(app, token, 'transfer', {
      fromDishId: dishId, toDishId: newDishId,
    });
    expect(db.prepare('SELECT dishId FROM plants WHERE id = ?').get(plantId).dishId).toBe(newDishId);

    // 4. 撤销转移
    const undoRes = await undo(app, token);
    expect(undoRes.body.meta.undoneEventType).toBe('transfer');
    expect(db.prepare('SELECT dishId FROM plants WHERE id = ?').get(plantId).dishId).toBe(dishId);
    // 状态不受撤销转移影响
    expect(db.prepare('SELECT status FROM plants WHERE id = ?').get(plantId).status).toBe('变异');
  });

  it('多用户操作互不影响 — 各自只能撤销自己的操作', async () => {
    const { app, db } = setup();

    // 两个用户分别登录
    const demoLogin = await loginAs(app, 'demo', 'demo');
    const adminLogin = await loginAs(app, 'admin', 'admin');

    // demo 创建
    await postEvent(app, demoLogin.body.token, 'create', {
      type: '品种A', stage: '萌发', count: 1, trayId: 'T-01',
    });

    // admin 创建
    await postEvent(app, adminLogin.body.token, 'create', {
      type: '品种B', stage: '生长', count: 1, trayId: 'T-02',
    });

    expect(db.prepare('SELECT COUNT(*) as c FROM plants').get().c).toBe(12);

    // admin 撤销自己的操作
    const adminUndo = await undo(app, adminLogin.body.token);
    expect(adminUndo.status).toBe(200);
    expect(adminUndo.body.meta.undoneEventType).toBe('create');
    expect(db.prepare('SELECT COUNT(*) as c FROM plants').get().c).toBe(11);

    // demo 撤销自己的操作
    const demoUndo = await undo(app, demoLogin.body.token);
    expect(demoUndo.status).toBe(200);
    expect(db.prepare('SELECT COUNT(*) as c FROM plants').get().c).toBe(10);
  });

  it('上架 -> 查询事件确认记录', async () => {
    const { app, token } = await setupWithToken();

    // 模拟多个盘子上架到同一位置
    await postEvent(app, token, 'place', {
      trayId: 'T-01', locationId: 'rack-A1',
    });
    await postEvent(app, token, 'place', {
      trayId: 'T-02', locationId: 'rack-A1',
    });
    await postEvent(app, token, 'place', {
      trayId: 'T-03', locationId: 'rack-B1',
    });

    // 查询所有 place 事件
    const res = await request(app)
      .get('/api/events?type=place')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.length).toBe(3);
    expect(res.body.every(e => e.type === 'place')).toBe(true);

    // 确认位置信息
    const a1Events = res.body.filter(e => e.meta.locationId === 'rack-A1');
    expect(a1Events.length).toBe(2);
  });
});

// ============================================================
// 12. 种子数据完整性
// ============================================================

describe('E2E: 种子数据完整性', () => {
  it('初始有 10 株花苗 (P-1 ~ P-10)', async () => {
    const { db } = setup();
    const plants = db.prepare('SELECT * FROM plants ORDER BY id').all();
    expect(plants.length).toBe(10);
    for (let i = 1; i <= 10; i++) {
      const p = plants.find(p => p.id === `P-${i}`);
      expect(p).toBeTruthy();
      expect(p.dishId).toBe(`D-${i}`);
      expect(p.status).toBe('正常');
      expect(p.stage).toBe('萌发');
    }
  });

  it('初始有 10 个培养皿 (D-1 ~ D-10)', async () => {
    const { db } = setup();
    const dishes = db.prepare('SELECT * FROM dishes ORDER BY id').all();
    expect(dishes.length).toBe(10);
    for (let i = 1; i <= 10; i++) {
      const d = dishes.find(d => d.id === `D-${i}`);
      expect(d).toBeTruthy();
      expect(d.plantId).toBe(`P-${i}`);
    }
  });

  it('初始有 3 个位置', async () => {
    const { db } = setup();
    const locations = db.prepare('SELECT * FROM locations').all();
    expect(locations.length).toBe(3);
  });

  it('初始有 4 个盘子', async () => {
    const { db } = setup();
    const trays = db.prepare('SELECT * FROM trays').all();
    expect(trays.length).toBe(4);
  });

  it('初始有 2 个用户（admin 和 demo）', async () => {
    const { db } = setup();
    const users = db.prepare('SELECT * FROM users').all();
    expect(users.length).toBe(2);
  });

  it('初始无事件和会话', async () => {
    const { db } = setup();
    expect(db.prepare('SELECT COUNT(*) as c FROM events').get().c).toBe(0);
    expect(db.prepare('SELECT COUNT(*) as c FROM sessions').get().c).toBe(0);
  });
});
