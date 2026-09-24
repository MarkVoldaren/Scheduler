const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const Database = require("better-sqlite3");
const cookieSession = require("cookie-session");
const express = require("express");
const multer = require("multer");
const { readWorkCenter } = require("./projects-domain");
const { createProjectsStore } = require("./projects-store");
const { createPeopleStore } = require("./people-store");
const schedulerCore = require("./scheduler-core");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DB_PATH = process.env.SQLITE_PATH || path.join(DATA_DIR, "app.sqlite");
const APP_PASSWORD = process.env.APP_PASSWORD || (process.env.NODE_ENV === "production" ? "" : "changeme");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SESSION_SECRET = process.env.SESSION_SECRET || (process.env.NODE_ENV === "production" ? "" : "dev-session-secret-change-me");
const SESSION_COOKIE_NAME = "scheduler-session";
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 50 * 1024 * 1024);

const CSV_KINDS = {
  "work-center": {
    activeName: "work-center.csv",
    label: "Work Center",
  },
  "pick-list": {
    activeName: "pick-list.csv",
    label: "Pick List",
  },
};

const SETTING_KEYS = [
  "capacities",
  "machineCapacities",
  "manHourCapacities",
  "manHoursByDay",
  "temporaryAdditionalManning",
  "manningMultipliers",
  "capacityModes",
  "capacityHorizonShifts",
  "flowLocations",
];
const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const HORIZON_SHIFT_OPTIONS = new Set([0, 1, 2, 3, 5, 7, 10, 14]);

if (!APP_PASSWORD || !SESSION_SECRET) {
  console.error("APP_PASSWORD and SESSION_SECRET must be set in production.");
  process.exit(1);
}
if (ADMIN_PASSWORD && safeCompare(ADMIN_PASSWORD, APP_PASSWORD)) {
  console.error("ADMIN_PASSWORD must differ from APP_PASSWORD.");
  process.exit(1);
}

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS csv_metadata (
    kind TEXT PRIMARY KEY,
    original_name TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    uploaded_at TEXT NOT NULL,
    size INTEGER NOT NULL
  );
`);

const app = express();
function projectSource() {
  const metadata = getCsvMetadata("work-center");
  try {
    if (!metadata) return { rows: null, metadata: null, warning: "Upload a work-center CSV to add work. Saved project details remain available." };
    return { rows: readWorkCenter(fs.readFileSync(getActiveCsvPath("work-center"), "utf8")), metadata };
  } catch (error) {
    return { rows: null, metadata, warning: `Work-center data is unavailable. Showing last-known project data; no new completion is inferred. ${error.message}` };
  }
}
const projects = createProjectsStore(db, projectSource);
const people = createPeopleStore(db, () => {
  const { rows } = projectSource();
  if (!rows) return [];
  return [...new Set(schedulerCore.buildJobs(rows).flatMap(job => job.operations)
    .filter(operation => operation.phase !== "complete" && operation.hoursRemaining > 0 && operation.workCenter)
    .map(operation => operation.workCenter))].sort((a, b) => a.localeCompare(b));
});
const initialProjectSource = projectSource();
if (initialProjectSource.rows) projects.reconcile(initialProjectSource.rows, initialProjectSource.metadata.uploadedAt);
projects.initializeTrend();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));
app.use(
  cookieSession({
    name: SESSION_COOKIE_NAME,
    keys: [SESSION_SECRET],
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 12,
  }),
);

app.get("/api/session", (req, res) => {
  setNoCacheHeaders(res);
  res.json({ authenticated: Boolean(req.session && req.session.authenticated), adminAuthenticated: isAdmin(req) });
});

app.post("/api/login", (req, res) => {
  const password = String((req.body && req.body.password) || "");
  if (!safeCompare(password, APP_PASSWORD)) {
    return res.status(401).json({ error: "Invalid password" });
  }
  req.session = { authenticated: true, adminAuthenticated: false };
  res.json({ authenticated: true, adminAuthenticated: false });
});

app.post("/api/logout", (req, res) => {
  req.session = null;
  res.json({ authenticated: false, adminAuthenticated: false });
});

app.use("/api", requireAuth);

app.post("/api/admin/unlock", (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(403).json({ error: "Admin access is not configured. Contact the app administrator." });
  if (!safeCompare(String(req.body?.password || ""), ADMIN_PASSWORD)) {
    return res.status(403).json({ error: "Invalid admin password" });
  }
  req.session.adminAuthenticated = true;
  res.json({ authenticated: true, adminAuthenticated: true });
});

app.get("/api/projects", (req, res) => res.json(projects.list()));
app.get("/api/people", (req, res) => { setNoCacheHeaders(res); res.json(people.list()); });
const requirePeopleAdmin = (req, res, next) => isAdmin(req) ? next() : res.status(403).json({ error: "Admin access required" });
app.post("/api/people", requirePeopleAdmin, (req, res) => res.status(201).json(people.create(req.body || {})));
app.put("/api/people/:id", requirePeopleAdmin, (req, res) => res.json(people.update(req.params.id, req.body || {})));
app.put("/api/people/:id/archive", requirePeopleAdmin, (req, res) => res.json(people.archive(req.params.id, req.body || {})));
app.get("/api/projects/candidates", (req, res) => res.json(projects.candidates()));
app.get("/api/projects/:id", (req, res) => res.json(projects.detail(projectId(req.params.id))));
app.get("/api/projects/:id/export.csv", (req, res) => {
  const result = projects.exportCsv(projectId(req.params.id));
  setNoCacheHeaders(res);
  res.attachment(result.filename).type("text/csv; charset=utf-8").send(result.csv);
});
app.post("/api/projects", (req, res) => res.status(201).json(projects.create(req.body || {})));
app.put("/api/projects/:id", (req, res) => res.json(projects.update(projectId(req.params.id), req.body || {})));
app.put("/api/projects/:id/archive", (req, res) => res.json(projects.archive(projectId(req.params.id), req.body || {})));
app.post("/api/projects/:id/members", (req, res) => res.json(projects.add(projectId(req.params.id), req.body || {})));
app.delete("/api/projects/:id/members/:memberId", (req, res) => res.json(projects.remove(projectId(req.params.id), projectId(req.params.memberId), req.body || {})));

app.get("/api/app-state", (req, res) => {
  res.json({
    settings: getOperationalSettings(),
    csvs: {
      workCenter: getCsvMetadata("work-center"),
      pickList: getCsvMetadata("pick-list"),
    },
  });
});

app.get("/api/csv/:kind", (req, res) => {
  const kind = normalizeCsvKind(req.params.kind);
  if (!kind) {
    return res.status(404).json({ error: "Unknown CSV type" });
  }
  const metadata = getCsvMetadata(kind);
  const activePath = getActiveCsvPath(kind);
  if (!metadata || !fs.existsSync(activePath)) {
    return res.status(404).json({ error: `${CSV_KINDS[kind].label} CSV has not been uploaded yet` });
  }
  res.type("text/csv").sendFile(activePath);
});

app.post("/api/csv/:kind", upload.single("csv"), (req, res, next) => {
  try {
    const kind = normalizeCsvKind(req.params.kind);
    if (!kind) {
      return res.status(404).json({ error: "Unknown CSV type" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "CSV file is required" });
    }
    if (!isCsvUpload(req.file)) {
      return res.status(400).json({ error: "Only .csv uploads are supported" });
    }

    let workCenterRows;
    if (kind === "work-center") {
      try {
        workCenterRows = readWorkCenter(req.file.buffer.toString("utf8"));
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }
    }
    const activePath = getActiveCsvPath(kind);
    const tempPath = `${activePath}.${process.pid}.${Date.now()}.tmp`;
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(tempPath, req.file.buffer);

    const metadata = {
      kind,
      originalName: req.file.originalname,
      storedPath: path.relative(__dirname, activePath),
      uploadedAt: new Date().toISOString(),
      size: req.file.size,
    };
    // Serialize replacement and snapshot updates with other requests. Keep the
    // previous bytes if a database or filesystem write fails.
    const previous = fs.existsSync(activePath) ? fs.readFileSync(activePath) : null;
    let replaced = false;
    try {
      db.transaction(() => {
        fs.renameSync(tempPath, activePath);
        replaced = true;
        saveCsvMetadata(metadata);
        if (workCenterRows) {
          projects.reconcile(workCenterRows, metadata.uploadedAt);
          projects.captureDaily(metadata.uploadedAt);
        }
      })();
    } catch (error) {
      if (replaced) {
        if (previous) fs.writeFileSync(activePath, previous);
        else fs.rmSync(activePath, { force: true });
      }
      throw error;
    } finally {
      fs.rmSync(tempPath, { force: true });
    }
    res.json({ metadata });
  } catch (error) {
    next(error);
  }
});

app.put("/api/settings", (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Admin access required" });
  const settings = sanitizeOperationalSettings(req.body || {});
  saveOperationalSettings(settings);
  res.json({ settings });
});

// Serve browser assets only. In particular, the shared project database and
// server-side modules must never be downloadable through the static root.
const publicFiles = new Set(["/", "/index.html", "/app.js", "/styles.css", "/scheduler-core.js", "/projects-ui.js", "/projects-print.js", "/main.js", "/csv.js", "/domain.js", "/render.js", "/selectors.js", "/state.js"]);
publicFiles.add("/people-ui.js");
publicFiles.add("/people-domain.js");
const publicAssets = express.static(__dirname, {
  extensions: ["html"],
  etag: false,
  lastModified: false,
  setHeaders: setNoCacheHeaders,
});
app.use((req, res, next) => publicFiles.has(req.path) ? publicAssets(req, res, next) : next());
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/") || path.extname(req.path)) return res.status(404).json({ error: "Not found" });
  setNoCacheHeaders(res);
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use((error, req, res, next) => {
  if (error && error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "CSV upload is too large" });
  }
  if ((error.status >= 400 && error.status < 500) || error.status === 503) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error(error);
  res.status(500).json({ error: "Unexpected server error" });
});

const listener = app.listen(PORT, HOST, () => {
  console.log(`Scheduler Operations listening on http://${HOST}:${listener.address().port}`);
});

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  return res.status(401).json({ error: "Session required" });
}

function isAdmin(req) {
  return Boolean(ADMIN_PASSWORD && req.session?.authenticated && req.session?.adminAuthenticated);
}

function projectId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    const error = new Error("Invalid project or member ID.");
    error.status = 400;
    throw error;
  }
  return id;
}

function setNoCacheHeaders(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

function safeCompare(value, expected) {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  if (valueBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(valueBuffer, expectedBuffer);
}

function normalizeCsvKind(kind) {
  return Object.prototype.hasOwnProperty.call(CSV_KINDS, kind) ? kind : "";
}

function getActiveCsvPath(kind) {
  return path.join(UPLOAD_DIR, CSV_KINDS[kind].activeName);
}

function isCsvUpload(file) {
  const extension = path.extname(file.originalname || "").toLowerCase();
  return extension === ".csv" || file.mimetype === "text/csv" || file.mimetype === "application/vnd.ms-excel";
}

function getCsvMetadata(kind) {
  const row = db.prepare("SELECT kind, original_name, stored_path, uploaded_at, size FROM csv_metadata WHERE kind = ?").get(kind);
  if (!row) {
    return null;
  }
  return {
    kind: row.kind,
    originalName: row.original_name,
    storedPath: row.stored_path,
    uploadedAt: row.uploaded_at,
    size: row.size,
  };
}

function saveCsvMetadata(metadata) {
  db.prepare(
    `INSERT INTO csv_metadata (kind, original_name, stored_path, uploaded_at, size)
     VALUES (@kind, @originalName, @storedPath, @uploadedAt, @size)
     ON CONFLICT(kind) DO UPDATE SET
       original_name = excluded.original_name,
       stored_path = excluded.stored_path,
       uploaded_at = excluded.uploaded_at,
       size = excluded.size`,
  ).run(metadata);
}

function getOperationalSettings() {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get("operational_settings");
  if (!row) {
    return createEmptyOperationalSettings();
  }
  try {
    return sanitizeOperationalSettings(JSON.parse(row.value));
  } catch (error) {
    console.error("Failed to parse operational settings; returning defaults.", error);
    return createEmptyOperationalSettings();
  }
}

function saveOperationalSettings(settings) {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run("operational_settings", JSON.stringify(settings), new Date().toISOString());
}

function createEmptyOperationalSettings() {
  return SETTING_KEYS.reduce((settings, key) => {
    settings[key] = {};
    return settings;
  }, {});
}

function sanitizeOperationalSettings(input) {
  const output = createEmptyOperationalSettings();
  output.capacities = sanitizeNumberMap(input.capacities);
  output.machineCapacities = sanitizeNumberMap(input.machineCapacities);
  output.manHourCapacities = sanitizeNumberMap(input.manHourCapacities);
  output.manHoursByDay = sanitizeWeekdayMap(input.manHoursByDay);
  output.temporaryAdditionalManning = sanitizeNumberMap(input.temporaryAdditionalManning);
  output.manningMultipliers = sanitizePositiveNumberMap(input.manningMultipliers);
  output.capacityModes = sanitizeStringMap(input.capacityModes);
  output.capacityHorizonShifts = sanitizeHorizonShiftMap(input.capacityHorizonShifts);
  output.flowLocations = sanitizeStringMap(input.flowLocations);
  return output;
}

function sanitizeNumberMap(input) {
  if (!isPlainObject(input)) {
    return {};
  }
  const output = {};
  Object.entries(input).forEach(([key, value]) => {
    const parsed = Number(value);
    if (key && Number.isFinite(parsed) && parsed >= 0) {
      output[String(key)] = parsed;
    }
  });
  return output;
}

function sanitizePositiveNumberMap(input) {
  if (!isPlainObject(input)) {
    return {};
  }
  const output = {};
  Object.entries(input).forEach(([key, value]) => {
    const parsed = Number(value);
    if (key && Number.isFinite(parsed) && parsed > 0) {
      output[String(key)] = parsed;
    }
  });
  return output;
}

function sanitizeWeekdayMap(input) {
  if (!isPlainObject(input)) {
    return {};
  }
  const output = {};
  Object.entries(input).forEach(([department, days]) => {
    if (!department || !isPlainObject(days)) {
      return;
    }
    const sanitizedDays = {};
    WEEKDAY_KEYS.forEach((dayKey) => {
      const parsed = Number(days[dayKey]);
      if (Number.isFinite(parsed) && parsed >= 0) {
        sanitizedDays[dayKey] = parsed;
      }
    });
    if (Object.keys(sanitizedDays).length) {
      output[String(department)] = sanitizedDays;
    }
  });
  return output;
}

function sanitizeHorizonShiftMap(input) {
  if (!isPlainObject(input)) {
    return {};
  }
  const output = {};
  Object.entries(input).forEach(([key, value]) => {
    const parsed = Number(value);
    if (key && HORIZON_SHIFT_OPTIONS.has(parsed)) {
      output[String(key)] = parsed;
    }
  });
  return output;
}

function sanitizeStringMap(input) {
  if (!isPlainObject(input)) {
    return {};
  }
  const output = {};
  Object.entries(input).forEach(([key, value]) => {
    if (key && typeof value === "string") {
      output[String(key)] = value;
    }
  });
  return output;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
