// 共享常量 — 品种、阶段、状态枚举；事件类型标签映射

export const PLANT_TYPES = ['品种A', '品种B'];
export const STAGES = ['萌发', '生长', '分化'];
export const STATUS_ENUM = ['正常', '感染', '变异'];

export const EVENT_TYPE_LABELS = {
  create: '创建',
  split: '拆分',
  merge: '合并',
  place: '上架',
  status: '状态',
  transfer: '转移',
  undo: '撤销',
};

export const EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS);

export function labelOfType(type) {
  return EVENT_TYPE_LABELS[type] || type;
}

// 状态颜色映射
export const STATUS_COLORS = {
  '正常': 'success',
  '感染': 'danger',
  '变异': 'warning',
};
