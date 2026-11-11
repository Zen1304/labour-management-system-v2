// Drizzle schema — Phase 1 subset (auth/RBAC foundation).
//
// Fresh-start schema: no legacy roles, no vestigial columns carried over
// from the old app (see /root/.claude/plans/hashed-beaming-sedgewick.md).
// Core business entities (sites, vendors, workers, pay agreements, payroll)
// are added in later phases — this file grows incrementally, one phase at
// a time, same as the old app's db.js did.
import { pgTable, serial, text, integer, boolean, timestamp, pgEnum, doublePrecision, unique, date } from 'drizzle-orm/pg-core';

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

// ---------- Phase 2: core entities ----------
// Site ids stay in the old app's 100-999 numbering band (100 = the
// built-in "Unassigned Pool", seeded once in db/seed.ts) via a dedicated
// Postgres sequence (sites_id_seq, created in db/migrate-extra.ts since
// Drizzle's schema builder has no clean way to express a custom
// DEFAULT nextval() on a plain integer column) — app code pulls the next
// id from that sequence explicitly when inserting a site. Purely cosmetic/
// historical continuity, not load-bearing anywhere else in the new app.
export const siteStatusEnum = pgEnum('site_status', ['active', 'on_hold', 'completed']);

export const sites = pgTable('sites', {
  id: integer('id').primaryKey(), // assigned from sites_id_seq by app code (Drizzle has no raw DEFAULT nextval() escape)
  name: text('name').notNull(),
  location: text('location'),
  status: siteStatusEnum('status').notNull().default('active'),
  address: text('address'),
  district: text('district'),
  state: text('state'),
  mapsLink: text('maps_link'),
  projectNumber: integer('project_number'), // unique among non-null (partial index in migration SQL)
  clientName: text('client_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vendors = pgTable('vendors', {
  id: serial('id').primaryKey(),
  vendorCode: text('vendor_code').notNull().unique(), // 'V0001'... ; the built-in Direct vendor gets a fixed 'B0001'-style code
  name: text('name').notNull(),
  contact: text('contact'),
  whatsapp: text('whatsapp'),
  email: text('email'),
  address: text('address'),
  isDirect: boolean('is_direct').notNull().default(false), // the one protected "Bilara Direct" vendor — never deletable, never deactivatable
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workerTypes = pgTable('worker_types', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  active: boolean('active').notNull().default(true),
});

export const skillCategories = pgTable(
  'skill_categories',
  {
    id: serial('id').primaryKey(),
    workerTypeId: integer('worker_type_id').notNull().references(() => workerTypes.id),
    name: text('name').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.workerTypeId, t.name)]
);

export const workers = pgTable('workers', {
  id: serial('id').primaryKey(),
  workerCode: text('worker_code').unique(), // 'W00001'..., nullable until assigned
  name: text('name').notNull(),
  workerTypeId: integer('worker_type_id').references(() => workerTypes.id),
  vendorId: integer('vendor_id').notNull().references(() => vendors.id),
  aadharNumber: text('aadhar_number').notNull().unique(),
  siteId: integer('site_id').notNull().references(() => sites.id).default(100),
  wageRate: doublePrecision('wage_rate').notNull().default(0), // Daily Wage default hourly rate
  overtimeMultiplier: doublePrecision('overtime_multiplier').notNull().default(1.5),
  contact: text('contact'),
  status: text('status', { enum: ['active', 'inactive'] }).notNull().default('active'),
  verificationStatus: text('verification_status', { enum: ['pending', 'verified'] }).notNull().default('pending'),
  joinedDate: date('joined_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // Note: no skill_grade column — that per-worker field was retired in
  // favor of the per-skill-category rating below (worker_skill_ratings).
});

export const workerSkillRatings = pgTable(
  'worker_skill_ratings',
  {
    id: serial('id').primaryKey(),
    workerId: integer('worker_id').notNull().references(() => workers.id),
    skillCategoryId: integer('skill_category_id').notNull().references(() => skillCategories.id),
    rating: text('rating', { enum: ['trainee', 'skilled', 'expert'] }).notNull(),
    ratedBy: integer('rated_by').references(() => users.id),
    ratedAt: timestamp('rated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.workerId, t.skillCategoryId)]
);

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(), // must be a well-formed email, validated in app code
  passwordHash: text('password_hash').notNull(),
  salt: text('salt').notNull(),
  name: text('name').notNull(),
  role: roleEnum('role').notNull(),
  siteId: integer('site_id').references(() => sites.id), // single-site roles (labor_manager/audit_manager); multi-site roles use user_site_assignments below
  contact: text('contact'),
  active: boolean('active').notNull().default(true),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Project Managers / Site Engineers can be assigned to many sites at once —
// a plain many-to-many join, separate from the single siteId above.
export const userSiteAssignments = pgTable(
  'user_site_assignments',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id),
    siteId: integer('site_id').notNull().references(() => sites.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.siteId)]
);

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
export type Site = typeof sites.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type WorkerType = typeof workerTypes.$inferSelect;
export type SkillCategory = typeof skillCategories.$inferSelect;
export type Worker = typeof workers.$inferSelect;
export type NewWorker = typeof workers.$inferInsert;
