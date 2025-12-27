import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireMembership, canManageExpenses } from "@/lib/auth-helpers"
import { expenseUpdateSchema } from "@/lib/validations"
import { createAuditLog } from "@/lib/audit-log"
import { ensureDefaultAccounts, createExpenseTransaction, reverseTransaction, guardPeriodNotLocked } from "@/lib/ledger/ledgerService"
import { randomUUID } from "crypto"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const expense = await prisma.expense.findUnique({
      where: { id },
      include: {
        receipts: true,
      },
    })

    if (!expense || expense.deletedAt) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 })
    }

    await requireMembership(expense.organizationId, "VIEWER")

    return NextResponse.json(expense)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const validated = expenseUpdateSchema.parse({ ...body, id })

    const existingExpense = await prisma.expense.findUnique({
      where: { id },
    })

    if (!existingExpense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 })
    }

    const { user } = await requireMembership(existingExpense.organizationId, "MEMBER")

    if (!(await canManageExpenses(existingExpense.organizationId, user.id))) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    // Prevent changing organizationId
    const { organizationId, id: _id, ...updateData } = validated

    // Guard against locked periods (check both old and new dates)
    await guardPeriodNotLocked(existingExpense.organizationId, existingExpense.date)
    if (updateData.date) {
      await guardPeriodNotLocked(existingExpense.organizationId, updateData.date)
    }

    // Implement supersede: reverse old transaction, create new one
    const result = await prisma.$transaction(async (tx) => {
      // Reverse existing ledger transaction if it exists
      if (existingExpense.ledgerTransactionId) {
        await reverseTransaction({
          organizationId: existingExpense.organizationId,
          transactionId: existingExpense.ledgerTransactionId,
          reason: "Expense updated",
          createdByUserId: user.id,
        }, tx)
      }

      // Create new ledger transaction with updated values
      const finalDate = updateData.date || existingExpense.date
      const finalAmount = updateData.amount !== undefined ? updateData.amount : existingExpense.amount
      const finalDescription = updateData.description || existingExpense.description
      const finalCategory = updateData.category !== undefined ? updateData.category : existingExpense.category
      const finalVendor = updateData.vendor !== undefined ? updateData.vendor : existingExpense.vendor

      const amountCents = Math.round(Number(finalAmount) * 100)
      const idempotencyKey = `expense:${id}:${randomUUID()}`

      const newLedgerTransactionId = await createExpenseTransaction({
        organizationId: existingExpense.organizationId,
        occurredAt: finalDate,
        description: finalDescription,
        amountCents,
        category: finalCategory,
        vendor: finalVendor,
        idempotencyKey,
        createdByUserId: user.id,
      }, tx)

      // Update expense with new values and new ledger transaction ID
      const expense = await tx.expense.update({
        where: { id },
        data: {
          ...updateData,
          ledgerTransactionId: newLedgerTransactionId,
        },
        include: {
          receipts: true,
        },
      })

      return expense
    })

    await createAuditLog({
      organizationId: existingExpense.organizationId,
      userId: user.id,
      action: "UPDATE",
      entityType: "Expense",
      entityId: result.id,
      metadata: { changes: updateData },
    })

    return NextResponse.json(result)
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: "Validation error", details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const expense = await prisma.expense.findUnique({
      where: { id },
    })

    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 })
    }

    const { user } = await requireMembership(expense.organizationId, "MEMBER")

    if (!(await canManageExpenses(expense.organizationId, user.id))) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    // Guard against locked periods
    await guardPeriodNotLocked(expense.organizationId, expense.date)

    // Soft delete: reverse transaction, set deletedAt, keep receipts
    await prisma.$transaction(async (tx) => {
      // Reverse ledger transaction if it exists
      if (expense.ledgerTransactionId) {
        await reverseTransaction({
          organizationId: expense.organizationId,
          transactionId: expense.ledgerTransactionId,
          reason: "Expense deleted",
          createdByUserId: user.id,
        })
      }

      // Soft delete expense
      await tx.expense.update({
        where: { id },
        data: {
          deletedAt: new Date(),
        },
      })
    })

    await createAuditLog({
      organizationId: expense.organizationId,
      userId: user.id,
      action: "DELETE",
      entityType: "Expense",
      entityId: id,
      metadata: { amount: expense.amount, description: expense.description },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
}

