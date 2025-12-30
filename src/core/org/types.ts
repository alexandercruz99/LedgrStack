/**
 * Core types for OrgCore
 */

import { Role } from "./roles"

/**
 * Actor represents an authenticated user in the context of an organization
 */
export interface Actor {
  userId: string
  orgId: string
  role: Role
}

/**
 * OrgContext represents organization context without user info
 */
export interface OrgContext {
  orgId: string
  role: Role
}

