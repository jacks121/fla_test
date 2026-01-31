export const staff = [
  { id: 'emp-01', name: 'Alice' },
  { id: 'emp-02', name: 'Bob' },
];

export const locations = [
  { id: 'rack-A1', label: 'A架-1层-1位' },
  { id: 'rack-A2', label: 'A架-2层-2位' },
  { id: 'rack-B1', label: 'B架-1层-1位' },
];

export const plants = Array.from({ length: 10 }).map((_, idx) => ({
  id: `P-${idx + 1}`,
  type: idx % 2 === 0 ? '品种A' : '品种B',
  stage: '萌发',
  status: '正常',
  dishId: `D-${idx + 1}`,
}));

export const dishes = plants.map((p) => ({ id: p.dishId, plantId: p.id }));

export function makeInitialState() {
  return {
    plants: new Map(plants.map((p) => [p.id, { ...p }])),
    dishes: new Map(dishes.map((d) => [d.id, { ...d }])),
    locations: new Map(locations.map((l) => [l.id, { ...l }])),
    events: [],
    staff,
  };
}
