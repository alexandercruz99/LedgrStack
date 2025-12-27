import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireMembership } from "@/lib/auth-helpers"

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

    const where: any = {
      organizationId,
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

    const expenses = await prisma.expense.findMany({
      where,
      orderBy: {
        date: "desc",
      },
    })

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

