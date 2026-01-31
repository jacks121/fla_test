import { createDb } from './db.js';
import { createApp } from './app.js';

const port = process.env.PORT || 8787;
const db = await createDb();
const app = createApp({ db });

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
