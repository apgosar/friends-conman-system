# Neev CMS on Google Cloud

**Branch**: `claude/google-ai-ocr-integration-8c2685` (the Google stack; `main` is unchanged and still uses AZAPI + Supabase)
**Region**: `asia-south1` (Mumbai)

| Layer | Google service | How the app reaches it |
|---|---|---|
| App | **Cloud Run** (container built by **Cloud Build**, stored in **Artifact Registry**) | `deploy-cloudrun.ps1` |
| Database | **Cloud SQL for PostgreSQL 16** (daily backups, point-in-time recovery, deletion protection) | Unix socket `/cloudsql/<connection name>` mounted by Cloud Run (IAM-authenticated). The instance keeps Google's default public IP but no network is allow-listed, so nothing can connect to it directly |
| Documents (KYC files, PDFs) | **Cloud Storage** bucket, private, uniform access, public access prevented | `src/lib/storage/gcs-adapter.ts` through the service account; files are served by `/api/files/...` behind login |
| Document reading | **Gemini on Vertex AI** (`gemini-3.5-flash`) | `src/lib/google-ai.ts` and `src/lib/kyc-extract.ts`; the service account has the *Vertex AI User* role: no API key |
| Secrets | **Secret Manager** | Mounted as environment variables at start-up; the service account can read only its own secrets |
| Daily job (interest, overdue, reminders) | **Cloud Scheduler** → `POST /api/cron/daily` at 09:00 IST | Bearer `CRON_SECRET` |
| Migrations | **Cloud Run job** (same image) running `prisma migrate deploy` | Same Cloud SQL socket |
| Logs | **Cloud Logging** | `pino` writes JSON with a `severity` field, which Cloud Logging reads as the log level |

## Deploy (one command, safe to repeat)

Prerequisites: the [Google Cloud SDK](https://cloud.google.com/sdk/docs/install), a Google Cloud project with billing linked.

```powershell
Copy-Item .env.production.example .env.production   # optional: company name, email, WhatsApp
.\deploy-cloudrun.ps1 -ProjectId <your-project-id> -MinInstances 1 -Seed
```

It enables the APIs, creates the service account, bucket, Cloud SQL instance, database and secrets, builds the image, runs the migrations, deploys the service and creates the Scheduler job. The first run takes 15 to 20 minutes (Cloud SQL creation and the first build). Later runs take a few minutes: `-SkipBuild` when only configuration changed.

- `-Seed` loads the demo users and data (a new database has no users). It prints a generated password once; read it in the seed job's log, whose link the script prints. Do not seed a customer's real database.
- `-MinInstances 1` keeps one instance warm so a demo never waits for a cold start (a few hundred rupees a month more).
- **`PII_ENCRYPTION_KEY`** is created once in Secret Manager and never replaced. Back it up apart from the database: `gcloud secrets versions access latest --secret=PII_ENCRYPTION_KEY`. Without it stored PAN and Aadhaar numbers cannot be read.

## Reading PAN and Aadhaar cards with Gemini

`POST /api/extract-kyc` (unchanged for the screen) now works like this:

1. A password-locked PDF is unlocked with the password the person typed (`src/lib/pdf-password.ts`).
2. The photo or PDF goes to Gemini with a strict response schema: `documentMatches`, `fullName`, `number`, `address`. Temperature is 0.
3. The answer is **checked in our code**, never trusted: a PAN must match `AAAAA9999A`; an Aadhaar must be 12 digits that pass the Verhoeff checksum. A value that fails is left empty and returned in `missing`, and the screen asks the person to type it. A wrong document (an Aadhaar uploaded as a PAN) is refused.
4. Staff see and confirm every field before the sale is saved.

Test one document from your machine (after `gcloud auth application-default login` and `GOOGLE_CLOUD_PROJECT` in `.env.local`):

```powershell
npx tsx scripts/test-kyc-read.ts pan "C:\path\to\pan.jpg"
```

The prompts and schema in `src/lib/kyc-extract.ts` are the ones to paste into Google AI Studio when trying a new kind of document.

**Check before relying on it**: that `gemini-3.5-flash` is served in `asia-south1` for your project (Vertex AI → Model Garden), and what Google's data-residency table promises for it. If it is not available there, set `GOOGLE_CLOUD_LOCATION=global` (or another region) and say so honestly in any data-residency claim. The model is `GEMINI_MODEL`; change it without code changes.

## Costs

Scale-to-zero Cloud Run (2 GiB, 1 vCPU, because PDFs are made with Chromium), a `db-g1-small` Cloud SQL instance (the main fixed cost), a private bucket, and Gemini billed per document read (a card is a few thousand tokens). Reading is rate limited to 20 documents per hour per user.

## Not done here, on purpose

- Private IP / VPC for Cloud SQL (the socket connection needs no allow-listed network; add a VPC and turn the public IP off for a stricter posture).
- Custom domain and Cloud Armor in front of Cloud Run.
- On-premise: the `main` branch keeps the on-prem stack. On this branch the on-prem card reader needs a Google service-account key (see `deploy/onprem/DEPLOYMENT-GUIDE.md`) until a local Gemma reader is added.
