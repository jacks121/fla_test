import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../password.js';

describe('password', () => {
  it('hashPassword returns a string containing salt and hash', () => {
    const h = hashPassword('test123');
    expect(typeof h).toBe('string');
    expect(h).toContain('.');
  });

  it('verifyPassword returns true for correct password', () => {
    const h = hashPassword('test123');
    expect(verifyPassword('test123', h)).toBe(true);
  });

  it('verifyPassword returns false for wrong password', () => {
    const h = hashPassword('test123');
    expect(verifyPassword('wrong', h)).toBe(false);
  });

  it('different calls produce different hashes (unique salt)', () => {
    const h1 = hashPassword('test123');
    const h2 = hashPassword('test123');
    expect(h1).not.toBe(h2);
  });
});
