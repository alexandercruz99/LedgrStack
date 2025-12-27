import { z } from "zod"

export const expenseSchema = z.object({
  amount: z.coerce.number().positive("Amount must be positive"),
  description: z.string().min(1, "Description is required").max(500),
  category: z.string().max(100).optional(),
  vendor: z.string().max(100).optional(),
  date: z.coerce.date(),
  organizationId: z.string().cuid(),
})

export const expenseUpdateSchema = expenseSchema.partial().extend({
  id: z.string().cuid(),
})

export const organizationSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  slug: z.string().min(1, "Slug is required").max(100).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
})

export const membershipSchema = z.object({
  userId: z.string().cuid(),
  organizationId: z.string().cuid(),
  role: z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]),
})

export const receiptUploadSchema = z.object({
  expenseId: z.string().cuid(),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().positive().max(10 * 1024 * 1024), // 10MB max
})

export const reportFiltersSchema = z.object({
  organizationId: z.string().cuid(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  category: z.string().optional(),
  vendor: z.string().optional(),
  groupBy: z.enum(["month", "category", "vendor"]).optional(),
})

