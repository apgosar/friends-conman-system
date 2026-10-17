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

This is the actual "persistent across restarts" requirement. WSL2's own service starts with Windows, but a specific *distro* only runs while something keeps a `wsl.exe` process **that never exits** attached to it. A Scheduled Task running `sleep infinity` inside the distro does both jobs — it boots the distro (bringing up systemd and, via `systemctl enable docker` above, `dockerd` and every `restart: always` container), and it leaves a long-lived client attached for as long as it keeps running. The task has to run **whether a user is logged on or not**, and it has to be **supervised** — see the two lessons below.

> **Two lessons from real-hardware use — each one cost an outage:**
>
> 1. **Don't use a one-shot command like `-e /bin/true`**, even though it looks like the obvious "just boot the distro" command. It boots the distro, then exits immediately — the stack came up briefly after boot and then fell over (containers cycling, Cloudflare error 1033 as the tunnel dropped) until the task was changed to a command that never exits. The exact WSL2 internals responsible weren't pinned down, so treat "something must keep a long-running `wsl.exe` process alive" as an empirically established requirement, not something derived from documentation.
> 2. **Don't trigger it only "At startup".** The keep-alive can end for reasons that aren't a boot. In testing it was first killed by Task Scheduler's default 72-hour limit (event 329), and later it exited by itself (return code `0x80070001`) on a Monday morning, after the PC had slept since Saturday evening — cause not proven, but a long sleep/resume is the likely suspect. An at-startup trigger fires only on a *cold boot* (not on waking from sleep), so nothing restarted it and the app stayed down for 8 days. The task below instead **re-fires every 5 minutes**: if the keep-alive is already running the new launch is ignored, and if it has died it's back within 5 minutes.

**Shell: PowerShell (Admin).** Use the exact distro name from `wsl -l -v` (Step 1) as `<distro-name>` below — a mismatch here is the single most common reason this silently doesn't work:

```powershell
schtasks /create /tn "Start-WSL-Docker" /tr "wsl.exe -d <distro-name> -u root -e sleep infinity" /sc minute /mo 5 /ru "<local-admin-username>" /rp "<that-account's-password>" /rl highest /f
```

Use a real local admin account here, not `SYSTEM` — WSL commands invoked from a `SYSTEM`-context task are known to behave unreliably since WSL expects a normal user profile/token. Once `dockerd` is running, any container with `restart: always` in `docker-compose.yml` (that's every service in ours) gets restarted by Docker itself — the scheduled task never needs to re-run `docker compose up`, only to get the distro up and keep it up.

**Then fix the task's settings — do not skip this.** `schtasks /create` can't set these, and the defaults it applies break this task, so use the GUI: `taskschd.msc` → Task Scheduler Library → `Start-WSL-Docker` → right-click → **Properties**. Recreating the task resets all of these, so redo them whenever you recreate it.

- **Settings** tab → **uncheck "Stop the task if it runs longer than"**. The default is 72 hours; at the limit Task Scheduler kills the process — and with it the attached `wsl.exe` — and the stack falls over. Also confirm "If the task is already running, then the following rule applies" says **"Do not start a new instance"**, which is what makes the 5-minute re-fire harmless while the keep-alive is up.
- **Conditions** tab → **uncheck "Stop if the computer switches to battery power" first, then "Start the task only if the computer is on AC power"**. The defaults refuse to start, or stop, the keep-alive on a UPS or battery blip.
- **Triggers** tab (optional) → **New → "At startup"**, so it also starts at boot instead of waiting for the next 5-minute tick.

**Stop the machine sleeping — a sleeping server is an offline server.** While it sleeps the tunnel is down (Cloudflare error 1033) and scheduled jobs are missed, and waking up isn't a boot, so only the 5-minute re-fire brings the stack back. In testing, the PC went to sleep almost every evening. Turn sleep and hibernation off (turning hibernation off also disables Fast Startup, so "Shut down" becomes a real shutdown and boot-time triggers fire reliably):

```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /hibernate off
```

If this is a laptop, also set "closing the lid" to "Do nothing" (Control Panel → Power Options → Choose what closing the lid does). If you deliberately want the machine to sleep, expect an outage for the whole sleep plus up to 5 minutes after each wake, and test that path too (Step 7).

**Also recommended: turn off WSL2's VM idle shutdown** for the account the task runs as (`<task-account>` = the same account as `/ru` above). This was in place alongside the `sleep infinity` task when the setup was verified working. On its own, with the one-shot task, it did *not* keep the stack up, and whether it's still required alongside `sleep infinity` wasn't isolated — so it's kept as low-cost insurance:

```powershell
@"
[wsl2]
vmIdleTimeout=-1
"@ | Set-Content -Path "C:\Users\<task-account>\.wslconfig" -Encoding ascii
```

Then start the task now instead of waiting for the next tick (`wsl --shutdown` first so the `.wslconfig` is picked up — on a fresh install nothing is running yet, so it's harmless):

```powershell
wsl --shutdown
schtasks /run /tn "Start-WSL-Docker"
```

**Verify with passive checks only.** Any `wsl -d <name> <command>` (including `docker ps` or `systemctl status`) starts the distro itself if it's stopped, so it can make a broken setup look fine — that exact mistake cost hours of misdirected debugging. These only observe:

```powershell
schtasks /query /tn "Start-WSL-Docker" /v /fo LIST
schtasks /query /tn "Start-WSL-Docker" /xml | Select-String ExecutionTimeLimit
wsl -l -v
```

The task's `Status` should be `Running` (it's meant to never exit), the XML should show `<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>` (`PT0S` = no limit; `PT72H` means the Settings-tab step above didn't take), and the distro should be `Running`. From another machine, `https://<customer-slug>.<your-domain>/api/health` should respond. Then do the real reboot test in Step 7 — if anything's off, see **Troubleshooting** at the end of this doc before assuming something deeper is wrong.

---

## Step 5 — Put the deployment files on the server

Only these files go on the customer's box — never this git repo, never source code:

- [docker-compose.yml](docker-compose.yml)
- [.env.onprem.example](.env.onprem.example) (copied to `.env` and filled in)
- [cloudflared/config.yml](cloudflared/config.yml) (filled in) and the `<TUNNEL_ID>.json` credentials file from your Cloudflare tunnel setup
- [update.sh](update.sh), next to `docker-compose.yml` — the updater. Its Windows launcher [Update-NeevCMS.bat](Update-NeevCMS.bat) goes on the Windows side instead (Desktop or `C:\NeevCMS\`; edit its `DISTRO` and `APPDIR` lines first). The exact steps, including how to find the right folder, are in [README.md](README.md#updating-a-customers-server-one-click) — the launcher only starts `update.sh`, so the script must already be inside WSL.

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
docker compose exec web npx prisma db seed   # first install only (demo data); set SEED_PASSWORD, or note the password it prints
```

`migrate deploy` creates the tables and applies every later change in order. (Older installs were built with `db push`; the updater converts them automatically the first time.)

---

## Step 7 — Confirm it actually survives a reboot

Don't skip this — it's the specific requirement that started this whole runbook.

**Shell: PowerShell (Admin):**

```powershell
Restart-Computer
```

After it comes back, **without logging in**, check from another machine:

- `https://<customer-slug>.<your-domain>/api/health` responds within about 7 minutes of the machine coming up — up to 5 for the next task re-fire (less if you added the optional "At startup" trigger), plus about a minute for Docker and the tunnel. See README.md for what these placeholders mean — `<your-domain>` is yours, not the customer's.
- If you can reach the server another way (RDP, a colleague's session), check `wsl -l -v` (distro `Running`) and `schtasks /query /tn "Start-WSL-Docker" /v /fo LIST` (`Status: Running`) first. Only then, from **PowerShell**, `wsl -d <distro-name> -u root docker compose -f /home/<user>/neev-cms/docker-compose.yml ps` should show every service `Up` — run it last, because if the distro was actually stopped, that command starts it itself and can't tell you whether it would have come up on its own.

If you let the machine sleep, test that too: put it to sleep, wake it, and confirm the health URL recovers the same way. Waking isn't a boot, so this exercises a different path than the reboot does.

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

## Troubleshooting: app doesn't come back after a reboot, or stops later

Work through these in order — each one rules out a specific link in the chain (Windows boot → scheduled task → WSL2 → systemd → dockerd → your containers). All commands below are **PowerShell (Admin)** unless marked otherwise.

**Prefer passive checks (`wsl -l -v`, `schtasks /query`) first.** Any `wsl -d <name> <command>` starts the distro itself if it's stopped, so it can hide the very failure you're trying to observe — a stack that "started working after I ran `docker ps`" was just started by `docker ps`.

**1. Does the distro name the task uses actually exist?** This is the single most common cause — `wsl --install -d Ubuntu-22.04` doesn't always register the distro under that exact name.
```powershell
wsl -l -v
```
If the name differs from what's in your scheduled task's `/tr` argument, that's the bug — delete and recreate the task (Step 4) with the correct name.

**2. Did the scheduled task's last run actually succeed?**
```powershell
schtasks /query /tn "Start-WSL-Docker" /v /fo LIST
```
`Status` should be `Running` — this task is meant to never exit. If it says `Ready`, the keep-alive isn't running, and with the 5-minute re-fire it should have been restarted by now: the task isn't launching at all (check item 6, the account password) or something keeps ending it (item 7). `Last Result` of `0` is not proof of health for a task that's supposed to run forever — a one-shot task also reports `0` right before the stack falls over. A non-zero `Last Result` means the last run ended by itself, which is what item 7's event-log commands explain. Any other failure — Task Scheduler's own GUI (`taskschd.msc` → Task Scheduler Library → your task → History tab; enable "Enable All Tasks History" from the Actions pane if that tab is empty) often has a more specific error than the exit code alone, and its History also shows whether a run was boot-triggered or manual.

**3. Can WSL start the distro at all?** A quick diagnostic — *not* the task's real action (that's `sleep infinity`, which would just sit there):
```powershell
wsl.exe -d <distro-name> -u root -e /bin/true
echo $LASTEXITCODE
```

**4. Is systemd actually active inside the distro, and is Docker enabled to start with it?** (These start the distro if it isn't running — check `wsl -l -v` first.)
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

**7. Stack comes up, then falls over later — minutes, days, or after a sleep/wake — or the site shows Cloudflare error 1033 and stays that way?** Something ended the keep-alive, and the event logs say what and when. Put the app back first (`schtasks /run /tn "Start-WSL-Docker"`), then read these before changing anything:

```powershell
Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-TaskScheduler/Operational'; StartTime=(Get-Date).AddDays(-16)} | Where-Object { $_.Message -like '*Start-WSL-Docker*' } | Select-Object TimeCreated,Id,Message | Format-List
```

```powershell
Get-WinEvent -FilterHashtable @{LogName='System'; Id=12,13,41,42,1074,6008; StartTime=(Get-Date).AddDays(-16)} | Sort-Object TimeCreated | Select-Object TimeCreated,Id,ProviderName
```

How to read them:
- **Event 329** ("terminated … due to exceeding the time allocated for execution") — Task Scheduler killed it, so the 72-hour limit is still on. Redo the Settings-tab step in Step 4 and confirm with the XML check.
- **Event 201 with a return code, and no 329** — the `wsl.exe` process ended by itself, i.e. WSL went down underneath it. This was seen after a long sleep/resume. Turn sleep and hibernation off (Step 4) and let the 5-minute re-fire bring it back.
- **Event 118 ("launched … due to system startup") only after cold boots, and nothing since** — an at-startup-only trigger never fires on waking from sleep. Recreate the task with `/sc minute /mo 5` (Step 4).
- **System log: 12 = a cold boot, 42 = the machine went to sleep, 41/6008 = unexpected shutdown or power loss, 1074 = a restart or shutdown was requested.** If you "restarted it several times" but 12 and 1074 never appear, the machine was only woken from sleep or the power button was pressed — neither is a restart, and neither runs an at-startup task.

The Task Scheduler log is small by default and rolls over in days (the 5-minute re-fires add to that). Enlarge it now so the history is there when you need it:

```powershell
wevtutil sl Microsoft-Windows-TaskScheduler/Operational /ms:67108864
```

(If `Get-CimInstance Win32_OperatingSystem` fails with `Invalid class`, the WMI repository is damaged — a separate Windows problem, check it with `winmgmt /verifyrepository`. The commands above don't depend on WMI.)

---

## Day-2 operations

- **Logs**: `docker compose logs -f web`, run from `~/neev-cms` inside the Ubuntu shell.
- **Updating**: tag and push a new release from your machine (`git tag vX.Y.Z && git push origin vX.Y.Z`) and wait for the "Release on-prem image" GitHub Action to go green. Then the customer double-clicks `Update-NeevCMS.bat` and types that tag — it downloads the image, backs up the database, applies schema changes, switches the app over, rolls back on its own if the new version doesn't come up, and then runs any one-time data conversion the release ships with. Setup and limits are in [README.md](README.md#updating-a-customers-server-one-click). You can also run it by hand from `~/neev-cms` in the Ubuntu shell: `bash update.sh vX.Y.Z`.
- **Remote access without physically touching the Windows box**: RDP, or enable the OpenSSH Server Windows feature and SSH in, then `wsl -d <distro-name>` from there.
- **Scheduled task account password rotated?** See Troubleshooting item 6 above — it breaks silently until the next reboot.
