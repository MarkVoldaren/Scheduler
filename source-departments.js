'use strict';
const fs = require('fs');
const core = require('./scheduler-core');

function createSourceDepartments(file, metadata) {
  let snapshot = null;
  function signature() {
    const stat = fs.statSync(file);
    fs.accessSync(file, fs.constants.R_OK);
    if (!stat.isFile()) throw new Error('Not a file');
    return JSON.stringify([stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs, metadata()?.uploadedAt]);
  }
  function prepare(rows) {
    return [...new Set(core.buildJobs(rows).flatMap(job => job.operations)
      .filter(op => op.phase !== 'complete' && op.hoursRemaining > 0 && op.workCenter)
      .map(op => op.workCenter))].sort((a, b) => a.localeCompare(b));
  }
  return {
    prepare,
    publish(departments) {
      // Publication is deliberately after the upload transaction commits.
      try { snapshot = { signature: signature(), departments: [...departments] }; }
      catch { snapshot = null; }
    },
    read() {
      const warning = 'Work-center source is unavailable or changed outside the app. Re-upload the CSV or restart the server to restore department choices. Saved assignments are preserved.';
      try {
        if (!metadata()) { snapshot = null; return { departments: [], sourceWarning: 'Upload a work-center CSV to make departments available. Saved assignments are preserved.' }; }
        if (!snapshot || signature() !== snapshot.signature) {
          snapshot = null;
          return { departments: [], sourceWarning: warning };
        }
        return { departments: [...snapshot.departments] };
      } catch { snapshot = null; return { departments: [], sourceWarning: warning }; }
    },
  };
}
module.exports = { createSourceDepartments };
