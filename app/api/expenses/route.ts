import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireMembership, canManageExpenses } from "@/lib/auth-helpers"
import { expenseSchema } from "@/lib/validations"
import { createAuditLog } from "@/lib/audit-log"
import { ensureDefaultAccounts, createExpenseTransaction, guardPeriodNotLocked } from "@/lib/ledger/ledgerService"
import { randomUUID } from "crypto"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const organizationId = searchParams.get("organizationId")

    if (!organizationId) {
      return NextResponse.json({ error: "organizationId is required" }, { status: 400 })
    }

    const { user } = await requireMembership(organizationId, "VIEWER")

    const expenses = await prisma.expense.findMany({
      where: {
        organizationId,
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
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = expenseSchema.parse(body)

    const { user, membership } = await requireMembership(validated.organizationId, "MEMBER")

    if (!(await canManageExpenses(validated.organizationId, user.id))) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    // Guard against locked periods
    await guardPeriodNotLocked(validated.organizationId, validated.date)

    // Convert amount to cents
    const amountCents = Math.round(Number(validated.amount) * 100)

    // Generate idempotency key
    const idempotencyKey = `expense:${randomUUID()}`

    // Create expense and ledger transaction in a single transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create ledger transaction (pass tx to use same transaction)
      const ledgerTransactionId = await createExpenseTransaction({
        organizationId: validated.organizationId,
        occurredAt: validated.date,
        description: validated.description,
        amountCents,
        category: validated.category,
        vendor: validated.vendor,
        idempotencyKey,
        createdByUserId: user.id,
      }, tx)

      // Create expense record
      const expense = await tx.expense.create({
        data: {
          ...validated,
          createdById: user.id,
          ledgerTransactionId,
        },
        include: {
          receipts: true,
        },
      })

      return expense
    })

    await createAuditLog({
      organizationId: validated.organizationId,
      userId: user.id,
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
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
}

