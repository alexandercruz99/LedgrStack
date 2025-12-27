# Ledger Integration Plan

## Current Architecture Audit

### Prisma Schema Models
- **Organization**: id, name, slug, timestamps
- **Membership**: userId, organizationId, role (OWNER/ADMIN/MEMBER/VIEWER)
- **User**: id, email, name, emailVerified, image (NextAuth)
- **Expense**: id, organizationId, amount, description, category, vendor, date, createdById
- **Receipt**: id, expenseId, url, key, filename, size, mimeType
- **AuditLog**: id, organizationId, userId, action, entityType, entityId, metadata

### Organization ID Derivation Patterns

1. **Query Parameters**: `organizationId` passed via searchParams in GET requests
   - `/api/expenses?organizationId=xxx`
   - `/api/reports?organizationId=xxx`
   - `/api/expenses/export?organizationId=xxx`

2. **Request Body**: `organizationId` in POST/PATCH request body
   - Validated via Zod schemas
   - Always verified via `requireMembership(organizationId, role)`

3. **From Related Entity**: When accessing via related entity (e.g., expense → orgId)
   - Example: Receipt lookup → expense.organizationId → verify membership

4. **Authorization Flow**:
   - `requireAuth()` → gets user from session
   - `requireMembership(orgId, minRole)` → validates user has membership with required role
   - All queries scoped by `organizationId` in WHERE clauses

### Expense CRUD Flows

#### CREATE (`POST /api/expenses`)
1. Validate request body with `expenseSchema` (includes organizationId)
2. Call `requireMembership(organizationId, "MEMBER")` → validates auth + membership
3. Check `canManageExpenses(organizationId, userId)`
4. Create expense record
5. Create audit log entry

#### UPDATE (`PATCH /api/expenses/[id]`)
1. Load existing expense by id
2. Verify membership via `requireMembership(existingExpense.organizationId, "MEMBER")`
3. Prevent organizationId changes (stripped from updateData)
4. Update expense record
5. Create audit log entry

#### DELETE (`DELETE /api/expenses/[id]`)
1. Load existing expense by id
2. Verify membership via `requireMembership(expense.organizationId, "MEMBER")`
3. **Currently hard deletes** expense and receipts (S3 deletion not implemented)
4. Create audit log entry

### Receipt Upload Flow

1. **Get Upload URL** (`POST /api/receipts/upload-url`)
   - Client provides expenseId, filename, mimeType, size
   - Server validates expense exists and user has access
   - Generates S3 presigned URL with unique key
   - Returns uploadUrl + key

2. **Confirm Receipt** (`POST /api/receipts`)
   - Client uploads file to S3 using presigned URL
   - Client calls this endpoint with expenseId, key, filename, mimeType, size
   - Server creates Receipt record linked to expense

## Integration Strategy

### Phase 1: Schema Extension
- Add ledger models (Account, LedgerTransaction, LedgerPosting, LedgerAttachmentLink, LedgerPeriodLock)
- Add `ledgerTransactionId` nullable field to Expense model
- Add `deletedAt` nullable field to Expense for soft deletes
- Run migration

### Phase 2: Ledger Service Layer
- Create `/lib/ledger/ledgerService.ts` (server-only)
- Implement account management (ensureDefaultAccounts)
- Implement transaction creation with double-entry postings
- Implement transaction reversal
- Implement period locking

### Phase 3: Expense CRUD Integration
- **CREATE**: Generate idempotencyKey, create ledger transaction, link to expense
- **UPDATE**: Reverse old transaction, create new transaction, update expense.ledgerTransactionId
- **DELETE**: Reverse transaction, set deletedAt, keep receipts

### Phase 4: Backfill
- Script to migrate existing expenses to ledger
- Deterministic idempotencyKey: `backfill:expense:${expense.id}`
- Link existing receipts via LedgerAttachmentLink

### Phase 5: Reports Migration
- Create ledger-derived report queries
- Add feature flag `LEDGER_REPORTS_ENABLED`
- Parallel implementation until parity confirmed

### Phase 6: Testing & Validation
- Self-test script for ledger invariants
- Verify DR==CR on all transactions
- Verify org scoping on all queries

## Security Considerations

- All ledger operations must validate organizationId matches caller's membership
- IdempotencyKey must be unique per organization
- Period locks prevent modifications to closed periods
- All queries scoped by organizationId

## Non-Breaking Changes

- Existing Expense model remains unchanged (additive fields only)
- UI flows remain identical
- API contracts unchanged
- Backward compatible: expenses without ledgerTransactionId still work

