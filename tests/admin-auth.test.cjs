const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const vm = require('node:vm');

async function server(t, adminPassword = 'admin-test') {
  const root = path.resolve(__dirname, '../.cache');
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'admin-test-'));
  let child, base;
  async function stop() {
    if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
  }
  async function start() {
    child = spawn(process.execPath, [path.resolve(__dirname, '../server.js')], {
      env: { ...process.env, HOST: '127.0.0.1', PORT: '0', DATA_DIR: dir, SQLITE_PATH: path.join(dir, 'app.sqlite'), APP_PASSWORD: 'app-test', ADMIN_PASSWORD: adminPassword, SESSION_SECRET: 'test-session-secret', NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    base = await new Promise((resolve, reject) => {
      let log = '';
      const timeout = setTimeout(() => reject(new Error(log)), 8000);
      child.stdout.on('data', data => { log += data; const match = log.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timeout); resolve(match[0]); } });
      child.stderr.on('data', data => { log += data; });
      child.on('exit', code => { clearTimeout(timeout); reject(new Error(`Exit ${code}: ${log}`)); });
    });
  }
  t.after(async () => { await stop(); assert.ok(dir.startsWith(root + path.sep)); fs.rmSync(dir, { recursive: true, force: true }); });
  function client(initialCookie = '') {
    let cookie = initialCookie;
    return {
      get cookie() { return cookie; },
      async request(route, method = 'GET', body, status = 200) {
        const response = await fetch(base + '/api' + route, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
        const cookies = response.headers.getSetCookie();
        if (cookies.length) cookie = cookies.map(value => value.split(';')[0]).join('; ');
        const data = await response.json();
        assert.equal(response.status, status, JSON.stringify(data));
        return data;
      },
    };
  }
  return { start, stop, client };
}

test('Capacity admin authentication, independent sessions and persistent settings', async t => {
  const app = await server(t); await app.start();
  const a = app.client(), b = app.client(), anon = app.client();
  await anon.request('/settings', 'PUT', {}, 401);
  await anon.request('/admin/unlock', 'POST', { password: 'admin-test' }, 401);
  assert.deepEqual(await a.request('/login', 'POST', { password: 'app-test' }), { authenticated: true, adminAuthenticated: false });
  await b.request('/login', 'POST', { password: 'app-test' });
  await a.request('/settings', 'PUT', { machineCapacities: { Press: 99 } }, 403);
  await a.request('/admin/unlock', 'POST', { password: 'app-test' }, 403);
  await a.request('/admin/unlock', 'POST', { password: 'wrong' }, 403);
  assert.equal((await a.request('/session')).authenticated, true);
  assert.equal((await a.request('/session')).adminAuthenticated, false);
  await a.request('/admin/unlock', 'POST', { password: 'admin-test' });
  assert.equal((await app.client(a.cookie).request('/session')).adminAuthenticated, true);
  assert.equal((await b.request('/session')).adminAuthenticated, false);
  await b.request('/settings', 'PUT', {}, 403);
  await a.request('/settings', 'PUT', { machineCapacities: { Press: 12 } });
  assert.equal((await b.request('/app-state')).settings.machineCapacities.Press, 12);
  await app.stop(); await app.start();
  assert.equal((await a.request('/app-state')).settings.machineCapacities.Press, 12);
  await a.request('/login', 'POST', { password: 'app-test' });
  await a.request('/settings', 'PUT', {}, 403);
  await a.request('/admin/unlock', 'POST', { password: 'admin-test' });
  assert.deepEqual(await a.request('/logout', 'POST'), { authenticated: false, adminAuthenticated: false });
  assert.equal((await a.request('/session')).adminAuthenticated, false);
  await a.request('/settings', 'PUT', {}, 401);
});

test('Missing admin password keeps the app usable and Capacity locked', async t => {
  const app = await server(t, ''); await app.start(); const a = app.client();
  await a.request('/login', 'POST', { password: 'app-test' });
  await a.request('/app-state');
  await a.request('/admin/unlock', 'POST', { password: '' }, 403);
  await a.request('/settings', 'PUT', {}, 403);
});

test('Matching app and admin passwords are rejected', async t => {
  const app = await server(t, 'app-test');
  await assert.rejects(app.start(), /ADMIN_PASSWORD must differ/);
});

const source = fs.readFileSync(path.resolve(__dirname, '../app.js'), 'utf8');
function fn(name) {
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, name); return match[0];
}

test('Non-admin CSV hydration cannot queue settings writes, and locked rendering is guarded', async () => {
  let writes = 0, renders = 0;
  const context = vm.createContext({
    state: { usesServerSettings: true, adminAuthenticated: false }, refs: {},
    window: { clearTimeout() {}, setTimeout() { writes++; } },
    SERVER_SETTINGS_SAVE_DELAY: 350,
    renderSharedChrome() {}, renderCapacity() { renders++; }, getCapacityViewModel() { throw new Error('Locked data rendered'); },
  });
  vm.runInContext([fn('queueServerSettingsSave'), fn('saveServerSettingsNow'), fn('renderCapacitySurface')].join('\n'), context);
  vm.runInContext('queueServerSettingsSave(); renderCapacitySurface();', context);
  await vm.runInContext('saveServerSettingsNow()', context);
  assert.equal(writes, 0); assert.equal(renders, 0);
  context.state.adminAuthenticated = true;
  vm.runInContext('queueServerSettingsSave()', context);
  assert.equal(writes, 1);
});

test('Admin endpoints retain the scheduler deployment prefix', () => {
  const context = vm.createContext({ API_BASE_PATH: '/scheduler' });
  vm.runInContext(fn('resolveApiUrl'), context);
  assert.equal(vm.runInContext('resolveApiUrl("/api/admin/unlock")', context), '/scheduler/api/admin/unlock');
});

test('Session expiration cancels pending settings saves and removes capacity controls', async () => {
  let cancelled = false, cleared = false;
  const elements = new Map();
  const element = key => {
    if (!elements.has(key)) elements.set(key, { hidden: false, value: '', focus() {} });
    return elements.get(key);
  };
  const context = vm.createContext({
    state: { adminAuthenticated: true, settingsSaveTimer: 123, authGeneration: 0 },
    refs: { capacityGrid: { replaceChildren() { cleared = true; } }, viewCapacity: { setAttribute() {} }, loginScreen: {}, loginPassword: { focus() {} } },
    window: { clearTimeout(id) { cancelled = id === 123; } },
    document: { body: { dataset: {} }, querySelector: element }, setLoginError() {},
    fetch: async () => ({ status: 401 }), resolveApiUrl: value => value,
  });
  vm.runInContext([fn('setAuthenticated'), fn('setAdminAuthenticated'), fn('fetchJson')].join('\n'), context);
  await assert.rejects(vm.runInContext('fetchJson("/api/settings")', context), /Session expired/);
  assert.equal(context.state.adminAuthenticated, false);
  assert.equal(context.state.settingsSaveTimer, null);
  assert.equal(context.document.body.dataset.auth, 'locked');
  assert.equal(cancelled, true); assert.equal(cleared, true);
});

test('Rejected admin save locks Capacity and reports the failure inline', async () => {
  const errorElement = {};
  const context = vm.createContext({
    state: { adminAuthenticated: true, authGeneration: 1 },
    fetchJson: async () => { throw Object.assign(new Error('Admin access required'), { status: 403 }); },
    getOperationalSettingsPayload: () => ({}),
    setAdminAuthenticated(value) { context.state.adminAuthenticated = value; },
    document: { querySelector: () => errorElement }, console: { error() {} },
  });
  vm.runInContext(fn('saveServerSettingsNow'), context);
  await vm.runInContext('saveServerSettingsNow()', context);
  assert.equal(context.state.adminAuthenticated, false);
  assert.equal(errorElement.hidden, false);
  assert.match(errorElement.textContent, /not saved/);
});
