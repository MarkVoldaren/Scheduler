const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const domain = require('../pick-list-domain');
const { createPickListStore } = require('../pick-list-store');
const headers = ['Ship Date', 'Part #', 'Cust.', 'Qty Needed', 'Qty Committed', 'SO / TO', 'P O #', 'Assoc. Print/WO'];
const row = { 'Ship Date': '10/20/2026', 'Part #': 'P', 'Cust.': 'C', 'Qty Needed': '10', 'Qty Committed': '0', 'SO / TO': 'SO1', 'P O #': 'PO1', 'Assoc. Print/WO': 'WO1' };
const csv = rows => [headers.join(','), ...rows.map(row => headers.map(h => row[h]).join(','))].join('\n');

test('matching ignores quantities, acceleration and row order but includes original date and WO', () => {
  assert.equal(domain.key(row), domain.key({ ...row, 'Qty Needed': '99', 'Acceleration Date': '10/21/2026', 'Ship Date': '2026-10-20' }));
  assert.notEqual(domain.key(row), domain.key({ ...row, 'Ship Date': '10/21/2026' }));
  assert.notEqual(domain.key(row), domain.key({ ...row, 'Assoc. Print/WO': 'WO2' }));
  assert.equal(domain.read(csv([row, row])).get(domain.key(row)), 2);
  assert.equal(domain.read(csv([])).size, 0);
  assert.throws(() => domain.read('invalid'), /required columns/);
  assert.throws(() => domain.read(csv([{ ...row, 'SO / TO': '' }])));
});

test('SQLite progress survives store recreation, rejects stale edits and prunes absent and ambiguous keys', () => {
  const db = new (require('better-sqlite3'))(':memory:');
  try {
    let store = createPickListStore(db);
    const keys = domain.read(csv([row]));
    const key = domain.key(row);
    let saved = store.save({ key, quantity: 2.5 }, keys)[0];
    store = createPickListStore(db);
    assert.equal(store.list()[0].quantity, 2.5);
    assert.throws(() => store.save({ key, quantity: 3 }, keys), /another session/);
    assert.throws(() => store.save({ key, quantity: -1, revision: saved.revision }, keys));
    store.reconcile(domain.read(csv([{ ...row, 'Qty Needed': '20' }])));
    assert.equal(store.list().length, 1);
    saved = store.save({ key, quantity: 4, revision: saved.revision }, keys)[0];
    store.save({ key, quantity: 0, revision: saved.revision }, keys);
    assert.equal(store.list().length, 0);
    store.save({ key, quantity: 1 }, keys);
    store.reconcile(domain.read(csv([row, row])));
    assert.equal(store.list().length, 0);
    assert.throws(() => store.save({ key, quantity: 1 }, new Map()), /missing or duplicated/);
    store.save({ key, quantity: 1 }, keys);
    store.reconcile(new Map());
    assert.equal(store.list().length, 0);
  } finally { db.close(); }
});

test('Picked field changes checkbox to clickable quantity and disables ambiguous rows', () => {
  const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
  const fn = name => source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`))[0];
  const ctx = vm.createContext({ state: { pickProgress: {} }, escapeHtml: s => String(s) });
  vm.runInContext(fn('createPickedCell'), ctx);
  const input = { pickKey: 'key', partNumber: 'P' };
  assert.match(ctx.createPickedCell(input), /type="checkbox"/);
  input.pulledQuantity = 2.5;
  assert.match(ctx.createPickedCell(input), /<button[^]*>2.5<\/button>/);
  assert.doesNotMatch(ctx.createPickedCell(input), /checkbox/);
  assert.match(ctx.createPickedCell({ ...input, pickAmbiguous: true }), /Duplicate key/);
});

test('authenticated upload reconciliation and picking survive restart without retaining removed rows', async t => {
  const path = require('node:path');
  const { spawn } = require('node:child_process');
  const { once } = require('node:events');
  const root = path.resolve(__dirname, '../.cache');
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'picking-test-'));
  let child, base, cookie;
  async function stop() {
    if (child && child.exitCode === null) { const done = once(child, 'exit'); child.kill(); await done; }
  }
  async function start() {
    child = spawn(process.execPath, [path.resolve(__dirname, '../server.js')], {
      env: { ...process.env, PORT: '0', HOST: '127.0.0.1', DATA_DIR: dir, SQLITE_PATH: path.join(dir, 'app.sqlite'), APP_PASSWORD: 'test', ADMIN_PASSWORD: '', SESSION_SECRET: 'test-picking-secret' },
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      let log = '';
      const timer = setTimeout(() => reject(new Error(log)), 8000);
      child.stdout.on('data', data => { log += data; const match = log.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
      child.stderr.on('data', data => { log += data; });
      child.on('exit', () => { clearTimeout(timer); reject(new Error(log)); });
    });
    const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test' }) });
    cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  }
  t.after(async () => { await stop(); assert.ok(dir.startsWith(root + path.sep)); fs.rmSync(dir, { recursive: true, force: true }); });
  async function upload(text, status = 200) {
    const body = new FormData();
    body.append('csv', new Blob([text], { type: 'text/csv' }), 'pick.csv');
    const response = await fetch(base + '/api/csv/pick-list', { method: 'POST', headers: { Cookie: cookie }, body });
    assert.equal(response.status, status, await response.text());
  }
  async function progress() { return (await fetch(base + '/api/pick-progress', { headers: { Cookie: cookie } })).json(); }
  async function save(quantity, revision, status = 200) {
    const response = await fetch(base + '/api/pick-progress', { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ key: domain.key(row), quantity, revision }) });
    assert.equal(response.status, status);
    return response.json();
  }
  await start();
  assert.equal((await fetch(base + '/api/pick-progress')).status, 401);
  await upload(csv([row]));
  const first = (await save(3))[0];
  await save(5, null, 409);
  await upload('invalid', 400);
  assert.equal((await progress())[0].quantity, 3);
  await upload(csv([{ ...row, 'Qty Needed': '20' }]));
  assert.equal((await progress())[0].revision, first.revision);
  await stop(); await start();
  assert.equal((await progress())[0].quantity, 3);
  await upload(csv([]));
  assert.deepEqual(await progress(), []);
  await save(3, first.revision, 409);
  await upload(csv([row]));
  assert.deepEqual(await progress(), []);
  await save(4);
  await upload(csv([row, row]));
  assert.deepEqual(await progress(), []);
  await save(2, null, 409);
});
