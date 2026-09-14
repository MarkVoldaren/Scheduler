"use strict";

const core = require("./scheduler-core");

const REQUIRED_HEADERS = ["WO #", "Combo #", "Customer", "Part", "Description", "Operation Sequence", "Manufacturing Work Center", "Hours Remaining", "WO Quantity", "Status", "Completed Quantity", "Remaining Quantity"];

function readWorkCenter(text) {
  text = String(text).replace(/^\uFEFF/, "");
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '"') continue;
    if (quoted && text[i + 1] === '"') i += 1;
    else quoted = !quoted;
  }
  if (quoted) throw new Error("Work-center CSV contains an unclosed quoted field.");
  const matrix = core.parseCsvMatrix(text);
  const headers = matrix[0] || [];
  const missing = REQUIRED_HEADERS.filter(header => !headers.includes(header));
  if (missing.length) throw new Error(`Work-center CSV is missing columns: ${missing.join(", ")}`);
  if (new Set(headers).size !== headers.length) throw new Error("Work-center CSV contains duplicate columns.");
  if (matrix.slice(1).some(row => row.length !== headers.length)) throw new Error("Work-center CSV has a row with the wrong number of columns.");
  // A sentinel also exposes the original header spelling for header-only files.
  // Reject spaced column names rather than accepting them on the server while
  // the browser would resolve different fields and silently lose memberships.
  const records = core.parseCsv(`${text}\n${headers.map(() => "x").join(",")}`);
  const sentinel = records.pop() || {};
  if (Object.keys(sentinel).some(header => header !== header.trim())) throw new Error("Work-center CSV column names must not contain leading or trailing spaces.");
  return records.filter(core.isSchedulableRow);
}

function memberRows(rows, type, identifier) {
  const field = type === "combo" ? "Combo #" : "WO #";
  return rows.filter(row => String(row[field] || "").trim() === identifier);
}

function normalizeMember(member, rows = member.rows) {
  if (!rows.length) return null;
  const job = core.normalizeGroup({
    key: `${member.type}:${member.identifier}`,
    combo: member.type === "combo" ? member.identifier : "",
    workOrders: new Set(rows.map(row => String(row["WO #"] || "").trim()).filter(Boolean)),
    rows,
  });
  if (member.inferredComplete) {
    job.operations = job.operations.map(op => ({ ...op, hoursRemaining: 0, progressRatio: 1, progressPercent: 100, fillRatio: 1, status: "Complete", phase: "complete" }));
    job.totalHoursRemaining = 0;
    job.percentComplete = 100;
  }
  return job;
}

function quantityByWo(rows) {
  const quantities = new Map();
  rows.forEach(row => {
    const wo = String(row["WO #"] || "").trim();
    if (wo) quantities.set(wo, Math.max(quantities.get(wo) || 0, core.parseNumber(row["WO Quantity"])));
  });
  return quantities;
}

function selectOwnedRows(members) {
  // Live work owns overlapping WOs before retained completion records; combos
  // own overlapping standalone selections. No operation is added twice.
  const ordered = [...members].sort((a, b) => Number(a.inferredComplete) - Number(b.inferredComplete) || Number(b.type === "combo") - Number(a.type === "combo") || a.id - b.id);
  const owners = new Map();
  return ordered.map(member => {
    const rows = member.rows.filter(row => !owners.has(String(row["WO #"] || "").trim()));
    const counted = new Set(rows.map(row => String(row["WO #"] || "").trim()));
    counted.forEach(wo => { if (wo) owners.set(wo, member.id); });
    return { member, rows, counted };
  });
}

function projectView(members) {
  const departments = new Map();
  const quantities = new Map();
  const allOperations = [];
  const views = new Map();
  selectOwnedRows(members).forEach(({ member, rows, counted }) => {
    const job = normalizeMember(member, rows);
    const fullJob = normalizeMember(member);
    const woQuantities = quantityByWo(member.rows);
    const workOrders = [...woQuantities].map(([identifier, quantity]) => {
      const woRows = memberRows(member.rows, "wo", identifier);
      const woJob = normalizeMember({ ...member, type: "wo", identifier }, woRows);
      return { identifier, quantity, part: core.unique(woRows.map(row => row.Part)).join(" / "), description: core.unique(woRows.map(row => row.Description)).join(" / "), counted: counted.has(identifier), operations: woJob.operations };
    });
    quantityByWo(rows).forEach((quantity, wo) => {
      quantities.set(wo, quantity);
    });
    if (job) {
      job.operations.forEach(op => {
        allOperations.push(op);
        departments.set(op.workCenter, (departments.get(op.workCenter) || 0) + op.hoursRemaining);
      });
    }
    views.set(member.id, {
      id: member.id, type: member.type, identifier: member.identifier,
      inferredComplete: member.inferredComplete, lastSeenAt: member.lastSeenAt,
      customer: fullJob?.customer || "", description: fullJob?.description || "", workOrders,
      remainingHours: job?.totalHoursRemaining || 0,
      progress: job?.percentComplete ?? fullJob?.percentComplete ?? 0,
      operations: job?.operations || [],
      displayOperations: fullJob?.operations || [],
      displayProgress: fullJob?.percentComplete || 0,
      overlapping: rows.length < member.rows.length,
    });
  });
  return {
    members: members.map(member => views.get(member.id)),
    summary: {
      remainingOperations: allOperations.filter(operation => operation.phase !== "complete").length,
      remainingHours: allOperations.reduce((sum, op) => sum + op.hoursRemaining, 0),
      workOrderCount: quantities.size,
      quantity: [...quantities.values()].reduce((sum, value) => sum + value, 0),
      progress: core.calculateOverallProgress(allOperations),
      comboCount: members.filter(member => member.type === "combo").length,
      individualCount: members.filter(member => member.type === "wo").length,
    },
    departments: [...departments].map(([name, hours]) => ({ name, hours })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

module.exports = { readWorkCenter, memberRows, projectView, selectOwnedRows, normalizeMember };
