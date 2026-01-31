export const seedLocations = [
  { id: 'rack-A1', label: 'A架-1层-1位' },
  { id: 'rack-A2', label: 'A架-2层-2位' },
  { id: 'rack-B1', label: 'B架-1层-1位' },
];

export const seedTrays = [
  { id: 'T-01', label: '盘-01' },
  { id: 'T-02', label: '盘-02' },
  { id: 'T-03', label: '盘-03' },
  { id: 'T-04', label: '盘-04' },
];

export const seedPlants = Array.from({ length: 10 }).map((_, idx) => ({
  id: `P-${idx + 1}`,
  type: idx % 2 === 0 ? '品种A' : '品种B',
  stage: '萌发',
  status: '正常',
  dishId: `D-${idx + 1}`,
}));

export const seedDishes = seedPlants.map((p) => ({ id: p.dishId, plantId: p.id }));

export const seedMeta = {
  locations: seedLocations,
  trays: seedTrays,
  statusEnum: ['正常', '感染', '变异'],
  stages: ['萌发', '生长', '分化'],
  types: ['品种A', '品种B', '合并苗'],
};
