import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:https';
import { createServer as createHttpServer } from 'node:http';
import { createDb } from './db.js';
import { createApp } from './app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');
const rootDir = join(__dirname, '..');

const port = process.env.PORT || 8787;
const db = createDb();
const app = createApp({ db, distDir: existsSync(distDir) ? distDir : undefined });

// Try to find TLS certs for HTTPS
const certFile = join(rootDir, '192.168.1.3+2.pem');
const keyFile = join(rootDir, '192.168.1.3+2-key.pem');

if (existsSync(certFile) && existsSync(keyFile)) {
  const httpsServer = createServer(
    { cert: readFileSync(certFile), key: readFileSync(keyFile) },
    app
  );
  httpsServer.listen(port, () => {
    console.log(`Server listening on https://localhost:${port}`);
  });
} else {
  const httpServer = createHttpServer(app);
  httpServer.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
