import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { expenseSchema } from "@/lib/validations"
import { ensureDefaultAccounts, createExpenseTransaction, guardPeriodNotLocked } from "@/lib/ledger/ledgerService"
import { requireActor, orgFindManyExpense, writeAudit } from "@/src/core/org"
import { randomUUID } from "crypto"

export async function GET(request: NextRequest) {
  try {
    // Use OrgCore to get actor (user + active org + role)
    const actor = await requireActor("VIEWER")

    // Use scoped query helper
    const expenses = await orgFindManyExpense(actor.orgId, {
      where: {
        deletedAt: null, // Exclude soft-deleted expenses
      },
      include: {
        receipts: true,
      },
      orderBy: {
        date: "desc",
      },
    })

    return NextResponse.json(expenses)
  } catch (error: any) {
    const statusCode = (error as any).statusCode || 500
    return NextResponse.json({ error: error.message }, { status: statusCode })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Use OrgCore to get actor (user + active org + role)
    const actor = await requireActor("MEMBER")

    const body = await request.json()
    // Validate expense data (organizationId comes from actor, not client)
    const expenseData = expenseSchema.parse(body)
    
    // Add organizationId from actor
    const validated = {
      ...expenseData,
      organizationId: actor.orgId, // Use actor's orgId, never trust client
    }

    // Guard against locked periods
    await guardPeriodNotLocked(actor.orgId, validated.date)

    // Convert amount to cents
    const amountCents = Math.round(Number(validated.amount) * 100)

    // Generate idempotency key
    const idempotencyKey = `expense:${randomUUID()}`

    // Create expense and ledger transaction in a single transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create ledger transaction (pass tx to use same transaction)
      const ledgerTransactionId = await createExpenseTransaction({
        organizationId: actor.orgId,
        occurredAt: validated.date,
        description: validated.description,
        amountCents,
        category: validated.category,
        vendor: validated.vendor,
        idempotencyKey,
        createdByUserId: actor.userId,
      }, tx)

      // Create expense record
      const expense = await tx.expense.create({
        data: {
          ...validated,
          createdById: actor.userId,
          ledgerTransactionId,
        },
        include: {
          receipts: true,
        },
      })

      return expense
    })

    // Use OrgCore audit helper
    await writeAudit({
      actor,
      action: "CREATE",
      entityType: "Expense",
      entityId: result.id,
      metadata: { amount: result.amount, description: result.description },
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: "Validation error", details: error.errors }, { status: 400 })
    }
    const statusCode = (error as any).statusCode || 500
    return NextResponse.json({ error: error.message }, { status: statusCode })
  }
}

