(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./scheduler-core"));
  else root.PickListDomain = factory(root.SchedulerCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";
  function key(row) {
    const text = field => String(row[field] || "").trim();
    const dateText = text("Ship Date");
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
    const date = iso ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])) : core.parseDate(dateText);
    const day = date && core.isKnownDate(date)
      ? `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}` : text("Ship Date");
    return JSON.stringify([text("Cust."), text("SO / TO"), text("Part #"), text("P O #"), text("Assoc. Print/WO"), day]);
  }
  function read(text) {
    const matrix = core.parseCsvMatrix(text);
    const required = ["Ship Date", "Part #", "Cust.", "Qty Needed", "Qty Committed", "SO / TO", "P O #", "Assoc. Print/WO"];
    const index = matrix.findIndex(row => required.every(header => row.map(cell => String(cell).trim()).includes(header)));
    if (index < 0) throw new Error("Pick List CSV is missing required columns.");
    const headers = matrix[index].map(cell => String(cell).trim());
    const rows = matrix.slice(index + 1).filter(cells => cells.some(cell => String(cell).trim())).map(cells => {
      if (cells.length !== headers.length) throw new Error("Pick List CSV has an invalid row width.");
      const row = Object.fromEntries(headers.map((header, i) => [header, cells[i]]));
      if (!String(row["Part #"] || "").trim() || !String(row["SO / TO"] || "").trim()) throw new Error("Each Pick List row must have a part and SO / TO.");
      return row;
    });
    const counts = new Map();
    rows.forEach(row => counts.set(key(row), (counts.get(key(row)) || 0) + 1));
    return counts;
  }
  return { key, read };
});
