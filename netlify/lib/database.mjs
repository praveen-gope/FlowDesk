import pg from 'pg';
import { getConnectionString } from '@netlify/database';

let pool;
export function database() {
  if (!pool) {
    const connectionString = process.env.NETLIFY_DB_URL || getConnectionString();
    if (!connectionString) throw new Error('Database is not configured.');
    pool = new pg.Pool({ connectionString, max: 3, connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000 });
  }
  return pool;
}
export async function transaction(operation) {
  const client = await database().connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
