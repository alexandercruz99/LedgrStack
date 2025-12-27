import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils"

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    redirect("/auth/signin")
  }

  const memberships = await prisma.membership.findMany({
    where: { userId: session.user.id },
    include: {
      organization: {
        include: {
          _count: {
            select: { expenses: true },
          },
        },
      },
    },
  })

  // Get recent expenses across all organizations
  const recentExpenses = await prisma.expense.findMany({
    where: {
      organizationId: {
        in: memberships.map((m) => m.organizationId),
      },
    },
    include: {
      organization: true,
    },
    orderBy: {
      date: "desc",
    },
    take: 5,
  })

  // Calculate totals
  const totals = await prisma.expense.groupBy({
    by: ["organizationId"],
    where: {
      organizationId: {
        in: memberships.map((m) => m.organizationId),
      },
    },
    _sum: {
      amount: true,
    },
  })

  const totalAmount = totals.reduce((sum, t) => sum + Number(t._sum.amount || 0), 0)

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {session.user.name || session.user.email}</p>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Total Expenses</CardTitle>
            <CardDescription>Across all organizations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalAmount)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Organizations</CardTitle>
            <CardDescription>You&apos;re a member of</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{memberships.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total Transactions</CardTitle>
            <CardDescription>All expenses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {memberships.reduce((sum, m) => sum + m.organization._count.expenses, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold">Your Organizations</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {memberships.map((membership) => {
            const orgTotal = totals.find((t) => t.organizationId === membership.organizationId)?._sum.amount || 0
            return (
              <Card key={membership.organizationId}>
                <CardHeader>
                  <CardTitle>{membership.organization.name}</CardTitle>
                  <CardDescription>Role: {membership.role}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <div className="text-2xl font-bold">{formatCurrency(Number(orgTotal))}</div>
                    <div className="text-sm text-muted-foreground">
                      {membership.organization._count.expenses} expenses
                    </div>
                  </div>
                  <Link href={`/expenses?organizationId=${membership.organizationId}`}>
                    <Button className="w-full">View Expenses</Button>
                  </Link>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {recentExpenses.length > 0 && (
        <div>
          <h2 className="mb-4 text-2xl font-semibold">Recent Expenses</h2>
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {recentExpenses.map((expense) => (
                  <div key={expense.id} className="flex items-center justify-between border-b pb-4 last:border-0">
                    <div>
                      <div className="font-medium">{expense.description}</div>
                      <div className="text-sm text-muted-foreground">
                        {expense.organization.name} • {new Date(expense.date).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-lg font-semibold">{formatCurrency(Number(expense.amount))}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

