"use strict";
function createPickListStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS pick_progress (key TEXT PRIMARY KEY, quantity REAL NOT NULL, revision TEXT NOT NULL)`);
  const list = () => db.prepare("SELECT key, quantity, revision FROM pick_progress").all();
  function reconcile(keys) {
    for (const row of list()) if (keys.get(row.key) !== 1) db.prepare("DELETE FROM pick_progress WHERE key = ?").run(row.key);
  }
  function save(body, keys) {
    const fail = (status, message) => { const error = new Error(message); error.status = status; throw error; };
    if (keys.get(body.key) !== 1) fail(409, "This line is missing or duplicated in the current upload. Refresh the Pick List.");
    if (typeof body.quantity !== "number" || !Number.isFinite(body.quantity) || body.quantity < 0) fail(400, "Enter a finite quantity of zero or greater.");
    const current = db.prepare("SELECT revision FROM pick_progress WHERE key = ?").get(body.key);
    if ((current?.revision || null) !== (body.revision || null)) fail(409, "Picking changed in another session. Refresh and try again.");
    if (body.quantity === 0) db.prepare("DELETE FROM pick_progress WHERE key = ?").run(body.key);
    else db.prepare("INSERT OR REPLACE INTO pick_progress VALUES (?, ?, ?)").run(body.key, body.quantity, require("crypto").randomUUID());
    return list();
  }
  return { list, reconcile, save };
}
module.exports = { createPickListStore };
