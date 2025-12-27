import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireMembership, canManageExpenses } from "@/lib/auth-helpers"
import { z } from "zod"
import { generatePresignedDownloadUrl } from "@/lib/s3"

const receiptSchema = z.object({
  expenseId: z.string().cuid(),
  key: z.string().min(1),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().positive(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = receiptSchema.parse(body)

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

    const receipt = await prisma.receipt.create({
      data: {
        expenseId: validated.expenseId,
        key: validated.key,
        filename: validated.filename,
        mimeType: validated.mimeType,
        size: validated.size,
        url: validated.key, // Store key as URL for now (presigned URLs generated on-demand)
      },
    })

    return NextResponse.json(receipt, { status: 201 })
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: "Validation error", details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const receiptId = searchParams.get("id")

    if (!receiptId) {
      return NextResponse.json({ error: "id is required" }, { status: 400 })
    }

    const receipt = await prisma.receipt.findUnique({
      where: { id: receiptId },
      include: {
        expense: true,
      },
    })

    if (!receipt) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 })
    }

    await requireMembership(receipt.expense.organizationId, "VIEWER")

    // Generate presigned download URL
    const downloadUrl = await generatePresignedDownloadUrl(receipt.key)

    return NextResponse.json({
      ...receipt,
      downloadUrl,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
}

