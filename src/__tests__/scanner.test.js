import { describe, it, expect } from 'vitest';

describe('scanner module', () => {
  it('exports startScan, startContinuousScan, stopScan', async () => {
    const mod = await import('../lib/scanner.js');
    expect(typeof mod.startScan).toBe('function');
    expect(typeof mod.startContinuousScan).toBe('function');
    expect(typeof mod.stopScan).toBe('function');
  });
});
