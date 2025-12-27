import { prisma } from "@/lib/prisma"
import { createAuditLog } from "@/lib/audit-log"
import { AccountType, PostingDirection } from "@prisma/client"
import { randomUUID } from "crypto"

/**
 * Server-only ledger service for double-entry bookkeeping
 * All operations are scoped by organizationId and validated
 */

interface CreateExpenseTransactionInput {
  organizationId: string
  occurredAt: Date
  description: string
  amountCents: number
  category?: string | null
  vendor?: string | null
  idempotencyKey: string
  createdByUserId: string
  currency?: string
}

interface ReverseTransactionInput {
  organizationId: string
  transactionId: string
  reason: string
  createdByUserId: string
}

/**
 * Ensures default system accounts exist for an organization
 */
export async function ensureDefaultAccounts(organizationId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Check if Cash account exists
    const cashAccount = await tx.ledgerAccount.findUnique({
      where: {
        organizationId_name: {
          organizationId,
          name: "Cash",
        },
      },
    })

    if (!cashAccount) {
      await tx.ledgerAccount.create({
        data: {
          organizationId,
          name: "Cash",
          type: AccountType.ASSET,
          currency: "USD",
          isSystem: true,
          code: "CASH",
        },
      })

      await createAuditLog({
        organizationId,
        userId: "system", // System-initiated
        action: "ACCOUNT_CREATED",
        entityType: "LedgerAccount",
        metadata: { name: "Cash", type: "ASSET", isSystem: true },
      })
    }

    // Check if Uncategorized Expense account exists
    const uncategorizedExpense = await tx.ledgerAccount.findUnique({
      where: {
        organizationId_name: {
          organizationId,
          name: "Uncategorized Expense",
        },
      },
    })

    if (!uncategorizedExpense) {
      await tx.ledgerAccount.create({
        data: {
          organizationId,
          name: "Uncategorized Expense",
          type: AccountType.EXPENSE,
          currency: "USD",
          isSystem: true,
          code: "UNCAT_EXP",
        },
      })

      await createAuditLog({
        organizationId,
        userId: "system",
        action: "ACCOUNT_CREATED",
        entityType: "LedgerAccount",
        metadata: { name: "Uncategorized Expense", type: "EXPENSE", isSystem: true },
      })
    }
  })
}

/**
 * Gets or creates an expense account for a category
 */
async function getOrCreateExpenseAccount(
  tx: any,
  organizationId: string,
  category: string | null | undefined
): Promise<string> {
  if (!category) {
    const uncategorized = await tx.ledgerAccount.findUnique({
      where: {
        organizationId_name: {
          organizationId,
          name: "Uncategorized Expense",
        },
      },
    })
    if (!uncategorized) {
      throw new Error("Uncategorized Expense account not found. Run ensureDefaultAccounts first.")
    }
    return uncategorized.id
  }

  // Try to find existing category account
  const existing = await tx.ledgerAccount.findUnique({
    where: {
      organizationId_name: {
        organizationId,
        name: `Expense: ${category}`,
      },
    },
  })

  if (existing) {
    return existing.id
  }

  // Create new category account
  const newAccount = await tx.ledgerAccount.create({
    data: {
      organizationId,
      name: `Expense: ${category}`,
      type: AccountType.EXPENSE,
      currency: "USD",
      isSystem: false,
      code: `EXP_${category.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`,
    },
  })

  return newAccount.id
}

/**
 * Gets the Cash account for an organization
 */
async function getCashAccount(tx: any, organizationId: string): Promise<string> {
  const cashAccount = await tx.ledgerAccount.findUnique({
    where: {
      organizationId_name: {
        organizationId,
        name: "Cash",
      },
    },
  })

  if (!cashAccount) {
    throw new Error("Cash account not found. Run ensureDefaultAccounts first.")
  }

  return cashAccount.id
}

/**
 * Creates a ledger transaction for an expense
 * DR: Expense account (category-based)
 * CR: Cash account
 * Can be called within an existing transaction (tx parameter) or standalone
 */
export async function createExpenseTransaction(
  input: CreateExpenseTransactionInput,
  tx?: any
): Promise<string> {
  const { organizationId, occurredAt, description, amountCents, category, vendor, idempotencyKey, createdByUserId, currency = "USD" } = input

  const execute = async (prismaTx: any) => {
    // Validate idempotency
    const existing = await prismaTx.ledgerTransaction.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId,
          idempotencyKey,
        },
      },
    })

    if (existing) {
      return existing.id
    }

    // Ensure accounts exist (this will check and create if needed)
    await ensureDefaultAccounts(organizationId)

    // Get expense account (category-based)
    const expenseAccountId = await getOrCreateExpenseAccount(prismaTx, organizationId, category)

    // Get cash account
    const cashAccountId = await getCashAccount(prismaTx, organizationId)

    // Create transaction
    const transaction = await prismaTx.ledgerTransaction.create({
      data: {
        organizationId,
        occurredAt,
        description,
        vendor: vendor || null,
        idempotencyKey,
        createdByUserId,
      },
    })

    // Create postings: DR expense, CR cash
    await prismaTx.ledgerPosting.createMany({
      data: [
        {
          organizationId,
          transactionId: transaction.id,
          accountId: expenseAccountId,
          direction: PostingDirection.DR,
          amountCents,
          currency,
          category: category || null,
          memo: description,
        },
        {
          organizationId,
          transactionId: transaction.id,
          accountId: cashAccountId,
          direction: PostingDirection.CR,
          amountCents,
          currency,
          memo: description,
        },
      ],
    })

    // Verify DR == CR
    const postings = await prismaTx.ledgerPosting.findMany({
      where: { transactionId: transaction.id },
    })

    const drTotal = postings
      .filter((p: any) => p.direction === PostingDirection.DR)
      .reduce((sum: number, p: any) => sum + p.amountCents, 0)
    const crTotal = postings
      .filter((p: any) => p.direction === PostingDirection.CR)
      .reduce((sum: number, p: any) => sum + p.amountCents, 0)

    if (drTotal !== crTotal) {
      throw new Error(`Transaction imbalance: DR=${drTotal}, CR=${crTotal}`)
    }

    await createAuditLog({
      organizationId,
      userId: createdByUserId,
      action: "LEDGER_TX_CREATED",
      entityType: "LedgerTransaction",
      entityId: transaction.id,
      metadata: { description, amountCents, category, vendor },
    })

    return transaction.id
  }

  if (tx) {
    return execute(tx)
  } else {
    return await prisma.$transaction(execute)
  }
}

/**
 * Reverses a ledger transaction by creating opposite postings
 * Can be called within an existing transaction (tx parameter) or standalone
 */
export async function reverseTransaction(input: ReverseTransactionInput, tx?: any): Promise<string> {
  const { organizationId, transactionId, reason, createdByUserId } = input

  const execute = async (prismaTx: any) => {
    // Load original transaction
    const originalTx = await prismaTx.ledgerTransaction.findUnique({
      where: { id: transactionId },
      include: { postings: true },
    })

    if (!originalTx) {
      throw new Error("Transaction not found")
    }

    if (originalTx.organizationId !== organizationId) {
      throw new Error("Organization mismatch")
    }

    if (originalTx.reversedByTransactionId) {
      throw new Error("Transaction already reversed")
    }

    // Check if already reversed
    const existingReversal = await prismaTx.ledgerTransaction.findFirst({
      where: {
        originalTransactionId: transactionId,
        organizationId,
      },
    })

    if (existingReversal) {
      return existingReversal.id
    }

    // Create reversal transaction
    const reversalTx = await prismaTx.ledgerTransaction.create({
      data: {
        organizationId,
        occurredAt: new Date(),
        description: `Reversal: ${originalTx.description}`,
        vendor: originalTx.vendor,
        idempotencyKey: `reversal:${transactionId}:${randomUUID()}`,
        createdByUserId,
        originalTransactionId: transactionId,
      },
    })

    // Create opposite postings
    const reversalPostings = originalTx.postings.map((posting: any) => ({
      organizationId,
      transactionId: reversalTx.id,
      accountId: posting.accountId,
      direction: posting.direction === PostingDirection.DR ? PostingDirection.CR : PostingDirection.DR,
      amountCents: posting.amountCents,
      currency: posting.currency,
      memo: `Reversal: ${posting.memo || ""} - ${reason}`,
      category: posting.category,
    }))

    await prismaTx.ledgerPosting.createMany({
      data: reversalPostings,
    })

    // Update original transaction to point to reversal
    await prismaTx.ledgerTransaction.update({
      where: { id: transactionId },
      data: { reversedByTransactionId: reversalTx.id },
    })

    await createAuditLog({
      organizationId,
      userId: createdByUserId,
      action: "LEDGER_TX_REVERSED",
      entityType: "LedgerTransaction",
      entityId: reversalTx.id,
      metadata: { originalTransactionId: transactionId, reason },
    })

    return reversalTx.id
  }

  if (tx) {
    return execute(tx)
  } else {
    return await prisma.$transaction(execute)
  }
}

/**
 * Guards against modifying transactions in locked periods
 */
export async function guardPeriodNotLocked(organizationId: string, occurredAt: Date): Promise<void> {
  const period = occurredAt.toISOString().slice(0, 7) // YYYY-MM

  const lock = await prisma.ledgerPeriodLock.findUnique({
    where: {
      organizationId_period: {
        organizationId,
        period,
      },
    },
  })

  if (lock) {
    throw new Error(`Period ${period} is locked and cannot be modified`)
  }
}

/**
 * Locks a period to prevent modifications
 */
export async function lockPeriod(
  organizationId: string,
  period: string,
  lockedByUserId: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.ledgerPeriodLock.findUnique({
      where: {
        organizationId_period: {
          organizationId,
          period,
        },
      },
    })

    if (existing) {
      return // Already locked
    }

    await tx.ledgerPeriodLock.create({
      data: {
        organizationId,
        period,
        lockedByUserId,
      },
    })

    await createAuditLog({
      organizationId,
      userId: lockedByUserId,
      action: "PERIOD_LOCKED",
      entityType: "LedgerPeriodLock",
      metadata: { period },
    })
  })
}

