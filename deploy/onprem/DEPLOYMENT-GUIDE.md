# Neev CMS on-prem deployment: the complete guide

One document, start to finish: buy a domain, put it on Cloudflare, install a Windows server, bring the app up on the internet, keep it running, update it later.

This replaces the step lists that used to be spread across `README.md`, `WINDOWS-INSTALL.md` and `DEPLOYMENT_ONPREM.md`. Those files stay as reference material (how the updater works, deep troubleshooting for the reboot problem, the security design). You should not need them to get a server live.

---

## Contents

0. [How it fits together, what you need, and the example values used below](#0-how-it-fits-together)
1. [Part A: one-time setup for your business](#part-a-one-time-setup-for-your-business) (domain, Cloudflare, tools, license keys, GitHub)
2. [Part B: prepare one customer, on your PC](#part-b-prepare-one-customer-on-your-pc) (tunnel, hostname, license, release)
3. [Part C: prepare the Windows server](#part-c-prepare-the-windows-server) (WSL2, Docker, keep-alive task)
4. [Part D: install the app on the server](#part-d-install-the-app-on-the-server)
5. [Part E: make it permanent and safe](#part-e-make-it-permanent-and-safe) (reboot test, daily job, updater, backups, hardening)
6. [Part F: day-2 operations](#part-f-day-2-operations)
7. [Part G: troubleshooting](#part-g-troubleshooting)
8. [Final checklist](#final-checklist)

---

## 0. How it fits together

```
 Customer's staff (browser)
        │  https://pfr.example.com
        ▼
 Cloudflare  ◀──────────── outbound tunnel (no inbound port is opened) ───────────┐
 (your domain, free plan)                                                          │
                                                                                   │
 Customer's Windows server                                                         │
   └─ WSL2 (Ubuntu)                                                                │
        └─ Docker Engine                                                           │
             ├─ cloudflared  (the container that makes the tunnel above) ──────────┘
             ├─ web          (Neev CMS; uploaded documents are kept in its "files" volume)
             └─ db           (Postgres: all records)
```

- **The customer does not need a domain.** Every customer gets a subdomain of a domain **you** own (`pfr.example.com`).
- **Nothing is opened on the customer's router or firewall.** The server calls out to Cloudflare; visitors never reach the server directly.
- **The server never sees the source code.** It pulls a finished, signed image from GitHub's private registry.
- **The license** is a signed token tied to the hostname. Without a valid one the app refuses to serve pages.

### Two machines, and which one each command runs on

Every command block below starts with a label saying where to run it:

| Label | Meaning |
|---|---|
| **[Your PC · PowerShell]** | Your own Windows machine, where the repository is checked out |
| **[Server · PowerShell (Admin)]** | The customer's Windows server, in an elevated PowerShell (right-click Start, "Terminal (Admin)") |
| **[Server · Ubuntu]** | The Ubuntu terminal on the server (Start menu, "Ubuntu 22.04", or `wsl -d Ubuntu-22.04` from PowerShell) |
| **[Browser]** | A web page (Cloudflare, GitHub, your registrar) |

Mixing these up is the most common mistake. A command that starts with `sudo`, `docker`, `cd ~/...` or `curl -fsSL` belongs in **Ubuntu**; one with `schtasks`, `wsl`, `powercfg` or `Get-...` belongs in **PowerShell**.

### What you need

| Item | Notes |
|---|---|
| A domain name | You buy it once (Part A). Roughly the price of a coffee per month. |
| A free Cloudflare account | Part A |
| A GitHub account with access to the repository | Builds and hosts the images |
| Your PC | Windows, with Git, Node.js and `cloudflared` (Part A installs them) |
| The customer's server | Windows 10 (2004+), Windows 11 or Windows Server 2022; virtualization enabled in firmware; recommended 8 GB RAM or more and 50 GB free disk; always on; a local administrator account **with a password**; outbound internet. |
| Outbound ports | 443 (web, GitHub, Docker Hub) and **7844** (Cloudflare tunnel, TCP and UDP). If the customer's firewall filters outbound traffic, ask them to allow 7844 to Cloudflare. |

Windows Server 2019 and older machines without virtualization are not supported by this guide (WSL2 needs it).

### Example values used in every command

Replace these with your own. They are the same throughout so you can follow one customer end to end.

| Placeholder | Example | What it is |
|---|---|---|
| `<your-domain>` | `example.com` | The domain you bought (Part A) |
| `<slug>` | `pfr` | A short customer id you invent |
| `<hostname>` | `pfr.example.com` | `<slug>.<your-domain>`: the address the customer's staff type. **One level only** (see A1) |
| `<tunnel-name>` | `neev-cms-pfr` | `neev-cms-<slug>` |
| `<TUNNEL_ID>` | `8f3c2a1e-5b7d-4c9e-a2f1-0d6b3e9c7a54` | The UUID `cloudflared tunnel create` prints |
| `<customer>` | `Paradigm Friends Realtors LLP` | The customer's legal name (goes on the license) |
| `<distro>` | `Ubuntu-22.04` | The **exact** name `wsl -l -v` shows on the server |
| `<win-user>` | `serveradmin` | The Windows account that installs Ubuntu and runs the keep-alive task |
| `<linux-user>` | `neev` | The Ubuntu username you create on the server |
| `<tag>` | `v0.0.40` | The release you install (a git tag) |
| App folder | `/home/neev/neev-cms` (written `~/neev-cms` inside Ubuntu) | Where the app lives on the server |

---

# Part A: one-time setup for your business

Do this once. Every customer after the first reuses all of it.

## A1. Buy a domain

You need one domain for the whole business, not one per customer.

1. Pick a name you are happy to have in every customer's address bar (`yourbrand.com`, `yourbrand.in`).
2. Buy it from any registrar: Cloudflare Registrar, Namecheap, GoDaddy, Spaceship, your local registrar. All work. Buying at Cloudflare Registrar skips the nameserver change in A2 because the domain is already on Cloudflare.
3. Enable the registrar's own two-factor login. Whoever controls the domain controls every customer's address.

**Hostname rule (this one bites people):** use exactly **one level** in front of the domain. `pfr.example.com` is fine. `pfr.apps.example.com` is not: Cloudflare's free certificate covers `*.example.com` but not deeper names, and the browser will show a certificate error.

## A2. Put the domain on Cloudflare

**[Browser]** The labels below were current when this guide was written; Cloudflare renames menus now and then, so follow the intent if one differs.

1. Create a free account at <https://dash.cloudflare.com/sign-up>. Turn on two-factor authentication for it (Profile, Authentication). This account will control every customer's hostname.
2. In the dashboard open **Domains**, then **Onboard a domain** (older dashboards: **Websites**, then **Add a site**).
3. Enter your domain (`example.com`, no `www`, no `https://`) and continue.
4. Choose the **Free** plan.
5. Cloudflare scans for existing DNS records. If this is a brand-new domain there is nothing to keep. If the domain already hosts a website or email, check that its records were imported before you continue.
6. Cloudflare shows **two nameservers**, for example:
   ```
   ali.ns.cloudflare.com
   jimmy.ns.cloudflare.com
   ```
   Copy both. (They are also on the domain's **Overview** page later.) Yours will have different names; use the ones Cloudflare shows you.
7. If DNSSEC is turned on at your registrar, turn it **off** there first (you can turn it on again from Cloudflare after the domain is active).
8. **At your registrar**, open the domain's **Nameservers** (sometimes called "DNS" or "Custom DNS") settings, choose "custom nameservers", delete the existing ones, and enter exactly the two from Cloudflare. Save.
9. Wait. It usually takes minutes and can take up to 24 hours. Cloudflare emails you, and the domain shows **Active** under Domains.

Check from your PC whether the change has reached the internet:

**[Your PC · PowerShell]**
```powershell
Resolve-DnsName example.com -Type NS -Server 1.1.1.1 | Where-Object Type -eq NS | Select-Object Name, NameHost
```
When it lists the two `*.ns.cloudflare.com` names, you are done. Until then, wait.

You do **not** create any A or CNAME records for the app by hand. Part B creates the one you need with a single command.

Optional but recommended once the domain is Active: **SSL/TLS, Edge Certificates, Always Use HTTPS = On**.

## A3. Install the tools on your PC

**[Your PC · PowerShell]**
```powershell
winget install --id Git.Git
winget install --id OpenJS.NodeJS.LTS
winget install --id Cloudflare.cloudflared
```
Close PowerShell and open a new one (so the new programs are found), then check all three:

```powershell
git --version
node --version
cloudflared --version
```

If `cloudflared` is "not recognized", it installed but is not on your PATH. It lives in `C:\Program Files (x86)\cloudflared`. Add it for this window and permanently:

```powershell
$env:Path += ';C:\Program Files (x86)\cloudflared'
[Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path', 'User') + ';C:\Program Files (x86)\cloudflared', 'User')
```

If `winget` is not available on your PC, download the installer instead: <https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.msi>. Windows does not update `cloudflared` by itself; re-run `winget upgrade --id Cloudflare.cloudflared` now and then.

Get the code and its dependencies (needed only for the license commands):

```powershell
git clone https://github.com/apgosar/friends-conman-system.git
cd friends-conman-system
npm ci
```

> **cloudflared on Linux.** You do not need it on the server: the app's `docker-compose.yml` runs `cloudflared` as a container. If you ever want to run the tunnel commands from inside Ubuntu instead of your PC, install it there with:
> **[Server · Ubuntu]**
> ```bash
> curl -fsSL -o cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
> sudo dpkg -i cloudflared.deb
> cloudflared --version
> ```
> Do the tunnel commands on **your PC** unless you have a reason not to: the login step stores a certificate (`cert.pem`) that controls your whole Cloudflare domain, and it must never be left on a customer's server.

## A4. Create the license signing key (once, ever)

Skip this if you already have `license-private-key.jwk.json` and the matching public key is already in `src/lib/license/public-key.ts`.

**[Your PC · PowerShell]**, in the repository folder:
```powershell
npx tsx scripts/license/generate-keypair.ts
```
It writes `license-private-key.jwk.json` and prints a public key.

1. **Back up the private file now** (password manager attachment, encrypted USB). If you lose it you can never issue another license that existing images accept. It is git-ignored; never commit it, never send it to a customer, never run the license commands on a server.
2. Paste the printed public key into `src/lib/license/public-key.ts`, commit and push it.
3. **The public key is baked into each image when it is built.** Images built before this change cannot verify licenses signed with the new key. Do this before you cut the first release.

## A5. GitHub: releases and the private registry

**How a release works.** Pushing a git tag that looks like `v1.2.3` starts the GitHub Action "Release on-prem image". It builds the image, pushes it to `ghcr.io/apgosar/friends-conman-system:<tag>`, and signs it. It takes about four minutes.

**[Your PC · PowerShell]**
```powershell
git tag --sort=-v:refname | Select-Object -First 5      # newest existing tags
git tag v0.0.41
git push origin v0.0.41
```
Watch it at <https://github.com/apgosar/friends-conman-system/actions>. Wait for green before giving the tag to anyone.

**Make the package private (once, after the very first release).** A new GitHub package can start out public.

**[Browser]** github.com, your profile picture, **Your profile**, **Packages**, `friends-conman-system`, **Package settings**, **Danger Zone**, **Change visibility**, **Private**.

**One registry token per customer.** The server needs permission to pull the private image. GitHub Packages accepts only a **personal access token (classic)** (fine-grained tokens do not work for packages).

**[Browser]** github.com, profile picture, **Settings**, **Developer settings**, **Personal access tokens**, **Tokens (classic)**, **Generate new token (classic)**:

- **Note:** `neev-cms pfr server` (the customer's name, so you can revoke just this one later)
- **Expiration:** choose one and put the renewal date in your calendar. An expired token silently stops updates.
- **Scopes:** tick **only `read:packages`**
- Generate, and copy the token (`ghp_...`) immediately. GitHub shows it once.

> **The source repository is currently public.** That means anyone can read the code, and the updater downloads `update.sh` from it. If you later make the repository private, that automatic download stops working; copy `update.sh` to the server by hand instead (see `README.md`, "Updating a customer's server").

---

# Part B: prepare one customer, on your PC

Everything in this part happens on **your PC**. At the end you have a folder, the "kit", holding the files you carry to the server.

## B1. Choose the names

For a customer called "Paradigm Friends Realtors": slug `pfr`, hostname `pfr.example.com`, tunnel name `neev-cms-pfr`. Make a kit folder:

**[Your PC · PowerShell]**
```powershell
New-Item -ItemType Directory -Force C:\NeevDeploy\pfr | Out-Null
```

## B2. Create the tunnel and the DNS record

**[Your PC · PowerShell]**

**1. Log in to Cloudflare (once per PC; repeat only if you delete `cert.pem`):**
```powershell
cloudflared tunnel login
```
A browser opens. Sign in, **choose the domain the hostname will live under** (`example.com`), and click **Authorize**. When it says "You have successfully logged in", a certificate was saved to `C:\Users\<you>\.cloudflared\cert.pem`. That file can change your DNS, so keep it on your PC only.

> If your Cloudflare account holds several domains, the one you pick here is the one `route dns` uses in step 3. Picking the wrong one is the most common mistake in this part; the symptom is described in step 3.

**2. Create the tunnel:**
```powershell
cloudflared tunnel create neev-cms-pfr
```
Expected output (the id will differ):
```
Tunnel credentials written to C:\Users\you\.cloudflared\8f3c2a1e-5b7d-4c9e-a2f1-0d6b3e9c7a54.json. ...
Created tunnel neev-cms-pfr with id 8f3c2a1e-5b7d-4c9e-a2f1-0d6b3e9c7a54
```
**Write down the id** (`<TUNNEL_ID>`). That `.json` is the tunnel's secret: it goes to the server and nowhere else.

**3. Create the DNS record that points the hostname at the tunnel:**
```powershell
cloudflared tunnel route dns neev-cms-pfr pfr.example.com
```
Expected: `Added CNAME pfr.example.com which will route to this tunnel`.

**4. Check it:**
```powershell
cloudflared tunnel list
```
**[Browser]** In the Cloudflare dashboard open the domain, **DNS**, **Records**: there should be a `CNAME` named `pfr` pointing at `8f3c2a1e-....cfargotunnel.com`, **Proxied** (orange cloud). The tunnel shows as inactive/down until the server connects in Part D; that is normal.

> **If the record is named `pfr.example.com.someotherdomain.com`**, you authorized the wrong domain at login. Delete that record in the dashboard, run `cloudflared tunnel login` again choosing the right domain, then repeat step 3.

## B3. Write the tunnel's `config.yml`

This file tells the tunnel which hostname goes to which container. Put your real tunnel id and hostname in the first lines of the script and run it:

**[Your PC · PowerShell]**
```powershell
$tunnelId = '8f3c2a1e-5b7d-4c9e-a2f1-0d6b3e9c7a54'     # from step 2
$fqdn     = 'pfr.example.com'

@"
tunnel: $tunnelId
credentials-file: /etc/cloudflared/$tunnelId.json

ingress:
  - hostname: $fqdn
    service: http://web:8080
  - service: http_status:404
"@ | Set-Content -Path C:\NeevDeploy\pfr\config.yml -Encoding ascii

Copy-Item "$env:USERPROFILE\.cloudflared\$tunnelId.json" C:\NeevDeploy\pfr\
Get-Content C:\NeevDeploy\pfr\config.yml
```
The result should read exactly like this:
```yaml
tunnel: 8f3c2a1e-5b7d-4c9e-a2f1-0d6b3e9c7a54
credentials-file: /etc/cloudflared/8f3c2a1e-5b7d-4c9e-a2f1-0d6b3e9c7a54.json

ingress:
  - hostname: pfr.example.com
    service: http://web:8080
  - service: http_status:404
```
Leave `/etc/cloudflared/...` and `http://web:8080` exactly as written. They are paths and names *inside the containers*, not Windows paths.

## B4. Issue the license

**[Your PC · PowerShell]**, in the repository folder:
```powershell
npx tsx scripts/license/issue-license.ts --customer "Paradigm Friends Realtors LLP" --host pfr.example.com --days 365 --grace 14 --out C:\NeevDeploy\pfr\license.jwt
```
Expected:
```
Issued license for "Paradigm Friends Realtors LLP"
  Hosts: pfr.example.com
  Expires: 2027-11-04T08:19:06.614Z (+14d grace)
  Written to: C:\NeevDeploy\pfr\license.jwt
```
- `--host` must be **exactly** the hostname people will use. A license for `pfr.example.com` does not work at any other address. Several hosts: `--host a.example.com,b.example.com`.
- `--days` is the validity; `--grace` is how many extra days the app keeps working after expiry before it blocks.
- The token is a signed string, not a secret; it is fine to send to the customer's server.

## B5. Make sure a release exists

You need a finished release tag to install. If the newest tag already contains everything you want, use it; otherwise do the release steps in A5. Note the tag, for example `v0.0.40`.

**[Your PC · PowerShell]**
```powershell
git tag --sort=-v:refname | Select-Object -First 3
```
Check that its Action run is green (A5). A tag whose build failed or is still running does not exist in the registry yet.

## B6. The kit

Before you travel to (or remote into) the server, `C:\NeevDeploy\pfr` should hold:

| File / value | Where it came from | Goes to |
|---|---|---|
| `config.yml` | B3 | server, `~/neev-cms/cloudflared/` |
| `<TUNNEL_ID>.json` | B2 | server, `~/neev-cms/cloudflared/` |
| `license.jwt` | B4 | server, `~/neev-cms/` |
| GitHub token (`ghp_...`) | A5 | typed once on the server |
| Release tag (`v0.0.40`) | B5 | `IMAGE_TAG` in `.env` |
| Hostname (`pfr.example.com`) | B1 | `APP_URL`, `NEXTAUTH_URL` |

Copy the folder to a USB drive, or have it ready to copy over a remote-desktop session.

---

# Part C: prepare the Windows server

Why WSL2 and plain Docker Engine rather than Docker Desktop: the app is built from Linux containers, and WSL2 plus Docker Engine runs headless as a normal background service, with no logged-in desktop session and no Docker Desktop license question for the customer's company.

## C0. Can this machine run WSL2?

**[Server · PowerShell (Admin)]**
```powershell
[System.Environment]::OSVersion.Version
Get-ComputerInfo | Select-Object WindowsProductName, OsBuildNumber, HyperVRequirementVirtualizationFirmwareEnabled
```
You need build **19041 or newer** (Windows 10 2004+), any Windows 11, or **Windows Server 2022**, and `HyperVRequirementVirtualizationFirmwareEnabled` must be `True`. If it is `False`, enable virtualization (Intel VT-x / AMD-V / SVM) in the BIOS first.

## C1. Install WSL2 and Ubuntu

Log in to the server as the Windows account that will own the installation (`<win-user>`, a local administrator with a password). **WSL distros belong to the Windows user who installed them**, so the keep-alive task in C4 must run as this same account.

**[Server · PowerShell (Admin)]**
```powershell
wsl --install -d Ubuntu-22.04
```
Reboot if asked. After the reboot an Ubuntu window opens by itself: create the Linux username (`neev`) and a password when it asks. That is the only interactive step.

If the command errors (more common on Server 2022), enable the features by hand, reboot, and retry:
```powershell
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
Restart-Computer
```
```powershell
wsl --set-default-version 2
wsl --install -d Ubuntu-22.04
```

**Write down the distro's real name.** It does not always match what you asked for:

**[Server · PowerShell (Admin)]**
```powershell
wsl -l -v
```
```
  NAME            STATE           VERSION
* Ubuntu-22.04    Running         2
```
Use whatever the `NAME` column says as `<distro>` in every `wsl -d <distro>` command below. A mismatch here is the number one reason the "survives a reboot" setup silently fails.

## C2. Turn on systemd inside Ubuntu

**[Server · Ubuntu]**
```bash
sudo tee /etc/wsl.conf > /dev/null <<'EOF'
[boot]
systemd=true
EOF
exit
```
**[Server · PowerShell (Admin)]** restart the distro so it applies:
```powershell
wsl --shutdown
wsl -d Ubuntu-22.04
```
That last command opens Ubuntu again. Stay in it for C3.

## C3. Install Docker Engine in Ubuntu

**[Server · Ubuntu]**
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
Log out and back in so the group applies:
```bash
exit
```
**[Server · PowerShell (Admin)]**
```powershell
wsl -d Ubuntu-22.04
```
**[Server · Ubuntu]** confirm Docker works without `sudo`:
```bash
docker run --rm hello-world
docker compose version
```
You should see "Hello from Docker!" and a Compose version.

## C4. Make Ubuntu and Docker start with Windows, with nobody logged in

WSL2 only keeps a distro running while some `wsl.exe` process stays attached to it. A Scheduled Task running `sleep infinity` inside the distro does that, and the 5-minute repeat brings it back if it ever ends. Two earlier outages came from skipping the details below, so follow them all.

### C4a. Create the task

Use the exact `<distro>` from C1, and the Windows account from C1 (`/ru`). Put the password in **single quotes** (a `$` or a backtick inside double quotes is silently mangled by PowerShell).

**[Server · PowerShell (Admin)]**
```powershell
schtasks /create /tn "Start-WSL-Docker" /tr "wsl.exe -d Ubuntu-22.04 -u root -e sleep infinity" /sc minute /mo 5 /ru "$env:COMPUTERNAME\serveradmin" /rp 'TheWindowsPassword' /rl highest /f
```
You must see:
```
SUCCESS: The scheduled task "Start-WSL-Docker" has successfully been created.
```
Confirm it exists (this reads the task store directly, so it is more reliable than looking in the Task Scheduler window, which does not refresh by itself):
```powershell
schtasks /query /tn "Start-WSL-Docker"
```

**If it printed nothing, or the query says "cannot find the file specified",** go to C4b. (On one server a security product silently swallowed task-creation commands that contained `wsl.exe -d ... sleep infinity`, exit code 0, no output, no task. See Part G.)

### C4b. Fallback: run the command through a short script

Put the long command in a file and have the task run the file. The task's own command line is then just a path.

**[Server · PowerShell (Admin)]**
```powershell
New-Item -ItemType Directory -Force C:\neev | Out-Null
Set-Content -Path C:\neev\keepalive.cmd -Value '@echo off','wsl.exe -d Ubuntu-22.04 -u root -e sleep infinity' -Encoding ascii
Get-Content C:\neev\keepalive.cmd
```
```powershell
schtasks /create /tn "Start-WSL-Docker" /tr "C:\neev\keepalive.cmd" /sc minute /mo 5 /ru "$env:COMPUTERNAME\serveradmin" /rp 'TheWindowsPassword' /rl highest /f
schtasks /query /tn "Start-WSL-Docker" /v /fo LIST
```
Continue with C4c. If this is also silent, something on the machine is blocking scheduled-task creation: check the antivirus / endpoint-protection log (Windows Security, "Protection history") and ask the customer's IT to allow it.

### C4c. Fix the task's settings (do not skip)

`schtasks /create` cannot set these, and its defaults break this task. Redo them any time you recreate the task.

**[Server · Task Scheduler]** press Start, type `taskschd.msc`, Task Scheduler Library, right-click `Start-WSL-Docker`, **Properties**:

- **Settings** tab: **untick "Stop the task if it runs longer than"** (the default 72 hours would kill the keep-alive and the whole stack with it). Set "If the task is already running, then the following rule applies" to **Do not start a new instance**.
- **Conditions** tab: untick **"Stop if the computer switches to battery power"**, then untick **"Start the task only if the computer is on AC power"**.
- **Triggers** tab (optional): **New**, "At startup", so it starts at boot rather than waiting for the next 5-minute tick.

Check that the settings took:

**[Server · PowerShell (Admin)]**
```powershell
schtasks /query /tn "Start-WSL-Docker" /xml | Select-String "ExecutionTimeLimit|DisallowStartIfOnBatteries|MultipleInstancesPolicy"
```
You want `PT0S` (no limit; `PT72H` means the Settings step did not take), `false`, and `IgnoreNew`.

### C4d. Stop the server from sleeping

A sleeping server is an offline server. Turn off sleep and hibernation (this also makes "Shut down" a real shutdown):

**[Server · PowerShell (Admin)]**
```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /hibernate off
```
On a laptop also set "closing the lid" to "Do nothing" (Control Panel, Power Options).

Also keep WSL's idle shutdown off for this account:

**[Server · PowerShell (Admin)]**, run as the same Windows account as `/ru`:
```powershell
@"
[wsl2]
vmIdleTimeout=-1
"@ | Set-Content -Path "$env:USERPROFILE\.wslconfig" -Encoding ascii
```

### C4e. Start it and check, without disturbing it

**[Server · PowerShell (Admin)]**
```powershell
wsl --shutdown
schtasks /run /tn "Start-WSL-Docker"
```
Wait about 15 seconds, then use only these *passive* checks. Running a command **inside** the distro (even `docker ps`) starts a stopped distro, which hides the very failure you are testing for.
```powershell
schtasks /query /tn "Start-WSL-Docker" /v /fo LIST
wsl -l -v
```
`Status` should be `Running` and the distro `Running`.

---

# Part D: install the app on the server

From here almost everything runs in **Ubuntu**.

## D1. Create the app folder and fetch the stack files

**[Server · Ubuntu]**
```bash
mkdir -p ~/neev-cms/cloudflared
cd ~/neev-cms

TAG=v0.0.40
BASE=https://raw.githubusercontent.com/apgosar/friends-conman-system/$TAG/deploy/onprem
curl -fsSL "$BASE/docker-compose.yml"    -o docker-compose.yml
curl -fsSL "$BASE/.env.onprem.example"   -o .env.onprem.example
ls -l
```
Use your real tag instead of `v0.0.40`. This downloads only two small text files, never source code. (If the repository is private, copy these two files in by hand with D2's method instead.)

Keep the app inside Ubuntu's own filesystem (`~/neev-cms`), never under `/mnt/c/...`: the Windows drive is much slower and has permission quirks.

## D2. Copy in the kit from Part B

Three files from `C:\NeevDeploy\pfr` need to land in Ubuntu's filesystem. From Windows, Ubuntu's files appear as a network share named `\\wsl$\<distro>`.

**Option 1, File Explorer.** Open `\\wsl$\Ubuntu-22.04\home\neev\neev-cms` and drag:
- `config.yml` and `<TUNNEL_ID>.json` into the `cloudflared` folder
- `license.jwt` into `neev-cms` itself

**Option 2, PowerShell.** Adjust the source folder (here the kit is on a USB drive `D:`):

**[Server · PowerShell (Admin)]**
```powershell
$dest = '\\wsl$\Ubuntu-22.04\home\neev\neev-cms'
Copy-Item 'D:\pfr\config.yml'                                   "$dest\cloudflared\config.yml"
Copy-Item 'D:\pfr\8f3c2a1e-5b7d-4c9e-a2f1-0d6b3e9c7a54.json'    "$dest\cloudflared\"
Copy-Item 'D:\pfr\license.jwt'                                  "$dest\license.jwt"
```
(The distro must be running; the keep-alive from Part C keeps it up.)

**Option 3, from inside Ubuntu**, if the USB drive shows up as `D:`:
**[Server · Ubuntu]**
```bash
cp /mnt/d/pfr/config.yml /mnt/d/pfr/*.json ~/neev-cms/cloudflared/
cp /mnt/d/pfr/license.jwt ~/neev-cms/
```

Then make the tunnel files readable by the `cloudflared` container, which runs as an unprivileged user and otherwise cannot open a file that only you can read:

**[Server · Ubuntu]**
```bash
cd ~/neev-cms
chmod 755 cloudflared
chmod 644 cloudflared/*
ls -l cloudflared license.jwt
```
You should see `config.yml`, `8f3c2a1e-....json` and `license.jwt`.

## D3. Create `.env` (secrets and settings)

`.env` holds every secret for this server. Generate fresh values for each customer (never reuse another customer's), and never put this file in git or email it.

**[Server · Ubuntu]**, from `~/neev-cms`. First set the three values that are specific to this customer, then run the whole block:

```bash
cd ~/neev-cms

HOSTNAME_PUBLIC="pfr.example.com"
TAG="v0.0.40"
COMPANY="Paradigm Friends Realtors LLP"
COMPANY_ADDR="45 Builder Tower, Mumbai"

cp .env.onprem.example .env
chmod 600 .env

# hex values are URL-safe, which matters: the database password also sits inside DATABASE_URL
DB_PASS="$(openssl rand -hex 24)"
set_var() { sed -i "s|^$1=.*|$1=\"$2\"|" .env; }

set_var POSTGRES_PASSWORD     "$DB_PASS"
set_var DATABASE_URL          "postgresql://neev_cms:$DB_PASS@db:5432/neev_cms?schema=public"
set_var NEXTAUTH_SECRET       "$(openssl rand -base64 32)"
set_var CRON_SECRET           "$(openssl rand -hex 32)"
set_var PII_ENCRYPTION_KEY    "$(openssl rand -base64 32)"

set_var NEXTAUTH_URL          "https://$HOSTNAME_PUBLIC"
set_var APP_URL               "https://$HOSTNAME_PUBLIC"
set_var IMAGE_TAG             "$TAG"
set_var COMPANY_NAME          "$COMPANY"
set_var COMPANY_ADDRESS       "$COMPANY_ADDR"
set_var LICENSE_TOKEN         "$(cat license.jwt)"
```

Check it:
```bash
grep -c CHANGE_ME .env          # must print 0
grep -E '^(IMAGE_TAG|APP_URL|NEXTAUTH_URL|LICENSE_MODE|DEPLOYMENT_TARGET|STORAGE_PROVIDER)=' .env
```
Expected:
```
0
DEPLOYMENT_TARGET="onprem"
STORAGE_PROVIDER="s3"
IMAGE_TAG="v0.0.40"
LICENSE_MODE="onprem"
NEXTAUTH_URL="https://pfr.example.com"
APP_URL="https://pfr.example.com"
```

**Back up the encryption key right now.** `PII_ENCRYPTION_KEY` encrypts buyers' PAN and Aadhaar numbers in the database. If the server is lost and you do not have this key, those numbers can never be read again. Show it, copy it into your password manager under this customer's name, and keep it apart from the server:
```bash
grep '^PII_ENCRYPTION_KEY=' .env
```

If the company name or address contains `&`, `|`, `"` or a backslash, the `sed` line above will mangle it. Leave those two lines at their defaults in the block and set them afterwards by hand with `nano .env`.

What the other lines mean:

| Line | Meaning |
|---|---|
| `DEPLOYMENT_TARGET`, `STORAGE_PROVIDER`, `LOCAL_STORAGE_DIR` | Already right for on-prem (uploaded documents are kept in the `files` volume, mounted at `/data/files`). Leave them. |
| `LICENSE_MODE="onprem"` | Turns the license check on. Leave it. |
| `NEXTAUTH_URL`, `APP_URL` | Must be the real `https://` address. A leftover `<...>` placeholder makes the app crash with "Invalid URL". |
| `POSTGRES_*` | The password the app and the database use to talk to each other; the value is internal. |
| `COMPANY_GSTIN`, `GMAIL_*` | Optional; see E6. |

## D4. Log in to the private registry

**[Server · Ubuntu]**
```bash
docker login ghcr.io -u your-github-username
```
At `Password:` paste the `ghp_...` token from A5 (nothing is shown as you paste) and press Enter. Expect `Login Succeeded`. It is remembered in `~/.docker/config.json` for the updater.

## D5. Download and start the stack

**[Server · Ubuntu]**
```bash
cd ~/neev-cms
docker compose pull
docker compose up -d
docker compose ps --all
```
The first `pull` downloads a large image (it bundles Chromium and LibreOffice for PDFs), so expect several minutes. Within a minute or two `ps` should show:

| Service | Expected state |
|---|---|
| `db` | `Up ... (healthy)` |
| `web` | `Up ... (healthy)` once started (the first check can take up to a minute) |
| `cloudflared` | `Up` |

If `pull` says `denied` or `unauthorized`, the login (D4) or the token's `read:packages` scope is wrong. If it says `manifest unknown`, the tag in `.env` does not exist yet (the release build is not green).

## D6. Create the database tables

**[Server · Ubuntu]**
```bash
docker compose exec web npx prisma migrate deploy
```
It ends with `All migrations have been successfully applied.` (about 15 migrations on a new install). On every later update the updater runs this for you.

## D7. Create the first administrator

> **Do not run `prisma db seed`.** That command fills the database with a demo company, demo projects and demo sales and four `@friends.com` demo logins; its own comment says never to run it on a customer's database. Use the command below instead: it creates one real Super Admin and nothing else.

**[Server · Ubuntu]**, from `~/neev-cms`. It asks for the details (the password is not echoed and does not end up in your shell history):
```bash
read -rp  "Admin full name: " ADMIN_NAME
read -rp  "Admin email: " ADMIN_EMAIL
read -rsp "Admin password (10+ characters, a letter and a number): " ADMIN_PASSWORD; echo

docker compose exec -T -e ADMIN_NAME="$ADMIN_NAME" -e ADMIN_EMAIL="$ADMIN_EMAIL" -e ADMIN_PASSWORD="$ADMIN_PASSWORD" web node - <<'JS'
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const name = (process.env.ADMIN_NAME || '').trim()
const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase()
const pw = process.env.ADMIN_PASSWORD || ''
if (!name || !email || !pw) { console.error('Set ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD first'); process.exit(1) }
if (pw.length < 10 || Buffer.byteLength(pw) > 72 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) {
  console.error('The password must be 10 to 72 characters with at least one letter and one number'); process.exit(1)
}

const prisma = new PrismaClient()
;(async () => {
  const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } })
  if (existing) { console.log('That user already exists, nothing was changed:', existing.email); return }
  const user = await prisma.user.create({
    data: { name, email, password: await bcrypt.hash(pw, 12), role: 'SUPER_ADMIN', passwordChangedAt: new Date() },
  })
  console.log('Created', user.role, user.email)
})().catch((e) => { console.error(e.message); process.exitCode = 1 }).finally(() => prisma.$disconnect())
JS

unset ADMIN_PASSWORD
```
Example of the prompts and result:
```
Admin full name: Ramesh Shah
Admin email: ramesh@paradigmfriends.com
Admin password (10+ characters, a letter and a number):
Created SUPER_ADMIN ramesh@paradigmfriends.com
```
The password rules are the app's own (10 to 72 characters, at least one letter and one number, not a common password). Staff accounts are created afterwards by this Super Admin on the app's **Users** page; roles are `SUPER_ADMIN`, `ADMIN`, `SALES` and `VIEWER`.

## D8. Check that it is live

**[Server · Ubuntu]**
```bash
docker compose logs --tail=15 cloudflared
```
Look for four lines containing `Registered tunnel connection`. If you see `permission denied` about the credentials file, redo the `chmod` in D2. If it cannot connect at all, outbound port 7844 is blocked.

```bash
docker compose logs web | grep -i license | tail -3
```
You want a line like `[License] Licensed to Paradigm Friends Realtors LLP until ...`.

```bash
curl -s https://pfr.example.com/api/health
```
Expected:
```json
{"status":"ok","version":"0.0.40","build":"2000c10","timestamp":"2026-11-04T10:30:00.000Z"}
```
Finally, from any computer, open **https://pfr.example.com** in a browser and sign in with the administrator from D7. The login page footer shows the version (`v0.0.40 · 2000c10`). Back in the Cloudflare dashboard, the tunnel now shows **Healthy**.

---

# Part E: make it permanent and safe

## E1. Reboot test (do not skip)

This is the requirement that matters most: it must come back by itself with nobody logged in.

**[Server · PowerShell (Admin)]**
```powershell
Restart-Computer
```
Do **not** log in. From another computer, `https://pfr.example.com/api/health` should answer within about 7 minutes of the machine starting (up to 5 minutes for the next task tick, then about a minute for Docker and the tunnel).

If you can reach the server another way, check passively first (`schtasks /query /tn "Start-WSL-Docker" /v /fo LIST` shows `Running`; `wsl -l -v` shows the distro `Running`). If it does not come back, go to Part G and `WINDOWS-INSTALL.md`, "Troubleshooting".

## E2. The daily job

The app posts late-payment interest and moves overdue demands once a day. Something must trigger it, and a day the server was off is made up by the next run.

**[Server · PowerShell (Admin)]** Download the two launchers into `C:\NeevCMS`. They are stored with Unix line endings on GitHub, so the second part converts them to Windows line endings (Windows `cmd` can misread the other kind):
```powershell
New-Item -ItemType Directory -Force C:\NeevCMS | Out-Null
$tag  = 'v0.0.40'
$base = "https://raw.githubusercontent.com/apgosar/friends-conman-system/$tag/deploy/onprem"
foreach ($f in 'Update-NeevCMS.bat', 'Run-NeevDailyJob.bat') {
  Invoke-WebRequest "$base/$f" -OutFile "C:\NeevCMS\$f" -UseBasicParsing
  (Get-Content "C:\NeevCMS\$f") | Set-Content "C:\NeevCMS\$f" -Encoding ascii
}
```
Tell both files your distro and app folder (use the **absolute** folder path):
```powershell
foreach ($f in 'Update-NeevCMS.bat', 'Run-NeevDailyJob.bat') {
  (Get-Content "C:\NeevCMS\$f") `
    -replace 'set "DISTRO=.*"', 'set "DISTRO=Ubuntu-22.04"' `
    -replace 'set "APPDIR=.*"', 'set "APPDIR=/home/neev/neev-cms"' |
    Set-Content "C:\NeevCMS\$f" -Encoding ascii
}
Select-String -Path C:\NeevCMS\*.bat -Pattern '^set "(DISTRO|APPDIR|WSLUSER)='
```
Leave `WSLUSER` empty unless the app was installed under a different Linux user than the distro's default.

Run it once by hand; it should print `200` and `Daily job done.`:
```powershell
C:\NeevCMS\Run-NeevDailyJob.bat
```
Schedule it for 00:30 every day, whether or not anyone is logged in:
```powershell
schtasks /create /tn "Neev CMS daily job" /tr "C:\NeevCMS\Run-NeevDailyJob.bat" /sc daily /st 00:30 /ru "$env:COMPUTERNAME\serveradmin" /rp 'TheWindowsPassword' /rl highest /f
schtasks /query /tn "Neev CMS daily job"
```
(If `schtasks` prints nothing or the task is missing, see Part G, "schtasks is silent".)

## E3. The one-click updater

`C:\NeevCMS\Update-NeevCMS.bat` (downloaded and configured in E2) is what the customer double-clicks to install a new release. It downloads the matching `update.sh`, backs up the database, applies database migrations, switches the app over, rolls back by itself if the new version does not start, and runs any one-time data conversion. Details are in `README.md`, "Updating a customer's server".

Make a desktop shortcut called **Update Neev CMS**:

**[Server · PowerShell (Admin)]**
```powershell
$lnk = (New-Object -ComObject WScript.Shell).CreateShortcut("$env:PUBLIC\Desktop\Update Neev CMS.lnk")
$lnk.TargetPath = 'C:\NeevCMS\Update-NeevCMS.bat'
$lnk.WorkingDirectory = 'C:\NeevCMS'
$lnk.Save()
```

**Dry run it once, with the version that is already installed.** It downloads nothing new, takes a backup, checks the database and health, and proves the registry login, the backup and the Windows-to-WSL hand-off all work before a real update depends on them:
```powershell
C:\NeevCMS\Update-NeevCMS.bat v0.0.40
```
It should end with `Checked v0.0.40 - everything is up to date.`

## E4. Backups

The updater takes a database backup before every update and keeps the last 10 in `~/neev-cms/backups`. That is not enough on its own: take regular copies **off the server** too. There is no automatic nightly backup yet.

**[Server · Ubuntu]** Database:
```bash
cd ~/neev-cms
mkdir -p backups
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" --clean --if-exists --no-owner "$POSTGRES_DB"' | gzip > backups/db-manual-$(date +%Y%m%d-%H%M%S).sql.gz
ls -lh backups | tail -3
```
Uploaded documents (KYC scans, generated PDFs) live in a separate Docker volume, `files`:
```bash
docker run --rm -v neev-cms_files:/data -v "$PWD/backups":/backup alpine tar czf /backup/files-manual-$(date +%Y%m%d-%H%M%S).tgz -C /data .
ls -lh backups | tail -3
```
*(The database command is the one the updater uses. The files command was tested on a Docker volume, including a restore, but not yet on a customer server: check the file's size the first time.)*

The database backup and the files backup belong together: take them at the same time, and restore them together.

Copy `backups\` and `.env` to storage you control. From Windows, the folder is `\\wsl$\Ubuntu-22.04\home\neev\neev-cms\backups`. `.env` holds the `PII_ENCRYPTION_KEY` (D3); a database backup without it cannot be read.

**Restore a database backup** (stops the app briefly):
```bash
docker compose stop web
gunzip -c backups/db-manual-20261104-103000.sql.gz | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose start web
```

**Restore the uploaded documents** (replaces what is in the volume; the owner must be the app's user, 1001):
```bash
docker compose stop web
docker run --rm -v neev-cms_files:/data -v "$PWD/backups":/backup alpine sh -c "rm -rf /data/* && cd /data && tar xzf /backup/files-manual-20261104-103000.tgz && chown -R 1001:1001 /data"
docker compose start web
```

## E5. Security checklist

1. **Disk encryption.** The WSL disk lives on the Windows drive, so encrypting the drive covers it.
   **[Server · PowerShell (Admin)]**
   ```powershell
   Enable-BitLocker -MountPoint "C:" -EncryptionMethod XtsAes256 -UsedSpaceOnly -RecoveryPasswordProtector
   ```
   Save the recovery password somewhere that is not this server.
2. **No inbound firewall rule for the app.** The tunnel is outbound only. Review what is open and remove anything not deliberately needed:
   ```powershell
   Get-NetFirewallRule -Direction Inbound -Enabled True -Action Allow | Select-Object DisplayName, Profile
   ```
   If remote desktop is enabled for your own access, limit it to your IP or a VPN.
3. **Change any default or shared passwords** on the Windows account, and give the Windows account a strong password (it is stored in the scheduled tasks).
4. **`.env` stays `chmod 600`** and is never copied to a place others can read.
5. **Cloudflare:** Always Use HTTPS (A2); optionally add WAF/rate-limit rules and Cloudflare Access for an extra login in front of the app (see `DEPLOYMENT_ONPREM.md`, section 5).
6. **One GitHub token per customer** (A5), with a calendar reminder for its expiry.

## E6. Optional: email, WhatsApp and ID-card reading

These are settings in `.env`. Edit the file, then restart only the app:
```bash
cd ~/neev-cms
nano .env
docker compose up -d web
```
| Feature | Lines to set in `.env` |
|---|---|
| Email through Gmail (needs 2-step verification and an *app password*) | `GMAIL_USER="accounts@customer.com"`, `GMAIL_APP_PASSWORD="abcd efgh ijkl mnop"` |
| Email through any SMTP server | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, optionally `SMTP_FROM_ADDRESS` |
| WhatsApp Cloud API | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` |
| PAN / Aadhaar card reading (OCR) | `AZAPI_TOKEN` |

The startup log prints "No email provider configured" until email is set; that is only a warning. The Settings page's email badge is decided when the image is built, so it can read "not configured" on a prebuilt image even when email works: send a real test email to confirm.

---

# Part F: day-2 operations

All in **[Server · Ubuntu]** from `~/neev-cms` unless stated.

**See what is running**
```bash
docker compose ps
docker compose exec web wget -qO- http://localhost:8080/api/health
```
From anywhere: `https://pfr.example.com/api/health` (shows `version` and `build`), or the footer on the login page.

**Logs**
```bash
docker compose logs -f --tail=50 web
```
More recipes (errors only, one service, debug level, database prompt) are in `DEBUGGING.md`.

**Release and install a new version.** You:

**[Your PC · PowerShell]**
```powershell
git tag v0.0.41
git push origin v0.0.41
```
Wait for the green Action (about four minutes), then tell the customer the tag. They double-click **Update Neev CMS**, type `v0.0.41`, confirm, and wait a few minutes (about a minute of downtime). A failed update rolls itself back, and the customer can send you the newest file in `~/neev-cms/update-logs`. The updater does **not** change `docker-compose.yml` or add new `.env` settings; if a release needs either, tell the customer separately.

**Move a server that still runs MinIO to the files volume (once per server).** Servers set up before v0.0.42 keep uploaded documents in a MinIO container. MinIO has withdrawn its images, so that container can no longer be re-downloaded if it is ever recreated on a new machine. Servers set up from v0.0.42 on have nothing to move (the script says so and stops). First update the app to v0.0.42 or newer (the normal updater), then:

**[Server · Ubuntu]**
```bash
cd ~/neev-cms
curl -fsSL https://raw.githubusercontent.com/apgosar/friends-conman-system/v0.0.42/deploy/onprem/switch-to-local-storage.sh -o switch-to-local-storage.sh
bash switch-to-local-storage.sh
```
It copies every document into the new `files` volume while the app keeps running, asks before it stops the app (about a minute), copies what changed in the meantime, **proves the two are identical**, swaps in the `docker-compose.yml` and `.env` settings for your release (`IMAGE_TAG` in `.env`), and starts the app without MinIO. It saves your old `docker-compose.yml` and `.env` first (in `backups/storage-switch-<time>/`) and puts them back by itself if the app does not become healthy. The database restarts briefly because `.env` changes. Afterwards, sign in and open a sale's documents. The old MinIO data stays in the `minio-data` volume as a safety copy; after a week, free the space with `docker volume rm neev-cms_minio-data`. To go back, copy the two saved files back and run `docker compose up -d --remove-orphans` (documents uploaded since the switch are only in the new volume). Take a backup (E4) first; it is cheap insurance.

**Move a project from one server to another.** For a project set up on one customer server (or your test server) that now belongs on another. It is done in the browser by a Super Admin of each server, with nothing to run on either machine. Both servers must run a release that has it (the first one after v0.0.42), and the destination must be on the same release or newer.

1. **Source server.** Open the project, choose **Export Project**, type a passphrase of at least 12 characters twice, and **Download file**. You get one `.neevproject` file with the building, sales, buyers (their PAN and Aadhaar numbers are inside, readable only with the passphrase), payments and receipts, interest, loans, documents, templates, inquiries with their quotations, parking, plans, charges, and every stored file that belongs to them. Send the passphrase by a different route than the file.
2. **Destination server.** Open **Projects**, choose **Import Project**, pick the file, type the passphrase and choose **Open the file**. The file goes up in 5 MB pieces, so a project with thousands of documents is fine. It then shows what is inside (counts, the company, and anything worth knowing) and whether it can be imported. Nothing is saved yet.
3. Choose **Import project** and confirm. It is all or nothing: if anything fails, nothing is left behind, including files. Open the project and check a sale, a payment and a document.

What to know:
- **It is a copy.** The project stays on the old server. If you are moving it for good, delete it on the old server once you have checked the new one (**Delete Project**, Super Admin), otherwise buyers can get payment reminders from both servers.
- **Not carried:** old messages (a copied queued message would be sent again to the buyer) and the activity history. The import writes its own entry in the activity log.
- **The company** is matched by name. If the destination already has it, the project uses that one and only adds partners it lacks; the company's own details and letterhead are not overwritten. Otherwise the company is added with its partners.
- **People** named in records (who waived interest, who approved a reminder) are matched to a user with the same e-mail on the destination, and credited to the importing Super Admin when there is none.
- **Numbers.** Sale and receipt numbers are kept as they are, and the next ones carry on after them. If another project on the destination already uses the same numbers (the short code comes from the project name, so "Neev Court" and "Nova Centre" are both NC), the import is refused with the numbers named; nothing is renumbered, because they are printed on documents already issued.
- **PAN and Aadhaar** are decrypted for the file and encrypted again with the destination's own `PII_ENCRYPTION_KEY`, so the two servers do not need the same key.
- **Space.** The uploaded pieces sit in the destination's `files` volume until the import finishes or is cancelled, so it needs room for about twice the file. If a browser is closed half-way through an upload, those pieces stay in the `transfers` folder of that volume; they can be deleted.

**Renew a license.** Issue a new token on your PC (B4, same command), then on the server replace the value and restart the app:
```bash
nano .env          # replace the LICENSE_TOKEN value
docker compose up -d web
```
The license is checked in the background every ~15 minutes, so editing the file alone is not enough; the restart is.

**Rotate the Windows password used by the scheduled tasks.** A changed password breaks the tasks silently until the next reboot:

**[Server · PowerShell (Admin)]**
```powershell
schtasks /change /tn "Start-WSL-Docker" /rp 'NewPassword'
schtasks /change /tn "Neev CMS daily job" /rp 'NewPassword'
```

**Take a customer offline for good.** In this order. First stop the stack on the server (a tunnel with a live connection cannot be deleted):

**[Server · Ubuntu]**
```bash
cd ~/neev-cms
docker compose down
```
Then, on your PC, delete the tunnel, delete the `pfr` record in Cloudflare DNS (dashboard, DNS, Records), and revoke that customer's GitHub token (A5):

**[Your PC · PowerShell]**
```powershell
cloudflared tunnel delete neev-cms-pfr
```
Keep a final database backup (E4) for as long as your agreement requires before anyone deletes the server's data.

---

# Part G: troubleshooting

Start with the general-purpose questions: is the server on, is the task running (`schtasks /query /tn "Start-WSL-Docker" /v /fo LIST`), is the distro running (`wsl -l -v`), are the containers up (`docker compose ps`).

| What you see | Likely cause | What to do |
|---|---|---|
| **Cloudflare error 1033** (HTTP 530), "Argo Tunnel error" | Nothing is connected to the tunnel: server off or asleep, WSL stopped, or `cloudflared` not running | Check the server is on; `schtasks /run /tn "Start-WSL-Docker"`; `docker compose logs cloudflared`. If it recurs after reboots or sleep, read `WINDOWS-INSTALL.md`, "Troubleshooting". |
| **Cloudflare 502 / Bad gateway** | Tunnel is up but the app is not: `web` stopped or unhealthy, or the `service:` line in `config.yml` is wrong | `docker compose ps`, `docker compose logs --tail=50 web`; `service` must be `http://web:8080`. |
| **Cloudflare 1016**, "Origin DNS error", or the name does not resolve | The DNS record is missing or on the wrong domain | B2 step 4: look at DNS Records; recreate with `cloudflared tunnel route dns`. |
| Browser **certificate error** on `pfr.example.com` | Two-level hostname (`a.b.example.com`) or the domain is not Active yet | Use `<slug>.<your-domain>` only; wait for Active (A2). |
| `cloudflared` log: **permission denied** on the credentials file | The container cannot read a file only you can read | `chmod 755 cloudflared; chmod 644 cloudflared/*` in `~/neev-cms`, then `docker compose restart cloudflared`. |
| `cloudflared` log: cannot connect, timeouts to `*.argotunnel.com` | Outbound port **7844** blocked by the customer's firewall | Ask them to allow outbound TCP and UDP 7844 to Cloudflare. |
| Every page says **license expired / invalid**; log has `[License]` | `docker compose logs web \| grep -i license`: *signature invalid* means the image was built before you changed the public key (rebuild and re-release); *not valid for host* means the license `--host` differs from the address in use; *expired* means renew (Part F) | Fix per the message, then `docker compose up -d web`. |
| `web` unhealthy, log says **Invalid URL** | `NEXTAUTH_URL` or `APP_URL` in `.env` is still a placeholder | Set both to `https://<hostname>`, then `docker compose up -d web`. |
| `docker compose pull`: **denied / unauthorized** for `ghcr.io/apgosar/...` | Not logged in, wrong token, token missing `read:packages`, or expired | Repeat D4 with a valid classic token. |
| Import Project: **The passphrase is wrong, or this is not a Neev CMS project file** | Either the passphrase has a typo, or the file is not an export from Neev CMS. A file that was changed or cut short says **damaged or incomplete** instead | Type the passphrase again (**Check again**). If it still fails, export again on the source server and upload the new file |
| Import Project: **made by a newer version of Neev CMS** | The source server runs a newer release than this one | Update this server to the same release or newer (E3), then import again |
| Import Project: **sale numbers already used here** | Another project on this server has the same short code, so the numbers clash | Nothing is changed. The numbers are printed on issued documents, so they are never renumbered. Import onto a server where those numbers are free, or ask your support contact if the other project on this server can be moved first |
| Export Project: **A PAN or Aadhaar number could not be read** | This server's `PII_ENCRYPTION_KEY` is not the one the numbers were saved with (for example `.env` was rebuilt) | Put back the key the data was saved with. Nothing was exported |
| `docker compose pull`: **pull access denied for minio/minio** or **minio/mc** (login already works) | MinIO removed those images from Docker Hub in September 2026, and Quay now needs a login. Your `docker-compose.yml` is an older copy that still names them. The other images (Postgres, cloudflared) are fine; they only show "Interrupted" because the pull stopped | Best: update to v0.0.42 or newer and run the move to the files volume (Part F, "Move a server that still runs MinIO"); MinIO is then not needed at all. Quick fix to stay on MinIO for now: point the file at Chainguard's free build: `sed -i 's#image: minio/minio:latest#image: cgr.dev/chainguard/minio:latest#; s#image: minio/mc:latest#image: cgr.dev/chainguard/minio:latest#' docker-compose.yml`, then `docker compose pull && docker compose up -d`. |
| `docker compose pull`: **manifest unknown** | That tag is not in the registry | Check `IMAGE_TAG`; make sure the release Action finished green. |
| `migrate deploy` fails with **P3018 / P3009** or a SQL error | A migration could not apply | Stop. Do not retry blindly; send the output to yourself/support. On a fresh install, the database is empty, so `docker compose down -v` then start over is safe **only before real data exists**. |
| **Cannot sign in** with a password you set | Rules not met, or too many failed tries | Rules: 10+ characters, letter and number. Wait a few minutes after repeated failures. |
| `schtasks /create` **prints nothing**, task not created | Something intercepts the command (seen with security software) | Use the keep-alive wrapper script (C4b); check the product's protection history; ask the customer's IT for an allow rule. |
| Task exists but **does not show** in Task Scheduler | The window was open before the task was created | Press F5 in `taskschd.msc`; confirm with `schtasks /query /tn "<name>"`. |
| App **not back after a reboot** | Keep-alive task, wrong distro name, sleep | `WINDOWS-INSTALL.md`, "Troubleshooting: app doesn't come back after a reboot" (event IDs 329, 201, 118 explained there). |
| Uploads or PDFs fail, everything slow | Disk full or low memory | `df -h`, `docker system df`, `docker stats --no-stream` (see `DEBUGGING.md`, section 6). |

For anything else, send these three (taken right after repeating the problem), as `DEBUGGING.md` describes:
```bash
docker compose ps
docker compose logs web --since 10m
docker compose logs cloudflared --since 10m
```

---

# Final checklist

Print this and tick it off per customer.

**Once, for your business**
- [ ] Domain bought, registrar two-factor on
- [ ] Domain **Active** on Cloudflare, Cloudflare two-factor on
- [ ] Git, Node.js, `cloudflared` installed on your PC; repository cloned; `npm ci` run
- [ ] License keypair created, private file backed up, public key committed
- [ ] GitHub package set to **Private**

**Per customer: your PC**
- [ ] Slug, hostname (`<slug>.<your-domain>`, one level) and tunnel name chosen
- [ ] `cloudflared tunnel login`, `create`, `route dns` done; CNAME visible and **Proxied**
- [ ] `config.yml` written; tunnel `.json` copied into the kit
- [ ] License issued for exactly that hostname
- [ ] Release tag exists and its Action is green
- [ ] GitHub token (classic, `read:packages`) created, named for this customer, expiry noted

**Per customer: the server**
- [ ] WSL2 + Ubuntu installed; real distro name noted; systemd on; Docker works without `sudo`
- [ ] `Start-WSL-Docker` task created **and visible**, settings fixed (no 72 h limit, battery boxes, "do not start a new instance"), sleep/hibernate off, `.wslconfig` written
- [ ] App folder, `docker-compose.yml`, `.env` (no `CHANGE_ME` left), tunnel files (readable), `license.jwt` in place
- [ ] `PII_ENCRYPTION_KEY` copied somewhere safe, away from the server
- [ ] `docker login ghcr.io` succeeded; `docker compose pull` and `up -d` done; all services healthy
- [ ] `migrate deploy` applied; first Super Admin created (**no demo seed**)
- [ ] Cloudflare tunnel **Healthy**; `https://<hostname>/api/health` answers; login works from another computer
- [ ] Reboot test passed with nobody logged in
- [ ] Daily job scheduled and run once by hand
- [ ] Updater launcher configured, shortcut made, dry run succeeded
- [ ] BitLocker on; no inbound firewall rules for the app; backups copied off the server once, restore tested

---

### Where the older documents still help

| File | Use it for |
|---|---|
| [README.md](README.md) | How the updater works step by step, one-time data conversions, restoring a backup |
| [WINDOWS-INSTALL.md](WINDOWS-INSTALL.md) | The long troubleshooting tree for "it stopped after a reboot or a sleep", with the Windows event IDs explained |
| [DEBUGGING.md](DEBUGGING.md) | Reading logs and checking the app's settings on a running server |
| [DEPLOYMENT_ONPREM.md](../../DEPLOYMENT_ONPREM.md) | Why it is built this way: licensing design, container hardening, legal layer |
