// Drizzle schema — Phase 1 subset (auth/RBAC foundation).
//
// Fresh-start schema: no legacy roles, no vestigial columns carried over
// from the old app (see /root/.claude/plans/hashed-beaming-sedgewick.md).
// Core business entities (sites, vendors, workers, pay agreements, payroll)
// are added in later phases — this file grows incrementally, one phase at
// a time, same as the old app's db.js did.
import { pgTable, serial, text, integer, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core';

// Exactly the 7 roles the old app settled on after its own v10 role
// reduction — no legacy slots this time, since there's no historical data
// to keep readable.
export const roleEnum = pgEnum('role', [
  'super_admin',
  'admin',
  'hr',
  'labor_manager',
  'audit_manager',
  'project_manager',
  'site_engineer',
]);

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(), // must be a well-formed email, validated in app code
  passwordHash: text('password_hash').notNull(),
  salt: text('salt').notNull(),
  name: text('name').notNull(),
  role: roleEnum('role').notNull(),
  contact: text('contact'),
  active: boolean('active').notNull().default(true),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  token: text('token').primaryKey(), // crypto.randomBytes(32).toString('hex')
  userId: integer('user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const loginAttempts = pgTable('login_attempts', {
  username: text('username').primaryKey(),
  failedCount: integer('failed_count').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
});

export const auditLog = pgTable('audit_log', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(), // 'create' | 'update' | 'delete' | 'login' | 'csrf_reject' | ...
  entityType: text('entity_type'),
  entityId: integer('entity_id'),
  detail: text('detail'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
