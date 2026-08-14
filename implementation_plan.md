# On-Premise Deployment Plan (Windows Server & Cloudflare Tunnel)

This document outlines the detailed requirements and installation steps for deploying the BuildSight CRM application on a client's local Windows Server, using Cloudflare Tunnel for secure remote access without requiring port forwarding.

---

## 1. Hardware & Storage Calculations

### Recommended Configuration
| Component | Specification |
| :--- | :--- |
| **CPU** | 4 vCPUs |
| **RAM** | 8 GB |
| **Storage** | 100 GB SSD |

### Storage Estimation (How many units in 100GB?)
Out of a 100GB drive, Windows Server, Docker, and the application files will consume approximately **30GB - 40GB**, leaving roughly **60GB (60,000 MB)** for database and document storage.

**Estimated Data per Unit:**
*   KYC Documents (PAN, Aadhaar for 2 buyers): ~8 MB
*   Booking & Allotment Letters: ~2 MB
*   Agreement for Sale (scanned/signed): ~3 MB
*   Demand Letters (approx. 15 per unit): ~5 MB
*   Receipts (approx. 15 per unit): ~5 MB
*   *Total per Unit:* **~23 MB** (Let's assume **30 MB** to be safe)

**Capacity:** `60,000 MB / 30 MB = ~2,000 Units`
A 100GB disk can comfortably accommodate data and documents for **1,500 to 2,000 unique units** before you would need to expand the storage.

---

## 2. Pre-requisites & Installation Steps (Windows Server)

Since the client prefers their data strictly on-premise, everything will run locally using Docker on Windows via WSL 2.

> [!NOTE]
> **No Database Server Installation Required:** Because BuildSight uses SQLite, the database engine runs entirely inside the application's Docker container. You **do not** need to install MySQL, PostgreSQL, or SQLite on the Windows Server itself. The database is simply stored as a single file (`dev.db`).

### Step 1: Install WSL 2 & Git
Docker requires WSL 2 to run Linux containers efficiently on Windows. We also need Git to securely pull updates from your GitHub repository.
1. Open PowerShell as Administrator.
2. Run the command: `wsl --install`
3. Run the command to install Git: `winget install --id Git.Git -e --source winget`
4. Restart the Windows Server.

### Step 2: Install Docker Desktop
1. Download Docker Desktop for Windows from the official Docker website.
2. Run the installer and ensure the option **"Use WSL 2 instead of Hyper-V"** is checked.
3. After installation, launch Docker Desktop to start the Docker Engine.
4. Go to Docker Desktop Settings > General, and check **"Start Docker Desktop when you log in"** to ensure it starts after a server reboot.

### Step 3: Initial Deployment via GitHub
Instead of manually copying files, we will securely clone the code so it stays linked to your repository.
1. Open PowerShell and navigate to the root directory: `cd C:\`
2. Clone your repository: `git clone https://github.com/apgosar/friends-conman-system.git BuildSight`
3. Enter the directory: `cd C:\BuildSight`
4. Create the `.env` file with your database URL: `DATABASE_URL="file:./dev.db"`.
5. Run the initial build: `docker compose up -d --build`.

---

## 3. Remote Updates (One-Click Client Updates)

To allow you to push code remotely and have the client securely fetch the updates, we will create a simple script on the client's desktop.

### `Update BuildSight.ps1`
Create this PowerShell script on the Windows Server Desktop for the client:

```powershell
# Update BuildSight.ps1
Write-Host "Fetching latest updates for BuildSight CRM..."
Set-Location -Path "C:\BuildSight"

# Pull the latest code from GitHub
git reset --hard
git pull origin main

# Rebuild the Docker container
Write-Host "Rebuilding the application. This may take a few minutes..."
docker compose build
docker compose down
docker compose up -d

Write-Host "Update Complete! The application is now running the latest version."
Pause
```

**How it works:**
1. You make code changes and push a new release to the `main` branch on GitHub.
2. You inform the client an update is ready.
3. The client simply double-clicks the `Update BuildSight.ps1` shortcut on their server Desktop.
4. The script fetches the live code directly from GitHub, rebuilds the application environment, and restarts it automatically without any technical intervention required.

---

## 4. Secure Internet Exposure (Cloudflare Tunnel)

Cloudflare Tunnel creates a secure outbound connection from the Windows Server to Cloudflare, meaning you **do not** need to open any firewall ports or expose the client's IP address.

### Step 1: Cloudflare Setup
1. The client must own a domain (e.g., `client-builders.com`) and point its nameservers to a free Cloudflare account.
2. In the Cloudflare Dashboard, navigate to **Zero Trust > Networks > Tunnels**.
3. Create a new Tunnel and name it (e.g., "BuildSight-OnPrem").

### Step 2: Install Cloudflared on Windows Server
1. Cloudflare will provide a Windows installation command.
2. Open PowerShell as Administrator on the server and run the provided command. Example:
   ```powershell
   winget install --id Cloudflare.cloudflared
   cloudflared service install <YOUR_TUNNEL_TOKEN>
   ```
3. This installs `cloudflared` as a Windows Background Service that starts automatically on boot.

### Step 3: Route the Traffic
1. Go back to the Cloudflare Dashboard.
2. Under "Public Hostnames" for your tunnel, add a route:
   * **Subdomain:** `crm`
   * **Domain:** `client-builders.com`
   * **Service:** `http://localhost:3000`
3. Save the configuration. The application is now securely accessible worldwide at `https://crm.client-builders.com` with automatic SSL, and all data remains firmly on the client's physical server.

---

## User Review Required

> [!IMPORTANT]
> Since we are not doing cloud backups to comply with the client's data policies, I highly recommend configuring a local Windows Scheduled Task to zip and copy the `C:\BuildSight\public\uploads` folder and `dev.db` file to a **secondary internal hard drive** or an **external USB drive** weekly.
> 
> Are you ready to proceed?
