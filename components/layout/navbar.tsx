"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface NavbarProps {
  organizationId?: string
}

export function Navbar({ organizationId }: NavbarProps) {
  const pathname = usePathname()

  const navItems = organizationId
    ? [
        { href: "/dashboard", label: "Dashboard" },
        { href: `/expenses?organizationId=${organizationId}`, label: "Expenses" },
        { href: `/reports?organizationId=${organizationId}`, label: "Reports" },
      ]
    : []

  return (
    <nav className="border-b bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
        <div className="flex items-center space-x-8">
          <Link href="/dashboard" className="text-xl font-bold">
            Ledgr
          </Link>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "text-sm font-medium transition-colors hover:text-primary",
                pathname === item.href.split("?")[0]
                  ? "text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <Button variant="ghost" onClick={() => signOut({ callbackUrl: "/auth/signin" })}>
          Sign Out
        </Button>
      </div>
    </nav>
  )
}

