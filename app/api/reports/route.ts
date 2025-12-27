import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireMembership } from "@/lib/auth-helpers"
import { reportFiltersSchema } from "@/lib/validations"
import { getLedgerReport } from "@/lib/reports/ledgerReports"

const LEDGER_REPORTS_ENABLED = process.env.LEDGER_REPORTS_ENABLED === "true"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const filters = {
      organizationId: searchParams.get("organizationId") || "",
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
      category: searchParams.get("category") || undefined,
      vendor: searchParams.get("vendor") || undefined,
      groupBy: searchParams.get("groupBy") || undefined,
    }

    const validated = reportFiltersSchema.parse(filters)
    await requireMembership(validated.organizationId, "VIEWER")

    // Use ledger reports if enabled
    if (LEDGER_REPORTS_ENABLED) {
      const result = await getLedgerReport({
        organizationId: validated.organizationId,
        startDate: validated.startDate,
        endDate: validated.endDate,
        category: validated.category,
        vendor: validated.vendor,
        groupBy: validated.groupBy,
      })
      return NextResponse.json(result)
    }

    // Fallback to expense-based reports
    const where: any = {
      organizationId: validated.organizationId,
      deletedAt: null, // Exclude soft-deleted expenses
    }

    if (validated.startDate) {
      where.date = { ...where.date, gte: validated.startDate }
    }

    if (validated.endDate) {
      where.date = { ...where.date, lte: validated.endDate }
    }

    if (validated.category) {
      where.category = validated.category
    }

    if (validated.vendor) {
      where.vendor = validated.vendor
    }

    const expenses = await prisma.expense.findMany({
      where,
      select: {
        amount: true,
        date: true,
        category: true,
        vendor: true,
      },
    })

    let result: any = {}

    if (validated.groupBy === "month") {
      const grouped = expenses.reduce((acc, expense) => {
        const month = new Date(expense.date).toISOString().slice(0, 7) // YYYY-MM
        acc[month] = (acc[month] || 0) + Number(expense.amount)
        return acc
      }, {} as Record<string, number>)

      result = Object.entries(grouped).map(([month, total]) => ({
        month,
        total: Number(total),
      }))
    } else if (validated.groupBy === "category") {
      const grouped = expenses.reduce((acc, expense) => {
        const category = expense.category || "Uncategorized"
        acc[category] = (acc[category] || 0) + Number(expense.amount)
        return acc
      }, {} as Record<string, number>)

      result = Object.entries(grouped).map(([category, total]) => ({
        category,
        total: Number(total),
      }))
    } else if (validated.groupBy === "vendor") {
      const grouped = expenses.reduce((acc, expense) => {
        const vendor = expense.vendor || "Unknown"
        acc[vendor] = (acc[vendor] || 0) + Number(expense.amount)
        return acc
      }, {} as Record<string, number>)

      result = Object.entries(grouped).map(([vendor, total]) => ({
        vendor,
        total: Number(total),
      }))
    } else {
      // Default: total
      const total = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0)
      result = { total: Number(total), count: expenses.length }
    }

    return NextResponse.json(result)
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: "Validation error", details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
}

