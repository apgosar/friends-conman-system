<#
.SYNOPSIS
    Deploys Neev CMS to Google Cloud: Cloud Run + Cloud SQL (PostgreSQL) + Cloud Storage + Vertex AI (Gemini).

.DESCRIPTION
    One command sets up everything in your Google Cloud project, and it is safe to run again (it only creates what is missing):

      1. Checks gcloud, the login, the project and that billing is on
      2. Enables the APIs: Cloud Run, Cloud Build, Artifact Registry, Cloud SQL, Secret Manager, Vertex AI, Cloud Scheduler, Cloud Storage
      3. Creates a service account for the app with only the roles it needs (it signs the calls to Cloud SQL, Storage and Gemini: no keys, no API tokens)
      4. Creates the Cloud Storage bucket for uploaded documents and generated PDFs
      5. Creates the Cloud SQL for PostgreSQL instance, the database and the app's database user
      6. Puts every secret in Secret Manager (database URL, NEXTAUTH_SECRET, CRON_SECRET, PII_ENCRYPTION_KEY, email and WhatsApp secrets)
      7. Builds the container on Cloud Build and deploys it to Cloud Run
      8. Runs the database migrations as a Cloud Run job (and the demo seed with -Seed)
      9. Creates the Cloud Scheduler job that runs the daily interest and reminders job

    PII_ENCRYPTION_KEY is created once and then never replaced: a new key would make every stored PAN and Aadhaar unreadable.

.PARAMETER ProjectId     Google Cloud project id (default "neev-cms")
.PARAMETER Region        Region for everything (default "asia-south1", Mumbai)
.PARAMETER ServiceName   Cloud Run service name (default "neev-cms")
.PARAMETER BucketName    Cloud Storage bucket for documents (default "neev-cms-docs"; the project id is added if the name is taken)
.PARAMETER SqlInstance   Cloud SQL instance name (default "neev-cms-db")
.PARAMETER SqlTier       Cloud SQL machine size (default "db-g1-small"; use "db-custom-2-7680" for more)
.PARAMETER EnvFile       Settings file (default ".env.production", see .env.production.example)
.PARAMETER MinInstances  Keep this many instances warm (default 0 = scale to zero; use 1 for a demo so nobody waits for a cold start)
.PARAMETER Seed          Also load the demo users and data (a new empty database has no users, so nobody could sign in)
.PARAMETER SkipBuild     Reuse the image built last time (only configuration changed)

.EXAMPLE
    .\deploy-cloudrun.ps1 -ProjectId my-project-id -MinInstances 1 -Seed
#>

[CmdletBinding()]
param(
    [string]$ProjectId = "neev-cms",
    [string]$Region = "asia-south1",
    [string]$ServiceName = "neev-cms",
    [string]$BucketName = "neev-cms-docs",
    [string]$SqlInstance = "neev-cms-db",
    [string]$SqlTier = "db-g1-small",
    [string]$DbName = "neev",
    [string]$DbUser = "neev_app",
    [string]$EnvFile = ".env.production",
    [string]$Memory = "2Gi",
    [string]$Cpu = "1",
    [int]$MinInstances = 0,
    [int]$MaxInstances = 5,
    [int]$Timeout = 300,
    [switch]$Seed,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Write-Step { param([string]$Message) Write-Host "`n== $Message" -ForegroundColor Cyan }
function Write-Info { param([string]$Message) Write-Host "   $Message" -ForegroundColor Yellow }
function Write-Ok   { param([string]$Message) Write-Host "   OK  $Message" -ForegroundColor Green }

# Runs gcloud and stops the script when it fails. Only the first words of the command are shown in the error, because some
# commands carry a password in their arguments.
function Invoke-Gcloud {
    & gcloud @args
    if ($LASTEXITCODE -ne 0) { throw "gcloud $(($args | Select-Object -First 3) -join ' ') failed (exit code $LASTEXITCODE)" }
}

# True when the gcloud command succeeds; used to ask "does this exist already?" without printing errors
function Test-Gcloud {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    & gcloud @args *> $null
    $ok = ($LASTEXITCODE -eq 0)
    $ErrorActionPreference = $previous
    return $ok
}

function New-RandomText {
    param([int]$Length = 32)
    $chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    $bytes = New-Object byte[] $Length
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
}

function New-RandomBytes {
    param([int]$Count = 32, [ValidateSet("base64", "hex")][string]$As = "base64")
    $bytes = New-Object byte[] $Count
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    if ($As -eq "hex") { return ([BitConverter]::ToString($bytes) -replace "-", "").ToLower() }
    return [Convert]::ToBase64String($bytes)
}

# Stores a secret's value without a trailing newline (piping a string to gcloud would add one and corrupt the secret)
function Set-SecretValue {
    param([string]$Name, [string]$Value)
    $file = [IO.Path]::GetTempFileName()
    try {
        [IO.File]::WriteAllText($file, $Value, (New-Object Text.UTF8Encoding($false)))
        if (Test-Gcloud secrets describe $Name --project=$ProjectId) {
            Invoke-Gcloud secrets versions add $Name --data-file=$file --project=$ProjectId --quiet
        } else {
            Invoke-Gcloud secrets create $Name --data-file=$file --replication-policy=automatic --project=$ProjectId --quiet
        }
    } finally {
        Remove-Item $file -Force -ErrorAction SilentlyContinue
    }
}

function Test-Secret { param([string]$Name) return (Test-Gcloud secrets describe $Name --project=$ProjectId) }

try {
    # -- 1. gcloud, login, project, billing ---------------------------------
    Write-Step "Checking Google Cloud access"
    if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
        throw "The Google Cloud SDK (gcloud) is not installed. Get it from https://cloud.google.com/sdk/docs/install"
    }
    $account = (& gcloud config get-value account 2>$null)
    if ([string]::IsNullOrWhiteSpace($account) -or $account -eq "(unset)") {
        Invoke-Gcloud auth login
        $account = (& gcloud config get-value account 2>$null)
    }
    Write-Info "Signed in as $account"

    if (-not (Test-Gcloud projects describe $ProjectId)) {
        throw "Project '$ProjectId' was not found, or you have no access to it. Create it at https://console.cloud.google.com/projectcreate and run again with -ProjectId <its id>"
    }
    Invoke-Gcloud config set project $ProjectId --quiet
    Invoke-Gcloud config set run/region $Region --quiet
    $projectNumber = (& gcloud projects describe $ProjectId --format="value(projectNumber)").Trim()

    $billing = (& gcloud billing projects describe $ProjectId --format="value(billingEnabled)" 2>$null)
    if ("$billing".Trim() -ne "True") {
        throw "Billing is not switched on for project '$ProjectId'. Link a billing account (your buildathon credits count) at https://console.cloud.google.com/billing/linkedaccount?project=$ProjectId"
    }
    Write-Ok "Project $ProjectId ($projectNumber), region $Region"

    # -- 2. APIs -------------------------------------------------------------
    Write-Step "Turning on the Google Cloud services"
    Invoke-Gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com `
        sqladmin.googleapis.com secretmanager.googleapis.com aiplatform.googleapis.com cloudscheduler.googleapis.com `
        storage.googleapis.com logging.googleapis.com --project=$ProjectId
    Write-Ok "Services enabled"

    # -- 3. Service accounts -------------------------------------------------
    Write-Step "Service account for the app (no keys: Cloud Run signs every call)"
    $runSa = "neev-cms-run@$ProjectId.iam.gserviceaccount.com"
    if (-not (Test-Gcloud iam service-accounts describe $runSa --project=$ProjectId)) {
        Invoke-Gcloud iam service-accounts create neev-cms-run --display-name="Neev CMS on Cloud Run" --project=$ProjectId
        Start-Sleep -Seconds 10 # a new service account takes a moment to be usable in policies
    }
    foreach ($role in @("roles/cloudsql.client", "roles/aiplatform.user", "roles/logging.logWriter")) {
        Invoke-Gcloud projects add-iam-policy-binding $ProjectId --member="serviceAccount:$runSa" --role=$role --condition=None --quiet | Out-Null
    }
    # Cloud Build runs as the default compute account on new projects and needs these to build and push the image
    $buildSa = "$projectNumber-compute@developer.gserviceaccount.com"
    foreach ($role in @("roles/cloudbuild.builds.builder", "roles/artifactregistry.writer", "roles/storage.objectViewer", "roles/logging.logWriter")) {
        Invoke-Gcloud projects add-iam-policy-binding $ProjectId --member="serviceAccount:$buildSa" --role=$role --condition=None --quiet | Out-Null
    }
    Write-Ok "${runSa}: Cloud SQL Client, Vertex AI User, Logs Writer"

    # -- 4. Cloud Storage ----------------------------------------------------
    Write-Step "Cloud Storage bucket for documents"
    if (-not (Test-Gcloud storage buckets describe "gs://$BucketName" --project=$ProjectId)) {
        if (-not (Test-Gcloud storage buckets create "gs://$BucketName" --location=$Region --uniform-bucket-level-access --public-access-prevention --project=$ProjectId)) {
            $BucketName = "$BucketName-$ProjectId" # bucket names are global: the first name may belong to someone else
            if (-not (Test-Gcloud storage buckets describe "gs://$BucketName" --project=$ProjectId)) {
                Invoke-Gcloud storage buckets create "gs://$BucketName" --location=$Region --uniform-bucket-level-access --public-access-prevention --project=$ProjectId
            }
        }
    }
    Invoke-Gcloud storage buckets add-iam-policy-binding "gs://$BucketName" --member="serviceAccount:$runSa" --role=roles/storage.objectAdmin --project=$ProjectId --quiet | Out-Null
    Write-Ok "gs://$BucketName (private, uniform access)"

    # -- 5. Cloud SQL --------------------------------------------------------
    Write-Step "Cloud SQL for PostgreSQL (the first creation takes about 5-10 minutes)"
    $sqlConnection = "${ProjectId}:${Region}:${SqlInstance}"
    if (-not (Test-Gcloud sql instances describe $SqlInstance --project=$ProjectId)) {
        Invoke-Gcloud sql instances create $SqlInstance --database-version=POSTGRES_16 --edition=ENTERPRISE --tier=$SqlTier `
            --region=$Region --storage-type=SSD --storage-size=10GB --storage-auto-increase `
            --backup-start-time=21:00 --enable-point-in-time-recovery --deletion-protection --project=$ProjectId
    }
    if (-not (Test-Gcloud sql databases describe $DbName --instance=$SqlInstance --project=$ProjectId)) {
        Invoke-Gcloud sql databases create $DbName --instance=$SqlInstance --project=$ProjectId
    }
    if (-not (Test-Secret "DATABASE_URL")) {
        # The password is letters and digits only, so it needs no escaping inside the URL. Prisma reaches Cloud SQL through the
        # unix socket Cloud Run mounts at /cloudsql (host=...). connection_limit keeps several instances under the database's limit.
        $dbPassword = New-RandomText 32
        if (Test-Gcloud sql users describe $DbUser --instance=$SqlInstance --project=$ProjectId) {
            Invoke-Gcloud sql users set-password $DbUser --instance=$SqlInstance --password=$dbPassword --project=$ProjectId
        } else {
            Invoke-Gcloud sql users create $DbUser --instance=$SqlInstance --password=$dbPassword --project=$ProjectId
        }
        Set-SecretValue "DATABASE_URL" "postgresql://${DbUser}:${dbPassword}@localhost/${DbName}?host=/cloudsql/${sqlConnection}&connection_limit=5"
        Write-Ok "Database user created; DATABASE_URL stored in Secret Manager"
    }
    Write-Ok "$sqlConnection / $DbName"

    # -- 6. Secrets ----------------------------------------------------------
    Write-Step "Secrets in Secret Manager"
    $envMap = @{}
    if (Test-Path $EnvFile) {
        Write-Info "Reading $EnvFile"
        Get-Content $EnvFile | ForEach-Object {
            $line = $_.Trim()
            if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
                $idx = $line.IndexOf("=")
                $key = $line.Substring(0, $idx).Trim()
                $val = $line.Substring($idx + 1).Trim().Trim('"').Trim("'")
                if ($key -and $val) { $envMap[$key] = $val }
            }
        }
    } else {
        Write-Info "$EnvFile not found: using the defaults (company name etc. can be set later in the app)"
    }

    if (-not (Test-Secret "NEXTAUTH_SECRET")) { Set-SecretValue "NEXTAUTH_SECRET" (New-RandomBytes 32 "base64") }
    if (-not (Test-Secret "CRON_SECRET"))     { Set-SecretValue "CRON_SECRET" (New-RandomBytes 32 "hex") }

    # The PII key is created ONCE. Never replace it: a new key makes every stored PAN and Aadhaar unreadable.
    if (-not (Test-Secret "PII_ENCRYPTION_KEY")) {
        $pii = $envMap["PII_ENCRYPTION_KEY"]
        if ([string]::IsNullOrWhiteSpace($pii) -or $pii.ToUpper().StartsWith("CHANGE_ME")) {
            $pii = New-RandomBytes 32 "base64"
            Write-Info "A new PII_ENCRYPTION_KEY was created. BACK IT UP somewhere safe, apart from the database:"
            Write-Info "  gcloud secrets versions access latest --secret=PII_ENCRYPTION_KEY --project=$ProjectId"
        }
        Set-SecretValue "PII_ENCRYPTION_KEY" $pii
    } else {
        Write-Info "PII_ENCRYPTION_KEY already exists: kept as it is"
    }

    # Secrets taken from the env file when it has a value (their key is the secret's name)
    $optionalSecrets = @("GMAIL_APP_PASSWORD", "WHATSAPP_ACCESS_TOKEN", "SMTP_PASS")
    foreach ($name in $optionalSecrets) {
        if ($envMap.ContainsKey($name)) { Set-SecretValue $name $envMap[$name] }
    }
    $secretNames = @("DATABASE_URL", "NEXTAUTH_SECRET", "CRON_SECRET", "PII_ENCRYPTION_KEY") + ($optionalSecrets | Where-Object { Test-Secret $_ })
    foreach ($name in $secretNames) {
        Invoke-Gcloud secrets add-iam-policy-binding $name --member="serviceAccount:$runSa" --role=roles/secretmanager.secretAccessor --project=$ProjectId --quiet | Out-Null
    }
    Write-Ok "Secrets: $($secretNames -join ', ')"

    # -- 7. Build ------------------------------------------------------------
    $repoName = "cloud-run-source-deploy"
    if (-not (Test-Gcloud artifacts repositories describe $repoName --location=$Region --project=$ProjectId)) {
        Invoke-Gcloud artifacts repositories create $repoName --repository-format=docker --location=$Region --description="Neev CMS images" --project=$ProjectId
    }
    $image = "$Region-docker.pkg.dev/$ProjectId/$repoName/${ServiceName}:latest"
    if ($SkipBuild) {
        Write-Step "Skipping the build (using $image)"
    } else {
        Write-Step "Building the container on Cloud Build (no Docker needed on this computer)"
        Invoke-Gcloud builds submit --tag $image --project=$ProjectId
        Write-Ok "Image $image"
    }

    # -- 8. Settings for the service ------------------------------------------
    $serviceUrl = "https://$ServiceName-$projectNumber.$Region.run.app" # Cloud Run's address is known before the first deploy
    $plain = @{
        NODE_ENV               = "production"
        DEPLOYMENT_TARGET      = "cloud"
        STORAGE_PROVIDER       = "gcs"
        GCS_BUCKET_NAME        = $BucketName
        GOOGLE_CLOUD_PROJECT   = $ProjectId
        GOOGLE_CLOUD_LOCATION  = $Region
        NEXTAUTH_URL           = $serviceUrl
        APP_URL                = $serviceUrl
        TRUSTED_PROXY_COUNT    = "1"
    }
    foreach ($k in $envMap.Keys) {
        if ($optionalSecrets -contains $k -or @("PII_ENCRYPTION_KEY", "DATABASE_URL", "NEXTAUTH_SECRET", "CRON_SECRET", "NEXTAUTH_URL", "APP_URL") -contains $k) { continue }
        $plain[$k] = $envMap[$k]
    }
    $yamlPath = [IO.Path]::GetTempFileName()
    $yaml = foreach ($k in $plain.Keys) {
        $v = ([string]$plain[$k]).Replace('\', '\\').Replace('"', '\"')
        '{0}: "{1}"' -f $k, $v
    }
    [IO.File]::WriteAllLines($yamlPath, $yaml, (New-Object Text.UTF8Encoding($false)))
    $secretMap = ($secretNames | ForEach-Object { "$_=${_}:latest" }) -join ","

    # -- 9. Migrations (a Cloud Run job: same image, same Cloud SQL connection) ----
    Write-Step "Database migrations"
    Invoke-Gcloud run jobs deploy "$ServiceName-migrate" --image=$image --region=$Region --service-account=$runSa `
        --set-cloudsql-instances=$sqlConnection --set-secrets="DATABASE_URL=DATABASE_URL:latest" `
        --command=node --args="node_modules/prisma/build/index.js,migrate,deploy" --max-retries=0 --task-timeout=600 --project=$ProjectId
    Invoke-Gcloud run jobs execute "$ServiceName-migrate" --region=$Region --wait --project=$ProjectId
    Write-Ok "Migrations applied"

    if ($Seed) {
        Write-Step "Demo data (-Seed)"
        Invoke-Gcloud run jobs deploy "$ServiceName-seed" --image=$image --region=$Region --service-account=$runSa `
            --set-cloudsql-instances=$sqlConnection --set-secrets="DATABASE_URL=DATABASE_URL:latest" `
            --command=node --args="node_modules/tsx/dist/cli.mjs,prisma/seed.ts" --max-retries=0 --task-timeout=600 --project=$ProjectId
        Invoke-Gcloud run jobs execute "$ServiceName-seed" --region=$Region --wait --project=$ProjectId
        Write-Info "The seed prints a generated demo password once. Read it in the job's log:"
        Write-Info "  https://console.cloud.google.com/run/jobs/details/$Region/$ServiceName-seed/logs?project=$ProjectId"
    }

    # -- 10. Deploy the service ------------------------------------------------
    Write-Step "Deploying to Cloud Run"
    Invoke-Gcloud run deploy $ServiceName --image=$image --region=$Region --platform=managed --allow-unauthenticated `
        --service-account=$runSa --add-cloudsql-instances=$sqlConnection `
        --memory=$Memory --cpu=$Cpu --cpu-boost --min-instances=$MinInstances --max-instances=$MaxInstances --timeout=$Timeout `
        --execution-environment=gen2 --env-vars-file=$yamlPath --set-secrets=$secretMap --project=$ProjectId
    Remove-Item $yamlPath -Force -ErrorAction SilentlyContinue

    $liveUrl = (& gcloud run services describe $ServiceName --region=$Region --project=$ProjectId --format="value(status.url)").Trim()
    if ($liveUrl -ne $serviceUrl) {
        Write-Info "Cloud Run gave ${liveUrl}: updating NEXTAUTH_URL and APP_URL to match"
        Invoke-Gcloud run services update $ServiceName --region=$Region --update-env-vars="NEXTAUTH_URL=$liveUrl,APP_URL=$liveUrl" --project=$ProjectId
        $serviceUrl = $liveUrl
    }

    # -- 11. Cloud Scheduler: the daily interest, overdue and reminders job ------
    Write-Step "Cloud Scheduler (daily job at 09:00 India time)"
    $cron = (& gcloud secrets versions access latest --secret=CRON_SECRET --project=$ProjectId).Trim()
    $schedulerAction = "create"
    if (Test-Gcloud scheduler jobs describe "$ServiceName-daily" --location=$Region --project=$ProjectId) { $schedulerAction = "update" }
    Invoke-Gcloud scheduler jobs $schedulerAction http "$ServiceName-daily" --location=$Region --schedule="0 9 * * *" --time-zone="Asia/Kolkata" `
        --uri="$serviceUrl/api/cron/daily" --http-method=POST --headers="Authorization=Bearer $cron" --attempt-deadline=180s --project=$ProjectId
    Write-Ok "Scheduler job $ServiceName-daily"

    # -- Done ----------------------------------------------------------------------
    Write-Host "`n== DONE" -ForegroundColor Green
    Write-Host "   App:          $serviceUrl" -ForegroundColor Yellow
    Write-Host "   Health check: $serviceUrl/api/health" -ForegroundColor Yellow
    Write-Host "   Database:     Cloud SQL $sqlConnection" -ForegroundColor Yellow
    Write-Host "   Documents:    gs://$BucketName" -ForegroundColor Yellow
    Write-Host "   Gemini:       Vertex AI, $Region (model: gemini-3.5-flash unless GEMINI_MODEL is set)" -ForegroundColor Yellow
    try {
        $health = Invoke-RestMethod -Uri "$serviceUrl/api/health" -TimeoutSec 60
        Write-Host "   Health now:   $($health | ConvertTo-Json -Compress)" -ForegroundColor Green
    } catch {
        Write-Host "   The health check did not answer yet; open $serviceUrl/api/health in a minute." -ForegroundColor Yellow
    }
    if (-not $Seed) { Write-Host "`n   A new database has no users. Run again with -Seed to load the demo users, or create the first administrator yourself." -ForegroundColor White }
}
catch {
    Write-Host "`n   FAILED: $_" -ForegroundColor Red
    exit 1
}
