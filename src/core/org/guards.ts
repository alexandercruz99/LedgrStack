/**
 * Authentication and authorization guards
 */

import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getActiveOrgId } from "./activeOrg"
import { requireRole } from "./membership"
import { Actor } from "./types"
import { Role } from "./roles"

/**
 * Require authenticated session user
 * Returns userId from Auth.js session
 * Throws 401 if not authenticated
 */
export async function requireSessionUser(): Promise<string> {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    const error = new Error("Unauthorized")
    ;(error as any).statusCode = 401
    throw error
  }

  return session.user.id
}

/**
 * Require actor (authenticated user + active org + role)
 * Resolves session userId, active org, and role via OrgCore
 * Returns Actor
 */
export async function requireActor(minRole: Role = "VIEWER"): Promise<Actor> {
  const userId = await requireSessionUser()
  const orgId = await getActiveOrgId(userId)
  
  // Check minimum role requirement (this will throw if insufficient)
  const role = await requireRole(userId, orgId, minRole)

  return {
    userId,
    orgId,
    role,
  }
}

