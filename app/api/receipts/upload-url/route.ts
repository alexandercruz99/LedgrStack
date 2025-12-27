import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireMembership, canManageExpenses } from "@/lib/auth-helpers"
import { receiptUploadSchema } from "@/lib/validations"
import { generatePresignedUploadUrl } from "@/lib/s3"
import { randomBytes } from "crypto"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = receiptUploadSchema.parse(body)

    const expense = await prisma.expense.findUnique({
      where: { id: validated.expenseId },
    })

    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 })
    }

    const { user } = await requireMembership(expense.organizationId, "MEMBER")

    if (!(await canManageExpenses(expense.organizationId, user.id))) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    // Generate unique key for S3
    const fileExtension = validated.filename.split(".").pop()
    const key = `receipts/${expense.organizationId}/${validated.expenseId}/${randomBytes(16).toString("hex")}.${fileExtension}`

    const uploadUrl = await generatePresignedUploadUrl(key, validated.mimeType)

    return NextResponse.json({
      uploadUrl,
      key,
    })
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: "Validation error", details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
}

