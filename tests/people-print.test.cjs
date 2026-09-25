const test = require('node:test');
const assert = require('node:assert/strict');
const { createReport, buildHtml, prepare } = require('../people-print');
const flows = ['Material Handling', 'Screen Printing', 'Digital Printing', 'Finishing Prep', 'Cutting', 'Finishing', 'Auxiliary'];
const person = (id, allocations, hours = 8, archived = false) => ({ id, name: `Person ${id}`, archived, hours: {mon:hours,tue:hours,wed:hours,thu:hours,fri:hours,sat:0,sun:0}, allocations });
const a = (department, percent) => ({department,percent});
test('weekly report sums allocations by flow without duplicating hours or people', () => {
  const roster = [person(1,[a('Shearcut',60),a('Kitting',40)]),person(2,[a('Ink',50),a('Kitting',50)]),person(3,[a('Shearcut',100)],8,true),person(4,[a('Ink',100)],0)];
  const report = createReport(roster, ['Shearcut','Kitting','Ink','Art'], {Shearcut:'Material Handling',Kitting:'Auxiliary',Ink:'Auxiliary',Art:'Auxiliary'}, flows, new Date('2026-09-25T12:00:00Z'));
  assert.equal(report.groups.length,7); assert.equal(report.count,3); assert.equal(report.hours,80);
  assert.equal(report.groups[0].hours,24); assert.equal(report.groups[0].people[0].units/1000000/40,.6);
  const auxiliary = report.groups[6]; assert.equal(auxiliary.hours,56); assert.equal(auxiliary.people.length,3);
  assert.equal(auxiliary.people.find(p=>p.id===2).units/1000000/40,1);
  assert.equal(auxiliary.departments.find(d=>d.name==='Art').hours,0);
  assert.match(report.week,/Sep 21, 2026 - Sep 27, 2026/);
});
test('report preserves missing assignments and honors configured flow mappings', () => {
  const report = createReport([person(1,[a('Old Department',100)])], [], {'Old Department':'Cutting'}, flows);
  assert.equal(report.groups[4].hours,40); assert.equal(report.unavailable,true);
  assert.equal(report.groups[4].departments[0].unavailable,true);
  const fallback = createReport([person(1,[a('Old Department',100)])], [], {}, flows);
  assert.equal(fallback.groups[6].hours,40);
});
test('report escapes names, excludes archives, preserves duplicate names and rounds only on display', () => {
  const roster = [person(1,[a('<Cut>',33.33),a('Ink',66.67)],7.11),person(2,[a('Ink',100)])];
  roster.forEach(p=>p.name='<script>alert(1)</script>');
  const report = createReport(roster,['<Cut>','Ink'],{'<Cut>':'Cutting',Ink:'Auxiliary'},flows);
  assert.equal(report.count,2); assert.equal(report.hours,75.55);
  assert.equal(report.groups[6].people.length,2);
  const html = buildHtml(report); assert.ok(!html.includes('<script>')); assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&lt;Cut&gt;')); assert.match(html,/40 weekly hours = 1.00 manning/);
  assert.match(html,/@page \{ size: letter landscape/);
});
test('empty report retains all flows and fit scales the complete content to one page', () => {
  const empty = createReport([],[],{},flows); assert.equal(empty.hours,0);
  assert.equal((buildHtml(empty).match(/No people assigned/g)||[]).length,7);
  const sheet={style:{},scrollHeight:1400,scrollWidth:980},frame={style:{}},status={};
  const scale=prepare({querySelector:selector=>selector==='.sheet'?sheet:selector==='.frame'?frame:status});
  assert.ok(scale<1); assert.ok(parseInt(frame.style.height)<=740);
  assert.match(status.textContent,/small text/); assert.match(sheet.style.transform,/scale/);
});
