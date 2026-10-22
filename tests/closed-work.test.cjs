const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const core = require("../scheduler-core");
const { readWorkCenter } = require("../projects-domain");

const row = (wo, Status, extra = {}) => ({
  "WO #": wo, "Combo #": "C1", Customer: "Customer", Part: wo,
  Description: "Part", "Operation Sequence": "1", "Manufacturing Work Center": "Print",
  "Hours Remaining": "5", "WO Quantity": "100", Status,
  "Completed Quantity": "20", "Remaining Quantity": "80", ...extra,
});
const csv = rows => {
  const headers = Object.keys(row("", ""));
  return [headers.join(","), ...rows.map(r => headers.map(h => JSON.stringify(r[h])).join(","))].join("\n");
};

test("closed status filtering is separate from structural eligibility", () => {
  for (const status of ["Closed", "closed", "  CLOSED \t"]) {
    const r = row("W1", status);
    assert.equal(core.isSchedulableRow(r), true);
    assert.equal(core.isClosedRow(r), true);
    assert.equal(core.isActiveWorkRow(r), false);
  }
  for (const status of ["In Process", "Released", "", "Not Closed", "Complete"]) {
    assert.equal(core.isActiveWorkRow(row("W1", status)), true);
  }
  assert.equal(core.isActiveWorkRow({}), false);
  assert.equal(core.isActiveWorkRow(row("W1", "Released", { "Ship By": "Total" })), false);
});

test("browser and server exclude closed combo rows before grouping and retain metric input", () => {
  const active = row("W1", "Released");
  const rows = [row("W2", "Closed", { "Manufacturing Work Center": "Closed-only department", "Hours Remaining": "900" }), active];
  const text = csv(rows);
  assert.deepEqual(readWorkCenter(text), [active]);
  assert.deepEqual(readWorkCenter(text, { includeClosed: true }), rows);
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../scheduler-core.js"), "utf8"), context);
  const browser = context.SchedulerCore;
  const jobs = browser.buildJobs(browser.parseCsv(text).filter(browser.isSchedulableRow));
  assert.equal(JSON.stringify(jobs), JSON.stringify(core.buildJobs(readWorkCenter(text))));
  assert.equal(jobs.length, 1);
  assert.deepEqual(Array.from(jobs[0].workOrders), ["W1"]);
  assert.equal(jobs[0].totalHoursRemaining, 5);
  assert.ok(jobs[0].operations.every(op => op.workCenter === "Print"));
  assert.deepEqual(core.buildJobs([row("W2", "Closed")]), []);
  assert.deepEqual(readWorkCenter(csv([row("W2", "Closed")])), []);
  assert.throws(() => readWorkCenter("wrong,columns\n1,2", { includeClosed: true }), /missing columns/);
});
