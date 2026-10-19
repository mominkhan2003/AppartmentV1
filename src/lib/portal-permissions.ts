export const portalPermissions = [
  { id: "household.manage", name: "Manage groups, rooms and washroom access" },
  { id: "issues.manage", name: "Assign and resolve issues" },
  { id: "audit.read", name: "Read audit history" },
] as const;

export function canManage(isAdmin: boolean, permissions: readonly string[], permission: string) {
  return isAdmin || permissions.includes(permission);
}