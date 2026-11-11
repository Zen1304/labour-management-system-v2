// Postgres connection — deliberately Neon-agnostic (see plan doc §Tech
// stack: "no Neon-specific code or assumptions" so Zen can point this at a
// different Postgres instance later with zero code changes). SSL is
// enabled for any non-local connection string, same heuristic the old
// app's db.js used.
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/lms_rebuild';

function wantsSsl(connectionString: string) {
  if (process.env.PGSSLMODE === 'disable') return false;
  if (/localhost|127\.0\.0\.1/.test(connectionString)) return false;
  return true;
}

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: wantsSsl(DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });
