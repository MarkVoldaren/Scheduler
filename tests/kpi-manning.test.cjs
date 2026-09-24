const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../scheduler-core.js');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const today = new Date(2026, 8, 21); // Monday

function context() {
  const ctx = vm.createContext({ ...core, Date, Set, Map, startOfToday: () => new Date(today) });
  // Load the actual app helpers without booting the DOM or server connection.
  const end = source.indexOf('\nconst ', source.indexOf('const DEFAULT_FLOW_LOCATIONS') + 10);
  vm.runInContext('const DEFAULT_DAILY_CAPACITY = 8;\n' + source.slice(source.indexOf('const DEFAULT_MACHINE_CAPACITY_PER_DAY'), end), ctx);
  vm.runInContext([...source.matchAll(/(?:async )?function \w+\([^]*?\n\}/g)].map(match => match[0]).join('\n'), ctx);
  return ctx;
}

function state(jobs = []) {
  return {
    workCenters: ['Zeta', 'Alpha', 'Idle'], jobs,
    filters: { kpiHorizonDays: 7, kpiCurrentOnly: false, kpiSortBy: 'department-az', selectedKpiDepartmentGroup: 'ALL' },
    flowLocations: { Alpha: 'Cutting', Zeta: 'Cutting', Idle: 'Finishing' },
    machineCapacities: {}, manHourCapacities: { Alpha: 8, Zeta: 4, Idle: 16 },
    manHoursByDay: { Alpha: { sat: 0, sun: 0 }, Zeta: { sat: 0, sun: 0 }, Idle: { sat: 0, sun: 0 } }, temporaryAdditionalManning: { Alpha: 0.5, Idle: 2 },
    capacityModes: {}, capacityHorizonShifts: {}, manningMultipliers: {},
  };
}
function job(offset, hours, phase = 'current', department = 'Alpha') {
  return { key: `${offset}-${phase}-${hours}`, shipByDate: offset === null ? null : core.addDays(today, offset), operations: [{ workCenter: department, phase, hoursRemaining: hours }] };
}
function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 0.0001, `${actual} != ${expected}`); }

test('needed manning excludes overdue demand but keeps today and undated demand', () => {
  const c = context();
  for (const [jobs, normal, excluded] of [
    [[job(-1, 80)], 10, 0],
    [[job(-1, 80), job(0, 8), job(4, 32)], 11, 1],
    [[job(0, 16)], 2, 2],
    [[job(null, 40)], 1, 1],
    [[job(0, 16, 'complete')], 0, 0],
  ]) {
    const s = state(jobs);
    near(c.getNeededManningForDepartment(s, 'Alpha', 7, false), normal);
    near(c.getNeededManningForDepartment(s, 'Alpha', 7, false, false), normal);
    near(c.getNeededManningForDepartment(s, 'Alpha', 7, false, true), excluded);
  }
});

test('horizon, current-only, shifts, multipliers and weekends retain existing behavior', () => {
  const c = context();
  const s = state([job(0, 8), job(0, 8, 'upcoming'), job(7, 80)]);
  near(c.getNeededManningForDepartment(s, 'Alpha', 7, true, true), 1);
  near(c.getNeededManningForDepartment(s, 'Alpha', 7, false, true), 2);
  near(c.getNeededManningForDepartment(s, 'Alpha', 14, true, true), 88 / 48);
  s.capacityHorizonShifts.Alpha = 1;
  s.manningMultipliers.Alpha = 2;
  near(c.getNeededManningForDepartment(s, 'Alpha', 7, true, true), 88 / 80);
  s.jobs = [job(5, 80)];
  near(c.getNeededManningForDepartment(s, 'Alpha', 7, true, true), 1);
});

test('overview sums all staffing, includes idle departments and empty flows, and ignores group filter', () => {
  const c = context();
  const s = state([job(-1, 80), job(0, 8)]);
  const all = c.getKpiBoardViewModel(s);
  assert.equal(all.manningOverview.groups.length, 7);
  const cutting = all.manningOverview.groups.find(g => g.flowLocation === 'Cutting');
  assert.deepEqual(Array.from(cutting.departments, d => d.department), ['Alpha', 'Zeta']);
  near(all.manningOverview.totals.currentManning, 3.5);
  near(all.manningOverview.totals.temporaryManning, 2.5);
  near(all.manningOverview.totals.neededManning, 11);
  near(all.manningOverview.totals.neededManningWithoutPastDue, 1);
  s.filters.selectedKpiDepartmentGroup = 'Idle';
  const filtered = c.getKpiBoardViewModel(s);
  assert.equal(filtered.departments.length, 0);
  assert.deepEqual(filtered.manningOverview, all.manningOverview);
  for (const group of all.manningOverview.groups) {
    assert.ok(group.totals.neededManningWithoutPastDue <= group.totals.neededManning);
  }
  const markup = c.createManningOverviewCard(filtered);
  assert.match(markup, /No departments assigned/);
  assert.match(markup, /All Departments/);
  assert.match(markup, /data-manning-toggle aria-expanded="false"/);
  assert.equal(c.getKpiBoardViewModel(state()).summary, null);
  c.renderKpiControls = () => {};
  c.createFragment = markup => markup;
  const root = { replaceChildren(markup) { this.innerHTML = markup; } };
  c.renderKpiBoard({ kpiBoardRoot: root }, filtered);
  assert.match(root.innerHTML, /Manning Overview/);
  assert.match(root.innerHTML, /No department load found/);
  c.renderKpiBoard({ kpiBoardRoot: root }, c.getKpiBoardViewModel(state()));
  assert.doesNotMatch(root.innerHTML, /Manning Overview/);
});

test('hover, keyboard, touch pinning and dismissal keep panel and ARIA state in sync', () => {
  const c = context();
  const listeners = {};
  const documentListeners = {};
  function group() {
    const panel = { hidden: true };
    const toggle = { expanded: 'false', setAttribute(name, value) { this.expanded = value; } };
    const item = {
      dataset: {},
      querySelector: selector => selector === '[data-manning-toggle]' ? toggle : panel,
      contains: target => target === item || target === toggle || target === panel,
    };
    toggle.closest = selector => selector === '[data-manning-toggle]' ? toggle : item;
    panel.closest = () => item;
    return { item, toggle, panel };
  }
  const a = group(), b = group();
  c.document = { activeElement: null, addEventListener(name, handler) { documentListeners[name] = handler; } };
  c.bindManningOverviewInteractions({
    addEventListener(name, handler) { listeners[name] = handler; },
    querySelectorAll: () => [a.item, b.item],
  });
  const event = { target: a.toggle, relatedTarget: null, pointerType: 'mouse' };
  const check = (g, open) => {
    assert.equal(g.panel.hidden, !open);
    assert.equal(g.toggle.expanded, String(open));
  };
  listeners.pointerover(event); check(a, true);
  listeners.pointerout({ ...event, relatedTarget: a.panel }); check(a, true);
  listeners.pointerout(event); check(a, false);
  listeners.pointerover({ ...event, pointerType: 'touch' }); check(a, false);
  listeners.focusin(event); check(a, true);
  listeners.click(event); // First touch/click pins the focus-opened panel.
  listeners.pointerout(event); check(a, true);
  listeners.click(event); check(a, false);
  listeners.focusin(event);
  listeners.focusout(event); check(a, false);
  listeners.pointerover(event);
  listeners.pointerover({ ...event, target: b.toggle }); check(a, false); check(b, true);
  documentListeners.keydown({ key: 'Escape' }); check(b, false);
  listeners.click(event);
  documentListeners.click({ target: { closest: () => null } }); check(a, false);
});
