import { describe, expect, it } from 'vitest';
import { filterEventsByActor } from '../lib/history.js';

describe('filterEventsByActor', () => {
  it('filters events by actorId and keeps order', () => {
    const events = [
      { id: 'e1', actorId: 'u1', type: 'split' },
      { id: 'e2', actorId: 'u2', type: 'merge' },
      { id: 'e3', actorId: 'u1', type: 'place' },
    ];
    const result = filterEventsByActor(events, 'u1');
    expect(result).toEqual([
      { id: 'e1', actorId: 'u1', type: 'split' },
      { id: 'e3', actorId: 'u1', type: 'place' },
    ]);
  });

  it('returns empty when actorId missing', () => {
    const events = [{ id: 'e1', actorId: 'u1', type: 'split' }];
    expect(filterEventsByActor(events, '')).toEqual([]);
  });
});
