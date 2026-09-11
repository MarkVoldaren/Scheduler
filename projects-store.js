"use strict";

const { memberRows, projectView } = require("./projects-domain");

function createProjectsStore(db, getSource) {
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, customer TEXT NOT NULL DEFAULT '',
      target_date TEXT NOT NULL DEFAULT '', archived INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS project_members (
      id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('combo','wo')), identifier TEXT NOT NULL,
      snapshot TEXT NOT NULL, inferred_complete INTEGER NOT NULL DEFAULT 0,
      last_seen_at TEXT NOT NULL, UNIQUE(project_id, type, identifier)
    );
  `);
  function project(id) {
    const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
    if (!row) fail(404, "Project was not found.");
    return { id: row.id, name: row.name, customer: row.customer, targetDate: row.target_date, archived: Boolean(row.archived), revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at };
  }
  function members(id) {
    return db.prepare("SELECT * FROM project_members WHERE project_id = ? ORDER BY id").all(id).map(row => ({ id: row.id, type: row.type, identifier: row.identifier, rows: JSON.parse(row.snapshot), inferredComplete: Boolean(row.inferred_complete), lastSeenAt: row.last_seen_at }));
  }
  function touch(id) {
    db.prepare("UPDATE projects SET revision = revision + 1, updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
  }
  function checkRevision(id, revision) {
    const current = project(id);
    if (!Number.isInteger(revision) || current.revision !== revision) fail(409, "This project changed in another viewer or upload. Refresh the project before saving again.");
    return current;
  }
  const reconcile = db.transaction((rows, uploadedAt) => {
    const changed = new Set();
    db.prepare("SELECT * FROM project_members").all().forEach(member => {
      const liveRows = memberRows(rows, member.type, member.identifier);
      const inferred = liveRows.length ? 0 : 1;
      const snapshot = liveRows.length ? JSON.stringify(liveRows) : member.snapshot;
      const lastSeen = liveRows.length ? uploadedAt : member.last_seen_at;
      if (snapshot !== member.snapshot || inferred !== member.inferred_complete || lastSeen !== member.last_seen_at) {
        db.prepare("UPDATE project_members SET snapshot = ?, inferred_complete = ?, last_seen_at = ? WHERE id = ?").run(snapshot, inferred, lastSeen, member.id);
        changed.add(member.project_id);
      }
    });
    changed.forEach(touch);
  });
  function detail(id) {
    const source = getSource();
    return { project: project(id), ...projectView(members(id)), source: source.metadata, warning: source.warning || "" };
  }
  function list() {
    return { projects: db.prepare("SELECT id FROM projects ORDER BY archived, name COLLATE NOCASE, id").all().map(row => project(row.id)) };
  }
  function candidates() {
    const source = getSource();
    if (!source.rows) fail(503, source.warning || "Upload a work-center CSV before adding work.");
    const groups = new Map();
    source.rows.forEach(row => {
      const combo = String(row["Combo #"] || "").trim();
      const wo = String(row["WO #"] || "").trim();
      const type = combo ? "combo" : "wo";
      const identifier = combo || wo;
      if (!identifier) return;
      const key = `${type}:${identifier}`;
      if (!groups.has(key)) groups.set(key, { type, identifier, texts: new Set(), workOrders: new Set() });
      const group = groups.get(key);
      [row.Customer, row.Part, row.Description].filter(Boolean).forEach(value => group.texts.add(value));
      if (wo) group.workOrders.add(wo);
    });
    return { candidates: [...groups.values()].map(group => ({ type: group.type, identifier: group.identifier, description: [...group.texts].join(" · "), workOrders: [...group.workOrders] })).sort((a, b) => a.identifier.localeCompare(b.identifier)) };
  }
  const create = db.transaction(input => {
    const fields = validateFields(input);
    const now = new Date().toISOString();
    const result = db.prepare("INSERT INTO projects (name, customer, target_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(fields.name, fields.customer, fields.targetDate, now, now);
    return detail(Number(result.lastInsertRowid));
  });
  const update = db.transaction((id, input) => {
    checkRevision(id, input.revision);
    const fields = validateFields(input);
    db.prepare("UPDATE projects SET name = ?, customer = ?, target_date = ? WHERE id = ?").run(fields.name, fields.customer, fields.targetDate, id);
    touch(id);
    return detail(id);
  });
  const archive = db.transaction((id, input) => {
    checkRevision(id, input.revision);
    if (typeof input.archived !== "boolean") fail(400, "Archived must be true or false.");
    db.prepare("UPDATE projects SET archived = ? WHERE id = ?").run(Number(input.archived), id);
    touch(id);
    return detail(id);
  });
  const add = db.transaction((id, input) => {
    const current = checkRevision(id, input.revision);
    if (current.archived) fail(400, "Restore this project before changing its scope.");
    if (!Array.isArray(input.members) || !input.members.length || input.members.length > 500) fail(400, "Select between 1 and 500 members.");
    const source = getSource();
    if (!source.rows) fail(503, source.warning || "Work-center data is unavailable.");
    let changed = false;
    input.members.forEach(member => {
      if (!member || !["combo", "wo"].includes(member.type) || typeof member.identifier !== "string" || !member.identifier.trim()) fail(400, "Invalid project member.");
      const identifier = member.identifier.trim();
      if (db.prepare("SELECT id FROM project_members WHERE project_id = ? AND type = ? AND identifier = ?").get(id, member.type, identifier)) return;
      const rows = memberRows(source.rows, member.type, identifier);
      if (!rows.length || (member.type === "wo" && rows.some(row => String(row["Combo #"] || "").trim()))) fail(400, "Select an available whole combo or standalone WO. The source may have changed; refresh the list.");
      db.prepare("INSERT INTO project_members (project_id, type, identifier, snapshot, last_seen_at) VALUES (?, ?, ?, ?, ?)").run(id, member.type, identifier, JSON.stringify(rows), source.metadata.uploadedAt);
      changed = true;
    });
    if (changed) touch(id);
    return detail(id);
  });
  const remove = db.transaction((id, memberId, input) => {
    const current = checkRevision(id, input.revision);
    if (current.archived) fail(400, "Restore this project before changing its scope.");
    const result = db.prepare("DELETE FROM project_members WHERE project_id = ? AND id = ?").run(id, memberId);
    if (!result.changes) fail(404, "Project member was not found.");
    touch(id);
    return detail(id);
  });
  return { list, detail, create, update, archive, add, remove, candidates, reconcile };
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function validateFields(input) {
  const fields = {};
  for (const [key, limit] of [["name", 200], ["customer", 200], ["targetDate", 10]]) {
    if (input[key] !== undefined && typeof input[key] !== "string") fail(400, `Invalid ${key}.`);
    fields[key] = (input[key] || "").trim();
    if (fields[key].length > limit) fail(400, `${key} is too long.`);
  }
  if (!fields.name) fail(400, "Project name is required.");
  if (fields.targetDate && (!/^\d{4}-\d{2}-\d{2}$/.test(fields.targetDate) || Number.isNaN(Date.parse(fields.targetDate)) || new Date(fields.targetDate).toISOString().slice(0, 10) !== fields.targetDate)) fail(400, "Enter a valid target date.");
  return fields;
}

module.exports = { createProjectsStore };
