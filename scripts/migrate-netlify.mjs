import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { database } from '../netlify/lib/database.mjs';

// Manual local fallback only. Managed deploys use Netlify's migration tracker.
if (process.env.NETLIFY) throw new Error('Use Netlify automatic migrations during deployment, not this local fallback.');
const pool = database(), db = await pool.connect();
try {
  await db.query('SELECT pg_advisory_lock(827462)');
  await db.query('CREATE TABLE IF NOT EXISTS fd_manual_migrations(name TEXT PRIMARY KEY, hash TEXT NOT NULL)');
  const root = resolve(import.meta.dirname, '../netlify/database/migrations');
  for (const name of (await readdir(root)).filter(name => name.endsWith('.sql')).sort()) {
    const sql = await readFile(resolve(root, name), 'utf8');
    const hash = createHash('sha256').update(sql).digest('hex');
    const previous = (await db.query('SELECT hash FROM fd_manual_migrations WHERE name=$1', [name])).rows[0];
    if (previous) {
      if (previous.hash !== hash) throw new Error(`Applied migration changed: ${name}`);
      continue;
    }
    await db.query('BEGIN');
    try {
      await db.query(sql);
      await db.query('INSERT INTO fd_manual_migrations VALUES($1,$2)', [name, hash]);
      await db.query('COMMIT');
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    console.log('Applied', name);
  }
} finally {
  await db.query('SELECT pg_advisory_unlock(827462)');
  db.release();
  await pool.end();
}
