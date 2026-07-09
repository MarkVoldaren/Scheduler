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
- `PORT`: server port, defaults to `3000`.
- `DATA_DIR`: runtime data directory, defaults to `./data`.
- `SQLITE_PATH`: SQLite path, defaults to `${DATA_DIR}/app.sqlite`.
- `MAX_UPLOAD_BYTES`: upload limit, defaults to `52428800`.

## Droplet Deployment

Suggested layout:

```text
/opt/scheduler-operations
  app.js
  index.html
  styles.css
  server.js
  package.json
  data/
    app.sqlite
    uploads/
      work-center.csv
      pick-list.csv
```

Install and start:

```bash
cd /opt/scheduler-operations
npm ci --omit=dev
sudo mkdir -p /opt/scheduler-operations/data/uploads
sudo chown -R scheduler:scheduler /opt/scheduler-operations/data
```

Example `/etc/scheduler-operations.env`:

```bash
NODE_ENV=production
PORT=3000
APP_PASSWORD=replace-with-shared-password
SESSION_SECRET=replace-with-long-random-secret
DATA_DIR=/opt/scheduler-operations/data
```

Example systemd service:

```ini
[Unit]
Description=Scheduler Operations
After=network.target

[Service]
Type=simple
User=scheduler
WorkingDirectory=/opt/scheduler-operations
EnvironmentFile=/etc/scheduler-operations.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Run:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now scheduler-operations
sudo systemctl status scheduler-operations
```

Put Nginx or Caddy in front for HTTPS and reverse proxy to `127.0.0.1:3000`. Set the proxy upload limit high enough for your CSV files.

Back up `data/app.sqlite` and `data/uploads/*.csv` if you need to preserve the current operational state before replacing or moving the droplet.
