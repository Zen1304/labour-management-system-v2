// Single source of truth for who can do what — ported from the old app's
// src/permissions.js, which proved itself well (one capability-matrix
// object drives both route gates and conditional UI, so they can never
// drift apart). The only real change here: Role and Capability are now
// TypeScript literal unions, so `can(user, 'payrol.generate')` (a typo) is
// a compile error instead of a runtime "Unknown capability" throw.
//
// Fresh-start: no legacy roles (supervisor/operation_head/ceo) carried
// forward — there's no historical data that needs them to keep rendering.

export const ROLES = [
  'super_admin',
  'admin',
  'hr',
  'labor_manager',
  'audit_manager',
  'project_manager',
  'site_engineer',
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  hr: 'HR',
  labor_manager: 'Labour Manager',
  audit_manager: 'Audit Manager',
  project_manager: 'Project Manager',
  site_engineer: 'Site Engineer',
};

// Company-wide oversight (dashboards, payroll pages, site-performance
// pages — read access). project_manager/site_engineer are deliberately
// excluded: they get site-scoped views via user_site_assignments instead.
export const OVERSIGHT: Role[] = ['super_admin', 'admin', 'hr', 'labor_manager', 'audit_manager'];

export const MULTI_SITE_ROLES: Role[] = ['project_manager', 'site_engineer'];

export const CAPABILITIES = {
  // Workers
  'workers.manage': ['super_admin', 'admin', 'hr', 'labor_manager'],
  'workers.verify': ['super_admin', 'admin', 'hr'],
  'workers.skill_assess': ['super_admin', 'admin', 'hr', 'labor_manager'],
  'skillcategories.manage': ['super_admin', 'admin'],

  // Attendance
  'attendance.mark': ['super_admin', 'admin', 'hr', 'labor_manager'],
  'attendance.delete': ['super_admin', 'admin', 'hr', 'labor_manager'],

  // Payroll & site performance (incl. the new pay-agreement system —
  // reuses the same capability names since pay agreements are part of
  // "payroll" from a permissions standpoint, not a separate surface)
  'payroll.view': OVERSIGHT,
  'payroll.generate': ['super_admin', 'admin', 'labor_manager'],
  'payroll.approve': ['super_admin', 'admin', 'audit_manager'],
  'payagreements.manage': ['super_admin', 'admin', 'labor_manager'],
  'siteperf.view': OVERSIGHT,
  'siteperf.manage': ['super_admin', 'admin', 'labor_manager'],

  // Analytics
  'analytics.view': OVERSIGHT,

  // Administration (sites, vendors, worker types, users, site
  // assignments, audit log)
  'admin.full': ['super_admin', 'admin'],
} as const satisfies Record<string, Role[]>;

export type Capability = keyof typeof CAPABILITIES;

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
}

export function can(user: AuthUser | null | undefined, capability: Capability): boolean {
  if (!user) return false;
  const allowed = CAPABILITIES[capability] as readonly Role[];
  return allowed.includes(user.role);
}
