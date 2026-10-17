# Friends Conman System

A comprehensive Real Estate Construction & Sales Management platform built for modern builders. This system orchestrates the entire lifecycle of real estate development—from managing building architecture and units, to handling complex payment schedules, AI-powered KYC verification, and dynamic PDF document generation.

## 🌟 Key Features

### 🏢 Project & Inventory Management
* **Complex Hierarchies**: Easily define Projects, Buildings, Wings, Floors, and individual Units (Flats, Shops, etc.).
* **Unit Tracking**: Track the real-time status of every unit (Available, Booked, Sold, Blocked) along with carpet area, configurations, and parking spaces.
* **Construction Milestones**: Map out construction phases (e.g., "Plinth Level", "First Slab") and link them directly to automated customer payment demands.

### 💰 Financials & Payment Schedules
* **Dynamic Payment Plans**: Generate customized payment schedules based on a percentage of the total Agreement Value linked to construction milestones.
* **Payment Recording**: Securely record payments (NEFT, UPI, Cheque), automatically calculating the split between Principal and GST.
* **Interest & Aging**: Built-in calculations for simple interest on overdue payments, along with a dashboard breaking down aging buckets (Overdue 7 days, 15 days, 30+ days).
* **Automated Receipts**: Instantly generate and log PDF receipts the second a payment is recorded.

### 📄 Document Engine & Templating
* **Dynamic PDF & DOCX Generation**: Built-in headless document engine (using Puppeteer) to generate pixel-perfect PDFs on the fly.
* **Custom Templates**: Upload custom HTML or DOCX templates with placeholder variables (e.g., `{{buyer1Name}}`, `{{receipt.amount}}`).
* **Automated Letters**: Trigger the generation of **Quotes**, **Demand Letters**, and **Receipts** without manual data entry.

### 📬 Communication Log
* **Centralized Audit Trail**: A unified timeline tracking every automated message, Demand Letter, or Receipt sent to a buyer.
* **Smart Parsing**: Automatically parses milestone completions and metadata tags to give admins a clean, readable overview of all outbound communications.
* **Omnichannel Ready**: Designed to support Email and WhatsApp channels out-of-the-box.

### 🆔 AI-Powered KYC Verification
* **OCR Extraction**: Automatically extracts details from uploaded PAN and Aadhaar cards using Tesseract OCR.
* **Verification Workflow**: Review extracted text against user inputs to securely approve or reject KYC documents.

## 🛠️ Tech Stack

* **Framework**: [Next.js 15](https://nextjs.org/) (App Router)
* **Language**: TypeScript
* **Database**: PostgreSQL (managed via [Prisma ORM](https://www.prisma.io/))
* **Styling**: Vanilla CSS (CSS Modules & Global CSS Variables for strict design system enforcement)
* **Authentication**: NextAuth.js
* **Document Generation**: Puppeteer (HTML to PDF) / Docxtemplater (DOCX generation)
* **OCR**: Tesseract.js

## 🚀 Getting Started

### Prerequisites
* Node.js (v18+)
* PostgreSQL Database

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/apgosar/friends-conman-system.git
   cd friends-conman-system
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Environment Variables**
   Create a `.env` file in the root directory based on `.env.example`:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/friends_db"
   NEXTAUTH_SECRET="your-secret-key"
   NEXTAUTH_URL="http://localhost:3000"
   # Encrypts buyers' PAN and Aadhaar numbers. Optional for local development, REQUIRED in production.
   # Generate with `openssl rand -base64 32` and back it up apart from the database (without it those numbers cannot be read).
   PII_ENCRYPTION_KEY="..."
   ```
   Upgrading a database that already holds buyers? Run `npm run db:encrypt-pii` once after setting the key (safe to repeat).

4. **Initialize Database**
   ```bash
   npx prisma generate
   npx prisma migrate deploy   # creates the tables and applies every migration
   # Optional: Run seeders to populate initial data
   # npx tsx prisma/seed.ts
   ```

5. **Start the Development Server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser. The demo seed creates `admin@friends.com` and prints a generated password once (set `SEED_PASSWORD` to choose it); there is no default password.

## 🎨 UI / UX Philosophy

The application features a sleek, premium, dark-mode optimized aesthetic. Key design choices include:
* **Glassmorphism**: Subtle blurs (`backdrop-filter`) and semi-transparent overlays on Modals and Sidebars.
* **Strict Design Tokens**: All colors, shadows, and radiuses map to CSS Variables (e.g., `var(--bg-card)`) ensuring 100% consistency across 50+ components.
* **Data-Dense but Clean**: Tables and forms maximize screen real estate while maintaining distinct visual hierarchies for financial data.


## Testing and quality gate

```bash
npm run typecheck     # TypeScript
npm run lint          # ESLint (warnings are tracked and may not increase: see lint:ci)
npm test              # unit tests; integration tests are skipped without a database
```

The integration tests run against a real PostgreSQL and **empty its tables**, so give them a disposable database:

```bash
createdb neev_test
TEST_DATABASE_URL=postgresql://localhost:5432/neev_test npm test     # applies the migrations, then runs everything
```

CI (`.github/workflows/ci.yml`) runs the same checks plus a migrations-vs-schema drift check and a production build.
`deploy.yml` and `release-onprem.yml` call it first, so a failing commit is never deployed or released.

### Database changes

Schema changes are Prisma migrations (`prisma/migrations`), not `db push`.

```bash
npx prisma migrate dev --name what_changed   # edit schema.prisma first; commit the generated folder
```

Never edit a migration that has already shipped. Things `schema.prisma` cannot express (partial unique indexes,
CHECK constraints) go in the migration SQL, as in `20261017000000_hardening`.
Existing databases created by the old `db push` are baselined automatically by the on-prem updater
(`prisma migrate resolve --applied 0_init`); on Cloud Run run that once by hand (`npm run db:baseline`) before the first `npm run db:deploy`.
