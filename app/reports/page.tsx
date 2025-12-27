import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { ReportsView } from "@/components/reports/reports-view"

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { organizationId?: string }
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect("/auth/signin")
  }

  if (!searchParams.organizationId) {
    redirect("/dashboard")
  }

  return <ReportsView organizationId={searchParams.organizationId} />
}

