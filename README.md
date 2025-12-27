# Ledgr

A production-ready multi-tenant expense tracking application built with Next.js 14, TypeScript, Prisma, and PostgreSQL. Ledgr provides an expense-first user experience backed by a double-entry ledger system for accurate financial reporting and audit trails.

## Features

- **Multi-tenant Architecture** - Complete organization isolation with role-based access control (OWNER/ADMIN/MEMBER/VIEWER)
- **Expense Management** - Full CRUD operations for expenses with categories, vendors, and dates
- **Double-Entry Ledger** - Every expense creates ledger transactions with balanced DR/CR postings
- **Receipt Attachments** - Upload and manage receipt files using S3 presigned URLs
- **Reports & Analytics** - View expense totals grouped by month, category, or vendor (ledger-derived)
- **CSV Export** - Export filtered expense data to CSV
- **Audit Logging** - Track key actions across the application
- **Input Validation** - Zod schema validation on all server inputs
- **Security** - Server-side authorization with organization-scoped queries to prevent IDOR attacks
- **Modern UI** - Built with Tailwind CSS and shadcn/ui components

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **Database:** PostgreSQL (Neon)
- **ORM:** Prisma
- **Authentication:** NextAuth.js (Email + Google OAuth)
- **File Storage:** AWS S3 (presigned uploads)
- **Email:** Resend

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL database (recommend [Neon](https://neon.tech) for serverless Postgres)
- AWS S3 bucket (for receipt storage)
- Google OAuth credentials (optional, for Google sign-in)
- Resend API key (optional, for email sign-in)

## Getting Started

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd Ledgr
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Copy the `.env.example` file to `.env` and fill in your values:

```bash
cp .env.example .env
```

**Required environment variables:**

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/ledgr?schema=public"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here-generate-with-openssl-rand-base64-32"

# OAuth - Google (optional)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# Email - Resend (optional, required for email sign-in)
RESEND_API_KEY=""
EMAIL_FROM="noreply@example.com"

# AWS S3 (required for receipt uploads)
AWS_REGION="us-east-1"
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
AWS_S3_BUCKET_NAME=""

# App
APP_URL="http://localhost:3000"
```

**Generate NEXTAUTH_SECRET:**

```bash
openssl rand -base64 32
```

### 4. Set up the database

```bash
# Generate Prisma Client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed the database with demo data
npm run db:seed

# Backfill existing expenses into ledger (if you have existing data)
npm run db:backfill-ledger
```

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 6. Sign in

Use the demo account created by the seed script:
- **Email:** `demo@ledgr.app`
- **Password:** (Use email sign-in link)

Or sign in with Google if you've configured OAuth credentials.

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run db:generate` - Generate Prisma Client
- `npm run db:migrate` - Run database migrations
- `npm run db:seed` - Seed database with demo data
- `npm run db:studio` - Open Prisma Studio
- `npm run db:backfill-ledger` - Backfill existing expenses into ledger tables
- `npm run test:ledger` - Run ledger self-test to verify ledger functionality

## Project Structure

```
ledgr/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── auth/         # NextAuth routes
│   │   ├── expenses/     # Expense CRUD
│   │   ├── receipts/     # Receipt upload/download
│   │   ├── reports/      # Reports API
│   │   └── organizations/# Organization management
│   ├── auth/             # Auth pages
│   ├── dashboard/        # Dashboard page
│   ├── expenses/         # Expenses page
│   └── reports/          # Reports page
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   ├── expenses/         # Expense-related components
│   ├── reports/          # Report components
│   └── layout/           # Layout components
├── lib/                  # Utility functions
│   ├── auth.ts          # NextAuth configuration
│   ├── auth-helpers.ts  # Authorization helpers
│   ├── prisma.ts        # Prisma Client
│   ├── validations.ts   # Zod schemas
│   ├── audit-log.ts     # Audit logging
│   ├── s3.ts            # S3 utilities
│   └── utils.ts         # General utilities
├── prisma/              # Prisma files
│   ├── schema.prisma    # Database schema
│   └── seed.ts          # Seed script
└── types/               # TypeScript types
```

## Database Schema

The application uses the following main models:

- **User** - Application users
- **Organization** - Multi-tenant organizations
- **Membership** - User-organization relationships with roles
- **Expense** - Expense records (linked to ledger transactions)
- **Receipt** - Receipt attachments (linked to expenses)
- **AuditLog** - Audit trail of actions

### Ledger Models

- **LedgerAccount** - Chart of accounts (ASSET, LIABILITY, EQUITY, INCOME, EXPENSE)
- **LedgerTransaction** - Double-entry transactions with idempotency keys
- **LedgerPosting** - Individual DR/CR postings that make up transactions
- **LedgerAttachmentLink** - Links receipts to ledger transactions
- **LedgerPeriodLock** - Locks accounting periods to prevent modifications

## Ledger System

Ledgr uses a double-entry ledger system where every expense operation creates balanced ledger transactions:

- **Expense Create:** Creates a ledger transaction with DR (expense account) and CR (cash account) postings
- **Expense Update:** Reverses the original transaction and creates a new one with updated values (supersede pattern)
- **Expense Delete:** Reverses the transaction and soft-deletes the expense (no hard deletes in ledger)
- **Append-Only:** Ledger tables are append-only; corrections are made via reversals, not edits
- **Idempotency:** All ledger transactions use idempotency keys to prevent duplicates
- **Period Locking:** Accounting periods can be locked to prevent modifications

### Reports

Reports can be generated from either expense records (legacy) or ledger transactions (recommended). Enable ledger-derived reports by setting:

```env
LEDGER_REPORTS_ENABLED=true
```

Ledger-derived reports provide:
- Deterministic results based on transaction history
- Automatic exclusion of reversed transactions
- Accurate totals that match the ledger balance

### Backfilling Existing Data

If you have existing expenses before enabling the ledger system, run:

```bash
npm run db:backfill-ledger
```

This script:
- Creates default accounts (Cash, Uncategorized Expense) for each organization
- Creates ledger transactions for all existing expenses
- Links receipts to ledger transactions
- Uses deterministic idempotency keys (`backfill:expense:${expenseId}`) so it's safe to rerun

## Security Features

- **Organization Isolation:** All queries are scoped by `organizationId` to prevent cross-tenant data access
- **Role-Based Access Control:** OWNER, ADMIN, MEMBER, VIEWER roles with appropriate permissions
- **Input Validation:** All API inputs validated with Zod schemas
- **Authorization Checks:** Server-side authorization on all routes
- **IDOR Prevention:** Requests always include organizationId and membership is verified
- **Period Locking:** Prevents modifications to locked accounting periods

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

For issues and questions, please open an issue on GitHub.

