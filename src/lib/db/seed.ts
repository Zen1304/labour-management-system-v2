// Phase 1 seed: one account per role, so the full login/RBAC flow can be
// tested end to end before any business entities exist. Unlike the old
// app, these are NOT printed on the login page (that was a real security
// issue in the old app, flagged and worth not repeating) — they're only
// logged to this script's own console output, for local dev use.
import 'dotenv/config';
import { db, pool } from './client';
import { users, sites, vendors } from './schema';
import { hashPassword } from '../auth/password';
import { ROLES } from '../auth/permissions';

async function main() {
  console.log('Seeding the built-in Unassigned Pool site (id 100)...');
  await db
    .insert(sites)
    .values({ id: 100, name: 'Unassigned Pool', status: 'active' })
    .onConflictDoNothing({ target: sites.id });

  console.log('Seeding the built-in Bilara Direct vendor...');
  await db
    .insert(vendors)
    .values({ vendorCode: 'B0001', name: 'Bilara Direct', isDirect: true, active: true })
    .onConflictDoNothing({ target: vendors.vendorCode });

  console.log('Seeding Phase 1 users (one per role)...');
  for (const role of ROLES) {
    const username = `${role}@bilaragroup.test`;
    const password = `${role}-pass123`;
    const { hash, salt } = hashPassword(password);
    await db
      .insert(users)
      .values({
        username,
        passwordHash: hash,
        salt,
        name: role
          .split('_')
          .map((w) => w[0].toUpperCase() + w.slice(1))
          .join(' '),
        role,
        contact: '9800000000',
        active: true,
        mustChangePassword: false,
      })
      .onConflictDoNothing({ target: users.username });
    console.log(`  ${username} / ${password}`);
  }
  console.log('Done.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
