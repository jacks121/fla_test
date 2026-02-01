import { createDb } from './db.js';
import { hashPassword } from './password.js';
import { randomUUID } from 'node:crypto';

const [,, username, password, role = 'operator'] = process.argv;

if (!username || !password) {
  console.error('Usage: node server/add-user.js <username> <password> [role]');
  console.error('  role: operator (default) or admin');
  process.exit(1);
}

if (!['operator', 'admin'].includes(role)) {
  console.error('Invalid role. Must be "operator" or "admin".');
  process.exit(1);
}

const db = createDb();
const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (existing) {
  console.error(`User "${username}" already exists.`);
  db.close();
  process.exit(1);
}

const id = randomUUID();
const passwordHash = hashPassword(password);
db.prepare('INSERT INTO users (id, username, passwordHash, role) VALUES (?, ?, ?, ?)').run(
  id, username, passwordHash, role
);
db.close();
console.log(`User "${username}" created with role "${role}".`);
