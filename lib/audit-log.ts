import { prisma } from "./prisma"

interface AuditLogParams {
  organizationId: string
  userId: string
  action: string
  entityType: string
  entityId?: string
  metadata?: Record<string, any>
}

export async function createAuditLog(params: AuditLogParams) {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId,
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

