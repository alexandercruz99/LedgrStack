import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { expenseUpdateSchema } from "@/lib/validations"
import { createExpenseTransaction, reverseTransaction, guardPeriodNotLocked } from "@/lib/ledger/ledgerService"
import { requireActor, orgFindUniqueExpense, writeAudit } from "@/src/core/org"
import { randomUUID } from "crypto"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const actor = await requireActor("VIEWER")

    // Use scoped query helper
    const expense = await orgFindUniqueExpense(actor.orgId, {
      where: { id },
      include: {
        receipts: true,
      },
    })

    if (!expense || expense.deletedAt) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 })
    }

    return NextResponse.json(expense)
  } catch (error: any) {
    const statusCode = (error as any).statusCode || 500
    return NextResponse.json({ error: error.message }, { status: statusCode })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const actor = await requireActor("MEMBER")

    const body = await request.json()
    const validated = expenseUpdateSchema.parse({ ...body, id })

    // Use scoped query helper
    const existingExpense = await orgFindUniqueExpense(actor.orgId, {
      where: { id },
    })

    if (!existingExpense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 })
    }

    // Guard against locked periods (check both old and new dates)
    await guardPeriodNotLocked(actor.orgId, existingExpense.date)
    // Remove id from validated data (id comes from params, organizationId from actor)
    const { id: _id, ...updateData } = validated
    if (updateData.date) {
      await guardPeriodNotLocked(actor.orgId, updateData.date)
    }

    // Implement supersede: reverse old transaction, create new one
    const result = await prisma.$transaction(async (tx) => {
      // Reverse existing ledger transaction if it exists
      if (existingExpense.ledgerTransactionId) {
        await reverseTransaction({
          organizationId: actor.orgId,
          transactionId: existingExpense.ledgerTransactionId,
          reason: "Expense updated",
          createdByUserId: actor.userId,
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
        organizationId: actor.orgId,
        occurredAt: finalDate,
        description: finalDescription,
        amountCents,
        category: finalCategory,
        vendor: finalVendor,
        idempotencyKey,
        createdByUserId: actor.userId,
      }, tx)

      // Update expense with new values and new ledger transaction ID
      // updateData already has organizationId and id removed
      const safeUpdateData = updateData
      const expense = await tx.expense.update({
        where: { id },
        data: {
          ...safeUpdateData,
          ledgerTransactionId: newLedgerTransactionId,
        },
        include: {
          receipts: true,
        },
      })

      return expense
    })

    await writeAudit({
      actor,
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
    const statusCode = (error as any).statusCode || 500
    return NextResponse.json({ error: error.message }, { status: statusCode })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const actor = await requireActor("MEMBER")

    // Use scoped query helper
    const expense = await orgFindUniqueExpense(actor.orgId, {
      where: { id },
    })

    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 })
    }

    // Guard against locked periods
    await guardPeriodNotLocked(actor.orgId, expense.date)

    // Soft delete: reverse transaction, set deletedAt, keep receipts
    await prisma.$transaction(async (tx) => {
      // Reverse ledger transaction if it exists
      if (expense.ledgerTransactionId) {
        await reverseTransaction({
          organizationId: actor.orgId,
          transactionId: expense.ledgerTransactionId,
          reason: "Expense deleted",
          createdByUserId: actor.userId,
        }, tx)
      }

      // Soft delete expense
      await tx.expense.update({
        where: { id },
        data: {
          deletedAt: new Date(),
        },
      })
    })

    await writeAudit({
      actor,
      action: "DELETE",
      entityType: "Expense",
      entityId: id,
      metadata: { amount: expense.amount, description: expense.description },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    const statusCode = (error as any).statusCode || 500
    return NextResponse.json({ error: error.message }, { status: statusCode })
  }
}

