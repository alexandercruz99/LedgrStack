/**
 * Audit logging helpers using Actor from OrgCore
 */

import { prisma } from "./prisma"
import { Actor } from "./types"

interface AuditLogParams {
  actor: Actor
  action: string
  entityType: string
  entityId?: string
  metadata?: Record<string, any>
}

/**
 * Write audit log entry using Actor
 * Ensures orgId and userId are always set correctly
 */
export async function writeAudit(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: params.actor.orgId,
        userId: params.actor.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        metadata: params.metadata || {},
      },
    })
  } catch (error) {
    // Don't throw - audit logging should not break the application
    console.error("Failed to create audit log:", error)
  }
}

