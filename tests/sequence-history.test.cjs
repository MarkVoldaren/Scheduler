const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../scheduler-core');
const { projectView } = require('../projects-domain');
const row = (seq, completed, remaining, hours, extra = {}) => ({'WO #':'12110524128WO','Combo #':'','Operation Sequence':String(seq),'Operation Name':`Operation ${seq}`,'Manufacturing Work Center':'Print','WO Quantity':'4000','Completed Quantity':completed,'Remaining Quantity':remaining,'Hours Remaining':hours,'Qty Completed':'582',Status:'In Process',...extra});
const fixture = () => [row(1,'5568','-1568','-.7'),row(2,'4000','0','.3'),row(3,'4000','0','0'),row(4,'8000','-4000','-4.9'),row(5,'5600','-1600','-2.5'),row(6,'582','3418','2.4')];
const source = fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
function ui() { const ctx = vm.createContext({...core}); vm.runInContext([...source.matchAll(/(?:async )?function \w+\([^]*?\n\}/g)].map(m=>m[0]).join('\n'),ctx); return ctx; }
test('overproduction completes ops 1-5, leaves op 6 current and 2.4 hours', () => {
 const job=core.buildJobs(fixture())[0];
 assert.deepEqual(job.operations.map(o=>o.phase),['complete','complete','complete','complete','complete','current']);
 assert.equal(job.currentSequence,6); assert.equal(job.totalHoursRemaining,2.4);
 assert.ok(job.operations.slice(0,5).every(o=>o.hoursRemaining===0 && o.progressRatio===1));
 const view=projectView([{id:1,type:'wo',identifier:'12110524128WO',rows:fixture(),inferredComplete:false}]);
 assert.equal(view.summary.remainingHours,2.4); assert.equal(view.summary.remainingOperations,1);
 const ctx=ui(); const html=ctx.renderMiniSequenceTrack(job);
 assert.match(html,/Operation 1 \| Completed/); assert.doesNotMatch(html,/Missing Op|Completed Op|Hours remaining/);
 assert.match(ctx.createWorkOrderOperationRow(job.operations[0],false),/Completed/);
 const browser=vm.createContext({}); vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../scheduler-core.js'),'utf8'),browser);
 assert.equal(JSON.stringify(browser.SchedulerCore.buildJobs(fixture())),JSON.stringify(core.buildJobs(fixture())));
});
test('explicit zero, missing quantities, derivation, and negative hours are handled conservatively',()=>{
 const op = extra => core.buildJobs([row(1,'0','0','-3',extra)])[0].operations[0];
 assert.notEqual(op({}).phase,'complete'); assert.equal(op({}).progressRatio,0); assert.equal(op({}).hoursRemaining,0);
 assert.equal(op({'Completed Quantity':'','Remaining Quantity':'-1'}).phase,'complete');
 assert.notEqual(op({'Completed Quantity':'','Remaining Quantity':'','Qty Completed':'4000'}).phase,'complete');
 assert.equal(op({'Completed Quantity':'','Remaining Quantity':''}).progressRatio,0);
 assert.equal(op({'WO Quantity':'','Completed Quantity':'50','Remaining Quantity':'-10'}).phase,'complete');
 assert.notEqual(op({'WO Quantity':'','Completed Quantity':'','Remaining Quantity':''}).phase,'complete');
});
test('combo overproduction cannot hide unfinished rows or subtract their hours',()=>{
 const rows=[row(1,'8000','-4000','-5',{'Combo #':'C'}),row(1,'1000','3000','3',{'WO #':'SECOND','Combo #':'C'})];
 const job=core.buildJobs(rows)[0], op=job.operations[0];
 assert.equal(op.phase,'current'); assert.equal(op.progressRatio,0.625); assert.equal(op.hoursRemaining,3);
 rows.push(row(1,'0','4000','2',{'WO #':'THIRD','Combo #':'C','Operation Name':'Parallel'}));
 assert.equal(core.buildJobs(rows)[0].currentOperations.length,2);
});
test('unknown sequence slots retain placeholders without looking up closed rows',()=>{
 const job=core.buildJobs([row(2,'0','4000','2'),row(4,'0','4000','2')])[0];
 const html=ui().renderMiniSequenceTrack(job); assert.match(html,/Completed Op/); assert.match(html,/Missing Op/);
 assert.doesNotMatch(source,/getSequenceDisplayOperations|isClosedSource/);
});