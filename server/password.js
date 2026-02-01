import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export function hashPassword(password) {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}.${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split('.');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, KEY_LENGTH);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
