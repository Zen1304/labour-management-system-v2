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

// ---------- Phase 3: attendance ----------
// One row per worker, per date, per site: a worker who splits a day
// between two sites gets two rows for that date.
export const attendance = pgTable(
  'attendance',
  {
    id: serial('id').primaryKey(),
    workerId: integer('worker_id').notNull().references(() => workers.id),
    siteId: integer('site_id').notNull().references(() => sites.id),
    date: date('date').notNull(),
    hoursWorked: doublePrecision('hours_worked').notNull().default(0),
    leaveHours: doublePrecision('leave_hours').notNull().default(0),
    overtimeHours: doublePrecision('overtime_hours').notNull().default(0),
    markedBy: integer('marked_by').references(() => users.id),
    markedAt: timestamp('marked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.workerId, t.date, t.siteId)]
);

// A site can be marked "off" for a specific date (holiday / no-work day).
// Enforced at attendance-WRITE time in this rebuild (a deliberate
// improvement over the old app, which only excluded off-day attendance at
// payroll time — see the rebuild plan) as well as at payroll time later.
export const siteOffDays = pgTable(
  'site_off_days',
  {
    id: serial('id').primaryKey(),
    siteId: integer('site_id').notNull().references(() => sites.id),
    date: date('date').notNull(),
    reason: text('reason'),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.siteId, t.date)]
);

// ---------- Phase 4: pay agreements (Subcontract / Piece Work) ----------
// Daily Wage has no row here — it's the implicit default whenever no
// active agreement covers a worker+site+date (see the payroll generation
// algorithm in the rebuild plan).
export const payAgreementModeEnum = pgEnum('pay_agreement_mode', ['subcontract', 'piece_work']);
export const payoutMethodEnum = pgEnum('payout_method', ['cash', 'bank_transfer']);
export const payAgreementStatusEnum = pgEnum('pay_agreement_status', ['active', 'closed']);

export const payAgreements = pgTable('pay_agreements', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').notNull().references(() => sites.id),
  mode: payAgreementModeEnum('mode').notNull(),
  scopeDescription: text('scope_description').notNull(),
  vendorId: integer('vendor_id').references(() => vendors.id),
  lumpSumAmount: doublePrecision('lump_sum_amount'), // subcontract only
  unitLabel: text('unit_label'), // piece work only, e.g. "sq ft"
  ratePerUnit: doublePrecision('rate_per_unit'), // piece work only
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end'), // nullable = open-ended
  payoutMethod: payoutMethodEnum('payout_method').notNull().default('cash'),
  status: payAgreementStatusEnum('status').notNull().default('active'),
  terms: text('terms'), // free text for the printable work order
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // Subcontract lump sums are paid out exactly once, guaranteed regardless
  // of attendance (Zen's explicit call) — this is set by generatePayroll()
  // the first time it pays this agreement out, so a later run covering the
  // same still-active agreement never pays the lump sum a second time. NULL
  // = not yet paid. Piece Work needs no equivalent guard: its pay is driven
  // by dated entries, and each payroll period only ever covers its own
  // Thu-Wed week, so entries can't be double-counted across runs.
  lumpSumPaidAt: timestamp('lump_sum_paid_at', { withTimezone: true }),
});

export const payAgreementWorkers = pgTable(
  'pay_agreement_workers',
  {
    id: serial('id').primaryKey(),
    payAgreementId: integer('pay_agreement_id').notNull().references(() => payAgreements.id),
    workerId: integer('worker_id').notNull().references(() => workers.id),
    // NULL = split equally among all workers assigned to this agreement;
    // when any row sets a value, all of them must (validated in app code)
    // and they must sum to 100.
    sharePercent: doublePrecision('share_percent'),
  },
  (t) => [unique().on(t.payAgreementId, t.workerId)]
);

export const pieceWorkEntries = pgTable(
  'piece_work_entries',
  {
    id: serial('id').primaryKey(),
    payAgreementId: integer('pay_agreement_id').notNull().references(() => payAgreements.id),
    workerId: integer('worker_id').references(() => workers.id), // NULL = team-level entry
    date: date('date').notNull(),
    quantity: doublePrecision('quantity').notNull(),
    loggedBy: integer('logged_by').references(() => users.id),
    loggedAt: timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.payAgreementId, t.workerId, t.date)]
);

// ---------- Phase 5: payroll generation + verification across 3 modes ----------
// Extended, not replaced, from the old app's design (see rebuild plan,
// "Payroll generation algorithm (redesigned)"): payroll_runs,
// payroll_deductions and payroll_run_site_verifications are unchanged —
// verification/flag/regenerate already key off payroll_item_sites, so they
// extend to all 3 pay modes for free. payroll_items gains pay_mode +
// payout_method; payroll_item_sites gains a nullable pay_agreement_id (NULL
// = that slice was Daily Wage). site_performance (cuts/bonuses/additional
// payments) is carried forward unchanged and applies on top of any mode's
// computed slice pay.
export const payrollRunStatusEnum = pgEnum('payroll_run_status', ['pending_verification', 'verified', 'completed']);
// 'mixed' covers a worker straddling two pay modes in the same period (e.g.
// Daily Wage at one site, Piece Work at another) — payroll_items is a
// per-worker row, so when its site slices don't all share one mode this is
// what's stored at the item level; the true per-site mode always lives on
// payroll_item_sites via pay_agreement_id.
export const payModeEnum = pgEnum('pay_mode', ['daily_wage', 'subcontract', 'piece_work', 'mixed']);
export const sitePerfAdjustmentTypeEnum = pgEnum('site_perf_adjustment_type', ['cut', 'bonus', 'additional_payment']);

export const payrollRuns = pgTable('payroll_runs', {
  id: serial('id').primaryKey(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  generatedBy: integer('generated_by').references(() => users.id),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  notes: text('notes'),
  status: payrollRunStatusEnum('status').notNull().default('pending_verification'),
  verifiedBy: integer('verified_by').references(() => users.id),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  completedBy: integer('completed_by').references(() => users.id),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  flagged: boolean('flagged').notNull().default(false),
  flaggedBy: integer('flagged_by').references(() => users.id),
  flaggedAt: timestamp('flagged_at', { withTimezone: true }),
  flaggedReason: text('flagged_reason'),
});

export const payrollItems = pgTable('payroll_items', {
  id: serial('id').primaryKey(),
  payrollRunId: integer('payroll_run_id').notNull().references(() => payrollRuns.id),
  workerId: integer('worker_id').notNull().references(() => workers.id),
  vendorId: integer('vendor_id').references(() => vendors.id),
  payMode: payModeEnum('pay_mode').notNull().default('daily_wage'),
  payoutMethod: payoutMethodEnum('payout_method').notNull().default('cash'),
  daysPresent: doublePrecision('days_present').notNull().default(0),
  leaveHours: doublePrecision('leave_hours').notNull().default(0),
  hoursWorked: doublePrecision('hours_worked').notNull().default(0),
  overtimeHours: doublePrecision('overtime_hours').notNull().default(0),
  basePay: doublePrecision('base_pay').notNull().default(0),
  overtimePay: doublePrecision('overtime_pay').notNull().default(0),
});

export const payrollDeductions = pgTable('payroll_deductions', {
  id: serial('id').primaryKey(),
  payrollItemId: integer('payroll_item_id').notNull().references(() => payrollItems.id),
  reason: text('reason').notNull(),
  amount: doublePrecision('amount').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const payrollItemSites = pgTable(
  'payroll_item_sites',
  {
    id: serial('id').primaryKey(),
    payrollItemId: integer('payroll_item_id').notNull().references(() => payrollItems.id),
    siteId: integer('site_id').notNull().references(() => sites.id),
    payAgreementId: integer('pay_agreement_id').references(() => payAgreements.id), // NULL = Daily Wage
    hoursWorked: doublePrecision('hours_worked').notNull().default(0),
    overtimeHours: doublePrecision('overtime_hours').notNull().default(0),
    basePay: doublePrecision('base_pay').notNull().default(0),
    overtimePay: doublePrecision('overtime_pay').notNull().default(0),
    adjustmentsTotal: doublePrecision('adjustments_total').notNull().default(0),
    netPay: doublePrecision('net_pay').notNull().default(0),
  },
  (t) => [unique().on(t.payrollItemId, t.siteId)]
);

export const payrollRunSiteVerifications = pgTable(
  'payroll_run_site_verifications',
  {
    id: serial('id').primaryKey(),
    payrollRunId: integer('payroll_run_id').notNull().references(() => payrollRuns.id),
    siteId: integer('site_id').notNull().references(() => sites.id),
    verifiedBy: integer('verified_by').references(() => users.id),
    verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.payrollRunId, t.siteId)]
);

export const sitePerformance = pgTable('site_performance', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').notNull().references(() => sites.id),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  adjustmentType: sitePerfAdjustmentTypeEnum('adjustment_type').notNull().default('cut'),
  cutPercent: doublePrecision('cut_percent'), // cut/bonus
  flatAmount: doublePrecision('flat_amount'), // additional_payment
  reason: text('reason'),
  createdBy: integer('created_by').references(() => users.id),
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
export type Attendance = typeof attendance.$inferSelect;
export type SiteOffDay = typeof siteOffDays.$inferSelect;
export type PayAgreement = typeof payAgreements.$inferSelect;
export type PayAgreementWorker = typeof payAgreementWorkers.$inferSelect;
export type PieceWorkEntry = typeof pieceWorkEntries.$inferSelect;
export type PayrollRun = typeof payrollRuns.$inferSelect;
export type PayrollItem = typeof payrollItems.$inferSelect;
export type PayrollItemSite = typeof payrollItemSites.$inferSelect;
export type SitePerformance = typeof sitePerformance.$inferSelect;
