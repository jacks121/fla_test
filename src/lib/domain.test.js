import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from './domain.js';
import { makeInitialState } from './mockData.js';

describe('domain operations', () => {
  let store;
  beforeEach(() => {
    store = createStore(makeInitialState());
  });

  it('split creates new plants and events', () => {
    const evt = store.split({ parentDishId: 'D-1', count: 2 });
    expect(evt.type).toBe('split');
    expect(evt.outputIds).toHaveLength(2);
    expect(store.state.events[0].id).toBe(evt.id);
  });

  it('merge creates output plants', () => {
    const evt = store.merge({ parentDishIds: ['D-1', 'D-2'], outputs: 1 });
    expect(evt.type).toBe('merge');
    expect(evt.outputIds).toHaveLength(1);
  });

  it('place records location', () => {
    const evt = store.place({ locationId: 'rack-A1', dishIds: ['D-1', 'D-2'] });
    expect(evt.meta.locationId).toBe('rack-A1');
  });

  it('status updates plant status', () => {
    store.updateStatus({ dishId: 'D-1', status: '感染' });
    const plant = store.getPlantByDish('D-1');
    expect(plant.status).toBe('感染');
  });

  it('transfer moves plant to new dish', () => {
    store.transfer({ fromDishId: 'D-1', toDishId: 'ND-1' });
    const plant = store.getPlantByDish('ND-1');
    expect(plant.dishId).toBe('ND-1');
    expect(store.state.dishes.has('D-1')).toBe(false);
  });

  it('undo removes last event', () => {
    const evt = store.place({ locationId: 'rack-A1', dishIds: ['D-1'] });
    store.undoLast();
    expect(store.state.events.find((e) => e.id === evt.id)).toBeUndefined();
  });
});
