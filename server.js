const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const Database = require("better-sqlite3");
const cookieSession = require("cookie-session");
const express = require("express");
const multer = require("multer");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DB_PATH = process.env.SQLITE_PATH || path.join(DATA_DIR, "app.sqlite");
const APP_PASSWORD = process.env.APP_PASSWORD || (process.env.NODE_ENV === "production" ? "" : "changeme");
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
  res.json({ authenticated: Boolean(req.session && req.session.authenticated) });
});

app.post("/api/login", (req, res) => {
  const password = String((req.body && req.body.password) || "");
  if (!safeCompare(password, APP_PASSWORD)) {
    return res.status(401).json({ error: "Invalid password" });
  }
  req.session.authenticated = true;
  res.json({ authenticated: true });
});

app.post("/api/logout", (req, res) => {
  req.session = null;
  res.json({ authenticated: false });
});

app.use("/api", requireAuth);

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

app.post("/api/csv/:kind", upload.single("csv"), async (req, res, next) => {
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

    const activePath = getActiveCsvPath(kind);
    const tempPath = `${activePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.promises.writeFile(tempPath, req.file.buffer);
    await fs.promises.rm(activePath, { force: true });
    await fs.promises.rename(tempPath, activePath);

    const metadata = {
      kind,
      originalName: req.file.originalname,
      storedPath: path.relative(__dirname, activePath),
      uploadedAt: new Date().toISOString(),
      size: req.file.size,
    };
    saveCsvMetadata(metadata);
    res.json({ metadata });
  } catch (error) {
    next(error);
  }
});

app.put("/api/settings", (req, res) => {
  const settings = sanitizeOperationalSettings(req.body || {});
  saveOperationalSettings(settings);
  res.json({ settings });
});

app.use(express.static(__dirname, { extensions: ["html"] }));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use((error, req, res, next) => {
  if (error && error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "CSV upload is too large" });
  }
  console.error(error);
  res.status(500).json({ error: "Unexpected server error" });
});

app.listen(PORT, HOST, () => {
  console.log(`Scheduler Operations listening on http://${HOST}:${PORT}`);
});

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  return res.status(401).json({ error: "Session required" });
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
