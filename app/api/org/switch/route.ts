import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireSessionUser, setActiveOrgId } from "@/src/core/org"

const switchOrgSchema = z.object({
  orgId: z.string().cuid(),
})

export async function POST(request: NextRequest) {
  try {
    const userId = await requireSessionUser()
    const body = await request.json()
    const validated = switchOrgSchema.parse(body)

    // Verify membership and set active org
    await setActiveOrgId(userId, validated.orgId)

    return NextResponse.json({ success: true, orgId: validated.orgId })
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: "Validation error", details: error.errors }, { status: 400 })
    }
    const statusCode = (error as any).statusCode || 500
    return NextResponse.json({ error: error.message }, { status: statusCode })
  }
}

