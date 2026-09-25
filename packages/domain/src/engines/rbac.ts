export const RBAC_VERSION = '1.0.0';

// Admin RBAC (Section 0.4 admin row: "RBAC + audit on every action"). Roles are coarse on
// purpose — a permission matrix nobody can hold in their head gets bypassed in a hurry.

export type AdminRole = 'viewer' | 'catalog_editor' | 'sme' | 'compliance' | 'superadmin';

export type Permission =
  | 'catalog.read' | 'catalog.write'
  | 'knowledge.read' | 'knowledge.write' | 'knowledge.approve'
  | 'ingredient_rules.read' | 'ingredient_rules.write' | 'ingredient_rules.approve'
  | 'prompts.read' | 'prompts.write'
  | 'orders.read' | 'orders.refund'
  | 'users.read'
  | 'admin.manage_roles';

const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  viewer: ['catalog.read', 'knowledge.read', 'ingredient_rules.read', 'prompts.read', 'orders.read', 'users.read'],
  catalog_editor: ['catalog.read', 'catalog.write', 'knowledge.read', 'ingredient_rules.read', 'orders.read'],
  // The SME approves clinical/ingredient content but deliberately CANNOT edit the catalog or
  // refund orders — separation of duties between who writes and who signs off.
  sme: ['knowledge.read', 'knowledge.write', 'knowledge.approve',
        'ingredient_rules.read', 'ingredient_rules.write', 'ingredient_rules.approve', 'catalog.read'],
  compliance: ['knowledge.read', 'prompts.read', 'prompts.write', 'catalog.read', 'orders.read', 'users.read'],
  superadmin: ['catalog.read', 'catalog.write', 'knowledge.read', 'knowledge.write',
               'ingredient_rules.read', 'ingredient_rules.write', 'prompts.read', 'prompts.write',
               'orders.read', 'orders.refund', 'users.read', 'admin.manage_roles'],
};

// Note what superadmin does NOT have: knowledge.approve and ingredient_rules.approve.
// Approval is an SME judgement, not an administrative power — letting the person who can
// grant themselves any role also approve safety content would defeat the separation above.
export function permissionsFor(roles: AdminRole[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const role of roles) for (const p of ROLE_PERMISSIONS[role] ?? []) set.add(p);
  return set;
}

export function can(roles: AdminRole[], permission: Permission): boolean {
  return permissionsFor(roles).has(permission);
}

export function isSme(roles: AdminRole[]): boolean {
  return roles.includes('sme');
}
