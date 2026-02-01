import { describe, expect, it } from 'vitest';
import { normalizeParentIds } from '../lib/merge.js';

describe('normalizeParentIds', () => {
  it('merges queue and bulk list with uniqueness', () => {
    const result = normalizeParentIds(['D-1', 'D-2'], 'D-2, D-3, , D-1');
    expect(result).toEqual(['D-1', 'D-2', 'D-3']);
  });

  it('returns queue when bulk list empty', () => {
    const result = normalizeParentIds(['D-5'], '');
    expect(result).toEqual(['D-5']);
  });
});
