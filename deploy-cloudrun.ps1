<#
.SYNOPSIS
    Deploys Neev CMS (friends-conman-system) to Google Cloud Run with Google Cloud Storage and Supabase.

.DESCRIPTION
    This script automates:
    1. Verification of gcloud CLI and authentication
    2. GCP Project and Region configuration
    3. Enabling required GCP APIs (Cloud Run, Cloud Build, Artifact Registry, Cloud Storage)
    4. Creation and IAM setup of Google Cloud Storage bucket for document storage
    5. Creation of Google Artifact Registry Docker repository
    6. Parsing production environment variables from .env.production
    7. Building the production container on Cloud Build (no local Docker required)
    8. Deploying to Google Cloud Run with production-tuned settings (Puppeteer-friendly memory & CPU, scale-to-zero)
    9. Automatically updating NEXTAUTH_URL and APP_URL with the assigned Cloud Run URL

.PARAMETER ProjectId
    GCP Project ID (default: "neev-cms")

.PARAMETER Region
    GCP Region (default: "asia-south1")

.PARAMETER ServiceName
    Cloud Run service name (default: "neev-cms")

.PARAMETER BucketName
    GCS bucket name for uploaded KYC files & generated PDFs (default: "neev-cms-docs")

.PARAMETER EnvFile
    Path to production environment variables file (default: ".env.production")

.PARAMETER Memory
    Memory allocated to Cloud Run instance (default: "2Gi" - recommended for Chromium/Puppeteer PDF generation)

.PARAMETER Cpu
    CPU cores allocated to Cloud Run instance (default: "1")

.PARAMETER MinInstances
    Minimum instances for Cloud Run (default: "0" for cost-effective scale-to-zero)

.PARAMETER MaxInstances
    Maximum instances for Cloud Run (default: "5" to prevent unexpected costs)

.EXAMPLE
    .\deploy-cloudrun.ps1

.EXAMPLE
    .\deploy-cloudrun.ps1 -ProjectId "my-custom-project-id" -Region "asia-south1"
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$ProjectId = "neev-cms",

    [Parameter(Position = 1)]
    [string]$Region = "asia-south1",

    [Parameter(Position = 2)]
    [string]$ServiceName = "neev-cms",

    [Parameter(Position = 3)]
    [string]$BucketName = "neev-cms-docs",

    [Parameter()]
    [string]$EnvFile = ".env.production",

    [Parameter()]
    [string]$Memory = "2Gi",

    [Parameter()]
    [string]$Cpu = "1",

    [Parameter()]
    [int]$MinInstances = 0,

    [Parameter()]
    [int]$MaxInstances = 5,

    [Parameter()]
    [int]$Timeout = 300
)

# Set error handling preference
$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "`n========================================================" -ForegroundColor Cyan
    Write-Host " [STEP] $Message" -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Cyan
}

function Write-Info {
    param([string]$Message)
    Write-Host " [INFO] $Message" -ForegroundColor Yellow
}

function Write-Success {
    param([string]$Message)
    Write-Host " [SUCCESS] $Message" -ForegroundColor Green
}

function Write-ErrorMsg {
    param([string]$Message)
    Write-Host " [ERROR] $Message" -ForegroundColor Red
}

try {
    # ── 1. Check Prerequisites ────────────────────────────────────
    Write-Step "Checking prerequisites (Google Cloud SDK)"

    if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
        Write-ErrorMsg "Google Cloud SDK ('gcloud') is not found in your PATH."
        Write-Host "Please install it from: https://cloud.google.com/sdk/docs/install" -ForegroundColor Yellow
        exit 1
    }

    $activeAccount = gcloud config get-value account 2>$null
    if ([string]::IsNullOrWhiteSpace($activeAccount) -or $activeAccount -eq "(unset)") {
        Write-Info "No active gcloud authentication detected. Launching login..."
        gcloud auth login
    } else {
        Write-Info "Authenticated as: $activeAccount"
    }

    # ── 2. Configure GCP Project & Region ────────────────────────
    Write-Step "Configuring GCP Project: $ProjectId in Region: $Region"

    # Verify project exists or prompt user
    $projectCheck = gcloud projects describe $ProjectId --format="value(projectId)" 2>$null
    if (-not $projectCheck) {
        Write-Info "Project '$ProjectId' was not found or you may not have access."
        $confirmCreate = Read-Host "Would you like to try creating project '$ProjectId'? (y/n)"
        if ($confirmCreate -eq 'y' -or $confirmCreate -eq 'Y') {
            gcloud projects create $ProjectId --name="Neev CMS"
        } else {
            $ProjectId = Read-Host "Enter your existing GCP Project ID"
            if ([string]::IsNullOrWhiteSpace($ProjectId)) {
                Write-ErrorMsg "Project ID cannot be empty."
                exit 1
            }
        }
    }

    gcloud config set project $ProjectId
    gcloud config set run/region $Region

    # Get Project Number for IAM permissions
    $ProjectNumber = gcloud projects describe $ProjectId --format="value(projectNumber)"
    Write-Info "Project Number: $ProjectNumber"

    # ── 3. Enable Required GCP Services ──────────────────────────
    Write-Step "Enabling required GCP APIs (Cloud Run, Cloud Build, Artifact Registry, Storage)"

    $apis = @(
        "run.googleapis.com",
        "cloudbuild.googleapis.com",
        "artifactregistry.googleapis.com",
        "storage.googleapis.com"
    )

    foreach ($api in $apis) {
        Write-Info "Enabling $api..."
        gcloud services enable $api --project=$ProjectId
    }
    Write-Success "APIs enabled successfully."

    # ── 4. Create & Configure GCS Storage Bucket ─────────────────
    Write-Step "Setting up Google Cloud Storage Bucket: gs://$BucketName"

    $bucketCheck = cmd /c "gcloud storage buckets describe gs://$BucketName --project=$ProjectId 2>&1"
    if ($LASTEXITCODE -ne 0) {
        Write-Info "Bucket gs://$BucketName not found. Creating in $Region..."
        $createOut = cmd /c "gcloud storage buckets create gs://$BucketName --location=$Region --uniform-bucket-level-access --project=$ProjectId 2>&1"
        if ($LASTEXITCODE -ne 0) {
            Write-Info "Bucket name '$BucketName' might be globally taken. Trying 'gs://$BucketName-$ProjectId'..."
            $BucketName = "$BucketName-$ProjectId"
            cmd /c "gcloud storage buckets create gs://$BucketName --location=$Region --uniform-bucket-level-access --project=$ProjectId"
        }
    } else {
        Write-Info "GCS Bucket gs://$BucketName already exists."
    }

    # Grant Cloud Run default compute service account access to the GCS bucket
    $computeServiceAccount = "$ProjectNumber-compute@developer.gserviceaccount.com"
    Write-Info "Granting Storage Object Admin permission to Compute Service Account: $computeServiceAccount"
    cmd /c "gcloud storage buckets add-iam-policy-binding gs://$BucketName --member=serviceAccount:$computeServiceAccount --role=roles/storage.objectAdmin --project=$ProjectId"

    Write-Success "Storage Bucket configured."

    # ── 5. Set up Artifact Registry Repository ───────────────────
    Write-Step "Setting up Artifact Registry Docker repository"

    $repoName = "cloud-run-source-deploy"
    $repoCheck = cmd /c "gcloud artifacts repositories describe $repoName --location=$Region --project=$ProjectId 2>&1"
    if ($LASTEXITCODE -ne 0) {
        Write-Info "Creating Artifact Registry repository '$repoName'..."
        cmd /c "gcloud artifacts repositories create $repoName --repository-format=docker --location=$Region --description=""Docker repository for Cloud Run deployments"" --project=$ProjectId"
    } else {
        Write-Info "Artifact Registry repository '$repoName' already exists."
    }

    # ── 6. Parse Environment Variables ───────────────────────────
    Write-Step "Loading Environment Variables"

    $envMap = @{}
    $envMap["NODE_ENV"] = "production"
    $envMap["GCS_BUCKET_NAME"] = $BucketName

    if (Test-Path $EnvFile) {
        Write-Info "Loading variables from $EnvFile..."
        Get-Content $EnvFile | ForEach-Object {
            $line = $_.Trim()
            if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
                $idx = $line.IndexOf("=")
                $key = $line.Substring(0, $idx).Trim()
                $val = $line.Substring($idx + 1).Trim().Trim('"').Trim("'")
                if ($key -and $val) {
                    $envMap[$key] = $val
                }
            }
        }
    } else {
        Write-Info "$EnvFile not found."
        Write-Info "Checking for interactive inputs for critical secrets..."

        # DATABASE_URL
        $dbUrl = Read-Host "Enter your Supabase PostgreSQL DATABASE_URL"
        while ([string]::IsNullOrWhiteSpace($dbUrl)) {
            $dbUrl = Read-Host "DATABASE_URL is required. Enter Supabase DATABASE_URL"
        }
        $envMap["DATABASE_URL"] = $dbUrl

        # NEXTAUTH_SECRET
        $authSecret = Read-Host "Enter NEXTAUTH_SECRET (press Enter to auto-generate a secure random 32-byte secret)"
        if ([string]::IsNullOrWhiteSpace($authSecret)) {
            $bytes = New-Object byte[] 32
            (New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes($bytes)
            $authSecret = [Convert]::ToBase64String($bytes)
            Write-Info "Generated secure NEXTAUTH_SECRET: $authSecret"
        }
        $envMap["NEXTAUTH_SECRET"] = $authSecret
    }

    # Ensure required variables exist
    if (-not $envMap.ContainsKey("DATABASE_URL")) {
        $dbUrl = Read-Host "Enter your Supabase PostgreSQL DATABASE_URL"
        $envMap["DATABASE_URL"] = $dbUrl
    }

    if (-not $envMap.ContainsKey("NEXTAUTH_SECRET")) {
        $bytes = New-Object byte[] 32
        (New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes($bytes)
        $envMap["NEXTAUTH_SECRET"] = [Convert]::ToBase64String($bytes)
    }

    # Default temporary URLs if not present (will be updated after first deploy)
    if (-not $envMap.ContainsKey("NEXTAUTH_URL")) {
        $envMap["NEXTAUTH_URL"] = "https://$ServiceName-$Region.a.run.app"
    }
    if (-not $envMap.ContainsKey("APP_URL")) {
        $envMap["APP_URL"] = $envMap["NEXTAUTH_URL"]
    }

    # Format into temporary YAML file for gcloud --env-vars-file
    # This cleanly handles long tokens (e.g. WhatsApp access token) and special characters
    $yamlPath = Join-Path $PSScriptRoot ".env.cloudrun.yaml"
    $yamlLines = @()
    foreach ($k in $envMap.Keys) {
        $v = [string]$envMap[$k]
        $escV = $v.Replace('\', '\\').Replace('"', '\"')
        $yamlLines += "$k`: `"$escV`""
    }
    $yamlLines | Set-Content -Path $yamlPath -Encoding UTF8

    # ── 7. Build Container Image with Cloud Build ────────────────
    Write-Step "Building Container Image using Google Cloud Build"

    $imageTag = "$Region-docker.pkg.dev/$ProjectId/$repoName/${ServiceName}:latest"
    Write-Info "Target Image: $imageTag"
    Write-Info "Submitting build to Google Cloud Build (runs remotely, no local Docker needed)..."

    gcloud builds submit --tag $imageTag --project=$ProjectId
    if ($LASTEXITCODE -ne 0) {
        throw "Google Cloud Build failed with exit code $LASTEXITCODE. Check build logs for details."
    }

    Write-Success "Container image built and pushed to Artifact Registry."

    # ── 8. Deploy to Cloud Run ────────────────────────────────────
    Write-Step "Deploying to Google Cloud Run"

    Write-Info "Service: $ServiceName"
    Write-Info "Memory: $Memory | CPU: $Cpu | Min: $MinInstances | Max: $MaxInstances"

    gcloud run deploy $ServiceName `
        --image $imageTag `
        --region $Region `
        --platform managed `
        --allow-unauthenticated `
        --memory $Memory `
        --cpu $Cpu `
        --min-instances $MinInstances `
        --max-instances $MaxInstances `
        --timeout $Timeout `
        --execution-environment gen2 `
        --env-vars-file $yamlPath `
        --project=$ProjectId

    # Clean up temporary YAML file
    if (Test-Path $yamlPath) {
        Remove-Item $yamlPath -Force -ErrorAction SilentlyContinue
    }

    # ── 9. Fetch Live URL and Finalize Configuration ────────────
    Write-Step "Finalizing Deployment"

    $serviceUrl = gcloud run services describe $ServiceName --region $Region --project=$ProjectId --format="value(status.url)"

    Write-Info "Assigned Cloud Run URL: $serviceUrl"

    # If the NEXTAUTH_URL was a placeholder or differed from actual URL, update it
    if ($envMap["NEXTAUTH_URL"] -ne $serviceUrl -or $envMap["APP_URL"] -ne $serviceUrl) {
        Write-Info "Updating NEXTAUTH_URL and APP_URL environment variables to match $serviceUrl..."
        gcloud run services update $ServiceName `
            --region $Region `
            --update-env-vars "NEXTAUTH_URL=$serviceUrl,APP_URL=$serviceUrl" `
            --project=$ProjectId
    }

    Write-Host "`n========================================================" -ForegroundColor Cyan
    Write-Host " 🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!" -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host "`n Application URL: $serviceUrl" -ForegroundColor Yellow
    Write-Host " Health Check:    $serviceUrl/api/health" -ForegroundColor Yellow
    Write-Host " GCS Bucket:      gs://$BucketName" -ForegroundColor Yellow
    Write-Host " Region:          $Region" -ForegroundColor Yellow

    Write-Host "`n Next Steps:" -ForegroundColor Cyan
    Write-Host " 1. Ensure your database tables are created on Supabase by running:" -ForegroundColor White
    Write-Host "    `$env:DATABASE_URL=`"$($envMap['DATABASE_URL'])`"; npx prisma migrate deploy" -ForegroundColor Gray
    Write-Host " 2. (Optional) Seed the database with initial admin user & test data:" -ForegroundColor White
    Write-Host "    `$env:DATABASE_URL=`"$($envMap['DATABASE_URL'])`"; npx prisma db seed" -ForegroundColor Gray
    Write-Host " 3. Open $serviceUrl in your browser to sign in." -ForegroundColor White
    Write-Host ""

} catch {
    Write-ErrorMsg "Deployment failed: $_"
    Write-Host "Check the logs above for specific error details." -ForegroundColor Yellow
    exit 1
}
