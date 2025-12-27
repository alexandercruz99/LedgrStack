import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { ExpensesList } from "@/components/expenses/expenses-list"

export default async function ExpensesPage({
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

  return <ExpensesList organizationId={searchParams.organizationId} />
}

