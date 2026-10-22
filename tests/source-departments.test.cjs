const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const core = require('../scheduler-core');
const { createSourceDepartments } = require('../source-departments');

test('source cache never rebuilds on reads and invalidates permanently after external change', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scheduler-source-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'work.csv');
  fs.writeFileSync(file, 'original');
  let metadata = { uploadedAt: 'one' };
  const cache = createSourceDepartments(file, () => metadata);
  cache.publish(['Cutting']);
  const build = core.buildJobs;
  core.buildJobs = () => { throw new Error('Read rebuilt jobs'); };
  try {
    for (let i = 0; i < 10; i++) assert.deepEqual(cache.read(), { departments: ['Cutting'] });
  } finally { core.buildJobs = build; }
  const copy = cache.read().departments; copy.push('mutated');
  assert.deepEqual(cache.read().departments, ['Cutting']);
  fs.writeFileSync(file, 'external replacement');
  assert.match(cache.read().sourceWarning, /outside the app/);
  assert.deepEqual(cache.read().departments, []);
  cache.publish(['Finishing']);
  assert.deepEqual(cache.read().departments, ['Finishing']);
  const access = fs.accessSync;
  try {
    fs.accessSync = () => { throw Object.assign(new Error('Permission denied'), {code:'EACCES'}); };
    assert.deepEqual(cache.read().departments, []);
    assert.ok(cache.read().sourceWarning);
  } finally { fs.accessSync = access; }
  // Restoring access alone cannot resurrect a source already invalidated.
  assert.deepEqual(cache.read().departments, []);
  cache.publish(['Finishing']);
  metadata = { uploadedAt: 'two' };
  assert.deepEqual(cache.read().departments, []);
  cache.publish([]);
  assert.deepEqual(cache.read(), { departments: [] });
  fs.unlinkSync(file);
  assert.ok(cache.read().sourceWarning);
  metadata = null;
  assert.match(cache.read().sourceWarning, /Upload a work-center/);
});

test('a failed preparation cannot publish new departments', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scheduler-source-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'work.csv'); fs.writeFileSync(file, 'original');
  const cache = createSourceDepartments(file, () => ({ uploadedAt: 'one' }));
  cache.publish(['Cutting']);
  assert.throws(() => cache.prepare(null));
  assert.deepEqual(cache.read().departments, ['Cutting']);
});
