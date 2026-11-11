// Raw-SQL steps that fall outside what Drizzle's schema builder can express
// directly, run once after `drizzle-kit push`. Idempotent — safe to re-run.
import 'dotenv/config';
import { pool } from './client';

async function main() {
  await pool.query(`CREATE SEQUENCE IF NOT EXISTS sites_id_seq START 101`);
  // Partial unique index: project_number is nullable (the built-in
  // Unassigned Pool site and any site without one go without), but must be
  // unique among the sites that do have one.
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_project_number ON sites(project_number) WHERE project_number IS NOT NULL`
  );
  console.log('migrate-extra: sites_id_seq + project_number partial index ensured.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
