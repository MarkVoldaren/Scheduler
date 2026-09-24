'use strict';
const domain = require('./people-domain');
function createPeopleStore(db, getDepartments) {
  db.exec(`CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, hours TEXT NOT NULL, allocations TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  const fail = (status, message) => { const error = new Error(message); error.status = status; throw error; };
  function person(row) {
    const hours = Object.fromEntries(Object.entries(JSON.parse(row.hours)).map(([day, value]) => [day, value / 100]));
    const allocations = JSON.parse(row.allocations).map(item => ({ department: item.department, percent: item.basisPoints / 100 }));
    return { id: row.id, name: row.name, hours, allocations, archived: Boolean(row.archived), revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at };
  }
  function get(id) {
    if (!/^[1-9]\d*$/.test(String(id)) || !Number.isSafeInteger(Number(id))) fail(404, 'Person not found.');
    const row = db.prepare('SELECT * FROM people WHERE id = ?').get(id);
    if (!row) fail(404, 'Person not found.');
    return person(row);
  }
  function check(id, revision) {
    const current = get(id);
    if (current.revision !== revision) fail(409, 'This person was changed by another user. Refresh before saving again.');
    return current;
  }
  return {
    list() { return { people: db.prepare('SELECT * FROM people').all().map(person).sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id), departments: getDepartments() }; },
    create(input) {
      const data = domain.validate(input, getDepartments());
      const now = new Date().toISOString();
      const result = db.prepare('INSERT INTO people (name,hours,allocations,created_at,updated_at) VALUES (?,?,?,?,?)')
        .run(data.name, JSON.stringify(data.hours), JSON.stringify(data.allocations), now, now);
      return get(result.lastInsertRowid);
    },
    update: db.transaction((id, input) => {
      const current = check(id, input.revision);
      const data = domain.validate(input, getDepartments(), current.allocations.map(item => item.department));
      db.prepare('UPDATE people SET name=?,hours=?,allocations=?,revision=revision+1,updated_at=? WHERE id=?')
        .run(data.name, JSON.stringify(data.hours), JSON.stringify(data.allocations), new Date().toISOString(), id);
      return get(id);
    }),
    archive: db.transaction((id, input) => {
      check(id, input.revision);
      if (typeof input.archived !== 'boolean') fail(400, 'Archived must be true or false.');
      db.prepare('UPDATE people SET archived=?,revision=revision+1,updated_at=? WHERE id=?').run(Number(input.archived), new Date().toISOString(), id);
      return get(id);
    }),
  };
}
module.exports = { createPeopleStore };
