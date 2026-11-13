# Debugging Neev CMS on the server

Every command here runs in the **Ubuntu (WSL) shell on VDSSERVER**, not in Windows PowerShell. The app folder is the one that holds `docker-compose.yml` (for example `/home/ankur/neev-cms`; the README shows how to find it). Use your own folder in the first command.

The app writes JSON log lines (pino). In them, level 30 is info, 40 is a warning, 50 is an error and 60 is fatal.

## 1. Is it running?

Go to the app folder and list the containers. All of `web`, `db` and `cloudflared` should be `Up` (a server not yet moved to the `files` volume also runs `minio`):

```bash
cd /home/ankur/neev-cms && docker compose ps
```

Include stopped containers, to see one that crashed:

```bash
docker compose ps --all
```

Ask the app whether it is healthy. The port is the one in the `ports:` line under `web` in `docker-compose.yml`:

```bash
curl -s http://localhost:3000/api/health
```

Check which release is running:

```bash
docker compose images web
```

## 2. Read the logs

Watch the log live while you repeat the problem in the browser (press Ctrl+C to stop):

```bash
docker compose logs -f --tail=50 web
```

The last 30 minutes, errors only:

```bash
docker compose logs web --since 30m | grep -iE '"level":(50|60)|error'
```

Everything from one area, for example the ID-card reading:

```bash
docker compose logs web --since 1h | grep -i "KYC"
```

All services together (useful if `web` shows nothing, or its name differs in your folder):

```bash
docker compose logs --since 15m
```

The database or the file store:

```bash
docker compose logs --since 30m db
```

```bash
docker compose logs --since 30m minio   # only on a server that still runs MinIO
```

The tunnel to the internet:

```bash
docker compose logs --since 30m cloudflared
```

### Why an error shows on screen but nothing is in the log

The app only logs **unexpected** failures. A refusal it expects, such as "This PDF is password protected" or "The PDF could not be read", is sent to the browser and not written to the log. So an empty log does not mean nothing happened. Look at what the browser received (section 3) or turn on debug logging (section 4).

## 3. See what the browser received

This is often the fastest check. In the browser press F12, open the **Network** tab, repeat the action, click the failing request (for example `extract-kyc`) and read its **Response**. The exact message the screen showed is there.

## 4. Turn on more detail

Add `LOG_LEVEL=debug` to the `web` service's environment (the `.env` file next to `docker-compose.yml`), then restart that service:

```bash
docker compose up -d web
```

Set it back to `info` afterwards and restart again, because debug logs are large.

## 5. Check the settings the app was started with

Whether a secret is set, without printing it (replace `AZAPI_TOKEN` with the name you are checking):

```bash
docker compose exec web sh -c 'test -n "$AZAPI_TOKEN" && echo set || echo MISSING'
```

Whether the server can reach the OCR service:

```bash
docker compose exec web sh -c 'wget -qO- --server-response https://ocr.azapi.ai 2>&1 | head -3'
```

## 6. Look inside the container

Open a shell inside the app:

```bash
docker compose exec web sh
```

Disk space (a full disk breaks uploads and the database):

```bash
df -h
```

```bash
docker system df
```

Memory and CPU use per container:

```bash
docker stats --no-stream
```

## 7. Database

Open a SQL prompt (the user and database names are in your `.env`):

```bash
docker compose exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

Which migrations have been applied:

```sql
SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;
```

## 8. Restart

Restart only the app (keeps the data):

```bash
docker compose restart web
```

Start everything again if something is stopped:

```bash
docker compose up -d
```

## 9. The daily job (interest, overdue ageing, payment reminders)

`C:\NeevCMS\Run-NeevDailyJob.bat` runs once a day from the Windows task "Neev CMS daily job" (README, "Daily job"). It asks the app to run the job, and the app answers with what it did. Unlike the rest of this page, the first three checks are on the **Windows** side.

**a. The run log (Windows).** Every run adds the date and time, the attempt, the exit code and the app's answer to `C:\NeevCMS\daily-job.log`. A good run looks like `[14-Nov-26  0:30:02.15] attempt 1 of 4, exit code 0` followed by `200 {"success":true,"message":"Daily job complete: 42 demands checked, 3 reminded (6 messages)"}`. To see the last few runs, in **PowerShell**:

```powershell
Get-Content C:\NeevCMS\daily-job.log -Tail 20
```

| Exit code / answer | Meaning |
|---|---|
| `0` and `200 ...` | The job ran |
| `1` and `401 ...` | `CRON_SECRET` in the app's `.env` is empty or still the placeholder |
| `1` and `500 ...` | The job failed: the reason is in the app's log (d) |
| `1` and `fetch failed` / `service "web" is not running` | The app was not up. The .bat tries again 4 times, 5 minutes apart |
| `91` | `APPDIR` at the top of the .bat is wrong |
| `There is no distribution with the supplied name` | `DISTRO` at the top of the .bat is wrong (compare with `wsl -l -v`) |

**b. Did Windows start it? (PowerShell)**

```powershell
schtasks /query /tn "Neev CMS daily job" /v /fo list | Select-String "Last Run Time|Last Result|Next Run Time|Status"
```

`Last Result: 0` is a good run. For the history of every start, open `taskschd.msc`, select the task and use its **History** tab (if it is empty, click **Enable All Tasks History** in the right-hand pane; runs from then on are listed).

**c. Run it now, and watch (PowerShell)**

```powershell
cd C:\NeevCMS
.\Run-NeevDailyJob.bat
```

or start the scheduled task itself, exactly as the scheduler would, and check (b) a minute later:

```powershell
schtasks /run /tn "Neev CMS daily job"
```

Running it twice in a day is safe: interest is rebuilt, not added again, and a demand gets at most one reminder a week.

**d. What the app logged (Ubuntu/WSL, in the app folder)**

```bash
docker compose logs web --since 24h | grep -i "daily"
```

Each run logs `Daily job complete` with the counts, then `Daily job: reminders dispatched` when it sent reminders. A failure logs `Daily cron failed` or `Daily job: reminders could not be dispatched` with the reason (`err`). To see a single message that failed to send:

```bash
docker compose logs web --since 24h | grep -i "could not be sent"
```

**e. The reminders themselves.** In the app, **Communications**, filter **Type: Payment Reminder**: every reminder with its channel, status and failure reason, and **Retry**. Which demands were reminded, how often and when last, is on the database: open the SQL prompt (section 7) and run

```sql
SELECT description, status, "reminderCount", "lastReminderAt" FROM payment_schedules WHERE "lastReminderAt" IS NOT NULL ORDER BY "lastReminderAt" DESC LIMIT 20;
```

## What to send when asking for help

The output of these three, taken right after repeating the problem:

```bash
docker compose ps
```

```bash
docker compose logs web --since 10m
```

and the **Response** text from the browser's Network tab (section 3).
