/**
 * Membership helpers for organization access control
 */

import { prisma } from "./prisma"
import { Role, roleGte } from "./roles"

export interface UserOrg {
  id: string
  name: string
  role: Role
}

/**
 * Get all organizations a user belongs to
 */
export async function getUserOrgs(userId: string): Promise<UserOrg[]> {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: {
      organization: true,
    },
  })

  return memberships.map((m) => ({
    id: m.organizationId,
    name: m.organization.name,
    role: m.role as Role,
  }))
}

/**
 * Assert user is a member of organization, throws 403 if not
 * Returns the user's role in the organization
 */
export async function assertMember(userId: string, orgId: string): Promise<Role> {
  const membership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId: orgId,
      },
    },
  })

  if (!membership) {
    const error = new Error("Not a member of this organization")
    ;(error as any).statusCode = 403
    throw error
  }

  return membership.role as Role
}

/**
 * Require user has minimum role in organization
 * Throws 403 if not a member or role insufficient
 */
export async function requireRole(
  userId: string,
  orgId: string,
  minRole: Role
): Promise<Role> {
  const role = await assertMember(userId, orgId)

  if (!roleGte(role, minRole)) {
    const error = new Error("Insufficient permissions")
    ;(error as any).statusCode = 403
    throw error
  }

  return role
}

