// Shared scheduler normalization. Keep browser and server calculations identical.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SchedulerCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
'use strict';
const MAX_DATE = new Date(8640000000000000);

function parseCsv(text) {
  text = String(text).replace(/^\uFEFF/, "");
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

function parseCsvMatrix(text) {
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
      row.push(current.trim());
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current.trim());
      current = "";
      if (row.some((cell) => String(cell || "").trim())) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    current += char;
  }

  if (current.length || row.length) {
    row.push(current.trim());
    if (row.some((cell) => String(cell || "").trim())) {
      rows.push(row);
    }
  }

  return rows;
}

function isSchedulableRow(row) {
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

function parseNumber(value) {
  const number = Number.parseFloat(String(value || "").replace(/,/g, "").trim());
  return Number.isFinite(number) ? number : 0;
}

function parseDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildJobs(rows) {
  const groups = new Map();

  rows.forEach((row) => {
    const workOrder = (row["WO #"] || "").trim();
    const combo = (row["Combo #"] || "").trim();
    const groupKey = combo ? `combo:${combo}` : `wo:${workOrder}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        key: groupKey,
        combo,
        workOrders: new Set(),
        rows: [],
      });
    }

    const group = groups.get(groupKey);
    group.rows.push(row);
    if (workOrder) {
      group.workOrders.add(workOrder);
    }
  });

  return [...groups.values()]
    .map((group) => normalizeGroup(group))
    .sort((a, b) => a.shipByDate - b.shipByDate || a.displayId.localeCompare(b.displayId));
}

function normalizeGroup(group) {
  const rows = group.rows;
  const firstRow = rows[0] || {};
  const operationMap = new Map();
  const shipDates = rows
    .map((row) => parseDate(row["Ship By"]))
    .filter(Boolean)
    .sort((a, b) => a - b);
  const customers = unique(rows.map((row) => row.Customer));
  const parts = unique(rows.map((row) => row.Part));
  const descriptions = unique(rows.map((row) => row.Description));

  rows.forEach((row) => {
    const sequenceNumber = parseNumber(row["Operation Sequence"]);
    const operationName = (row["Operation Name"] || row["Formula (Text)"] || "").trim() || "Operation";
    const workCenter = (row["Manufacturing Work Center"] || "").trim() || "Unassigned";
    const hoursRemaining = parseNumber(row["Hours Remaining"]);
    const status = normalizeStatus(row.Status);
    const woQty = parseNumber(row["WO Quantity"]);
    const completedQuantity = parseNumber(row["Completed Quantity"]);
    const remainingQuantity = parseNumber(row["Remaining Quantity"]);
    const qtyCompleted = parseNumber(row["Qty Completed"]);
    const totalQuantity = woQty || completedQuantity + remainingQuantity || qtyCompleted + remainingQuantity || 0;
    const effectiveCompleted =
      completedQuantity > 0
        ? completedQuantity
        : totalQuantity > 0 && remainingQuantity > 0
          ? Math.max(totalQuantity - remainingQuantity, 0)
          : qtyCompleted;

    const operationKey = createOperationKey(sequenceNumber || 0, workCenter, operationName);
    if (!operationMap.has(operationKey)) {
      operationMap.set(operationKey, {
        key: operationKey,
        sequence: sequenceNumber || 0,
        sequenceLabel: `Op ${sequenceNumber || "?"}`,
        workCenter,
        operationName,
        rows: [],
        sourceRowCount: 0,
        hoursRemaining: 0,
        completedQuantity: 0,
        totalQuantity: 0,
        statusRank: 0,
        isDone: true,
        isPlaceholder: false,
      });
    }

    const operation = operationMap.get(operationKey);
    operation.rows.push(row);
    operation.sourceRowCount += 1;
    operation.hoursRemaining += hoursRemaining;
    operation.completedQuantity += effectiveCompleted;
    operation.totalQuantity += totalQuantity;
    operation.statusRank = Math.max(operation.statusRank, status.rank);
    operation.isDone = operation.isDone && status.isDone && hoursRemaining <= 0;
  });

  const operations = [...operationMap.values()]
    .sort(compareOperations)
    .map((operation) => finalizeOperation(operation));
  const correctedOperations = applyClaimCorrection(operations);
  const firstOpenSequence = correctedOperations.find((operation) => operation.phase !== "complete")?.sequence ?? null;

  correctedOperations.forEach((operation) => {
    if (operation.phase === "complete") {
      operation.fillRatio = operation.progressRatio;
      return;
    }

    operation.phase = firstOpenSequence !== null && operation.sequence === firstOpenSequence ? "current" : "future";
    operation.fillRatio = operation.progressRatio;
  });

  const currentOperations = correctedOperations.filter((operation) => operation.phase === "current");
  const currentOperation = currentOperations[0] || null;
  const totalHoursRemaining = correctedOperations.reduce((sum, operation) => sum + operation.hoursRemaining, 0);
  const remainingDepartmentCount = correctedOperations.filter(
    (operation) => operation.phase !== "complete" && operation.hoursRemaining > 0
  ).length;
  const percentComplete = calculateOverallProgress(correctedOperations);
  const shipByDate = shipDates[0] || MAX_DATE;
  const productionDate = calculateProductionDate(shipByDate, totalHoursRemaining, remainingDepartmentCount);
  const displayId = group.combo || [...group.workOrders][0] || "Unidentified";
  const isComplete = correctedOperations.every((operation) => operation.phase === "complete");
  const statusSummary = summarizeStatus(currentOperations, isComplete);

  return {
    key: group.key,
    combo: group.combo,
    displayId,
    typeLabel: group.combo ? "Combo" : "Solo WO",
    customer: customers.join(" / "),
    part: parts.slice(0, 2).join(" / "),
    description: descriptions.join(" / "),
    shipByDate,
    shipByLabel: isKnownDate(shipByDate) ? formatDate(shipByDate) : "Unknown",
    productionDate,
    productionDateLabel: isKnownDate(productionDate) ? formatDate(productionDate) : "Unknown",
    operations: correctedOperations,
    currentOperations,
    currentOperation,
    currentSequence: currentOperation?.sequence || Number.MAX_SAFE_INTEGER,
    percentComplete,
    totalHoursRemaining,
    remainingDepartmentCount,
    statusSummary,
    isComplete,
    isLate: !isComplete && stripTime(shipByDate) < startOfToday(),
    workOrders: [...group.workOrders],
    workOrderCountLabel: group.combo ? `${group.workOrders.size} WOs` : "1 WO",
    firstRow,
    sourceRows: rows,
  };
}

function calculateProductionDate(shipByDate, totalHoursRemaining, remainingDepartmentCount) {
  if (!isKnownDate(shipByDate)) {
    return MAX_DATE;
  }

  const leadDays = Math.ceil(totalHoursRemaining / 8 + remainingDepartmentCount / 2);
  return subtractWorkingDays(shipByDate, leadDays);
}

function calculateOverallProgress(operations) {
  if (!operations.length) {
    return 0;
  }

  const total = operations.length;
  const completed = operations.reduce((sum, operation) => sum + operation.progressRatio, 0);
  return Math.round((completed / total) * 100);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function stripTime(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function finalizeOperation(operation) {
  const quantityProgress =
    operation.totalQuantity > 0 ? clamp(operation.completedQuantity / operation.totalQuantity, 0, 1) : null;
  const status = statusFromRank(operation.statusRank);
  const phase = operation.isDone ? "complete" : "future";
  const progressRatio = operation.isDone ? 1 : quantityProgress ?? (operation.hoursRemaining <= 0 ? 1 : 0);

  return {
    ...operation,
    status,
    hasSourceRows: operation.sourceRowCount > 0,
    progressRatio,
    progressPercent: Math.round(progressRatio * 100),
    fillRatio: progressRatio,
    phase,
  };
}

function applyClaimCorrection(operations) {
  if (!operations.length) {
    return operations;
  }

  const firstOpenSequence = operations.find((operation) => operation.phase !== "complete")?.sequence ?? null;
  const furthestProgressSequence = operations.reduce((maxSequence, operation) => {
    if (operation.phase === "complete") {
      return maxSequence;
    }
    if (operation.progressRatio > 0 && operation.progressRatio < 1) {
      return Math.max(maxSequence, operation.sequence);
    }
    return maxSequence;
  }, -1);

  if (firstOpenSequence === null || furthestProgressSequence <= firstOpenSequence) {
    return operations;
  }

  return operations.map((operation) => {
    if (
      operation.sequence < furthestProgressSequence &&
      operation.phase !== "complete" &&
      operation.isPlaceholder &&
      !operation.hasSourceRows
    ) {
      return {
        ...operation,
        hoursRemaining: 0,
        isDone: true,
        status: "Complete",
        progressRatio: 1,
        progressPercent: 100,
        fillRatio: 1,
        phase: "complete",
      };
    }
    return operation;
  });
}

function summarizeStatus(currentOperations, isComplete) {
  if (currentOperations.some((operation) => operation.status === "In Process")) {
    return "In Process";
  }
  if (currentOperations[0]?.status) {
    return currentOperations[0].status;
  }
  return isComplete ? "Complete" : "Released";
}

function normalizeStatus(status) {
  const normalized = (status || "").trim().toLowerCase();
  if (["complete", "completed", "closed"].includes(normalized)) {
    return { label: "Complete", rank: 3, isDone: true };
  }
  if (normalized === "in process") {
    return { label: "In Process", rank: 2, isDone: false };
  }
  if (normalized === "released") {
    return { label: "Released", rank: 1, isDone: false };
  }
  return { label: status?.trim() || "Released", rank: normalized ? 1 : 0, isDone: false };
}

function statusFromRank(rank) {
  if (rank >= 3) {
    return "Complete";
  }
  if (rank === 2) {
    return "In Process";
  }
  return "Released";
}

function createOperationKey(sequence, workCenter, operationName) {
  return `${sequence}::${workCenter}::${operationName}`;
}

function compareOperations(a, b) {
  return (
    a.sequence - b.sequence ||
    a.workCenter.localeCompare(b.workCenter) ||
    a.operationName.localeCompare(b.operationName) ||
    a.key.localeCompare(b.key)
  );
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function subtractWorkingDays(date, workingDays) {
  let next = stripTime(date);
  let remaining = workingDays;

  while (remaining > 0) {
    next = addDays(next, -1);
    if (isWorkingDay(next)) {
      remaining -= 1;
    }
  }

  return next;
}

function isWorkingDay(date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function unique(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isKnownDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime()) && date.getTime() !== MAX_DATE.getTime();
}

return { parseCsv, parseCsvMatrix, isSchedulableRow, parseNumber, parseDate, buildJobs, normalizeGroup, calculateProductionDate, calculateOverallProgress, formatDate, startOfToday, stripTime, finalizeOperation, applyClaimCorrection, summarizeStatus, normalizeStatus, statusFromRank, createOperationKey, compareOperations, addDays, subtractWorkingDays, isWorkingDay, unique, clamp, isKnownDate };
});
