"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"

const expenseFormSchema = z.object({
  amount: z.coerce.number().positive("Amount must be positive"),
  description: z.string().min(1, "Description is required").max(500),
  category: z.string().max(100).optional(),
  vendor: z.string().max(100).optional(),
  date: z.string().min(1, "Date is required"),
})

type ExpenseFormData = z.infer<typeof expenseFormSchema>

interface ExpenseFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  expense?: {
    id: string
    amount: number
    description: string
    category?: string | null
    vendor?: string | null
    date: string
  }
  onSuccess?: () => void
}

export function ExpenseForm({ open, onOpenChange, organizationId, expense, onSuccess }: ExpenseFormProps) {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: expense
      ? {
          amount: expense.amount,
          description: expense.description,
          category: expense.category || "",
          vendor: expense.vendor || "",
          date: expense.date.split("T")[0],
        }
      : {
          date: new Date().toISOString().split("T")[0],
        },
  })

  useEffect(() => {
    if (expense) {
      reset({
        amount: expense.amount,
        description: expense.description,
        category: expense.category || "",
        vendor: expense.vendor || "",
        date: expense.date.split("T")[0],
      })
    } else {
      reset({
        date: new Date().toISOString().split("T")[0],
      })
    }
  }, [expense, reset])

  const onSubmit = async (data: ExpenseFormData) => {
    setLoading(true)
    try {
      const url = expense
        ? `/api/expenses/${expense.id}`
        : "/api/expenses"

      const method = expense ? "PATCH" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          organizationId,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to save expense")
      }

      toast({
        title: expense ? "Expense updated" : "Expense created",
        description: "Your expense has been saved successfully.",
      })

      onOpenChange(false)
      onSuccess?.()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{expense ? "Edit Expense" : "New Expense"}</DialogTitle>
          <DialogDescription>
            {expense ? "Update the expense details below." : "Add a new expense to track."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount *</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              {...register("amount")}
              placeholder="0.00"
            />
            {errors.amount && (
              <p className="text-sm text-destructive">{errors.amount.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Input
              id="description"
              {...register("description")}
              placeholder="What was this expense for?"
            />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              {...register("category")}
              placeholder="e.g., Travel, Food, Equipment"
            />
            {errors.category && (
              <p className="text-sm text-destructive">{errors.category.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="vendor">Vendor</Label>
            <Input
              id="vendor"
              {...register("vendor")}
              placeholder="e.g., Amazon, Restaurant Name"
            />
            {errors.vendor && (
              <p className="text-sm text-destructive">{errors.vendor.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="date">Date *</Label>
            <Input
              id="date"
              type="date"
              {...register("date")}
            />
            {errors.date && (
              <p className="text-sm text-destructive">{errors.date.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : expense ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

