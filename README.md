# Scheduler Operations

Scheduler Operations is a vanilla HTML/CSS/JS production scheduling app served by a small Node/Express backend. The backend protects the app with one shared password, persists the active uploaded CSV files on disk, and stores shared operational settings in SQLite.

## Local Development

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Start the server:

   ```powershell
   $env:APP_PASSWORD="change-this"
   $env:SESSION_SECRET="use-a-long-random-secret"
   npm start
   ```

3. Open `http://127.0.0.1:3000`.

The server stores runtime data in `data/` by default:

- `data/app.sqlite`
- `data/uploads/work-center.csv`
- `data/uploads/pick-list.csv`

New CSV uploads overwrite the active CSV file. The app does not retain upload history.

## Environment Variables

- `APP_PASSWORD`: shared password required to enter the app.
- `SESSION_SECRET`: long random string used to sign the HTTP-only session cookie.
- `HOST`: bind host, defaults to `127.0.0.1`; use `0.0.0.0` inside Docker.
- `PORT`: server port, defaults to `3000`.
- `DATA_DIR`: runtime data directory, defaults to `./data`.
- `SQLITE_PATH`: SQLite path, defaults to `${DATA_DIR}/app.sqlite`.
- `MAX_UPLOAD_BYTES`: upload limit, defaults to `52428800`.

## Droplet Deployment With Existing Gospel Light Caddy

This droplet already has a Docker Caddy reverse proxy container named `gospellight-caddy-1` using the external Docker network `gospellight_scheduler`. Deploy Scheduler as a Docker container on that same network and route `/scheduler/` through the existing Duramark domain.

Clone and configure:

```bash
cd /opt
sudo git clone https://github.com/MarkVoldaren/Scheduler.git scheduler-operations
sudo chown -R "$USER":"$USER" /opt/scheduler-operations
cd /opt/scheduler-operations
cp .env.example .env
nano .env
```

Set real values in `.env`:

```bash
APP_PASSWORD=replace-with-your-shared-password
SESSION_SECRET=replace-with-a-long-random-secret
```

Build and start Scheduler:

```bash
docker compose up -d --build
docker ps --filter name=scheduler-app
```

Edit the existing active Caddyfile:

```bash
sudo nano /opt/gospellight/Caddyfile
```

Inside the existing `duramark.jays-apps.com` site block, add the Scheduler route before the fallback Duramark selector route:

```caddyfile
handle_path /scheduler/* {
    reverse_proxy scheduler-app:3000
}
```

Validate and reload the running Caddy container:

```bash
docker exec gospellight-caddy-1 caddy validate --config /etc/caddy/Caddyfile
docker exec gospellight-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

Test:

```bash
curl -I https://duramark.jays-apps.com/scheduler/
```

Deploy updates later:

```bash
cd /opt/scheduler-operations
git pull
docker compose up -d --build
docker exec gospellight-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

Back up `data/app.sqlite` and `data/uploads/*.csv` if you need to preserve the current operational state before replacing or moving the droplet.
