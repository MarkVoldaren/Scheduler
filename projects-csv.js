"use strict";

const core = require("./scheduler-core");
const { selectOwnedRows, normalizeMember } = require("./projects-domain");
const HEADERS = ["Part Number", "Description", "WO Number", "Dynamic BOM", "Customer", "WO Quantity", "Ship By", "Hours Remaining", "Production Progress %", "Tracking Status"];
const value = (row, field) => String(row[field] || "").trim();
const dateText = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function exportRows(members, sourceAvailable = true) {
  const result = [];
  selectOwnedRows(members).forEach(({ member, rows }) => {
    const groups = new Map();
    rows.forEach(row => {
      const key = JSON.stringify([value(row, "WO #"), value(row, "Part")]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    groups.forEach(group => {
      const job = normalizeMember(member, group);
      const distinct = field => [...new Set(group.map(row => value(row, field)).filter(Boolean))].join(" | ");
      const dates = group.map(row => core.parseDate(row["Ship By"])).filter(date => date && core.isKnownDate(date));
      const earliest = dates.length ? new Date(Math.min(...dates.map(date => date.getTime()))) : null;
      result.push([value(group[0], "Part"), distinct("Description"), value(group[0], "WO #"), distinct("Combo #"), distinct("Customer"),
        Math.max(0, ...group.map(row => core.parseNumber(row["WO Quantity"]))), earliest ? dateText(earliest) : "",
        job.totalHoursRemaining, job.percentComplete,
        !sourceAvailable ? "Last-known data — source unavailable" : member.inferredComplete ? "Inferred complete" : "Current source data"]);
    });
  });
  return result;
}

function cell(value) {
  if (typeof value === "number") return String(Number.isFinite(value) ? value : 0);
  let text = String(value ?? "");
  if (/^\s*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function projectCsv(project, members, sourceAvailable, now = new Date()) {
  const name = project.name.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "-").replace(/[. ]+$/g, "").slice(0, 150) || "project";
  return { filename: `${name}-${dateText(now)}.csv`, csv: "\uFEFF" + [HEADERS, ...exportRows(members, sourceAvailable)].map(row => row.map(cell).join(",")).join("\r\n") + "\r\n" };
}

module.exports = { HEADERS, exportRows, projectCsv };
