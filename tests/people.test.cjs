const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const Database = require('better-sqlite3');
const domain = require('../people-domain');
const { createPeopleStore } = require('../people-store');
const sample = () => ({ name: ' Jamie Rivera ', hours: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0 }, allocations: [{ department: 'Shearcut', percent: 60 }, { department: 'Kitting', percent: 40 }] });

test('People validates exact allocations and calculates weekly and daily hours', () => {
  const input = sample(), normalized = domain.validate(input, ['Shearcut', 'Kitting']);
  assert.equal(normalized.name, 'Jamie Rivera');
  assert.equal(normalized.hours.mon, 800);
  assert.equal(normalized.allocations[0].basisPoints, 6000);
  const result = domain.totals(input.hours, input.allocations);
  assert.equal(result.weeklyHours, 40);
  assert.deepEqual(result.allocations.map(a => a.weeklyHours), [24, 16]);
  assert.deepEqual(result.allocations.map(a => a.dailyHours.mon), [4.8, 3.2]);
  input.allocations = [{ department: 'Shearcut', percent: '33.33' }, { department: 'Kitting', percent: '66.67' }];
  domain.validate(input, ['Shearcut', 'Kitting']);
  input.hours = Object.fromEntries(domain.days.map(day => [day, 0]));
  assert.equal(domain.totals(input.hours, input.allocations).weeklyHours, 0);
  domain.validate(input, ['Shearcut', 'Kitting']);
  for (const mutate of [
    p => { p.name = ' '; }, p => { p.name = 'a'.repeat(121); }, p => { p.hours.mon = -1; },
    p => { p.hours.mon = 24.01; }, p => { p.hours.mon = '1.001'; }, p => { p.hours.mon = ''; },
    p => { p.allocations = []; }, p => { p.allocations[0].percent = 59.99; },
    p => { p.allocations[0].percent = 0; }, p => { p.allocations[1].department = 'Shearcut'; },
    p => { p.allocations[1].department = 'Invented'; },
  ]) { const invalid = sample(); mutate(invalid); assert.throws(() => domain.validate(invalid, ['Shearcut', 'Kitting']), { status: 400 }); }
});

test('People storage preserves unavailable assignments, revisions, archives and integer values', () => {
  const db = new Database(':memory:');
  try {
    let departments = ['Shearcut', 'Kitting'];
    const store = createPeopleStore(db, () => departments);
    let person = store.create(sample());
    store.create({ ...sample(), name: 'Alex' });
    store.create(sample()); // Shared names are allowed.
    assert.equal(store.list().people[0].name, 'Alex');
    const raw = db.prepare('SELECT hours, allocations FROM people WHERE id=?').get(person.id);
    assert.equal(JSON.parse(raw.hours).mon, 800);
    assert.equal(JSON.parse(raw.allocations)[0].basisPoints, 6000);
    departments = [];
    person = store.update(person.id, { ...person, hours: { ...person.hours, sat: 2.25 } });
    assert.equal(person.hours.sat, 2.25);
    assert.throws(() => store.update(person.id, { ...person, revision: 1 }), { status: 409 });
    assert.throws(() => store.create(sample()), { status: 400 });
    person = store.archive(person.id, { revision: person.revision, archived: true });
    assert.equal(person.archived, true);
    assert.throws(() => store.archive(person.id, { revision: person.revision - 1, archived: false }), { status: 409 });
    person = store.archive(person.id, { revision: person.revision, archived: false });
    assert.equal(person.archived, false);
    assert.equal(createPeopleStore(db, () => departments).list().people.length, 3);
  } finally { db.close(); }
});

test('People API enforces permissions, persists after restart and leaves Capacity unchanged', async t => {
  const cache = path.resolve(__dirname, '../.cache');
  const dir = fs.mkdtempSync(path.join(cache, 'people-test-'));
  let child, base;
  async function stop() { if (child && child.exitCode === null) { const done = once(child, 'exit'); child.kill(); await done; } }
  async function start() {
    child = spawn(process.execPath, [path.resolve(__dirname, '../server.js')], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PORT: '0', HOST: '127.0.0.1', DATA_DIR: dir, SQLITE_PATH: path.join(dir, 'app.sqlite'), APP_PASSWORD: 'test-app', ADMIN_PASSWORD: 'test-admin', SESSION_SECRET: 'people-test-secret', NODE_ENV: 'test' } });
    base = await new Promise((resolve, reject) => {
      let log = ''; const timer = setTimeout(() => reject(new Error(log)), 8000);
      child.stdout.on('data', data => { log += data; const match = log.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
      child.stderr.on('data', data => { log += data; });
      child.on('exit', () => { clearTimeout(timer); reject(new Error(log)); });
    });
  }
  t.after(async () => { await stop(); assert.ok(dir.startsWith(cache + path.sep)); fs.rmSync(dir, { recursive: true, force: true }); });
  function client() {
    let cookie = '';
    return async (route, method = 'GET', body, expected = 200) => {
      const response = await fetch(base + route, { method, headers: { Cookie: cookie, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }) });
      if (response.headers.getSetCookie().length) cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
      assert.equal(response.status, expected, await response.clone().text());
      return response.json();
    };
  }
  await start(); const admin = client(), viewer = client();
  await viewer('/api/people', 'GET', undefined, 401);
  await admin('/api/login', 'POST', { password: 'test-app' });
  await viewer('/api/login', 'POST', { password: 'test-app' });
  await viewer('/api/people', 'POST', sample(), 403);
  await admin('/api/admin/unlock', 'POST', { password: 'test-admin' });
  const form = new FormData();
  form.append('csv', new Blob([fs.readFileSync(path.resolve(__dirname, '../StPWorkCenterFullResults669.csv'))], { type: 'text/csv' }), 'work.csv');
  await admin('/api/csv/work-center', 'POST', form);
  const catalog = await viewer('/api/people');
  assert.ok(catalog.departments.length);
  const input = { ...sample(), allocations: [{ department: catalog.departments[0], percent: 100 }] };
  const before = await admin('/api/app-state');
  let person = await admin('/api/people', 'POST', input, 201);
  await viewer(`/api/people/${person.id}`, 'PUT', person, 403);
  await viewer(`/api/people/${person.id}/archive`, 'PUT', { revision: 1, archived: true }, 403);
  person = await admin(`/api/people/${person.id}`, 'PUT', { ...person, name: 'Updated' });
  await admin(`/api/people/${person.id}`, 'PUT', { ...person, revision: 1 }, 409);
  person = await admin(`/api/people/${person.id}/archive`, 'PUT', { revision: person.revision, archived: true });
  assert.equal((await viewer('/api/people')).people[0].archived, true);
  person = await admin(`/api/people/${person.id}/archive`, 'PUT', { revision: person.revision, archived: false });
  assert.deepEqual((await admin('/api/app-state')).settings, before.settings);
  await stop(); await start();
  assert.equal((await viewer('/api/people')).people[0].name, 'Updated');
  await viewer('/people-store.js', 'GET', undefined, 404);
  await viewer('/api/logout', 'POST');
  await viewer('/api/people', 'GET', undefined, 401);
});
