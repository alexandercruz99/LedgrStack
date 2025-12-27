import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireMembership, canManageExpenses } from "@/lib/auth-helpers"
import { deleteS3Object } from "@/lib/s3"

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const receipt = await prisma.receipt.findUnique({
      where: { id },
      include: {
        expense: true,
      },
    })

    if (!receipt) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 })
    }

    const { user } = await requireMembership(receipt.expense.organizationId, "MEMBER")

    if (!(await canManageExpenses(receipt.expense.organizationId, user.id))) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    // Delete from S3
    await deleteS3Object(receipt.key)

    // Delete from database
    await prisma.receipt.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
}

