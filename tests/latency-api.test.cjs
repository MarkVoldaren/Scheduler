const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

test('source cache survives upload rollback, refreshes on commit/restart and leaves reads cheap', async t => {
  const root = path.resolve(__dirname, '../.cache'); fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'latency-test-'));
  const hook = path.join(dir, 'fault.cjs');
  // Fault injection is isolated to this child; no production hooks or endpoints.
  fs.writeFileSync(hook, `const fs = require('fs');
    const core = require(${JSON.stringify(path.resolve(__dirname, '../scheduler-core'))});
    const parse = core.parseCsv, build = core.buildJobs;
    core.parseCsv = (...args) => { if(fs.existsSync(${JSON.stringify(path.join(dir, 'forbid-parse'))})) throw new Error('Unexpected read parse'); return parse(...args); };
    core.buildJobs = (...args) => { if(fs.existsSync(${JSON.stringify(path.join(dir, 'forbid-parse'))})) throw new Error('Unexpected job build'); return build(...args); };
    const rename = fs.renameSync;
    fs.renameSync = (...args) => { if(fs.existsSync(${JSON.stringify(path.join(dir, 'fail-rename'))})) throw new Error('Injected rename failure'); return rename(...args); };
    const stores = require(${JSON.stringify(path.resolve(__dirname, '../projects-store'))});
    const create = stores.createProjectsStore;
    stores.createProjectsStore = (...args) => { const store = create(...args); const reconcile=store.reconcile;
      store.reconcile=(...values)=>{if(fs.existsSync(${JSON.stringify(path.join(dir, 'fail-reconcile'))})) throw new Error('Injected reconcile failure'); return reconcile(...values);}; return store; };
  `);
  let child, base, cookie = '';
  async function start() {
    child = spawn(process.execPath, ['--require', hook, path.resolve(__dirname, '../server.js')], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: '0', HOST: '127.0.0.1', NODE_ENV: 'test', DATA_DIR: dir, SQLITE_PATH: path.join(dir, 'app.sqlite'), APP_PASSWORD: 'latency-test', ADMIN_PASSWORD: 'latency-admin', SESSION_SECRET: 'latency-test-secret' },
    });
    base = await new Promise((resolve, reject) => {
      let log = ''; const timer = setTimeout(() => reject(new Error(log)), 10000);
      child.stdout.on('data', data => { log += data; const match = log.match(/http:\/\/127\.0\.0\.1:\d+/); if(match) { clearTimeout(timer); resolve(match[0]); } });
      child.stderr.on('data', data => { log += data; });
      child.on('exit', () => { clearTimeout(timer); reject(new Error(log)); });
    });
  }
  async function stop() { if(child && child.exitCode === null) { const done = once(child, 'exit'); child.kill(); await done; } }
  t.after(async () => { await stop(); fs.rmSync(dir, { recursive: true, force: true }); });
  async function request(route, body, expected = 200) {
    const response = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { Cookie: cookie, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) }, body: body ? body instanceof FormData ? body : JSON.stringify(body) : undefined });
    if(response.headers.getSetCookie().length) cookie = response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    const value = await response.json(); assert.equal(response.status, expected, JSON.stringify(value)); return value;
  }
  const original = fs.readFileSync(path.resolve(__dirname, '../StPWorkCenterFullResults669.csv'), 'utf8');
  const replacement = original.replaceAll('Shearcut', 'New Cutting Department');
  async function upload(text, expected = 200) { const form = new FormData(); form.append('csv', new Blob([text]), 'work.csv'); return request('/api/csv/work-center', form, expected); }
  await start(); await request('/api/login', {password: 'latency-test'});
  await upload(original);
  const before = await request('/api/people'); assert.ok(before.departments.includes('Shearcut'));
  await request('/api/admin/unlock', {password:'latency-admin'});
  await request('/api/people', {name:'Preserved assignment',hours:{mon:8,tue:8,wed:8,thu:8,fri:8,sat:0,sun:0},allocations:[{department:'Shearcut',percent:100}]},201);
  const settings = (await request('/api/app-state')).settings;
  fs.writeFileSync(path.join(dir, 'forbid-parse'), '1');
  for(let i=0;i<3;i++) {
    const begin = performance.now(); const reads = await Promise.all([request('/api/app-state'), request('/api/people'), request('/api/session')]);
    assert.deepEqual(reads[1].departments, before.departments);
    t.diagnostic(`warm parallel app-state/people/session sample ${i+1}: ${Math.round(performance.now()-begin)} ms`);
  }
  fs.unlinkSync(path.join(dir, 'forbid-parse'));
  for(const fault of ['fail-rename', 'fail-reconcile']) {
    fs.writeFileSync(path.join(dir, fault), '1'); await upload(replacement, 500); fs.unlinkSync(path.join(dir, fault));
    assert.deepEqual((await request('/api/people')).departments, before.departments);
    assert.equal(fs.readFileSync(path.join(dir, 'uploads/work-center.csv'), 'utf8'), original);
  }
  await upload('invalid', 400); assert.deepEqual((await request('/api/people')).departments, before.departments);
  await upload(replacement); assert.ok((await request('/api/people')).departments.includes('New Cutting Department'));
  fs.appendFileSync(path.join(dir, 'uploads/work-center.csv'), '\n');
  assert.deepEqual((await request('/api/people')).departments, []);
  assert.equal((await request('/api/people')).people[0].allocations[0].department,'Shearcut');
  assert.equal((await request('/api/app-state')).peopleManHoursByDay.Shearcut.mon,8);
  assert.deepEqual((await request('/api/app-state')).settings,settings);
  assert.match((await request('/api/app-state')).sourceWarning, /outside the app/);
  await stop(); await start();
  assert.ok((await request('/api/people')).departments.includes('New Cutting Department'));
  fs.unlinkSync(path.join(dir, 'uploads/work-center.csv'));
  assert.deepEqual((await request('/api/people')).departments, []);
  await upload(original.split(/\r?\n/,1)[0]+'\n');
  const empty = await request('/api/people');
  assert.deepEqual(empty.departments,[]);assert.equal(empty.sourceWarning,undefined);
});
