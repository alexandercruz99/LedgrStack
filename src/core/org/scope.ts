/**
 * Query scoping helpers to ensure all multi-tenant queries include orgId
 */

import { Prisma } from "@prisma/client"
import { prisma } from "./prisma"

/**
 * Create a scoped where clause with orgId
 */
export function scopedWhereOrg(orgId: string): { organizationId: string } {
  return { organizationId: orgId }
}

/**
 * Guard that orgId is present in where clause
 * Throws if orgId is missing or doesn't match expected orgId
 */
export function guardOrgIdInWhere<T extends { organizationId?: string }>(
  where: T,
  expectedOrgId: string
): T {
  if (!where.organizationId) {
    throw new Error("organizationId must be present in where clause")
  }

  if (where.organizationId !== expectedOrgId) {
    throw new Error("organizationId mismatch in where clause")
  }

  return where
}

/**
 * Scoped findMany for Expense model
 */
export async function orgFindManyExpense(
  orgId: string,
  args?: Partial<Omit<Prisma.ExpenseFindManyArgs, "where">> & { where?: Omit<Prisma.ExpenseWhereInput, "organizationId"> }
) {
  return prisma.expense.findMany({
    ...args,
    where: {
      ...args?.where,
      organizationId: orgId,
    },
  })
}

/**
 * Scoped findUnique for Expense model
 */
export async function orgFindUniqueExpense(
  orgId: string,
  args: { where: { id: string }; include?: Prisma.ExpenseInclude }
) {
  const result = await prisma.expense.findUnique({
    ...args,
    where: {
      ...args.where,
      organizationId: orgId,
    },
  })

  return result
}

/**
 * Scoped findMany for AuditLog model
 */
export async function orgFindManyAuditLog(
  orgId: string,
  args?: Partial<Omit<Prisma.AuditLogFindManyArgs, "where">> & { where?: Omit<Prisma.AuditLogWhereInput, "organizationId"> }
) {
  return prisma.auditLog.findMany({
    ...args,
    where: {
      ...args?.where,
      organizationId: orgId,
    },
  })
}

/**
 * Scoped findMany for LedgerTransaction model
 */
export async function orgFindManyLedgerTransaction(
  orgId: string,
  args?: Partial<Omit<Prisma.LedgerTransactionFindManyArgs, "where">> & { where?: Omit<Prisma.LedgerTransactionWhereInput, "organizationId"> }
) {
  return prisma.ledgerTransaction.findMany({
    ...args,
    where: {
      ...args?.where,
      organizationId: orgId,
    },
  })
}

/**
 * Scoped findUnique for LedgerTransaction model
 */
export async function orgFindUniqueLedgerTransaction(
  orgId: string,
  args: { where: { id: string }; include?: Prisma.LedgerTransactionInclude }
) {
  const result = await prisma.ledgerTransaction.findUnique({
    ...args,
    where: {
      ...args.where,
      organizationId: orgId,
    },
  })

  return result
}

/**
 * Scoped findMany for Receipt model (via expense relation)
 */
export async function orgFindManyReceipt(
  orgId: string,
  args?: Partial<Omit<Prisma.ReceiptFindManyArgs, "where">> & { where?: Omit<Prisma.ReceiptWhereInput, "expense"> }
) {
  return prisma.receipt.findMany({
    ...args,
    where: {
      ...args?.where,
      expense: {
        organizationId: orgId,
      },
    },
  })
}

