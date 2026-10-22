const {test} = require('node:test');
const assert = require('node:assert/strict');
const H = require('../hours-domain');
const header = 'Manufacturing Work Center,Date,Earned Hours (Sum)\n';
const detailHeader = 'Date,Created From,Operation Sequence,Manufacturing Work Center,Completed Quantity,Labor Setup Time (Min),Labor Run Time (Min),Earned Hours\n';
const op = (wo, date, quantity = '100', remaining = '9', center = 'Die Cut') => ({'WO #':wo, 'Operation Sequence':'2', 'Manufacturing Work Center':center, 'Ship By':date, 'WO Quantity':quantity, 'Hours Remaining':remaining});
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);
test('earned parser validates dates, headers and numbers while retaining duplicate totals', () => {
  const rows = H.readEarned('\uFEFF'+header+' Die Cut ,10/1/2026,1.25\nDie Cut,10/1/2026,2.75\n\n');
  assert.equal(rows.length,2);
  assert.equal(H.series([],rows,()=>true,'month','2026-10-22').points.at(-1).earned,4);
  for(const row of ['Art,2/30/2026,1','Art,10/1/2026,bad',',10/1/2026,2']) assert.throws(()=>H.readEarned(header+row),/row 2/);
  assert.throws(()=>H.readEarned('Date,Hours\n'),/Missing required column/);
  assert.equal(H.dateKey('2/29/2024'),'2024-02-29');
  assert.equal(H.dateKey('2/29/2026'),null);
});
test('raw booked includes completed operations and month window crosses years into future', () => {
  const booked=H.booked([{'Manufacturing Work Center':'A','Ship By':'12/1/2025','Hours Remaining':'1.25',Status:'Closed'},{'Manufacturing Work Center':'A','Ship By':'3/1/2026','Hours Remaining':'2.5'}]);
  const result=H.series(booked,[],()=>true,'month','2026-01-22');
  assert.deepEqual(result.points.map(p=>p.date),['2025-10','2025-11','2025-12','2026-01','2026-02','2026-03']);
  assert.equal(result.points[0].booked,null);
  assert.equal(result.points[2].booked,1.25);
  assert.equal(result.points[3].booked,0);
  assert.equal(result.points[5].booked,2.5);
});
test('daily coverage zeroes, gaps, future earned and Art rollup exclusion', () => {
  const b=[{center:'A',date:'2026-10-01',hours:2},{center:'B',date:'2026-10-03',hours:3},{center:'Art',date:'2026-10-01',hours:9}];
  const e=[{center:'A',date:'2026-10-01',hours:1},{center:'B',date:'2026-10-04',hours:4},{center:'Art',date:'2026-10-01',hours:8}];
  const accept=c=>H.normalize(c)!=='art';
  const all=H.series(b,e,accept,'day','2026-10-03').points;
  assert.equal(all.length,4); assert.equal(all[1].booked,0); assert.equal(all[3].booked,null); assert.equal(all[3].earned,null);
  const sum=points=>points.reduce((s,p)=>s+(p.booked||0),0);
  assert.equal(sum(all),sum(H.series(b,e,c=>c==='A','day','2026-10-03').points)+sum(H.series(b,e,c=>c==='B','day','2026-10-03').points));
  assert.ok(H.series(b,e,c=>c==='Art','day','2026-10-03',true).points.every(p=>p.earned===null));
});

test('negative hours remaining are excluded from booked totals and date coverage', () => {
  const rows = [
    ['A','10/1/2026','10'], ['A','10/1/2026','-4'],
    ['B','10/1/2026','5'], ['B','12/1/2026','-9'], ['A','10/2/2026','0'],
  ].map(([center,date,hours]) => ({'Manufacturing Work Center':center,'Ship By':date,'Hours Remaining':hours}));
  const booked = H.booked(rows);
  assert.equal(booked.length,3);
  const plant = H.series(booked,[],()=>true,'month','2026-10-22');
  assert.equal(plant.points.at(-1).date,'2026-10');
  assert.equal(plant.points.at(-1).booked,15);
  assert.deepEqual(plant.bookedCoverage,['2026-10-01','2026-10-02']);
  assert.equal(H.series(booked,[],c=>c==='A','day','2026-10-22').points[0].booked,10);
});

test('detailed parsing preserves blanks and rejects malformed numbers, keys and missing columns', () => {
  const rows = H.readEarned(detailHeader+'10/1/2026,Work Order #WO1,02, die cut ,10,,20,\n');
  assert.equal(rows.format,'detail');
  assert.equal(rows[0].hours,null); assert.equal(rows[0].setupMinutes,null);
  assert.equal(rows[0].operationKey,H.operationKey('wo1',2,'Die Cut'));
  const withEmptyOperation = H.readEarned(detailHeader+'10/1/2026,WO1,,,,,,\n10/1/2026,WO2,2,Die Cut,10,0,20,1\n');
  assert.equal(withEmptyOperation.length,1); assert.equal(withEmptyOperation.skippedNonOperations,1);
  assert.throws(()=>H.readEarned(detailHeader+'10/1/2026,WO1,2,Die Cut,ten,12,20,1'),/row 2.*Completed Quantity/);
  assert.throws(()=>H.readEarned(detailHeader+'10/1/2026,,2,Die Cut,10,12,20,1'),/work order/);
  assert.throws(()=>H.readEarned('Date,Manufacturing Work Center,Earned Hours\n'),/Created From/);
});

test('weighted run rate uses all completions, largest setup once and authoritative WO quantity', () => {
  const earned = H.readEarned(detailHeader+
    '10/1/2026,Work Order #WO1,2,Die Cut,10,12,20,0.5\n'+
    '10/25/2026,Work Order #wo1,02,DIE CUT,30,18,90,1.8\n');
  const raw = op(' WO1 ','10/1/2026');
  const booked = H.booked([raw,{...raw}],earned,'2026-10-22');
  assert.equal(booked.length,1);
  assert.equal(booked[0].method,'calculated');
  near(booked[0].hours,(18+100*110/40)/60);
  const point = H.series(booked,earned,()=>true,'month','2026-10-22');
  near(point.diagnostics.calculatedHours,booked[0].hours);
  assert.equal(point.points.at(-1).earned,0.5); // Future completion informs rate, not earned actuals.
});

test('historical fallback, today cutoff, explicit zeros, future remaining and invalid rate counts', () => {
  const earned = H.readEarned(detailHeader+
    '10/1/2026,A,2,Die Cut,10,,20,\n'+ // no setup: fallback
    '10/1/2026,B,2,Die Cut,0,12,20,1\n'+ // zero qty: unusable
    '10/1/2026,C,2,Die Cut,-2,12,20,1\n'+
    '10/1/2026,D,2,Die Cut,10,12,,1\n'+
    '10/1/2026,E,2,Die Cut,10,12,-1,1\n'+
    '10/1/2026,F,2,Die Cut,10,0,0,0\n'+
    '10/1/2026,G,2,Die Cut,10,12,20,1\n');
  const raw = ['A','B','C','D','E','F','G','UNMATCHED'].map(wo=>op(wo,wo==='G'?'10/23/2026':'10/22/2026'));
  raw.push(op('NEG','10/1/2026','100','-3'),op('BADQ','10/1/2026','','2'));
  const booked = H.booked(raw,earned,'2026-10-22');
  assert.equal(booked.length,9);
  assert.equal(booked.find(r=>r.method==='calculated').hours,0);
  assert.equal(booked.find(r=>r.method==='future').hours,9);
  const stats = H.series(booked,earned,()=>true,'month','2026-10-22').diagnostics;
  assert.equal(stats.unusableRateInputs,4); assert.equal(stats.fallbackHours,56);
  assert.equal(stats.futureHours,9); assert.equal(stats.calculatedHours,0);
  assert.equal(H.today(new Date('2026-10-23T04:59:59Z')),'2026-10-22');
  assert.equal(H.today(new Date('2026-10-23T05:00:00Z')),'2026-10-23');
});

test('blank-only earned buckets are gaps, mixed buckets flagged, absent days zero and future gaps', () => {
  const earned = H.readEarned(detailHeader+
    '10/1/2026,A,2,Die Cut,10,12,20,\n'+
    '10/3/2026,B,2,Die Cut,10,12,20,1.25\n'+
    '10/3/2026,C,2,Die Cut,10,12,20,\n'+
    '10/5/2026,D,2,Die Cut,10,12,20,2\n');
  const daily = H.series([],earned,()=>true,'day','2026-10-04');
  assert.deepEqual(daily.points.map(p=>p.earned),[null,0,1.25,0,null]);
  assert.deepEqual(daily.points.map(p=>p.missingEarned),[1,0,1,0,0]);
  const monthly = H.series([],earned,()=>true,'month','2026-10-04');
  assert.equal(monthly.points.at(-1).earned,1.25); assert.equal(monthly.diagnostics.missingEarned,2);
  const onlyBlank = H.readEarned(header+'Die Cut,10/1/2026,\n');
  assert.equal(H.series([],onlyBlank,()=>true,'month','2026-10-22').points.at(-1).earned,null);
});

test('calculated and fallback totals reconcile across departments with Art excluded', () => {
  const earned = H.readEarned(detailHeader+'10/1/2026,A,2,Die Cut,10,12,20,1\n10/1/2026,B,2,Finishing,20,6,30,2\n10/1/2026,C,2,Art,10,12,20,3\n');
  const raw = [op('A','10/1/2026'),op('B','10/1/2026','100','4','Finishing'),op('C','10/1/2026','100','5','Art'),op('D','10/1/2026','100','6','Die Cut')];
  const booked = H.booked(raw,earned,'2026-10-22');
  const get = accepts=>H.series(booked,earned,accepts,'month','2026-10-22');
  const a=get(c=>c==='Die Cut'), b=get(c=>c==='Finishing'), plant=get(c=>H.normalize(c)!=='art');
  near(plant.points.at(-1).booked,a.points.at(-1).booked+b.points.at(-1).booked);
  assert.equal(plant.points.at(-1).earned,3);
  const summary = H.readEarned(header+'Die Cut,10/1/2026,4\n');
  assert.equal(get(()=>true).diagnostics.hasDetail,true);
  assert.equal(H.series(H.booked(raw,summary,'2026-10-22'),summary,()=>true,'month','2026-10-22').diagnostics.hasDetail,false);
  assert.equal(H.booked(raw,summary,'2026-10-22')[0].method,'fallback');
});
