import { PrismaClient } from "@prisma/client"
import {
  getUserOrgs,
  getActiveOrgId,
  setActiveOrgId,
  requireRole,
  requireActor,
} from "../src/core/org"

const prisma = new PrismaClient()

async function main() {
  console.log("Running OrgCore self-test...\n")

  try {
    // Get or create test user
    let testUser = await prisma.user.findFirst({
      where: { email: "test-orgcore@example.com" },
    })

    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          email: "test-orgcore@example.com",
          name: "Test OrgCore User",
        },
      })
      console.log("✓ Created test user")
    } else {
      console.log("✓ Using existing test user")
    }

    // Get or create test orgs
    let org1 = await prisma.organization.findFirst({
      where: { slug: "test-org-1" },
    })

    if (!org1) {
      org1 = await prisma.organization.create({
        data: {
          name: "Test Org 1",
          slug: "test-org-1",
        },
      })
      console.log("✓ Created test org 1")
    } else {
      console.log("✓ Using existing test org 1")
    }

    let org2 = await prisma.organization.findFirst({
      where: { slug: "test-org-2" },
    })

    if (!org2) {
      org2 = await prisma.organization.create({
        data: {
          name: "Test Org 2",
          slug: "test-org-2",
        },
      })
      console.log("✓ Created test org 2")
    } else {
      console.log("✓ Using existing test org 2")
    }

    // Create memberships
    const membership1 = await prisma.membership.upsert({
      where: {
        userId_organizationId: {
          userId: testUser.id,
          organizationId: org1.id,
        },
      },
      update: {},
      create: {
        userId: testUser.id,
        organizationId: org1.id,
        role: "OWNER",
      },
    })
    console.log("✓ Created membership 1 (OWNER)")

    const membership2 = await prisma.membership.upsert({
      where: {
        userId_organizationId: {
          userId: testUser.id,
          organizationId: org2.id,
        },
      },
      update: {},
      create: {
        userId: testUser.id,
        organizationId: org2.id,
        role: "VIEWER",
      },
    })
    console.log("✓ Created membership 2 (VIEWER)")

    // Test getUserOrgs
    console.log("\n--- Test 1: getUserOrgs ---")
    const userOrgs = await getUserOrgs(testUser.id)
    console.log(`✓ Found ${userOrgs.length} organizations:`)
    userOrgs.forEach((org) => {
      console.log(`  - ${org.name} (${org.id}) - Role: ${org.role}`)
    })

    // Test getActiveOrgId
    console.log("\n--- Test 2: getActiveOrgId ---")
    const activeOrgId = await getActiveOrgId(testUser.id)
    console.log(`✓ Active org ID: ${activeOrgId}`)
    if (activeOrgId !== org1.id && activeOrgId !== org2.id) {
      throw new Error(`Unexpected active org ID: ${activeOrgId}`)
    }

    // Test setActiveOrgId
    console.log("\n--- Test 3: setActiveOrgId ---")
    await setActiveOrgId(testUser.id, org2.id)
    const newActiveOrgId = await getActiveOrgId(testUser.id)
    console.log(`✓ Switched active org to: ${newActiveOrgId}`)
    if (newActiveOrgId !== org2.id) {
      throw new Error(`Failed to switch active org. Expected ${org2.id}, got ${newActiveOrgId}`)
    }

    // Test requireRole (should succeed for OWNER)
    console.log("\n--- Test 4: requireRole (OWNER) ---")
    await setActiveOrgId(testUser.id, org1.id)
    const role1 = await requireRole(testUser.id, org1.id, "OWNER")
    console.log(`✓ User has role: ${role1}`)

    // Test requireRole (should fail for VIEWER trying ADMIN)
    console.log("\n--- Test 5: requireRole (VIEWER → ADMIN should fail) ---")
    await setActiveOrgId(testUser.id, org2.id)
    try {
      await requireRole(testUser.id, org2.id, "ADMIN")
      throw new Error("Should have thrown 403 error")
    } catch (error: any) {
      if ((error as any).statusCode === 403) {
        console.log("✓ Correctly rejected insufficient permissions")
      } else {
        throw error
      }
    }

    // Test requireActor (would need session, so we'll test the underlying functions)
    console.log("\n--- Test 6: Role hierarchy ---")
    const { roleGte } = await import("../src/core/org/roles")
    console.log(`✓ OWNER >= ADMIN: ${roleGte("OWNER", "ADMIN")}`)
    console.log(`✓ MEMBER >= VIEWER: ${roleGte("MEMBER", "VIEWER")}`)
    console.log(`✓ VIEWER >= ADMIN: ${roleGte("VIEWER", "ADMIN")}`)

    if (!roleGte("OWNER", "ADMIN")) {
      throw new Error("OWNER should be >= ADMIN")
    }
    if (!roleGte("MEMBER", "VIEWER")) {
      throw new Error("MEMBER should be >= VIEWER")
    }
    if (roleGte("VIEWER", "ADMIN")) {
      throw new Error("VIEWER should NOT be >= ADMIN")
    }

    console.log("\n✅ All OrgCore tests passed!")
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

