import { prisma } from "@/lib/prisma"
import { PostingDirection } from "@prisma/client"

interface ReportFilters {
  organizationId: string
  startDate?: Date
  endDate?: Date
  category?: string
  vendor?: string
  groupBy?: "month" | "category" | "vendor"
}

/**
 * Get expense totals from ledger transactions
 * Only includes non-reversed transactions
 */
export async function getLedgerReport(filters: ReportFilters) {
  const { organizationId, startDate, endDate, category, vendor, groupBy } = filters

  // Build where clause for transactions
  const transactionWhere: any = {
    organizationId,
    // Exclude reversed transactions (those that have been reversed)
    reversedByTransactionId: null,
  }

  if (startDate) {
    transactionWhere.occurredAt = { ...transactionWhere.occurredAt, gte: startDate }
  }

  if (endDate) {
    transactionWhere.occurredAt = { ...transactionWhere.occurredAt, lte: endDate }
  }

  if (vendor) {
    transactionWhere.vendor = vendor
  }

  // Get transactions with postings
  const transactions = await prisma.ledgerTransaction.findMany({
    where: transactionWhere,
    include: {
      postings: {
        where: {
          direction: PostingDirection.DR, // Only DR postings for expenses
          // Filter by category if provided
          ...(category ? { category } : {}),
        },
      },
    },
  })

  // Filter transactions that have expense postings (DR)
  const expenseTransactions = transactions.filter((tx) => tx.postings.length > 0)

  if (groupBy === "month") {
    const grouped = expenseTransactions.reduce((acc, tx) => {
      const month = tx.occurredAt.toISOString().slice(0, 7) // YYYY-MM
      const total = tx.postings.reduce((sum, p) => sum + p.amountCents, 0)
      acc[month] = (acc[month] || 0) + total
      return acc
    }, {} as Record<string, number>)

    return Object.entries(grouped).map(([month, total]) => ({
      month,
      total: Number(total) / 100, // Convert cents to dollars
    }))
  } else if (groupBy === "category") {
    const grouped = expenseTransactions.reduce((acc, tx) => {
      tx.postings.forEach((posting) => {
        const cat = posting.category || "Uncategorized"
        acc[cat] = (acc[cat] || 0) + posting.amountCents
      })
      return acc
    }, {} as Record<string, number>)

    return Object.entries(grouped).map(([category, total]) => ({
      category,
      total: Number(total) / 100,
    }))
  } else if (groupBy === "vendor") {
    const grouped = expenseTransactions.reduce((acc, tx) => {
      const vendor = tx.vendor || "Unknown"
      const total = tx.postings.reduce((sum, p) => sum + p.amountCents, 0)
      acc[vendor] = (acc[vendor] || 0) + total
      return acc
    }, {} as Record<string, number>)

    return Object.entries(grouped).map(([vendor, total]) => ({
      vendor,
      total: Number(total) / 100,
    }))
  } else {
    // Default: total
    const total = expenseTransactions.reduce((sum, tx) => {
      return sum + tx.postings.reduce((postingSum, p) => postingSum + p.amountCents, 0)
    }, 0)

    return {
      total: Number(total) / 100,
      count: expenseTransactions.length,
    }
  }
}

/**
 * Get expenses for CSV export from ledger
 */
export async function getLedgerExpensesForExport(filters: {
  organizationId: string
  startDate?: Date
  endDate?: Date
  category?: string
  vendor?: string
}) {
  const { organizationId, startDate, endDate, category, vendor } = filters

  const transactionWhere: any = {
    organizationId,
    reversedByTransactionId: null,
  }

  if (startDate) {
    transactionWhere.occurredAt = { ...transactionWhere.occurredAt, gte: startDate }
  }

  if (endDate) {
    transactionWhere.occurredAt = { ...transactionWhere.occurredAt, lte: endDate }
  }

  if (vendor) {
    transactionWhere.vendor = vendor
  }

  const transactions = await prisma.ledgerTransaction.findMany({
    where: transactionWhere,
    include: {
      postings: {
        where: {
          direction: PostingDirection.DR,
          ...(category ? { category } : {}),
        },
      },
    },
    orderBy: {
      occurredAt: "desc",
    },
  })

  // Map to expense-like format for CSV
  return transactions
    .filter((tx) => tx.postings.length > 0)
    .map((tx) => {
      const posting = tx.postings[0] // Get first DR posting
      return {
        date: tx.occurredAt,
        amount: posting.amountCents / 100,
        description: tx.description,
        category: posting.category || "",
        vendor: tx.vendor || "",
      }
    })
}

