import { PrismaClient } from "@prisma/client"
import { ensureDefaultAccounts, createExpenseTransaction, reverseTransaction } from "../lib/ledger/ledgerService"
import { randomUUID } from "crypto"

const prisma = new PrismaClient()

async function main() {
  console.log("Running ledger self-test...\n")

  try {
    // Get or create test org
    let testOrg = await prisma.organization.findFirst({
      where: { slug: "test-ledger-org" },
    })

    if (!testOrg) {
      testOrg = await prisma.organization.create({
        data: {
          name: "Test Ledger Org",
          slug: "test-ledger-org",
        },
      })
      console.log("✓ Created test organization")
    } else {
      console.log("✓ Using existing test organization")
    }

    // Get or create test user
    let testUser = await prisma.user.findFirst({
      where: { email: "test-ledger@example.com" },
    })

    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          email: "test-ledger@example.com",
          name: "Test User",
        },
      })
      console.log("✓ Created test user")
    } else {
      console.log("✓ Using existing test user")
    }

    // Ensure membership
    const membership = await prisma.membership.upsert({
      where: {
        userId_organizationId: {
          userId: testUser.id,
          organizationId: testOrg.id,
        },
      },
      update: {},
      create: {
        userId: testUser.id,
        organizationId: testOrg.id,
        role: "OWNER",
      },
    })
    console.log("✓ Membership ensured")

    // Ensure default accounts
    await ensureDefaultAccounts(testOrg.id)
    console.log("✓ Default accounts ensured")

    // Test 1: Create expense transaction
    console.log("\n--- Test 1: Create Expense Transaction ---")
    const expenseId1 = `test-expense-${randomUUID()}`
    const idempotencyKey1 = `test:${expenseId1}`
    const amountCents1 = 5000 // $50.00

    const txId1 = await createExpenseTransaction({
      organizationId: testOrg.id,
      occurredAt: new Date(),
      description: "Test expense 1",
      amountCents: amountCents1,
      category: "Test Category",
      vendor: "Test Vendor",
      idempotencyKey: idempotencyKey1,
      createdByUserId: testUser.id,
    })

    console.log(`✓ Created transaction: ${txId1}`)

    // Verify postings balance
    const postings1 = await prisma.ledgerPosting.findMany({
      where: { transactionId: txId1 },
    })

    const drTotal1 = postings1
      .filter((p) => p.direction === "DR")
      .reduce((sum, p) => sum + p.amountCents, 0)
    const crTotal1 = postings1
      .filter((p) => p.direction === "CR")
      .reduce((sum, p) => sum + p.amountCents, 0)

    if (drTotal1 !== crTotal1) {
      throw new Error(`❌ Transaction imbalance: DR=${drTotal1}, CR=${crTotal1}`)
    }
    console.log(`✓ Postings balance verified: DR=${drTotal1}, CR=${crTotal1}`)

    // Test 2: Update expense (supersede)
    console.log("\n--- Test 2: Update Expense (Supersede) ---")
    const amountCents2 = 7500 // $75.00
    const idempotencyKey2 = `test:${expenseId1}:update:${randomUUID()}`

    // Reverse old transaction
    const reversalTxId = await reverseTransaction({
      organizationId: testOrg.id,
      transactionId: txId1,
      reason: "Test update",
      createdByUserId: testUser.id,
    })
    console.log(`✓ Reversed transaction: ${reversalTxId}`)

    // Create new transaction
    const txId2 = await createExpenseTransaction({
      organizationId: testOrg.id,
      occurredAt: new Date(),
      description: "Test expense 1 (updated)",
      amountCents: amountCents2,
      category: "Test Category",
      vendor: "Test Vendor",
      idempotencyKey: idempotencyKey2,
      createdByUserId: testUser.id,
    })
    console.log(`✓ Created new transaction: ${txId2}`)

    // Verify original transaction is marked as reversed
    const originalTx = await prisma.ledgerTransaction.findUnique({
      where: { id: txId1 },
    })
    if (originalTx?.reversedByTransactionId !== reversalTxId) {
      throw new Error("❌ Original transaction not properly marked as reversed")
    }
    console.log("✓ Original transaction marked as reversed")

    // Test 3: Delete expense (reverse)
    console.log("\n--- Test 3: Delete Expense (Reverse) ---")
    const expenseId3 = `test-expense-${randomUUID()}`
    const idempotencyKey3 = `test:${expenseId3}`
    const amountCents3 = 3000 // $30.00

    const txId3 = await createExpenseTransaction({
      organizationId: testOrg.id,
      occurredAt: new Date(),
      description: "Test expense 3",
      amountCents: amountCents3,
      category: "Test Category",
      vendor: "Test Vendor",
      idempotencyKey: idempotencyKey3,
      createdByUserId: testUser.id,
    })
    console.log(`✓ Created transaction: ${txId3}`)

    // Reverse (delete)
    const deleteReversalTxId = await reverseTransaction({
      organizationId: testOrg.id,
      transactionId: txId3,
      reason: "Test delete",
      createdByUserId: testUser.id,
    })
    console.log(`✓ Reversed (deleted) transaction: ${deleteReversalTxId}`)

    // Verify org scoping
    console.log("\n--- Test 4: Organization Scoping ---")
    const allTransactions = await prisma.ledgerTransaction.findMany({
      where: { organizationId: testOrg.id },
    })
    console.log(`✓ Found ${allTransactions.length} transactions for test org`)

    // Summary
    console.log("\n--- Summary ---")
    const allPostings = await prisma.ledgerPosting.findMany({
      where: { organizationId: testOrg.id },
    })
    const allAccounts = await prisma.ledgerAccount.findMany({
      where: { organizationId: testOrg.id },
    })

    console.log(`✓ Total transactions: ${allTransactions.length}`)
    console.log(`✓ Total postings: ${allPostings.length}`)
    console.log(`✓ Total accounts: ${allAccounts.length}`)

    // Verify all transactions are balanced
    for (const tx of allTransactions) {
      const txPostings = await prisma.ledgerPosting.findMany({
        where: { transactionId: tx.id },
      })
      const dr = txPostings
        .filter((p) => p.direction === "DR")
        .reduce((sum, p) => sum + p.amountCents, 0)
      const cr = txPostings
        .filter((p) => p.direction === "CR")
        .reduce((sum, p) => sum + p.amountCents, 0)
      if (dr !== cr) {
        throw new Error(`❌ Transaction ${tx.id} is not balanced: DR=${dr}, CR=${cr}`)
      }
    }
    console.log("✓ All transactions are balanced")

    console.log("\n✅ All tests passed!")
  } catch (error: any) {
    console.error("\n❌ Test failed:", error.message)
    throw error
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

