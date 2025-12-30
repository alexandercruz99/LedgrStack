/**
 * Role definitions and role hierarchy helpers
 */

export type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER"

/**
 * Role rank map (higher number = higher privilege)
 */
const ROLE_RANK: Record<Role, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
}

/**
 * Check if role a >= role b (a has at least the privileges of b)
 */
export function roleGte(a: Role, b: Role): boolean {
  return ROLE_RANK[a] >= ROLE_RANK[b]
}

/**
 * Check if role is admin-like (ADMIN or OWNER)
 */
export function isAdminLike(role: Role): boolean {
  return role === "ADMIN" || role === "OWNER"
}

/**
 * Get role rank for comparison
 */
export function getRoleRank(role: Role): number {
  return ROLE_RANK[role]
}

