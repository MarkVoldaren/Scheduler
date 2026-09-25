const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../scheduler-core.js');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');

function context() {
  const clock = { today: new Date(2026, 8, 25) };
  const ctx = vm.createContext({ ...core, Date, Set, Map });
  vm.runInContext([...source.matchAll(/(?:async )?function \w+\([^]*?\n\}/g)].map(match => match[0]).join('\n'), ctx);
  ctx.startOfToday = () => new Date(clock.today);
  return { ctx, clock };
}

function row(ctx, created, header = 'Date Created', accelerated = '') {
  return ctx.normalizeShippingRow({ 'Ship Date': '9/28/2026', 'Part #': 'PART-1', 'Cust.': 'Customer', 'Qty Needed': '10', 'Qty Committed': '5', [header]: created, 'Acceleration Date': accelerated }, 0);
}

function view(ctx, rows) {
  return ctx.getPickListViewModel({ shippingRows: rows, jobs: [], filters: {}, shippingSourceName: 'test.csv' });
}

function rows(model) {
  return Object.values(model.groupedRows).flatMap(group => group.rows);
}

test('creation timestamps use their calendar date and tolerate header case', () => {
  const { ctx } = context();
  for (const header of ['Date Created', 'DATE CREATED', ' date   created ']) {
    for (const value of ['9/25/2026', '9/25/2026 12:00 am', '9/25/2026 11:59 PM']) {
      assert.equal(rows(view(ctx, [row(ctx, value, header)]))[0].isEnteredToday, true);
    }
  }
  for (const value of ['9/24/2026 11:59 pm', '9/26/2026 12:00 am', '', undefined, 'bad date', '2/30/2026', '13/25/2026', '9/25/2026 13:00 pm', '9/25/2026 3:60 pm']) {
    assert.equal(rows(view(ctx, [row(ctx, value)]))[0].isEnteredToday, false, String(value));
  }
});

test('CSV preamble, optional column, and day rollover work without reupload', () => {
  const { ctx, clock } = context();
  const csv = 'Pick List Feeder - Jay\n\nShip Date,Part #,Cust.,Qty Needed,Qty Committed,DATE CREATED\n9/28/2026,PART-1,Customer,10,5,9/25/2026 3:06 pm';
  const parsed = ctx.parseShippingScheduleCsv(csv);
  assert.equal(rows(view(ctx, parsed))[0].isEnteredToday, true);
  clock.today = new Date(2026, 8, 26);
  assert.equal(rows(view(ctx, parsed))[0].isEnteredToday, false);
  const legacy = ctx.parseShippingScheduleCsv('Ship Date,Part #,Cust.,Qty Needed,Qty Committed\n9/28/2026,PART-1,Customer,10,5');
  assert.equal(rows(view(ctx, legacy))[0].isEnteredToday, false);
});

test('screen and print preserve accelerated details alongside Entered Today', () => {
  const { ctx } = context();
  const current = rows(view(ctx, [row(ctx, '9/25/2026 3:06 pm', 'Date Created', '9/26/2026')]))[0];
  for (const html of [ctx.createPickListRow(current), ctx.createPickListPrintRow(current)]) {
    assert.match(html, /entered-today/);
    assert.match(html, /Entered Today/);
    assert.match(html, /Accelerated/);
    assert.match(html, /Original:/);
  }
  const old = rows(view(ctx, [row(ctx, '9/24/2026')]))[0];
  assert.doesNotMatch(ctx.createPickListRow(old), /Entered Today|entered-today/);
  assert.doesNotMatch(ctx.createPickListPrintRow(old), /Entered Today|entered-today/);
});
