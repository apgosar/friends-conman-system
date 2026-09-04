# 🚀 Google Cloud Run Deployment Guide for Neev CMS

**Application**: Neev CMS (Property Developer Sales & Document Management System)  
**Target Environment**: Google Cloud Run (Serverless Container)  
**Region**: `asia-south1` (Mumbai, India)  
**Project ID**: `neev-cms` (Customizable)  
**Database**: Supabase PostgreSQL (Managed Postgres with PgBouncer Pooling)  
**Document Storage**: Google Cloud Storage (`gs://neev-cms-docs`)  

---

## 1. Quick Start Deployment (3 Steps)

### Step 1: Create your `.env.production`
Copy `.env.production.example` to `.env.production` and paste your Supabase connection string:

```powershell
Copy-Item .env.production.example .env.production
```

Open `.env.production` and enter your Supabase connection string in `DATABASE_URL`.

---

### Step 2: Run the Deployment Script

```powershell
.\deploy-cloudrun.ps1
```

*(Optional custom parameters)*:
```powershell
.\deploy-cloudrun.ps1 -ProjectId "neev-cms" -Region "asia-south1" -BucketName "neev-cms-docs"
```

The script will automatically:
1. Enable all required GCP APIs (Cloud Run, Cloud Build, Artifact Registry, Storage).
2. Create and configure your private Google Cloud Storage bucket (`gs://neev-cms-docs`).
3. Build the Linux production container on Google Cloud Build.
4. Deploy to Cloud Run with `2Gi` RAM, `1` CPU, `min-instances 0` (scale-to-zero), and `max-instances 5`.
5. Sync the assigned Cloud Run URL with `NEXTAUTH_URL` and `APP_URL`.

---

### Step 3: Run Database Migrations on Supabase
From your local terminal, apply the Prisma schema to Supabase:

```powershell
$env:DATABASE_URL="your-supabase-connection-string"
npx prisma migrate deploy
```

*(Optional) Seed the database with initial users & data:*
```powershell
npx prisma db seed
```

---

## 2. Cost Analysis & Resource Settings

* **Cloud Run Scale-to-Zero**: When no requests are being processed, instances scale to `0`, incurring **$0.00** idle costs.
* **Memory & CPU**: Configured with `2Gi` RAM and `1` CPU core, which is optimal for running Chromium/Puppeteer for high-quality PDF demand letters and receipts.
* **Estimated Monthly Cost**: **$0.00 - $1.00** within standard usage and Google Cloud / Supabase free tiers.
