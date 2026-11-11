// Sites are never hard-deleted (see the old app's comment history on this —
// a "safe-looking" site could still crash a DELETE via an FK it forgot to
// check). Retirement is Status=Completed only. This just allocates the next
// id from sites_id_seq (100-999 band) since Drizzle's schema builder can't
// express a custom DEFAULT nextval() on a plain integer column.
import { pool } from '@/lib/db/client';

export async function nextSiteId(): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(`SELECT nextval('sites_id_seq')::int AS id`);
  return rows[0].id;
}

export interface SiteDependencyCounts {
  workers: number;
  attendance: number;
  users: number;
}

export async function siteDependencyCounts(siteId: number): Promise<SiteDependencyCounts> {
  const workers = await pool.query<{ c: string }>('SELECT COUNT(*) c FROM workers WHERE site_id = $1', [siteId]);
  let attendance = 0;
  try {
    const r = await pool.query<{ c: string }>('SELECT COUNT(*) c FROM attendance WHERE site_id = $1', [siteId]);
    attendance = Number(r.rows[0]?.c ?? 0);
  } catch {
    attendance = 0;
  }
  const users = await pool.query<{ c: string }>('SELECT COUNT(*) c FROM users WHERE site_id = $1', [siteId]);
  return {
    workers: Number(workers.rows[0]?.c ?? 0),
    attendance,
    users: Number(users.rows[0]?.c ?? 0),
  };
}
