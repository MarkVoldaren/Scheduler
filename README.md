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
   $env:ADMIN_PASSWORD="use-a-different-admin-password"
   $env:SESSION_SECRET="use-a-long-random-secret"
   npm start
   ```

3. Open `http://127.0.0.1:3000`.

The server stores runtime data in `data/` by default:

- `data/app.sqlite`
- `data/uploads/work-center.csv`
- `data/uploads/pick-list.csv`

New CSV uploads overwrite the active CSV file. The app does not retain upload history.

## Projects

The **Remaining operations** chart records the first accepted Work Center upload each calendar day in America/Chicago. It counts current and future normalized operations once using the same combo/WO ownership rules as project totals; zero hours alone does not mean an operation is complete. New projects start with a baseline when their first scope is saved. Existing projects receive a baseline from valid available data when the feature starts; earlier history is not reconstructed. Baselines keep their date's reading, and later uploads that day do not replace it. Archived projects continue tracking. Scope changes are annotated without rewriting earlier counts. Open the history table for exact readings and source timestamps. Failed uploads and unavailable sources add no readings; valid empty uploads can record zero. The trend is dashboard-only and is not added to printouts or CSV exports.

Add optional **Project notes** when creating a project or through **Edit details**. Notes are shared plain text, support multiple lines and up to 5,000 characters, and save with **Save changes**. They persist across uploads and restarts and remain editable on archived projects. Saved notes appear on the dashboard and after the printed scope summary, with continuation pages when needed. Unsaved edits remain in the form during downloads, refreshes, or failed saves. Notes are not included in the part-level CSV export.

Open **Projects** in the sidebar to create a named group, optionally set its customer and target date, and add whole combos or standalone work orders. Projects are shared by all signed-in viewers. Project metadata, membership, and the last known work details are stored in the existing SQLite database; replacing either CSV does not remove them. Archive old projects and use **Archived projects** to find and restore them.

Use **Download CSV** beside **Print Project** to export the selected project's saved scope. The export has one row per work-order and part, expands combos without repeating operation rows, includes retained inferred-complete work, and is independent of dashboard filters. It contains part, description, WO, Dynamic BOM, customer, quantity, ship-by date, remaining hours, production progress, and tracking status. Downloads use the project name and current date in the filename and remain available for archived projects.

The dashboard reports remaining hours, unique WO count, ordered quantity, and production progress. Quantity is the maximum reported WO quantity across that WO's operation rows, counted once per WO. Progress averages normalized operation quantity progress, following the scheduler; it is not hours completed. Combo membership follows the current upload. A saved standalone WO that later enters a combo still tracks only that WO, with overlaps counted once when its combo is also selected.

When a saved combo or WO disappears from an accepted work-center upload, Projects retains its last known details and treats it as completed (zero remaining hours, 100% progress). This inferred completion is labeled explicitly. Returning work uses live values again. A missing/unreadable source does not imply completion. Work-center uploads must include the scheduling columns; malformed files are rejected before replacing the active data. A valid header-only file represents an empty schedule.

Project data refreshes when entering the module, returning to the browser, clicking Refresh, or saving changes. Open edit forms and selections are preserved. If another viewer or upload changes the project, a stale save is rejected; cancel or refresh the form to load the current version before editing again.

**Print Project** uses a compact summary report: a project overview with totals and department hours, then one row per combo or standalone WO. Internal combo WOs and operation tables are omitted. Scope pages contain up to six rows, with repeated headers and page numbers (normally two or three pages; larger projects continue without dropping scope). Descriptions are shortened and each row shows its three largest departments plus grouped remaining hours. Overlapping rows show only their contribution to totals. Use the browser's Save as PDF destination for a PDF copy.

The additive migration creates `projects` and `project_members` on startup. Include `app.sqlite` in existing backups. No additional service or configuration is required.

### Project API

All routes use the existing authenticated session and the app's existing API base path.

- `GET /api/projects` lists active and archived project metadata.
- `GET /api/projects/candidates` lists available whole combos and standalone WOs.
- `GET /api/projects/:id` returns `{ project, members, summary, departments, source, warning }`.
- `POST /api/projects` creates a project from `{ name, customer?, targetDate? }` (target date is `YYYY-MM-DD`).
- `PUT /api/projects/:id` updates `{ name, customer, targetDate, revision }`.
- `POST /api/projects/:id/members` adds `{ revision, members: [{ type: "combo" | "wo", identifier }] }`.
- `DELETE /api/projects/:id/members/:memberId` removes a membership with `{ revision }`.
- `PUT /api/projects/:id/archive` accepts `{ revision, archived: boolean }`.

Mutations return the current project detail. Revision conflicts return HTTP 409. Membership identifiers are trimmed, case-sensitive source IDs. Repeated additions are idempotent. Archived scope must be restored before adding or removing work.

### Validation

Use Node 20, matching Docker, for the existing native SQLite dependency. Run `npm run check` and `npm test` after installing dependencies. Tests use a separate temporary database under `.cache/` and exercise two sessions, restart persistence, upload replacement/rejection, inferred completion, scope changes, overlap, revision conflicts, archive/restore, and print content. `scheduler-core.js` is the shared browser/server normalization layer; `app.js` is the active browser entry point.

## Environment Variables

- `APP_PASSWORD`: shared password required to enter the app.
- `ADMIN_PASSWORD`: separate shared password to unlock Capacity. No default; when omitted, Capacity stays locked and the rest of the app works. Must differ from `APP_PASSWORD` or the server refuses to start.
- `SESSION_SECRET`: long random string used to sign the HTTP-only session cookie.
- `HOST`: bind host, defaults to `127.0.0.1`; use `0.0.0.0` inside Docker.
- `PORT`: server port, defaults to `3000`.
- `DATA_DIR`: runtime data directory, defaults to `./data`.
- `SQLITE_PATH`: SQLite path, defaults to `${DATA_DIR}/app.sqlite`.
- `MAX_UPLOAD_BYTES`: upload limit, defaults to `52428800`.

## Droplet Deployment

The Jay's Apps droplet uses one central Docker Caddy proxy and one shared external Docker network:

- Production root: `/opt/apps`
- Central Caddyfile: `/opt/apps/proxy/Caddyfile`
- Proxy container: `apps-caddy`
- Shared Docker network: `apps_proxy`

Deploy Scheduler as a Docker container on that shared network and route `/scheduler/` through the existing Duramark domain.

Clone and configure:

```bash
mkdir -p /opt/apps/duramark
cd /opt/apps/duramark
git clone https://github.com/MarkVoldaren/Scheduler.git scheduler
cd /opt/apps/duramark/scheduler
cp .env.example .env
nano .env
```

Set real values in `.env`:

```bash
APP_PASSWORD=replace-with-your-shared-password
ADMIN_PASSWORD=replace-with-a-separate-admin-password
SESSION_SECRET=replace-with-a-long-random-secret
```

Build and start Scheduler:

```bash
docker compose up -d --build
docker ps --filter name=scheduler-app
```

Edit the central active Caddyfile:

```bash
sudo nano /opt/apps/proxy/Caddyfile
```

Inside the existing `duramark.jays-apps.com` site block, add the Scheduler route before the fallback Duramark selector route:

```caddyfile
redir /scheduler /scheduler/

handle_path /scheduler/* {
    reverse_proxy scheduler-app:3000
}
```

Validate and restart the central proxy:

```bash
docker run --rm -v /opt/apps/proxy/Caddyfile:/etc/caddy/Caddyfile:ro caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
cd /opt/apps/proxy
docker compose restart caddy
```

Test:

```bash
curl -I https://duramark.jays-apps.com/scheduler/
```

Deploy updates later:

```bash
cd /opt/apps/duramark/scheduler
git pull
docker compose up -d --build
cd /opt/apps/proxy
docker compose restart caddy
```

Back up `data/app.sqlite` and `data/uploads/*.csv` if you need to preserve the current operational state before replacing or moving the droplet.

## Capacity admin access

Sign in with the normal app password, then open **Capacity** and enter the separate admin password. Capacity stays unlocked across refreshes for the existing 12-hour app session. Logout, session expiration, or a fresh app login clears admin access. Existing sessions start without admin access after this feature is deployed.

Only unlocked admin sessions can save shared capacity settings. Other pages continue reading those settings for scheduling calculations, and normal CSV uploads and Projects access are unchanged. Set `ADMIN_PASSWORD` in the deployment `.env` and recreate the container to apply configuration changes; no database migration is required. To invalidate existing signed sessions immediately, rotate `SESSION_SECRET` as well.

`GET /api/session` includes `adminAuthenticated`. Authenticated `POST /api/admin/unlock` accepts `{ password }` and grants admin access on success; invalid or unconfigured admin access returns 403. `PUT /api/settings` requires both app and admin authentication (401 without an app session, 403 without admin access).

## People

People is a shared roster of recurring weekly schedules, separate from Capacity and KPI staffing. Signed-in users can search by name, filter departments, and view active or archived people. Administrators unlock editing using the existing admin password and can add, edit, archive, and restore records.

Each person has Monday–Sunday hours (0–24 per day, up to two decimals) and one or more departments. A single department receives 100%; multiple allocations must be positive and total exactly 100%. Department hours are calculated from the same percentage on each day. Weekly roster totals count each person once. Hours and percentages are persisted as integer hundredths/basis points; allocated hours are rounded only for display.

Department choices follow the scheduler's open work centers. Saved assignments survive later CSV changes and are labeled unavailable when absent from the current schedule. Such assignments may be retained or removed; new assignments require an available department. People remains readable without a Work Center CSV.

Records are stored in the existing SQLite database. Startup creates the People table additively; no existing settings are migrated or overwritten. Concurrent edits use record revisions: stale saves fail and offer a refresh rather than overwrite another user's changes. Archives can be restored; there is no permanent delete or date-specific history.

API: authenticated `GET /api/people`; admin-only `POST /api/people`, `PUT /api/people/:id`, and `PUT /api/people/:id/archive`. Write payloads contain `name`, `hours` keyed by `mon`–`sun`, and `allocations` with `department`/`percent`; edits require `revision`. Archive/restore accepts `revision` and `archived`. Lists return `people` and `departments`.

### Weekly People PDF report

On People, select **Print / PDF Report**, then **Print / Save PDF** in the report window and choose your browser's Save as PDF destination. Use landscape Letter paper, default scale, and turn off the browser's extra headers/footers. The report fetches fresh saved roster data and flow assignments, includes all active people regardless of list filters, and uses **40 allocated weekly hours = 1.0 manning**. Save or cancel an open person editor before reporting.

The single-page layout shows all seven flows, department manning (including zero coverage), each person's manning within that flow, flow hours/manning, and unique shop totals. Multiple departments in the same flow are combined for each person. Archived people are excluded. Saved departments missing from the current CSV remain included and are marked with an asterisk; flow mappings use the same configured/default rules as the KPI Board. The displayed week is the current Monday–Sunday in America/Chicago and represents the recurring schedule, not attendance or historical hours.

The report automatically scales all content to one landscape page without omitting names. Large rosters can produce small text; the report preview shows a reduced-size notice when scaling below 75%. No Capacity settings or KPI calculations are modified.
