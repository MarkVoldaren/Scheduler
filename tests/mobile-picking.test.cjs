const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../scheduler-core');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
function context() {
  const ctx = vm.createContext({ ...core, Date, Map, Set, URLSearchParams });
  vm.runInContext([...source.matchAll(/(?:async )?function \w+\([^]*?\n\}/g)].map(m => m[0]).join('\n'), ctx);
  return ctx;
}
function setup(ctx) {
  const row = (shelf, date, part, acceleration = '') => ({ ...ctx.normalizeShippingRow({ 'Ship Date': date, 'Part #': part, 'SO / TO': 'SO', 'Cust.': 'Group : Division', 'Qty Needed': '10', 'Qty Committed': '2', 'Shelf #': shelf, 'Acceleration Date': acceleration }, 0), pickKey: part });
  return { mobilePicking: { active: true, from: '2026-10-20', to: '2026-10-22', shelf: null }, filters: { selectedPickListCustomer: 'Other', pickListSearch: 'exclude everything' },
    pickProgress: { A: { quantity: 3 } }, shippingRows: [row('10', '10/20/2026', 'A'), row('2', '10/22/2026', 'B'), row('', '10/21/2026', 'C'), row('1', '10/23/2026', 'D'), row('2', '10/29/2026', 'E', '10/20/2026')] };
}
test('mobile model uses inclusive effective dates, all customers, natural shelves and no-shelf last', () => {
  const ctx = context(), state = setup(ctx);
  let model = ctx.getMobilePickingModel(state);
  assert.equal(JSON.stringify(model.shelves), JSON.stringify(['2', '10', '']));
  assert.equal(model.shelf, '2'); assert.equal(model.index, 0);
  assert.equal(model.rows.map(row => row.partNumber).join(','), 'E,B');
  state.mobilePicking.shelf = '10';
  model = ctx.getMobilePickingModel(state);
  assert.equal(model.rows[0].pulledQuantity, 3);
  state.mobilePicking.from = '2026-10-21';
  assert.equal(ctx.getMobilePickingModel(state).shelf, '2');
  state.mobilePicking.shelf = '';
  assert.equal(ctx.getMobilePickingModel(state).shelf, '');
  state.mobilePicking.to = '2026-10-19';
  model = ctx.getMobilePickingModel(state);
  assert.equal(model.invalidRange, true); assert.equal(model.shelves.length, 0);
  state.mobilePicking.from = ''; state.mobilePicking.to = '';
  assert.equal(ctx.getMobilePickingModel(state).shelves.length, 4);
  assert.equal(state.filters.selectedPickListCustomer, 'Other');
});
test('mobile markup has seven fields, shared picking controls, navigation limits and empty state', () => {
  const ctx = context(); ctx.state = setup(ctx);
  ctx.refs = { pickListRoot: { innerHTML: '' } };
  ctx.state.activeCsvMeta = { pickList: {} };
  ctx.renderMobilePicking();
  let markup = ctx.refs.pickListRoot.innerHTML;
  assert.match(markup, /data-mobile-action="previous" disabled/);
  assert.match(markup, /<dt>Customer Group<\/dt><dd>Group<\/dd>/);
  assert.equal((markup.match(/<dt>/g) || []).length, 14);
  ctx.state.mobilePicking.shelf = '10'; ctx.renderMobilePicking();
  assert.match(ctx.refs.pickListRoot.innerHTML, /class="picked-quantity"/);
  ctx.state.mobilePicking.shelf = ''; ctx.renderMobilePicking();
  assert.match(ctx.refs.pickListRoot.innerHTML, /data-mobile-action="next" disabled/);
  ctx.state.shippingRows = []; ctx.renderMobilePicking();
  assert.match(ctx.refs.pickListRoot.innerHTML, /No items in this date range/);
});

test('bookmark route restores dates through sign-in and return leaves desktop filters intact', () => {
  const ctx = context(); ctx.state = setup(ctx);
  ctx.state.mobilePicking.active = false;
  ctx.window = { location: { hash: '#mobile-picking?from=2026-10-20&to=2026-10-22' } };
  ctx.renderActiveSurface = () => {};
  ctx.applyMobilePickingRoute();
  assert.equal(ctx.state.currentView, 'pick-list');
  assert.equal(ctx.state.mobilePicking.active, true);
  assert.equal(ctx.state.mobilePicking.from, '2026-10-20');
  assert.equal(ctx.state.mobilePicking.to, '2026-10-22');
  ctx.window.location.hash = '#pick-list'; ctx.applyMobilePickingRoute();
  assert.equal(ctx.state.mobilePicking.active, false);
  assert.equal(ctx.state.filters.selectedPickListCustomer, 'Other');
});

test('missing work-center data does not replace the mobile view with the desktop list', () => {
  const ctx = context(); ctx.state = setup(ctx);
  let mobileRenders = 0;
  ctx.renderMobilePicking = () => { mobileRenders++; };
  ctx.createEmptyCard = ctx.createEmptyState = () => '';
  const refs = Object.fromEntries(['sourcePill', 'sequencerCenterSelect', 'sequencerTopStats', 'sequencersGrid', 'capacityGrid', 'kpiBoardRoot', 'departmentViewer'].map(key => [key, {}]));
  ctx.renderError(refs, 'No work-center CSV uploaded.');
  assert.equal(mobileRenders, 1);
});
