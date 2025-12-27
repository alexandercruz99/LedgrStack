import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireMembership, canManageExpenses } from "@/lib/auth-helpers"
import { expenseSchema } from "@/lib/validations"
import { createAuditLog } from "@/lib/audit-log"

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

    const expense = await prisma.expense.create({
      data: {
        ...validated,
        createdById: user.id,
      },
      include: {
        receipts: true,
      },
    })

    await createAuditLog({
      organizationId: validated.organizationId,
      userId: user.id,
      action: "CREATE",
      entityType: "Expense",
      entityId: expense.id,
      metadata: { amount: expense.amount, description: expense.description },
    })

    return NextResponse.json(expense, { status: 201 })
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: "Validation error", details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
}

