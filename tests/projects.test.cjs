const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const core = require("../scheduler-core");
const { readWorkCenter, projectView } = require("../projects-domain");

const headers = ["Ship By", "WO #", "Combo #", "Customer", "Part", "Description", "Operation Sequence", "Operation Name", "Manufacturing Work Center", "Hours Remaining", "WO Quantity", "Status", "Completed Quantity", "Remaining Quantity"];
const row = (wo, combo = "", overrides = {}) => ({ "Ship By": "9/25/2026", "WO #": wo, "Combo #": combo, Customer: "Bush Hog", Part: "BH-1", Description: "Decal", "Operation Sequence": "1", "Operation Name": "Print", "Manufacturing Work Center": "Screen", "Hours Remaining": "10", "WO Quantity": "100", Status: "In Process", "Completed Quantity": "50", "Remaining Quantity": "50", ...overrides });
const csv = rows => [headers.join(","), ...rows.map(row => headers.map(header => `"${String(row[header] || "").replaceAll('"', '""')}"`).join(","))].join("\n");
const member = (id, type, identifier, rows, inferredComplete = false) => ({ id, type, identifier, rows, inferredComplete, lastSeenAt: "2026-09-11T12:00:00Z" });

test("notes migrate existing projects, validate input and preserve omitted values", () => {
  const Database = require("better-sqlite3");
  const { createProjectsStore } = require("../projects-store");
  const db = new Database(":memory:");
  try {
    db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT, customer TEXT, target_date TEXT, archived INTEGER, revision INTEGER, created_at TEXT, updated_at TEXT);
      INSERT INTO projects VALUES (1, 'Existing', '', '', 0, 1, '', '');`);
    const source = () => ({ rows: [], metadata: null });
    const store = createProjectsStore(db, source);
    assert.equal(store.detail(1).project.notes, "");
    const notes = '  Check <script> & "quotes"\nRésumé — ready 🚀\n';
    let d = store.update(1, { name: "Existing", revision: 1, notes });
    assert.equal(d.project.notes, notes);
    d = store.update(1, { name: "Renamed", revision: d.project.revision });
    assert.equal(d.project.notes, notes);
    assert.throws(() => store.update(1, { name: "Stale", revision: 1, notes: "Lost" }), { status: 409 });
    assert.equal(store.detail(1).project.notes, notes);
    assert.throws(() => store.create({ name: "Bad", notes: 5 }), { status: 400 });
    assert.throws(() => store.create({ name: "Too long", notes: "x".repeat(5001) }), { status: 400 });
    assert.equal(store.create({ name: "Limit", notes: "x".repeat(5000) }).project.notes.length, 5000);
    assert.equal(createProjectsStore(db, source).detail(1).project.notes, notes);
    d = store.update(1, { name: "Renamed", revision: d.project.revision, notes: "" });
    assert.equal(d.project.notes, "");
  } finally { db.close(); }
});

test("printed notes preserve complete text, escape HTML and continue after scope", () => {
  const print = require("../projects-print");
  const detail = { project: { name: "Notes", notes: "" }, ...projectView([]) };
  assert.doesNotMatch(print.buildHtml(detail), /<section class="page project-note-page">/);
  for (const notes of ['Line one\n<unsafe> & "quoted" — 🚀', "x".repeat(5000), "\n".repeat(5000)]) {
    detail.project.notes = notes;
    const html = print.buildHtml(detail);
    const chunks = [...html.matchAll(/<div class="project-note-body">([\s\S]*?)<\/div>/g)].map(match => match[1]);
    const escaped = notes.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    assert.equal(chunks.join(""), escaped);
    assert.ok(html.indexOf('class="page project-note-page"') > html.indexOf('class="page scope"'));
    assert.ok(html.includes(`${chunks.length + 2} / ${chunks.length + 2}`));
  }
});

test("supplied scheduler data retains its normalized job count and hours", () => {
  const rows = readWorkCenter(fs.readFileSync(path.join(__dirname, "../StPWorkCenterFullResults669.csv"), "utf8"));
  const jobs = core.buildJobs(rows);
  assert.equal(rows.length, 2506);
  assert.equal(jobs.length, 465);
  assert.ok(Math.abs(jobs.reduce((sum, job) => sum + job.totalHoursRemaining, 0) - 4055.9) < 0.00001);
});

test("quantity counts each WO once while progress averages normalized operations", () => {
  const rows = [row("W1", "C1"), row("W2", "C1"), row("W1", "C1", { "Operation Sequence": "2", "Manufacturing Work Center": "Finish", "Hours Remaining": "5", "WO Quantity": "90", "Completed Quantity": "0", "Remaining Quantity": "90" })];
  const result = projectView([member(1, "combo", "C1", rows)]);
  assert.equal(result.summary.quantity, 200);
  assert.equal(result.summary.workOrderCount, 2);
  assert.equal(result.summary.remainingHours, 25);
  assert.equal(result.summary.progress, 25);
  assert.deepEqual(result.departments, [{ name: "Finish", hours: 5 }, { name: "Screen", hours: 20 }]);
});

test("overlapping saved WO and combo count operations once, live data wins over snapshots", () => {
  const rows = [row("W1", "C1"), row("W2", "C1")];
  let result = projectView([member(1, "wo", "W1", rows.slice(0, 1)), member(2, "combo", "C1", rows)]);
  assert.equal(result.summary.remainingHours, 20);
  assert.equal(result.summary.quantity, 200);
  assert.equal(result.members[0].remainingHours, 0);
  assert.equal(result.members[0].workOrders[0].counted, false);
  result = projectView([member(1, "combo", "OLD", rows, true), member(2, "wo", "W1", [row("W1")])]);
  assert.equal(result.summary.remainingHours, 10);
  assert.equal(result.summary.quantity, 200);
  assert.equal(result.summary.progress, 75);
});

test("completed and empty project metrics and strict upload validation", () => {
  const result = projectView([member(1, "wo", "W1", [row("W1")], true)]);
  assert.equal(result.summary.progress, 100);
  assert.equal(result.summary.remainingHours, 0);
  assert.equal(result.summary.quantity, 100);
  assert.equal(projectView([]).summary.progress, 0);
  assert.deepEqual(readWorkCenter(csv([])), []);
  assert.equal(readWorkCenter(`\uFEFF${csv([row("W1")])}`).length, 1);
  assert.throws(() => readWorkCenter("wrong,columns\n1,2"), /missing columns/);
  assert.throws(() => readWorkCenter(`${csv([])}\n"unterminated`), /unclosed/);
  assert.throws(() => readWorkCenter(`${csv([])}\n1,2`), /wrong number/);
  assert.throws(() => readWorkCenter(`\n${csv([]).replace("WO #", " WO # ")}`), /column names/);
});

test("project summary print omits internal WOs, retains completion labels and escapes content", () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../projects-print.js"), "utf8"), context);
  const detail = { project: { name: '<script>alert("x")</script>', customer: "Bush Hog", targetDate: "2026-09-25" }, ...projectView([member(1, "combo", "C1", [row("W1", "C1"), row("W2", "C1")], true)]), source: { originalName: "work.csv", uploadedAt: "2026-09-11T12:00:00Z" } };
  const html = context.ProjectPrint.buildHtml(detail);
  assert.doesNotMatch(html, /W1|W2|Quantity complete|Op 1/); assert.match(html, /C1/);
  assert.match(html, /Inferred complete/); assert.match(html, /table-header-group/);
  assert.equal((html.match(/class="page /g) || []).length, 2);
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>|<details/);
});

test("summary print paginates every scope item and preserves deduplicated contributions", () => {
  const print = require('../projects-print');
  const makeDetail = members => ({ project: { name: 'Launch' }, ...projectView(members) });
  for (const [count, pages] of [[0,2],[4,2],[7,3],[12,3],[13,4]]) {
    const members = Array.from({length:count}, (_,i) => member(i+1,'wo',`SOLO-${i+1}`,[row(`SOLO-${i+1}`)]));
    const html = print.buildHtml(makeDetail(members));
    assert.equal((html.match(/class="page /g)||[]).length,pages);
    assert.equal((html.match(/class="item"/g)||[]).length,count);
    members.forEach(m => assert.equal(html.split(`<strong>${m.identifier}</strong>`).length-1,1));
    assert.equal((html.match(/PROJECT TOTAL/g)||[]).length,1);
  }
  const rows = [row('INTERNAL-A','C1'),row('INTERNAL-B','C1')];
  const html = print.buildHtml(makeDetail([member(1,'combo','C1',rows),member(2,'wo','INTERNAL-A',rows.slice(0,1))]));
  assert.match(html, /Overlapping work counted elsewhere/);
  assert.match(html, /<td>0<\/td><td>0<\/td><td><strong>0 h<\/strong>/);
  assert.doesNotMatch(html, /INTERNAL-B/);
});

test("authenticated project APIs persist across viewers, uploads and server restarts", { timeout: 30000 }, async t => {
  const cacheRoot = path.resolve(__dirname, "../.cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const dataDir = fs.mkdtempSync(path.join(cacheRoot, "projects-test-"));
  let child, base;
  async function start() {
    child = spawn(process.execPath, [path.join(__dirname, "../server.js")], { env: { ...process.env, HOST: "127.0.0.1", PORT: "0", DATA_DIR: dataDir, SQLITE_PATH: path.join(dataDir, "app.sqlite"), APP_PASSWORD: "project-test", SESSION_SECRET: "project-test-secret", NODE_ENV: "test" }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    base = await new Promise((resolve, reject) => {
      let log = "";
      const timeout = setTimeout(() => reject(new Error(`Server start timed out: ${log}`)), 8000);
      child.stdout.on("data", data => { log += data; const match = log.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timeout); resolve(match[0]); } });
      child.stderr.on("data", data => { log += data; });
      child.on("exit", code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${log}`)); });
    });
  }
  async function stop() { if (child && child.exitCode === null) { const exited = once(child, "exit"); child.kill(); await exited; } }
  t.after(async () => {
    await stop();
    assert.ok(path.resolve(dataDir).startsWith(cacheRoot + path.sep));
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  await start();
  async function login() {
    const response = await fetch(`${base}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "project-test" }) });
    assert.equal(response.status, 200);
    return response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  }
  let cookie = await login();
  const secondCookie = await login();
  async function api(url, method = "GET", body, expected = 200, auth = cookie) {
    const response = await fetch(`${base}/api${url}`, { method, headers: { Cookie: auth, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    assert.equal(response.status, expected, JSON.stringify(result));
    return result;
  }
  async function upload(text, expected = 200) {
    const form = new FormData(); form.append("csv", new Blob([text], { type: "text/csv" }), "work.csv");
    const response = await fetch(`${base}/api/csv/work-center`, { method: "POST", headers: { Cookie: cookie }, body: form });
    const result = await response.json(); assert.equal(response.status, expected, JSON.stringify(result)); return result;
  }
  await api("/projects", "GET", null, 401, "");
  for (const asset of ["/server.js", "/projects-store.js", "/data/app.sqlite"]) {
    assert.equal((await fetch(base + asset)).status, 404);
  }
  await api("/projects", "POST", { name: " " }, 400);
  await api("/projects", "POST", { name: "Bad date", targetDate: "2026-02-30" }, 400);
  const projectNotes = "Keep packing labels together.\nConfirm résumé artwork — <sample>.";
  let d = await api("/projects", "POST", { name: "Fall launch", customer: "Bush Hog", targetDate: "2026-09-25", notes: projectNotes }, 201);
  assert.equal(d.project.notes, projectNotes);
  const id = d.project.id, url = `/projects/${id}`;
  const firstRows = [row("W1", "C1"), row("W2", "C1"), row("W3")];
  await upload(csv(firstRows));
  const candidates = await api("/projects/candidates");
  assert.deepEqual(candidates.candidates.map(item => item.identifier), ["C1", "W3"]);
  await api(`${url}/members`, "POST", { revision: d.project.revision, members: [{ type: "wo", identifier: "W1" }] }, 400);
  d = await api(`${url}/members`, "POST", { revision: d.project.revision, members: [{ type: "combo", identifier: "C1" }, { type: "wo", identifier: "W3" }, { type: "wo", identifier: "W3" }] });
  assert.equal(d.members.length, 2); assert.equal(d.summary.remainingHours, 30);
  const duplicate = await api(`${url}/members`, "POST", { revision: d.project.revision, members: [{ type: "wo", identifier: "W3" }] });
  assert.equal(duplicate.project.revision, d.project.revision);
  assert.deepEqual((await api(url, "GET", null, 200, secondCookie)).summary, d.summary);
  assert.equal((await api(url, "GET", null, 200, secondCookie)).project.notes, projectNotes);
  await api(url, "PUT", { name: "Stale change", revision: 1 }, 409);
  d = await api(url, "PUT", { name: "Updated launch", customer: "Bush Hog", targetDate: "2026-09-30", revision: d.project.revision });
  let other = await api("/projects", "POST", { name: "Other project" }, 201);
  other = await api(`/projects/${other.project.id}/members`, "POST", { revision: other.project.revision, members: [{ type: "combo", identifier: "C1" }] });
  assert.equal(other.summary.workOrderCount, 2);
  const before = await api(url);
  await upload("wrong,columns\n1,2", 400);
  assert.deepEqual(await api(url), before);
  // Saved standalone WO now belongs to the selected combo: only three WOs count.
  await upload(csv([row("W1", "C1"), row("W2", "C1"), row("W3", "C1")]));
  d = await api(url); assert.equal(d.summary.workOrderCount, 3); assert.equal(d.summary.remainingHours, 30); assert.equal(d.members[1].overlapping, true);
  // A present combo follows changed membership; the independently saved W3 follows itself.
  await upload(csv([row("W1", "C1"), row("W4", "C1"), row("W3", "C2"), row("W5", "C2")]));
  d = await api(url); assert.equal(d.summary.workOrderCount, 3); assert.equal(d.summary.remainingHours, 30);
  assert.deepEqual(d.members[0].workOrders.map(wo => wo.identifier), ["W1", "W4"]);
  // Header-only CSV is valid: infer completion while retaining quantities.
  await upload(csv([]));
  d = await api(url); assert.equal(d.summary.remainingHours, 0); assert.equal(d.summary.progress, 100); assert.equal(d.summary.quantity, 300);
  assert.ok(d.members.every(member => member.inferredComplete));
  await stop(); await start(); cookie = await login();
  assert.deepEqual((await api(url)).summary, d.summary);
  assert.equal((await api(url)).project.notes, projectNotes);
  await upload(csv([row("W1", "C1"), row("W4", "C1"), row("W3")]));
  d = await api(url); assert.equal(d.summary.remainingHours, 30); assert.ok(d.members.every(member => !member.inferredComplete));
  // Missing physical source is not a successful empty upload.
  const sourcePath = path.join(dataDir, "uploads/work-center.csv"), savedBytes = fs.readFileSync(sourcePath);
  fs.unlinkSync(sourcePath);
  const unavailable = await api(url); assert.match(unavailable.warning, /unavailable/); assert.equal(unavailable.summary.remainingHours, 30);
  fs.writeFileSync(sourcePath, savedBytes);
  d = await api(`${url}/archive`, "PUT", { revision: d.project.revision, archived: true });
  assert.equal(d.project.archived, true);
  assert.equal(d.project.notes, projectNotes);
  d = await api(url, "PUT", { name: d.project.name, revision: d.project.revision, notes: "Archived note" });
  assert.equal(d.project.notes, "Archived note");
  await api(`${url}/members/${d.members[0].id}`, "DELETE", { revision: d.project.revision }, 400);
  d = await api(`${url}/archive`, "PUT", { revision: d.project.revision, archived: false });
  assert.equal(d.project.notes, "Archived note");
  d = await api(`${url}/members/${d.members[0].id}`, "DELETE", { revision: d.project.revision });
  assert.equal(d.members.length, 1);
  assert.equal(d.summary.workOrderCount, 1);
});
