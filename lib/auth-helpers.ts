import { getServerSession } from "next-auth"
import { authOptions } from "./auth"
import { prisma } from "./prisma"
import { Role } from "@prisma/client"

export async function getCurrentUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return null
  }
  return prisma.user.findUnique({
    where: { id: session.user.id },
  })
}

export async function getUserMembership(organizationId: string, userId: string) {
  return prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId,
      },
    },
    include: {
      organization: true,
    },
  })
}

export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error("Unauthorized")
  }
  return user
}

export async function requireMembership(organizationId: string, minimumRole: Role = "VIEWER") {
  const user = await requireAuth()
  const membership = await getUserMembership(organizationId, user.id)
  
  if (!membership) {
    const error = new Error("Not a member of this organization")
    ;(error as any).statusCode = 403
    throw error
  }

  const roleHierarchy: Record<Role, number> = {
    VIEWER: 0,
    MEMBER: 1,
    ADMIN: 2,
    OWNER: 3,
  }

  if (roleHierarchy[membership.role] < roleHierarchy[minimumRole]) {
    const error = new Error("Insufficient permissions")
    ;(error as any).statusCode = 403
    throw error
  }

  return { user, membership }
}

export async function canManageExpenses(organizationId: string, userId: string): Promise<boolean> {
  const membership = await getUserMembership(organizationId, userId)
  if (!membership) return false
  
  return membership.role === "OWNER" || membership.role === "ADMIN" || membership.role === "MEMBER"
}

export async function canViewExpenses(organizationId: string, userId: string): Promise<boolean> {
  const membership = await getUserMembership(organizationId, userId)
  return !!membership
}

