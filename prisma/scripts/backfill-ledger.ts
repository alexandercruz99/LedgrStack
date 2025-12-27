import { PrismaClient } from "@prisma/client"
import { ensureDefaultAccounts, createExpenseTransaction } from "../../lib/ledger/ledgerService"

const prisma = new PrismaClient()

async function main() {
  console.log("Starting ledger backfill...")

  // Get all organizations
  const organizations = await prisma.organization.findMany()

  for (const org of organizations) {
    console.log(`\nProcessing organization: ${org.name} (${org.id})`)

    // Ensure default accounts exist
    await ensureDefaultAccounts(org.id)
    console.log("✓ Default accounts ensured")

    // Get all expenses without ledger transactions
    const expenses = await prisma.expense.findMany({
      where: {
        organizationId: org.id,
        ledgerTransactionId: null,
        deletedAt: null, // Only backfill non-deleted expenses
      },
      include: {
        receipts: true,
      },
    })

    console.log(`Found ${expenses.length} expenses to backfill`)

    for (const expense of expenses) {
      try {
        // Generate deterministic idempotency key
        const idempotencyKey = `backfill:expense:${expense.id}`

        // Check if already backfilled (idempotency check)
        const existing = await prisma.ledgerTransaction.findUnique({
          where: {
            organizationId_idempotencyKey: {
              organizationId: org.id,
              idempotencyKey,
            },
          },
        })

        if (existing) {
          console.log(`  ⏭️  Expense ${expense.id} already backfilled, skipping`)
          // Link the existing transaction to the expense
          await prisma.expense.update({
            where: { id: expense.id },
            data: { ledgerTransactionId: existing.id },
          })
          continue
        }

        // Convert amount to cents
        const amountCents = Math.round(Number(expense.amount) * 100)

        // Create ledger transaction
        const ledgerTransactionId = await createExpenseTransaction({
          organizationId: org.id,
          occurredAt: expense.date,
          description: expense.description,
          amountCents,
          category: expense.category,
          vendor: expense.vendor,
          idempotencyKey,
          createdByUserId: expense.createdById || "system",
        })

        // Link transaction to expense
        await prisma.expense.update({
          where: { id: expense.id },
          data: { ledgerTransactionId },
        })

        // Link receipts to ledger transaction
        if (expense.receipts.length > 0) {
          await prisma.ledgerAttachmentLink.createMany({
            data: expense.receipts.map((receipt) => ({
              organizationId: org.id,
              transactionId: ledgerTransactionId,
              receiptId: receipt.id,
            })),
            skipDuplicates: true,
          })
        }

        console.log(`  ✓ Backfilled expense ${expense.id} (${expense.description})`)
      } catch (error: any) {
        console.error(`  ✗ Failed to backfill expense ${expense.id}:`, error.message)
      }
    }
  }

  console.log("\n✓ Ledger backfill completed!")
}

main()
  .catch((e) => {
    console.error("Backfill error:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

