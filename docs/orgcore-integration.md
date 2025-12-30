# OrgCore Integration Summary

## Overview

OrgCore is an internal module (`/src/core/org/`) that centralizes organization and membership management, ensuring all features are organization-safe by default.

## Key Changes

### 1. Prisma Schema Updates

- Added `User.activeOrgId` field (nullable String, indexed)
- This stores the user's currently active organization

### 2. OrgCore Module Structure

Created `/src/core/org/` with:

- **roles.ts**: Role definitions (OWNER/ADMIN/MEMBER/VIEWER) and hierarchy helpers
- **types.ts**: Actor and OrgContext type definitions
- **prisma.ts**: Prisma client re-export
- **membership.ts**: Membership verification helpers
- **activeOrg.ts**: Active organization management
- **guards.ts**: Authentication guards (requireSessionUser, requireActor)
- **scope.ts**: Query scoping helpers for safe multi-tenant queries
- **audit.ts**: Audit logging using Actor pattern
- **index.ts**: Module exports

### 3. Expenses CRUD Refactoring

All expense routes now:
- Use `requireActor(minRole)` instead of `requireMembership(orgId, role)`
- Never accept `organizationId` from client requests
- Use scoped query helpers (`orgFindManyExpense`, `orgFindUniqueExpense`)
- Use `writeAudit(actor, ...)` for audit logging

**Before:**
```typescript
const organizationId = searchParams.get("organizationId") // ❌ Client-provided
const { user } = await requireMembership(organizationId, "VIEWER")
const expenses = await prisma.expense.findMany({
  where: { organizationId }, // Manual scoping
})
```

**After:**
```typescript
const actor = await requireActor("VIEWER") // ✅ Server-derived
const expenses = await orgFindManyExpense(actor.orgId, {
  where: { deletedAt: null }, // Auto-scoped
})
```

### 4. Organization Switch Endpoint

Created `/app/api/org/switch/route.ts`:
- `POST /api/org/switch` with `{ orgId: string }` body
- Validates membership before switching
- Updates `User.activeOrgId`

### 5. Validation Schema Updates

- `expenseSchema`: Removed `organizationId` (comes from OrgCore)
- `expenseUpdateSchema`: Removed `organizationId` (comes from OrgCore)

## Security Improvements

1. **No Client-Provided OrgId**: All organization IDs are derived from the user's active organization
2. **Automatic Scoping**: Query helpers ensure `organizationId` is always in WHERE clauses
3. **Role Enforcement**: `requireActor()` enforces minimum role requirements
4. **Membership Verification**: All org operations verify membership before proceeding

## Migration Required

Run the following to add the `activeOrgId` field:

```bash
npm run db:migrate
```

This will create a migration adding `activeOrgId` to the User model.

## Testing

Run the self-test script:

```bash
npm run test:orgcore
```

This verifies:
- Organization listing
- Active org selection
- Role hierarchy
- Permission enforcement

## Next Steps for Other Features

To refactor other features to use OrgCore:

1. Replace `requireMembership(orgId, role)` with `requireActor(role)`
2. Replace manual `organizationId` in queries with scoped helpers
3. Replace `createAuditLog({ organizationId, userId, ... })` with `writeAudit({ actor, ... })`
4. Remove `organizationId` from client-facing validation schemas

