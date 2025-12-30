/**
 * Active organization management
 * Stores and retrieves the user's currently active organization
 */

import { prisma } from "./prisma"
import { assertMember } from "./membership"

/**
 * Get active organization ID for a user
 * If no active org is set, picks the first org and persists it
 */
export async function getActiveOrgId(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeOrgId: true },
  })

  if (user?.activeOrgId) {
    // Verify membership still exists
    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId: user.activeOrgId,
        },
      },
    })

    if (membership) {
      return user.activeOrgId
    }
  }

  // No active org or membership invalid, get first org
  const firstMembership = await prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  })

  if (!firstMembership) {
    const error = new Error("User is not a member of any organization")
    ;(error as any).statusCode = 403
    throw error
  }

  // Persist as active org
  await prisma.user.update({
    where: { id: userId },
    data: { activeOrgId: firstMembership.organizationId },
  })

  return firstMembership.organizationId
}

/**
 * Set active organization ID for a user
 * Verifies membership before setting
 */
export async function setActiveOrgId(userId: string, orgId: string): Promise<void> {
  // Verify membership
  await assertMember(userId, orgId)

  // Update user's active org
  await prisma.user.update({
    where: { id: userId },
    data: { activeOrgId: orgId },
  })
}

