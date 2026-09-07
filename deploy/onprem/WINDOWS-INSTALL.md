# Installing Neev CMS on a Windows on-prem server

For a blank Windows machine, going from nothing to a running, internet-reachable, reboot-proof deployment.

**Why this looks the way it does**: everything in [docker-compose.yml](docker-compose.yml) (the app, Postgres, MinIO, Cloudflare Tunnel) is built from Linux container images — that's not changing, porting to native Windows containers isn't practical here since Postgres/MinIO/cloudflared don't ship Windows images. So the plan is: run a lightweight Linux environment on the Windows box via **WSL2**, install plain **Docker Engine** inside it (not Docker Desktop — see below for why), and make sure that Linux environment boots automatically with Windows so the app survives reboots **without anyone logging in**. Everything from `deploy/onprem/README.md` onward runs unchanged inside that Linux shell.

**Why not Docker Desktop**: it's built for a logged-in user's desktop session, its background service's unattended-reboot behavior is less predictable than a plain systemd service, and it requires a paid subscription once a company crosses certain size/revenue thresholds — a licensing question about the *customer's* company that's better avoided. Docker Engine (Community) inside WSL2 is free, headless, and this exact combination is Docker's own documented supported path.

---

## Step 0 — Confirm this machine can run WSL2

**Shell: Windows PowerShell, as Administrator.** (Right-click Start → "Terminal (Admin)" or "Windows PowerShell (Admin)".)

```powershell
[System.Environment]::OSVersion.Version
Get-ComputerInfo | Select-Object WindowsProductName, OsBuildNumber, HyperVRequirementVirtualizationFirmwareEnabled
```

You need build **19041+** (Windows 10 2004 or later), any Windows 11, or **Windows Server 2022** (build 20348+), and `HyperVRequirementVirtualizationFirmwareEnabled` must be `True` (virtualization enabled in BIOS/firmware — if `False`, enable it there first).

If this is **Windows Server 2019** (build 17763) or virtualization can't be enabled, WSL2 isn't a good fit — stop here and ask for the Hyper-V Linux VM fallback instead (run a small Ubuntu VM under Hyper-V and treat that VM as the actual host; everything from Step 5 onward is identical inside it).

---

## Step 1 — Install WSL2 + Ubuntu

**Shell: PowerShell (Admin)**, same window as Step 0.

```powershell
wsl --install -d Ubuntu-22.04
```

Reboot if prompted. If this command errors (more likely on Server 2022 than Windows 11), do it manually:

```powershell
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
# reboot the machine, then:
wsl --set-default-version 2
wsl --install -d Ubuntu-22.04
```

Launch **Ubuntu 22.04** once from the Start Menu — first launch asks you to set a UNIX username/password. This is the one and only interactive setup step; do it now.

**Check what WSL actually registered the distro as before going further** — it doesn't always match the name you asked for:

```powershell
wsl -l -v
```

Use whatever name shows up there (not blindly `Ubuntu-22.04`) in every `wsl -d <name> ...` command for the rest of this doc, including Step 4's scheduled task. This single mismatch is the most common reason the "survives reboot" setup silently doesn't work.

---

## Step 2 — Enable systemd inside the distro

Without this, WSL2 has no real init system, `dockerd` has nothing to keep it running as a service, and the whole Linux environment shuts itself down after a period of idleness.

**Shell: inside the Ubuntu window** (the one you launched from the Start Menu at the end of Step 1):

```bash
sudo tee /etc/wsl.conf > /dev/null <<'EOF'
[boot]
systemd=true
EOF
exit
```

**Shell: back to PowerShell (Admin)** — restart the distro to pick it up (`<distro-name>` = whatever `wsl -l -v` showed in Step 1):

```powershell
wsl --shutdown
wsl -d <distro-name>
```

That last command also opens the shell for Step 3 — stay in it.

---

## Step 3 — Install Docker Engine inside WSL2

**Shell: inside the Ubuntu window**, continuing from Step 2 (standard Docker-on-Ubuntu install — nothing WSL-specific here):

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

sudo systemctl enable docker
sudo systemctl start docker

sudo usermod -aG docker $USER
```

**Shell: inside the Ubuntu window.** Log out and back in (`exit`, then back in PowerShell: `wsl -d <distro-name>`) so the group membership applies, then confirm from inside Ubuntu again:

```bash
docker run hello-world
```

---

## Step 4 — Make WSL2 (and Docker) start automatically at Windows boot, with nobody logged in

This is the actual "persistent across restarts" requirement. WSL2's own service starts with Windows, but a specific *distro* only boots when something invokes it — that's the gap this closes. A Scheduled Task set to run **at startup**, **whether a user is logged on or not**, fills that gap by just touching the distro once, which brings systemd (and via `systemctl enable docker` above, `dockerd`) up.

**Shell: PowerShell (Admin).** Use the exact distro name from `wsl -l -v` (Step 1) as `<distro-name>` below — a mismatch here is the single most common reason this doesn't actually work:

```powershell
schtasks /create /tn "Start-WSL-Docker" /tr "wsl.exe -d <distro-name> -u root -e /bin/true" /sc onstart /ru "<local-admin-username>" /rp "<that-account's-password>" /rl highest /f
```

Use a real local admin account here, not `SYSTEM` — WSL commands invoked from a `SYSTEM`-context task are known to behave unreliably since WSL expects a normal user profile/token. Once `dockerd` is running, any container with `restart: always` in `docker-compose.yml` (that's every service in ours) gets restarted by Docker itself — you don't need the scheduled task to re-run `docker compose up`, only to get `dockerd` alive again.

**Test it for real** before trusting it: `Restart-Computer`, let it fully boot with nobody logging in (or log in as a *different* account than the task's), then from any admin **PowerShell** session:

```powershell
wsl -d <distro-name> -u root docker ps
```

All containers should show `Up`. If they don't, see **Troubleshooting** at the end of this doc before assuming something deeper is wrong.

---

## Step 5 — Put the deployment files on the server

Only these files go on the customer's box — never this git repo, never source code:

- [docker-compose.yml](docker-compose.yml)
- [.env.onprem.example](.env.onprem.example) (copied to `.env` and filled in)
- [cloudflared/config.yml](cloudflared/config.yml) (filled in) and the `<TUNNEL_ID>.json` credentials file from your Cloudflare tunnel setup

Put them inside the **Linux filesystem**, not under `/mnt/c/...` — cross-filesystem access from WSL2 to Windows drives is noticeably slower and has occasional file-permission/inotify quirks; keep it native.

**Shell: inside the Ubuntu window:**

```bash
mkdir -p ~/neev-cms/cloudflared
cd ~/neev-cms
```

Copy the files in however's convenient (`scp` from your machine, a USB drive staged via `/mnt/c/...` then `cp`'d in, pasting content directly). End state: `~/neev-cms/docker-compose.yml`, `~/neev-cms/.env`, `~/neev-cms/cloudflared/config.yml`, `~/neev-cms/cloudflared/<TUNNEL_ID>.json`.

---

## Step 6 — Fill in `.env`, log in to the registry, bring it up

From here it's identical to the Linux instructions in [README.md](README.md) steps 6–9.

**Shell: inside the Ubuntu window**, continuing from Step 5:

```bash
cd ~/neev-cms
# edit .env: NEXTAUTH_SECRET, CRON_SECRET, POSTGRES_PASSWORD, MinIO keys,
# LICENSE_TOKEN (from you), IMAGE_TAG (the version you released)

docker login ghcr.io -u <your-github-username>
# password: the read:packages-scoped PAT for this customer, see README.md

docker compose pull
docker compose up -d
docker compose exec web npx prisma migrate deploy
```

---

## Step 7 — Confirm it actually survives a reboot

Don't skip this — it's the specific requirement that started this whole runbook.

**Shell: PowerShell (Admin):**

```powershell
Restart-Computer
```

After it comes back, **without logging in**, check from another machine:

- `https://<customer-slug>.<your-domain>/api/health` responds (see README.md for what these placeholders mean — `<your-domain>` is yours, not the customer's).
- If you can reach the server another way (RDP, a colleague's session), from **PowerShell**: `wsl -d <distro-name> -u root docker compose -f /home/<user>/neev-cms/docker-compose.yml ps` shows every service `Up`.

If it isn't, see **Troubleshooting** below.

---

## Step 8 — Disk encryption

Windows' equivalent of the LUKS recommendation in [DEPLOYMENT_ONPREM.md](../../DEPLOYMENT_ONPREM.md) §3 — WSL2's virtual disk lives on the Windows drive, so encrypting that drive covers it.

**Shell: PowerShell (Admin):**

```powershell
Enable-BitLocker -MountPoint "C:" -EncryptionMethod XtsAes256 -UsedSpaceOnly -RecoveryPasswordProtector
```

Store the recovery key somewhere you control, not on the server itself.

---

## Step 9 — Firewall

**Shell: PowerShell (Admin).** Cloudflare Tunnel is outbound-only, so **no inbound firewall rule is needed for the app** — don't open one. Review existing inbound allow rules (`Get-NetFirewallRule -Direction Inbound -Enabled True -Action Allow`) and remove anything not deliberately needed; if RDP is enabled for your own remote admin access, scope it to your own IP/VPN, not left open.

---

## Troubleshooting: app doesn't survive a reboot

Work through these in order — each one rules out a specific link in the chain (Windows boot → scheduled task → WSL2 → systemd → dockerd → your containers). All commands below are **PowerShell (Admin)** unless marked otherwise.

**1. Does the distro name the task uses actually exist?** This is the single most common cause — `wsl --install -d Ubuntu-22.04` doesn't always register the distro under that exact name.
```powershell
wsl -l -v
```
If the name differs from what's in your scheduled task's `/tr` argument, that's the bug — delete and recreate the task (Step 4) with the correct name.

**2. Did the scheduled task's last run actually succeed?**
```powershell
schtasks /query /tn "Start-WSL-Docker" /v /fo LIST
```
Check `Last Result`: `0` means success. Anything else is a real failure — Task Scheduler's own GUI (`taskschd.msc` → Task Scheduler Library → your task → History tab; enable "Enable All Tasks History" from the Actions pane if that tab is empty) often has a more specific error than the exit code alone.

**3. Run the exact task action manually and see the raw error directly:**
```powershell
wsl.exe -d <distro-name> -u root -e /bin/true
echo $LASTEXITCODE
```

**4. Is systemd actually active inside the distro, and is Docker enabled to start with it?**
```powershell
wsl -d <distro-name> -u root -- systemctl is-system-running
wsl -d <distro-name> -u root -- systemctl is-enabled docker
```
First should say `running` (or `degraded`, which is usually fine — `offline` or an error means `/etc/wsl.conf`'s `systemd=true` from Step 2 didn't take). Second should say `enabled` — if it says `disabled`, re-run `sudo systemctl enable docker` from inside Ubuntu.

**5. Do your containers actually have the restart policy that's supposed to bring them back?**
```powershell
wsl -d <distro-name> docker inspect neev-cms-web-1 --format "{{.HostConfig.RestartPolicy.Name}}"
```
Should say `always`. If it says `no`, the container was started some other way than `docker compose up -d` against the checked-in `docker-compose.yml` — bring it up again the normal way (Step 6) rather than however it was started before.

**6. The account whose password is in the task — did it change?** A rotated password silently breaks the task with no obvious symptom until the next reboot. Update it and re-test:
```powershell
schtasks /change /tn "Start-WSL-Docker" /rp "<new-password>"
Restart-Computer
```

---

## Day-2 operations

- **Logs**: `docker compose logs -f web`, run from `~/neev-cms` inside the Ubuntu shell.
- **Updating**: tag and push a new release from your machine (`git tag vX.Y.Z && git push origin vX.Y.Z`), then on the server (inside the Ubuntu shell, from `~/neev-cms`): edit `IMAGE_TAG` in `.env`, `docker compose pull && docker compose up -d`.
- **Remote access without physically touching the Windows box**: RDP, or enable the OpenSSH Server Windows feature and SSH in, then `wsl -d <distro-name>` from there.
- **Scheduled task account password rotated?** See Troubleshooting item 6 above — it breaks silently until the next reboot.
