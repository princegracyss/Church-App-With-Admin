// Role model for Parish Connect's admin module.
//
// Hierarchy (top has the most power):
//   super_admin      → can create/manage Admins, Priests, Secretaries and Members;
//                       can reassign anyone's role.
//   admin             → can create/manage Priests, Secretaries, Unit Admins and Members.
//   parish_priest     → can add Members; can approve/reject certificate requests.
//   church_secretary  → can add Members.
//   unit_admin        → can edit members within their own BCC unit only; no full admin access.
//   member            → no admin capabilities (parishioner / family login).
export const Role = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  PARISH_PRIEST: 'parish_priest',
  CHURCH_SECRETARY: 'church_secretary',
  UNIT_ADMIN: 'unit_admin',
  MEMBER: 'member',
};

export const ROLE_LABELS = {
  [Role.SUPER_ADMIN]: 'Super Admin',
  [Role.ADMIN]: 'Admin',
  [Role.PARISH_PRIEST]: 'Parish Priest',
  [Role.CHURCH_SECRETARY]: 'Church Secretary',
  [Role.UNIT_ADMIN]: 'Unit Admin',
  [Role.MEMBER]: 'Member',
};

// "Staff" = every elevated role that has full parish-wide admin access.
// unit_admin is intentionally excluded — it has BCC-scoped access only.
export const STAFF_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.PARISH_PRIEST, Role.CHURCH_SECRETARY];

// Back-compat alias — some older code/screens may still import this name.
export const ADMIN_ROLES = STAFF_ROLES;

// Who can create an account with which role. This drives both the "Manage
// Users" screen's role picker and (mirrored) the database-side checks in
// supabase/schema.sql + the create-parish-user Edge Function, so a user can
// never grant themselves more than the UI allows even if the client is
// bypassed.
export const CREATABLE_ROLES = {
  [Role.SUPER_ADMIN]: [Role.ADMIN, Role.PARISH_PRIEST, Role.CHURCH_SECRETARY, Role.UNIT_ADMIN, Role.MEMBER],
  [Role.ADMIN]: [Role.PARISH_PRIEST, Role.CHURCH_SECRETARY, Role.UNIT_ADMIN, Role.MEMBER],
  [Role.PARISH_PRIEST]: [Role.MEMBER],
  [Role.CHURCH_SECRETARY]: [Role.MEMBER],
  [Role.UNIT_ADMIN]: [],
  [Role.MEMBER]: [],
};

export function creatableRolesFor(role) {
  return CREATABLE_ROLES[role] || [];
}

export function canManageUsers(role) {
  return creatableRolesFor(role).length > 0;
}

// Only the Parish Priest (and Super Admin, who can do anything) can approve,
// reject, or issue a certificate request. Enforced again in the DB via a
// trigger — see supabase/schema.sql.
export function canApproveCertificates(role) {
  return role === Role.PARISH_PRIEST || role === Role.SUPER_ADMIN;
}

// Only a Super Admin can change an existing user's role after the fact.
export function canReassignRoles(role) {
  return role === Role.SUPER_ADMIN;
}

// unit_admin can edit members that are in their own BCC unit.
// Checked in MemberProfileScreen/EditMemberScreen against viewer's own BCC.
export function canEditUnitMembers(role) {
  return role === Role.UNIT_ADMIN;
}
