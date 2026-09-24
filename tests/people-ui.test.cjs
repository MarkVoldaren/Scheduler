const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const domain = require('../people-domain');
const source = fs.readFileSync(path.join(__dirname, '../people-ui.js'), 'utf8');
function setup(request) {
  const events = {}, selectors = new Map();
  const root = {
    innerHTML: '', addEventListener(name, listener) { events[name] = listener; },
    replaceChildren() { this.innerHTML = ''; },
    querySelector(selector) { if (!selectors.has(selector)) selectors.set(selector, { textContent: '', innerHTML: '', focus() {} }); return selectors.get(selector); },
    querySelectorAll() { return []; },
  };
  let allowLeave = false;
  const context = vm.createContext({ PeopleDomain: domain, window: { confirm: () => allowLeave, addEventListener() {} } });
  vm.runInContext(source, context);
  const ui = context.createPeopleUI({ root, request, isAdmin: () => true, isActive: () => true, lock() {}, unlock: async () => {} });
  const click = dataset => events.click({ target: { closest: () => ({ dataset }) } });
  return { ui, root, events, click, allowLeave: () => { allowLeave = true; } };
}
const person = { id: 1, name: 'Jamie', hours: {mon:8,tue:8,wed:8,thu:8,fri:8,sat:0,sun:0}, allocations:[{department:'Cutting',percent:60},{department:'Kitting',percent:40}], revision:1, archived:false };
const data = () => ({ people: [person], departments: ['Cutting', 'Kitting'] });

test('People drops late roster responses after logout', async () => {
  let resolve;
  const app = setup(() => new Promise(done => { resolve = done; }));
  const pending = app.ui.refresh();
  app.ui.clear(); resolve(data()); await pending;
  assert.equal(app.root.innerHTML, '');
});

test('People retains drafts on conflicts and protects unsaved navigation', async () => {
  const app = setup(async (url, options) => {
    if (!options) return data();
    const error = new Error('Changed by another user'); error.status = 409; throw error;
  });
  await app.ui.refresh();
  await app.click({ edit: '1' });
  app.events.input({target:{name:'person-name',value:'Jamie edited',dataset:{}}});
  assert.equal(app.ui.canLeave(), false);
  await app.events.submit({preventDefault(){},target:{id:'people-form'}});
  assert.match(app.root.innerHTML, /Jamie edited/);
  assert.match(app.root.innerHTML, /Changed by another user/);
  assert.match(app.root.innerHTML, /Refresh saved record/);
  app.allowLeave(); assert.equal(app.ui.canLeave(), true);
});

test('People defaults to 100%, preserves percentages on add and resets the sole remaining department', async () => {
  const app = setup(async () => data());
  await app.ui.refresh(); await app.click({ action:'add' });
  assert.match(app.root.innerHTML, /value="100" readonly/);
  await app.click({ action:'add-department' });
  assert.match(app.root.innerHTML, /data-percent="0"[^>]*value="100"/);
  assert.match(app.root.innerHTML, /data-percent="1"[^>]*value=""/);
  app.events.input({target:{dataset:{percent:'0'},value:'60'}});
  await app.click({ remove:'1' });
  assert.match(app.root.innerHTML, /value="100" readonly/);
});

test('People drops late successful saves after logout', async () => {
  let resolve;
  const app = setup((url, options) => options ? new Promise(done => { resolve = done; }) : Promise.resolve(data()));
  await app.ui.refresh(); await app.click({edit:'1'});
  const pending = app.events.submit({preventDefault(){},target:{id:'people-form'}});
  app.ui.clear(); resolve(person); await pending;
  assert.equal(app.root.innerHTML, '');
});
