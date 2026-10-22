# Scheduler latency audit — October 22, 2026

Target: https://duramark.jays-apps.com/scheduler/

Read-only production checks, with shared login and admin unlock verified through the UI. No operational records, settings, uploads, or production code changed. Three sequential samples per listed endpoint; this is a spot check, not a load test or a historical failure-rate measurement. Measurements include client/network time and are not browser paint timings.

## Measured results

| Request | Median | Range | Results |
| --- | ---: | ---: | --- |
| GET api/app-state | 2,793 ms | 2,708–2,950 ms | 3/3 HTTP 200 |
| GET api/people | 2,637 ms | 2,600–2,787 ms | 3/3 HTTP 200 |
| GET api/session | 82 ms | 69–106 ms | 3/3 HTTP 200 |
| GET api/pick-progress | 71 ms | 68–82 ms | 3/3 HTTP 200 |
| GET api/projects | 74 ms | 69–93 ms | 3/3 HTTP 200 |
| GET api/csv/work-center | 469 ms | 265–496 ms | 3/3 HTTP 200 |
| GET api/csv/pick-list | 101 ms | 78–123 ms | 3/3 HTTP 200 |

CSV measurements above requested no compression. A separate request advertising gzip/br confirmed gzip: work-center CSV 5,688,679 bytes decoded, 1,035,036 bytes transferred in 277 ms; app.js 50,237 compressed bytes; styles.css 17,215 compressed bytes. Missing compression is not the primary problem.

## Findings and priorities

### 1. High: synchronous source rebuilding delays unrelated requests

`server.js:175` calls `people.list()` for every app-state read. `people-store.js:27` calls `getDepartments()` on every list. The callback at `server.js:98` reads the CSV synchronously via `projectSource()`, validates/parses it, and builds all jobs merely to derive department names. `projects-domain.js:9` performs a structural matrix parse followed by a second object parse.

Concurrent reproduction: start app-state, then start session 150 ms later. App-state took 2,681 / 2,844 / 2,934 ms; session took 2,527 / 2,698 / 2,787 ms. The normally cheap request waited for almost the entire slow request. Together with the synchronous code path, this strongly supports event-loop blocking. Hosting CPU constraints may amplify the cost; no production CPU profile or host metrics were available.

Using the live CSV in memory on the local machine, the same source parser took 144–180 ms and job building 43–53 ms, producing 3,644 active rows and 463 jobs. These local CPU times are not production server timings.

Fix first: cache source-derived department names by source revision, rebuilding after successful work-center replacement. Ensure missing/unreadable files and changed data invalidate correctly. Avoid full job rebuilding in routine app-state/roster reads; keep roster-derived capacity fresh after People edits. If rebuilds remain costly, move them out of the request path or into a worker.

### 2. High: navigation waits on the slow route

`app.js:1128` awaits `refreshPeopleCapacity()` before switching Scheduler, Capacity, Departments, KPI, or Expedite. Each click therefore pays the app-state delay before the destination appears. Rapid clicks can queue more synchronous server work even though the navigation token prevents stale navigation from winning.

Fix: deduplicate concurrent refreshes, render an explicit pending state immediately, and separate inexpensive People-capacity reads from source reconstruction. Preserve freshness where calculations depend on current People assignments.

### 3. Medium: startup repeats work and couples independent failures

`app.js:841` loads app-state, pick progress, work-center CSV, and pick-list CSV sequentially. It then calls HoursUI.refresh(), which fetches app-state again at `hours-ui.js:14`. Two app-state calls alone cost about 5.4–5.9 seconds in these samples; the first schedule render can occur before the second call completes. Both CSV hydration functions also render the active surface.

Fix: reuse already-fetched metadata for Hours initialization, overlap independent reads, and batch hydration/rendering. Load optional Pick List and earned-hours data independently so their failure does not prevent the main schedule from loading.

### 4. Medium: loading and failure reporting can mislead users

The login screen disappears before data is ready; the browser briefly displayed "Sign in to load the shared schedule" after successful authentication. On session restore, initializeServerSession catches any hydration failure and labels it "Unable to reach the Scheduler server," even if authentication succeeded and only an optional source failed. fetchJson/fetchText have no explicit application deadline or cancellation; fetchJson also converts malformed successful JSON into an empty object.

Fix: distinguish authenticating, loading, ready, and partial failure; provide visible retry controls and request deadlines; reject malformed successful JSON explicitly; keep optional-data failures local to the affected feature.

### 5. Lower: static assets cannot be reused across reloads

HTML/JS/CSS respond with no-store, and the local static middleware disables ETag and Last-Modified. Compression works, but browsers still redownload and reparse assets. Use content-versioned assets with long-lived caching while keeping HTML fresh. This is secondary to the multi-second server bottleneck.

## Failure scope and limits

No HTTP 5xx or timeouts occurred on the measured valid read endpoints. Login, schedule population, and admin Capacity unlock succeeded in the browser. A deliberately exploratory api/hours request returned 404; the application uses api/app-state and api/csv/earned-hours instead, so that 404 is not an application defect.

Write operations, CSV upload failure recovery, historical errors, sustained load, and browser main-thread/paint profiling were not exercised. No production logs or reverse-proxy metrics were available. The demonstrated failure is responsiveness under overlapping requests, not an observed production outage.

Recommended order: remove repeated source reconstruction; deduplicate navigation/startup reads; improve partial-failure/loading handling; then optimize browser rendering and asset caching. Retest the same endpoint/concurrency measurements after the first change.
