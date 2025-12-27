import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { organizationSchema } from "@/lib/validations"
import { createAuditLog } from "@/lib/audit-log"

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()

    const memberships = await prisma.membership.findMany({
      where: { userId: user.id },
      include: {
        organization: true,
      },
    })

    const organizations = memberships.map((m) => ({
      ...m.organization,
      role: m.role,
    }))

    return NextResponse.json(organizations)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const validated = organizationSchema.parse(body)

    // Check if slug is available
    const existing = await prisma.organization.findUnique({
      where: { slug: validated.slug },
    })

    if (existing) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 400 })
    }

    const organization = await prisma.organization.create({
      data: {
        name: validated.name,
        slug: validated.slug,
        memberships: {
          create: {
            userId: user.id,
            role: "OWNER",
          },
        },
      },
    })

    await createAuditLog({
      organizationId: organization.id,
      userId: user.id,
      action: "CREATE",
      entityType: "Organization",
      entityId: organization.id,
      metadata: { name: organization.name },
    })

    return NextResponse.json(organization, { status: 201 })
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: "Validation error", details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
}

