const {test}=require('node:test');
const assert=require('node:assert/strict');
const {collect}=require('../pick-project');
test('picklist project members use displayed matches, whole combos and unique keys',()=>{
 const row=(type,wo,combo)=>({match:{matchType:type,matchedWo:wo,job:{combo}}});
 const result=collect({groupedRows:{pastDue:{rows:[row('linked','1','C'),row('suggested','2','C')]},today:{rows:[row('linked','3',''),row('suggested','3','')]},upcoming:{rows:[{match:{matchType:'linked-not-found'}},{match:{matchType:'none'}}]}}});
 assert.deepEqual(result,{members:[{type:'combo',identifier:'C'},{type:'wo',identifier:'3'}],skipped:2});
});
const fs=require('node:fs');
const vm=require('node:vm');
const core=require('../scheduler-core');
test('project scope follows every picklist filter',()=>{
 const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
 const ctx=vm.createContext({...core,Date,Map,Set});
 vm.runInContext([...source.matchAll(/(?:async )?function \w+\([^]*?\n\}/g)].map(m=>m[0]).join('\n'),ctx);
 const row={customerGroup:'ACME',customer:'ACME : Division',qtyNeeded:10,qtyCommitted:10,isAccelerated:true,shipDate:new Date(2026,10,5),partNumber:'PART',soTo:'SO',poNumber:'PO',shelf:'1',assocPrintWo:'WO1'};
 const defaults=['ACME','ACME : Division','fully',true,'2026-11-01','2026-11-10','part'];
 assert.equal(ctx.matchesPickListFilters(row,...defaults),true);
 for(const [index,value] of [[0,'Other'],[1,'Other'],[2,'not-fully'],[4,'2026-11-06'],[5,'2026-11-04'],[6,'missing']]){
  const filters=[...defaults];filters[index]=value;assert.equal(ctx.matchesPickListFilters(row,...filters),false,`filter ${index}`);
 }
 assert.equal(ctx.matchesPickListFilters({...row,isAccelerated:false},...defaults),false);
});
test('bulk project writes are atomic and enforce 500-member limit',()=>{
 const Database=require('better-sqlite3');const {createProjectsStore}=require('../projects-store');const db=new Database(':memory:');
 try{
 const rows=Array.from({length:501},(_,i)=>({'WO #':String(i+1),'Combo #':'',Customer:'ACME',Part:'P','Operation Sequence':'1','Operation Name':'Print','Manufacturing Work Center':'Screen','Hours Remaining':'1','WO Quantity':'1',Status:'In Process','Remaining Quantity':'1'}));
 const store=createProjectsStore(db,()=>({rows,metadata:{uploadedAt:'2026-11-05T12:00:00Z'}}));
 const project=store.create({name:'Bulk'}).project;
 const members=rows.map(r=>({type:'wo',identifier:r['WO #']}));
 assert.throws(()=>store.add(project.id,{revision:project.revision,members}),/500/);
 assert.equal(store.detail(project.id).members.length,0);
 assert.throws(()=>store.add(project.id,{revision:project.revision,members:[members[0],{type:'wo',identifier:'missing'}]}),/available/);
 assert.equal(store.detail(project.id).members.length,0);
 const added=store.add(project.id,{revision:project.revision,members:members.slice(0,500)});
 assert.equal(added.members.length,500);
 assert.equal(store.add(project.id,{revision:added.project.revision,members:[members[0]]}).members.length,500);
 }finally{db.close()}
});
