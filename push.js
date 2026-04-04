import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function migrate() {
  try {
    await db.execute(sql`ALTER TABLE workers ADD COLUMN email VARCHAR(255) UNIQUE;`);
  } catch(e) { console.log(e.message) }

  try {
    await db.execute(sql`ALTER TABLE workers ADD COLUMN firebase_uid VARCHAR(128) UNIQUE;`);
  } catch(e) { console.log(e.message) }
  process.exit(0);
}
migrate();
