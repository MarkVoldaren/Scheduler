const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../scheduler-core');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const row = (wo, sequence, status, extra = {}) => ({
  'WO #': wo, 'Combo #': 'C', 'Operation Sequence': String(sequence),
  'Operation Name': `Operation ${sequence}`, 'Manufacturing Work Center': 'Print',
  Status: status, 'Hours Remaining': '4', 'WO Quantity': '100',
  'Remaining Quantity': '100', ...extra,
});
function setup(rows) {
  const ctx = vm.createContext({ ...core, SchedulerCore: core, state: { rawRows: rows } });
  vm.runInContext([...source.matchAll(/(?:async )?function \w+\([^]*?\n\}/g)].map(m => m[0]).join('\n'), ctx);
  return ctx;
}

test('sequence display replaces leading completed and interior missing slots without changing job calculations', () => {
  const rows = [row('W', 1, 'Closed', { 'Operation Name': 'Art <proof>' }), row('W', 2, 'Released'),
    row('W', 3, ' closed ', { 'Operation Name': 'Die make ready', 'Hours Remaining': '1.5' }), row('W', 4, 'Released')];
  const job = core.buildJobs(rows)[0];
  const original = JSON.stringify(job);
  const ctx = setup(rows);
  const display = ctx.getSequenceDisplayOperations(job);
  assert.deepEqual(Array.from(display, op => op.sequence), [1, 2, 3, 4]);
  assert.equal(display[0].phase, 'complete');
  assert.equal(display[2].hoursRemaining, 1.5);
  const html = ctx.renderMiniSequenceTrack(job);
  assert.doesNotMatch(html, /Completed Op|Missing Op/);
  assert.match(html, /Art &lt;proof&gt;/);
  assert.match(html, /Die make ready \| Completed/);
  assert.doesNotMatch(html, /1.5 Hours|Hours remaining/);
  assert.match(ctx.createWorkOrderScheduleModal(job), /Closed/);
  assert.equal(JSON.stringify(job), original);
  assert.equal(job.totalHoursRemaining, 8);
  assert.equal(job.operations.length, 2);
});

test('unmatched gaps remain and unrelated, already present, and trailing closed sequences are excluded', () => {
  const rows = [row('W', 2, 'Released'), row('W', 4, 'Released'),
    row('OTHER', 1, 'Closed'), row('OTHER', 3, 'Closed'),
    row('W', 2, 'Closed'), row('W', 5, 'Closed')];
  const job = core.buildJobs(rows)[0];
  const ctx = setup(rows);
  assert.equal(ctx.getSequenceDisplayOperations(job), job.operations);
  const html = ctx.renderMiniSequenceTrack(job);
  assert.match(html, /Completed Op/);
  assert.match(html, /Missing Op/);
  // Project tracks without source WO identities keep their existing behavior.
  assert.equal(ctx.getSequenceDisplayOperations({ operations: job.operations }), job.operations);
});

test('matching uses WO identity even when the closed row has a different combo and keeps parallel operations', () => {
  const rows = [row('W', 3, 'Released'), row('W', 1, 'Closed', { 'Combo #': '' }),
    row('W', 1, 'Closed', { 'Operation Name': 'Parallel finish', 'Manufacturing Work Center': 'Finish' })];
  const job = core.buildJobs(rows)[0];
  const display = setup(rows).getSequenceDisplayOperations(job);
  assert.deepEqual(Array.from(display, op => op.sequence), [1, 1, 3]);
  assert.ok(display.slice(0, 2).every(op => op.phase === 'complete'));
});
