import { PrismaClient, Role } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("Seeding database...")

  // Create demo user
  const demoUser = await prisma.user.upsert({
    where: { email: "demo@ledgr.app" },
    update: {},
    create: {
      email: "demo@ledgr.app",
      name: "Demo User",
      emailVerified: new Date(),
    },
  })

  console.log("Created demo user:", demoUser.email)

  // Create demo organization
  const demoOrg = await prisma.organization.upsert({
    where: { slug: "demo-org" },
    update: {},
    create: {
      name: "Demo Organization",
      slug: "demo-org",
    },
  })

  console.log("Created demo organization:", demoOrg.name)

  // Create membership
  const membership = await prisma.membership.upsert({
    where: {
      userId_organizationId: {
        userId: demoUser.id,
        organizationId: demoOrg.id,
      },
    },
    update: {},
    create: {
      userId: demoUser.id,
      organizationId: demoOrg.id,
      role: Role.OWNER,
    },
  })

  console.log("Created membership:", membership.role)

  // Create sample expenses
  const expenses = [
    {
      organizationId: demoOrg.id,
      amount: 125.50,
      description: "Team lunch at Italian restaurant",
      category: "Food",
      vendor: "Luigi's Italian",
      date: new Date("2024-01-15"),
      createdById: demoUser.id,
    },
    {
      organizationId: demoOrg.id,
      amount: 49.99,
      description: "Office supplies - notebooks and pens",
      category: "Office Supplies",
      vendor: "Amazon",
      date: new Date("2024-01-18"),
      createdById: demoUser.id,
    },
    {
      organizationId: demoOrg.id,
      amount: 250.00,
      description: "Conference registration fee",
      category: "Travel",
      vendor: "TechConf 2024",
      date: new Date("2024-01-20"),
      createdById: demoUser.id,
    },
    {
      organizationId: demoOrg.id,
      amount: 89.95,
      description: "Coffee for office",
      category: "Food",
      vendor: "Starbucks",
      date: new Date("2024-01-22"),
      createdById: demoUser.id,
    },
    {
      organizationId: demoOrg.id,
      amount: 15.00,
      description: "Parking fee",
      category: "Travel",
      vendor: "City Parking",
      date: new Date("2024-01-25"),
      createdById: demoUser.id,
    },
  ]

  for (const expense of expenses) {
    await prisma.expense.create({
      data: expense,
    })
  }

  console.log(`Created ${expenses.length} sample expenses`)

  console.log("Seeding completed!")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

