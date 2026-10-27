# Debugging Neev CMS on the server

Every command here runs in the **Ubuntu (WSL) shell on VDSSERVER**, not in Windows PowerShell. The app folder is the one that holds `docker-compose.yml` (for example `/home/ankur/neev-cms`; the README shows how to find it). Use your own folder in the first command.

The app writes JSON log lines (pino). In them, level 30 is info, 40 is a warning, 50 is an error and 60 is fatal.

## 1. Is it running?

Go to the app folder and list the containers. All of `web`, `db`, `minio` and `cloudflared` should be `Up`:

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
docker compose logs --since 30m minio
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

## What to send when asking for help

The output of these three, taken right after repeating the problem:

```bash
docker compose ps
```

```bash
docker compose logs web --since 10m
```

and the **Response** text from the browser's Network tab (section 3).
