const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createProjectsStore, chicagoDate } = require('../projects-store');
const { projectView } = require('../projects-domain');
const row = (wo, combo = '', extra = {}) => ({ 'WO #': wo, 'Combo #': combo, Part: 'P', Customer: 'Customer', Description: 'Part', 'Operation Sequence': '1', 'Operation Name': 'Print', 'Manufacturing Work Center': 'Screen', 'Hours Remaining': '5', 'WO Quantity': '100', Status: 'In Process', 'Completed Quantity': '20', 'Remaining Quantity': '80', ...extra });

test('trend counts normalized open operations, including zero-hour open work', () => {
  const rows = [row('W1', 'C'), row('W2', 'C'), row('W1', 'C', { 'Operation Sequence': '2', 'Hours Remaining': '0' })];
  const members = [{id:1,type:'combo',identifier:'C',rows,inferredComplete:false}, {id:2,type:'wo',identifier:'W1',rows:rows.filter(r=>r['WO #']==='W1'),inferredComplete:false}];
  assert.equal(projectView(members).summary.remainingOperations, 2);
  assert.equal(projectView(members.map(m=>({...m,inferredComplete:true}))).summary.remainingOperations, 0);
  assert.equal(projectView([]).summary.remainingOperations, 0);
});

test('Central dates respect midnight and both daylight saving transitions', () => {
  assert.equal(chicagoDate('2026-09-15T04:59:59Z'), '2026-09-14');
  assert.equal(chicagoDate('2026-09-15T05:00:00Z'), '2026-09-15');
  assert.equal(chicagoDate('2026-03-08T07:59:59Z'), '2026-03-08');
  assert.equal(chicagoDate('2026-03-08T08:00:00Z'), '2026-03-08');
  assert.equal(chicagoDate('2026-11-01T06:30:00Z'), '2026-11-01');
  assert.equal(chicagoDate('2026-11-01T07:30:00Z'), '2026-11-01');
});

test('daily readings preserve baselines, scope history, archived work and transactional rollback', () => {
  const db = new Database(':memory:');
  let now = '2026-09-14T12:00:00Z';
  let source = { rows: [row('W1','C'),row('W2')], metadata: { uploadedAt: now } };
  const make = () => createProjectsStore(db, () => source, () => new Date(now));
  let store = make();
  const upload = rows => db.transaction(() => { source = { rows, metadata: { uploadedAt: now } }; store.reconcile(rows, now); store.captureDaily(now); })();
  try {
    let d = store.create({name:'Trend'}); const id = d.project.id;
    assert.equal(d.trend.readings.length,0);
    store.captureDaily(now); // First upload occurred before scope existed.
    d = store.add(id,{revision:d.project.revision,members:[{type:'combo',identifier:'C'},{type:'wo',identifier:'W2'}]});
    assert.equal(d.trend.readings[0].type,'baseline');
    assert.equal(d.trend.readings[0].remainingOperations,2);
    upload([row('W1','C'),row('W2','C'),row('W3','C')]);
    assert.equal(store.detail(id).trend.readings.length,1);
    assert.equal(store.detail(id).trend.readings[0].remainingOperations,2);
    assert.match(store.detail(id).trend.events.at(-1).description,/Added WOs: W2, W3/);
    now = '2026-09-15T12:00:00Z';
    upload([row('W1','C'),row('W2','C'),row('W3','C')]);
    assert.equal(store.detail(id).trend.readings.at(-1).remainingOperations,1);
    store.captureDaily(now); assert.equal(store.detail(id).trend.readings.length,2);
    store = make(); store.initializeTrend();
    assert.equal(store.detail(id).trend.readings.length,2);
    d = store.detail(id); store.archive(id,{revision:d.project.revision,archived:true});
    now = '2026-09-16T12:00:00Z'; upload([]);
    assert.equal(store.detail(id).trend.readings.at(-1).remainingOperations,0);
    now = '2026-09-17T12:00:00Z';
    assert.throws(() => db.transaction(() => { store.reconcile([row('W1','C')],now); store.captureDaily(now); throw new Error('rollback'); })());
    assert.equal(db.prepare('SELECT COUNT(*) n FROM project_capture_days WHERE date = ?').get('2026-09-17').n,0);
    assert.equal(store.detail(id).trend.readings.length,3);
    upload([row('W1','C')]);
    assert.equal(store.detail(id).trend.readings.at(-1).remainingOperations,1);
    const before = store.detail(id).trend;
    source = {rows:null,metadata:null}; store.initializeTrend();
    assert.deepEqual(store.detail(id).trend,before);
    d = store.detail(id); d = store.archive(id,{revision:d.project.revision,archived:false});
    d = store.remove(id,d.members[0].id,{revision:d.project.revision});
    assert.match(d.trend.events.at(-1).description,/Removed combo C/);
    assert.equal(d.trend.readings.length,4);
  } finally { db.close(); }
});

test('existing projects initialize once from valid data without backdating history', () => {
  const db = new Database(':memory:');
  const now = '2026-09-14T12:00:00Z';
  let source = {rows:[row('W1')],metadata:{uploadedAt:'2026-09-10T12:00:00Z'}};
  try {
    const store = createProjectsStore(db,()=>source,()=>new Date(now));
    let d = store.create({name:'Existing'});
    d = store.add(d.project.id,{revision:d.project.revision,members:[{type:'wo',identifier:'W1'}]});
    db.prepare('DELETE FROM project_readings').run(); // Simulate pre-feature membership.
    source = {...source,rows:null}; store.initializeTrend(); assert.equal(store.detail(d.project.id).trend.readings.length,0);
    source.rows=[row('W1')]; store.initializeTrend(); store.initializeTrend();
    const readings=store.detail(d.project.id).trend.readings;
    assert.equal(readings.length,1); assert.equal(readings[0].date,'2026-09-14');
    assert.equal(readings[0].sourceUploadedAt,'2026-09-10T12:00:00Z');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM project_capture_days').get().n,0);
  } finally { db.close(); }
});
