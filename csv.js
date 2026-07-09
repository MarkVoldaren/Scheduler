export function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current);
      current = "";
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    current += char;
  }

  if (current.length || row.length) {
    row.push(current);
    rows.push(row);
  }

  const [headerRow = [], ...bodyRows] = rows;
  return bodyRows.map((cells) => {
    const record = {};
    headerRow.forEach((header, index) => {
      record[header] = cells[index] ?? "";
    });
    return record;
  });
}

export function isSchedulableRow(row) {
  const shipBy = String(row["Ship By"] || "").trim().toLowerCase();
  const workOrder = String(row["WO #"] || "").trim();
  const combo = String(row["Combo #"] || "").trim();
  const workCenter = String(row["Manufacturing Work Center"] || "").trim();

  if (shipBy.includes("total")) {
    return false;
  }

  if (!workOrder && !combo && !workCenter) {
    return false;
  }

  return true;
}

export function parseNumber(value) {
  const number = Number.parseFloat(String(value || "").replace(/,/g, "").trim());
  return Number.isFinite(number) ? number : 0;
}

export function parseDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
