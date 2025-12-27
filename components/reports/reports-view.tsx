"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface ReportsViewProps {
  organizationId: string
}

interface ReportData {
  month?: string
  category?: string
  vendor?: string
  total: number
  count?: number
}

export function ReportsView({ organizationId }: ReportsViewProps) {
  const [groupBy, setGroupBy] = useState<string>("month")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [category, setCategory] = useState("")
  const [vendor, setVendor] = useState("")
  const [reportData, setReportData] = useState<ReportData[] | { total: number; count: number } | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchReport = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        organizationId,
        groupBy,
      })

      if (startDate) params.append("startDate", startDate)
      if (endDate) params.append("endDate", endDate)
      if (category) params.append("category", category)
      if (vendor) params.append("vendor", vendor)

      const response = await fetch(`/api/reports?${params.toString()}`)
      if (!response.ok) throw new Error("Failed to fetch report")
      const data = await response.json()
      setReportData(data)
    } catch (error: any) {
      console.error("Error fetching report:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, groupBy, startDate, endDate, category, vendor])

  const isArray = Array.isArray(reportData)

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Reports</h1>
        <p className="text-muted-foreground">View expense reports and analytics</p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Group By</Label>
              <Select value={groupBy} onValueChange={setGroupBy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Month</SelectItem>
                  <SelectItem value="category">Category</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Filter by category"
              />
            </div>

            <div className="space-y-2">
              <Label>Vendor</Label>
              <Input
                type="text"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="Filter by vendor"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {groupBy === "month" && "Expenses by Month"}
            {groupBy === "category" && "Expenses by Category"}
            {groupBy === "vendor" && "Expenses by Vendor"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div>Loading...</div>
          ) : isArray && reportData.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  {groupBy === "month" && <TableHead>Month</TableHead>}
                  {groupBy === "category" && <TableHead>Category</TableHead>}
                  {groupBy === "vendor" && <TableHead>Vendor</TableHead>}
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportData.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      {item.month || item.category || item.vendor || "Unknown"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : !isArray && reportData ? (
            <div className="space-y-4">
              <div className="text-2xl font-bold">
                Total: {formatCurrency(reportData.total)}
              </div>
              <div className="text-muted-foreground">
                {reportData.count || 0} expenses
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              No data available for the selected filters.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

