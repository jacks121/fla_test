import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createDb } from './db.js';
import { createApp } from './app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');

const port = process.env.PORT || 8787;
const db = createDb();
const app = createApp({ db });

if (existsSync(distDir)) {
  app.use(express.static(distDir));
  console.log('Serving static files from dist/');
}

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
