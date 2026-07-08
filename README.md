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
   ```

4. **Initialize Database**
   ```bash
   npx prisma generate
   npx prisma db push
   # Optional: Run seeders to populate initial data
   # npx tsx prisma/seed.ts
   ```

5. **Start the Development Server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser. Default login: `admin@friends.com` / `Admin@123`

## 🎨 UI / UX Philosophy

The application features a sleek, premium, dark-mode optimized aesthetic. Key design choices include:
* **Glassmorphism**: Subtle blurs (`backdrop-filter`) and semi-transparent overlays on Modals and Sidebars.
* **Strict Design Tokens**: All colors, shadows, and radiuses map to CSS Variables (e.g., `var(--bg-card)`) ensuring 100% consistency across 50+ components.
* **Data-Dense but Clean**: Tables and forms maximize screen real estate while maintaining distinct visual hierarchies for financial data.
