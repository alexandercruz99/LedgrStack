import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireMembership, canManageExpenses } from "@/lib/auth-helpers"
import { expenseUpdateSchema } from "@/lib/validations"
import { createAuditLog } from "@/lib/audit-log"

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

    if (!expense) {
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

    const expense = await prisma.expense.update({
      where: { id },
      data: updateData,
      include: {
        receipts: true,
      },
    })

    await createAuditLog({
      organizationId: existingExpense.organizationId,
      userId: user.id,
      action: "UPDATE",
      entityType: "Expense",
      entityId: expense.id,
      metadata: { changes: updateData },
    })

    return NextResponse.json(expense)
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

    // Delete receipts from S3
    const receipts = await prisma.receipt.findMany({
      where: { expenseId: id },
    })

    // Note: In production, you'd want to delete from S3 here
    // For now, we'll just delete the database records

    await prisma.expense.delete({
      where: { id },
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

