// server/backup.js
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const src = process.argv[2] || 'server/data.sqlite';
const dir = 'backups';
mkdirSync(dir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const dest = join(dir, `data-${timestamp}.sqlite`);

const db = new Database(src, { readonly: true });
db.backup(dest).then(() => {
  db.close();
  console.log(`Backup saved to ${dest}`);
}).catch((err) => {
  db.close();
  console.error('Backup failed:', err.message);
  process.exit(1);
});
