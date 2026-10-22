# Latency releases — October 22, 2026

The working tree contains both releases. Production has not been changed; deployment is user-managed.

## Release packages

- `latency-release-1.zip`: server department cache, upload rollback protection, in-flight app-state sharing, parallel startup reads, Hours metadata reuse, and People source warnings. This checkpoint passed 73 tests before Release 2 work started.
- `latency-release-2.zip`: complete final source, including Release 1 plus request deadlines/cancellation, startup/navigation recovery, uncertain-write safeguards, conditional JS/CSS caching, and the read-only latency check.

Both are complete source packages with dependency manifests, Docker files, tests, and the existing CSV fixtures. They exclude production data, `.env`, dependencies, caches, Git history, and screenshots. Do not upload either ZIP through the scheduler's CSV uploader. Extract source into the application checkout, preserving its `.env` and `data/` directory, then build normally. The current workspace is the Release 2 source if deploying through Git instead.

## Two-stage rollout

1. Deploy Release 1; perform the checks below and measure live timings. Accept Release 1 only when the timing gates pass. If they fail, inspect host CPU/throttling and remaining synchronous work before continuing.
2. Deploy Release 2 after Release 1 passes. Repeat the timings and browser checks, including failure/retry behavior. The final package contains the same latency script; copy just `scripts/latency-check.cjs` beside Release 1 source if checking the first release before installing Release 2.

No database migration or credential rotation is required. Keep the existing session secret.

### Docker deployment and consistent backup

Use `/opt/apps/duramark/scheduler`, as documented in the repository. Before replacing source, retain the existing image ID and tag a rollback image:

```sh
cd /opt/apps/duramark/scheduler
deployed_tag=$(docker inspect --format '{{.Config.Image}}' scheduler-app)
docker image tag "$(docker inspect --format '{{.Image}}' scheduler-app)" scheduler-latency:rollback
```

After installing the intended release's source:

```sh
docker compose build scheduler-app
docker compose stop scheduler-app
mkdir -p ../scheduler-backups
tar -czf "../scheduler-backups/before-latency-$(date +%Y%m%d-%H%M%S).tgz" data
docker compose up -d --no-build scheduler-app
docker compose logs --tail=100 scheduler-app
```

Stopping the application while backing up the whole data directory keeps SQLite, any WAL files, and CSV uploads consistent. If backup fails, restart the existing container with `docker compose start scheduler-app` and resolve the failure before recreating it. Preserve `.env`; do not replace it with `.env.example`.

If a release fails checks, restore the previous application image without restoring or deleting operational data:

```sh
docker compose stop scheduler-app
docker image tag scheduler-latency:rollback "$deployed_tag"
docker compose up -d --no-build --force-recreate scheduler-app
```

Tag the accepted Release 1 image as the rollback point before proceeding to Release 2. Record the rollback image's immutable ID and `deployed_tag` outside the shell session as well.

## Live latency check

Use Node 20 or later. Supply the existing shared password through the `SCHEDULER_PASSWORD` environment variable; the script never logs it or response bodies. Set `SCHEDULER_URL` only if testing another environment. The default is `https://duramark.jays-apps.com/scheduler/`.

```sh
node scripts/latency-check.cjs
```

Or run `npm run latency` on Release 2. Save each release's output with the deployment record. The script signs in, samples app-state/People/session/Projects three times, and samples session requests launched 150 ms after app-state three times. It does not edit production records, settings, or CSVs.

Acceptance: app-state and People median response times each below 300 ms; all three overlapping session requests below 300 ms; valid read endpoints return HTTP 200. Three samples are a spot check, not a load test or historical reliability statistic.

## Browser checks

- Sign in, reload with the active session, unlock Capacity, and visit Scheduler, Departments, KPI, People, Pick List, and Expedite.
- Check existing roster allocations and capacities without editing production data. Verify the booked/earned dialog and source upload timestamps.
- Confirm JS/CSS conditional requests return 304 on an unchanged reload, and a subsequent deployment retrieves changed bytes. HTML and session/app-state/People must remain uncached.
- Exercise writes and induced network/file failures only on disposable test data. Check that a staffing refresh failure keeps the current view and offers Retry; missing Pick List/earned data must not prevent schedule loading.
- A timeout or lost connection during a write is an unknown outcome. Compare saved records before resubmitting. People/Projects require a saved-data refresh; Capacity pauses autosave and offers loading saved settings; Pick List preserves the entered quantity and compares it after refresh; uploads require refreshing saved source data first.

## Local evidence and limits

Release 1's warm parallel app-state/People/session test completed in 4, 3, and 3 ms. The final source's standalone localhost check measured app-state 3/1/1 ms, People 1/1/1 ms, and overlapping session 5/4/4 ms. These measurements use isolated local sample data and do not establish production latency.

Final validation: `npm run check` passed and `npm test` passed all 88 tests. The full tests use Node 20.20.2, matching the Docker major version. The pre-existing local SQLite binary was compiled for Node 20 and cannot run under the machine's default Node 24 without rebuilding that dependency.

Browser verification used a dedicated `.cache/latency-browser` database: sign-in/session restore, admin unlock, a disposable People edit, KPI/earned-hours dialog, and removal/restoration of only the test Pick List CSV. The main schedule remained usable during the optional-source failure; Retry recovered the Pick List. The screenshot `latency-local-people-verified.png` shows the disposable edit.

Remaining limitations: expensive CSV validation/reconciliation still runs during uploads and startup; project-detail/candidate computation is unchanged. No worker threads, scheduling-rule changes, asset build system, service worker, or persistent staffing cache were introduced. Any further production bottleneck should be measured after this rollout.
