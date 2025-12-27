import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireMembership } from "@/lib/auth-helpers"
import { getLedgerExpensesForExport } from "@/lib/reports/ledgerReports"

const LEDGER_REPORTS_ENABLED = process.env.LEDGER_REPORTS_ENABLED === "true"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const organizationId = searchParams.get("organizationId")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const category = searchParams.get("category")
    const vendor = searchParams.get("vendor")

    if (!organizationId) {
      return NextResponse.json({ error: "organizationId is required" }, { status: 400 })
    }

    await requireMembership(organizationId, "VIEWER")

    let expenses: Array<{
      date: Date
      amount: number
      description: string
      category: string
      vendor: string
    }>

    // Use ledger reports if enabled
    if (LEDGER_REPORTS_ENABLED) {
      expenses = await getLedgerExpensesForExport({
        organizationId,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        category: category || undefined,
        vendor: vendor || undefined,
      })
    } else {
      // Fallback to expense-based export
      const where: any = {
        organizationId,
        deletedAt: null, // Exclude soft-deleted expenses
      }

      if (startDate) {
        where.date = { ...where.date, gte: new Date(startDate) }
      }

      if (endDate) {
        where.date = { ...where.date, lte: new Date(endDate) }
      }

      if (category) {
        where.category = category
      }

      if (vendor) {
        where.vendor = vendor
      }

      const expenseRecords = await prisma.expense.findMany({
        where,
        orderBy: {
          date: "desc",
        },
      })

      expenses = expenseRecords.map((expense) => ({
        date: expense.date,
        amount: Number(expense.amount),
        description: expense.description,
        category: expense.category || "",
        vendor: expense.vendor || "",
      }))
    }

    // Generate CSV
    const headers = ["Date", "Amount", "Description", "Category", "Vendor"]
    const rows = expenses.map((expense) => [
      new Date(expense.date).toISOString().split("T")[0],
      expense.amount.toString(),
      expense.description,
      expense.category || "",
      expense.vendor || "",
    ])

    const csv = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n")

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="expenses-${organizationId}-${Date.now()}.csv"`,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
}

