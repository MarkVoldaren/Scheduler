(function () {
  'use strict';
  const { days, totals, validate } = globalThis.PeopleDomain;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const number = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const allocated = value => Number(value || 0).toFixed(2);
  const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  globalThis.createPeopleUI = function ({ root, request, isAdmin, unlock, lock, isActive }) {
    let people = [], departments = [], draft = null, baseline = '', retained = [];
    let search = '', department = '', archived = false, error = '', notice = '', busy = false, generation = 0, loaded = false, unlockOpen = false;
    const dirty = () => draft && JSON.stringify(draft) !== baseline;
    const mayLeave = () => !busy && (!dirty() || window.confirm('Discard unsaved changes to this person?'));
    function clear() {
      generation++; people = []; departments = []; draft = null; baseline = ''; retained = [];
      search = ''; department = ''; archived = false; error = ''; notice = ''; busy = false; loaded = false; unlockOpen = false;
      root.replaceChildren();
    }
    async function refresh() {
      if (draft || busy) return;
      const token = ++generation;
      busy = true; error = ''; render();
      try {
        const result = await request('/api/people');
        if (token !== generation) return;
        people = result.people; departments = result.departments; loaded = true;
      } catch (failure) { if (token === generation) error = failure.message; }
      finally { if (token === generation) { busy = false; render(); } }
    }
    function begin(person) {
      draft = person ? JSON.parse(JSON.stringify(person)) : { name: '', hours: Object.fromEntries(days.map((day, i) => [day, i < 5 ? 8 : 0])), allocations: [{ department: '', percent: 100 }] };
      retained = person ? person.allocations.map(item => item.department) : [];
      baseline = JSON.stringify(draft); error = ''; notice = ''; render();
      root.querySelector('[name="person-name"]').focus();
    }
    function status() {
      return `<p id="people-status" class="people-status ${error ? 'is-error' : ''}" role="${error ? 'alert' : 'status'}" tabindex="-1">${esc(error || (busy ? 'Loading or saving…' : notice))}</p>`;
    }
    function choices() { return [...new Set([...departments, ...retained])].sort((a, b) => a.localeCompare(b)); }
    function form() {
      return `<form id="people-form" class="people-editor"><h2>${draft.id ? 'Edit Person' : 'Add Person'}</h2>
        <fieldset ${busy ? 'disabled' : ''}><label>Name<input name="person-name" maxlength="120" value="${esc(draft.name)}" required></label>
        <div class="people-days">${days.map(day => `<label>${day.toUpperCase()}<input data-hour="${day}" type="number" min="0" max="24" step="0.01" value="${esc(draft.hours[day])}" required></label>`).join('')}</div>
        <h3>Department allocations</h3><div class="people-allocations">${draft.allocations.map((item, i) => `<div class="people-allocation">
          <label>Department ${i + 1}<select data-department="${i}" required><option value="">Select department</option>${choices().map(name => `<option value="${esc(name)}" ${name === item.department ? 'selected' : ''}>${esc(name)}${departments.includes(name) ? '' : ' (unavailable in current schedule)'}</option>`).join('')}</select></label>
          <label>Allocation %<input data-percent="${i}" type="number" min="0.01" max="100" step="0.01" value="${esc(item.percent)}" ${draft.allocations.length === 1 ? 'readonly' : ''} required></label>
          <output data-allocation-hours="${i}"></output><button type="button" class="button button-secondary" data-remove="${i}" aria-label="Remove department ${i + 1}">Remove</button>
        </div>`).join('')}</div>
        <button class="button button-secondary" type="button" data-action="add-department" ${!departments.length ? 'disabled' : ''}>Add Department</button>
        <p id="people-allocation-summary" aria-live="polite"></p>
        <div class="people-actions"><button class="button button-primary" type="submit" ${!isAdmin() ? 'disabled' : ''}>Save Person</button><button class="button button-secondary" type="button" data-action="cancel">Cancel</button>
        ${draft.id ? `<button class="button button-secondary" type="button" data-action="archive">${draft.archived ? 'Restore' : 'Archive'} Person</button>` : ''}
        ${error ? '<button class="button button-secondary" type="button" data-action="reload">Refresh saved record</button>' : ''}</div></fieldset></form>`;
    }
    function list() {
      const visible = people.filter(person => person.archived === archived && person.name.toLowerCase().includes(search.toLowerCase()) && (!department || person.allocations.some(item => item.department === department)));
      return `<div class="people-table-scroll"><table class="people-table"><thead><tr><th>Name</th><th>Departments and Allocations</th>${days.map(day => `<th>${day.toUpperCase()}</th>`).join('')}<th>Weekly Total</th>${isAdmin() ? '<th>Actions</th>' : ''}</tr></thead><tbody>
      ${visible.map(person => `<tr><th scope="row">${esc(person.name)}</th><td>${totals(person.hours, person.allocations).allocations.map(item => `<div class="people-department">${esc(item.department)} · ${number(item.percent)}% · <strong>${allocated(item.weeklyHours)} hrs</strong>${departments.includes(item.department) ? '' : '<small>Unavailable in current schedule</small>'}</div>`).join('')}</td>${days.map(day => `<td>${number(person.hours[day])}</td>`).join('')}<td><strong>${number(totals(person.hours, person.allocations).weeklyHours)}</strong></td>${isAdmin() ? `<td><button class="button button-secondary" data-edit="${person.id}">Edit</button>${person.archived ? `<button class="button button-secondary" data-restore="${person.id}">Restore</button>` : ''}</td>` : ''}</tr>`).join('')}
      </tbody></table></div>${!visible.length ? `<p>${loaded ? 'No people match this view. Add a person or adjust the filters.' : 'Loading roster…'}</p>` : ''}
      <p class="people-total">${visible.length} ${visible.length === 1 ? 'person' : 'people'} · ${number(visible.reduce((sum, person) => sum + totals(person.hours, person.allocations).weeklyHours, 0))} scheduled hours</p>`;
    }
    function render() {
      const filterDepartments = [...new Set([...departments, ...people.flatMap(person => person.allocations.map(item => item.department))])].sort((a, b) => a.localeCompare(b));
      root.innerHTML = `<div class="people-heading"><div><p class="panel-kicker">Operations</p><h1>People</h1><p>Weekly scheduled hours and department assignments</p></div>${isAdmin() ? `<button class="button button-primary" data-action="add" ${busy || draft ? 'disabled' : ''}>Add Person</button>` : '<button class="button button-secondary" data-action="unlock">Unlock editing</button>'}</div>
        ${unlockOpen && !isAdmin() ? `<form id="people-unlock"><label>Admin password<input name="password" type="password" autocomplete="current-password" required></label><button class="button button-primary" ${busy ? 'disabled' : ''}>Unlock editing</button></form>` : ''}
        ${status()}${loaded && !departments.length ? '<p class="people-notice">Upload a Work Center CSV with open departments before assigning a new department. Existing assignments can be retained.</p>' : ''}
        ${draft ? form() : `<div class="people-filters"><label>Search people<input data-filter="search" type="search" value="${esc(search)}" placeholder="Search by name"></label><label>Department<select data-filter="department"><option value="">All departments</option>${filterDepartments.map(name => `<option ${name === department ? 'selected' : ''} value="${esc(name)}">${esc(name)}</option>`).join('')}</select></label><label>Roster<select data-filter="archived"><option value="active" ${!archived ? 'selected' : ''}>Active</option><option value="archived" ${archived ? 'selected' : ''}>Archived</option></select></label><button class="button button-secondary" data-action="refresh" ${busy ? 'disabled' : ''}>Refresh</button></div><div id="people-list">${list()}</div>`}`;
      updateTotals();
    }
    function updateTotals() {
      if (!draft) return;
      const calculated = totals(draft.hours, draft.allocations);
      root.querySelectorAll('[data-allocation-hours]').forEach(output => { output.textContent = `${allocated(calculated.allocations[Number(output.dataset.allocationHours)].weeklyHours)} hrs / week`; });
      const sum = draft.allocations.reduce((total, item) => total + Number(item.percent || 0), 0);
      root.querySelector('#people-allocation-summary').textContent = `Allocated: ${number(sum)}% of 100% · Weekly total: ${number(calculated.weeklyHours)} hours`;
    }
    function showError(failure) { error = failure.message; render(); root.querySelector('#people-status')?.focus(); }
    async function save(archiveValue, person = draft) {
      if (busy || !isAdmin()) return;
      try { if (archiveValue === undefined) validate(draft, departments, retained); }
      catch (failure) { showError(failure); return; }
      const token = ++generation;
      busy = true; error = ''; render();
      try {
        const route = archiveValue === undefined ? `/api/people${person.id ? '/' + person.id : ''}` : `/api/people/${person.id}/archive`;
        await request(route, json(person.id ? 'PUT' : 'POST', archiveValue === undefined ? person : { revision: person.revision, archived: archiveValue }));
        if (token !== generation) return;
        draft = null; notice = archiveValue === undefined ? 'Person saved.' : archiveValue ? 'Person archived.' : 'Person restored.';
        busy = false; await refresh();
      } catch (failure) {
        if (token !== generation) return;
        busy = false;
        if (failure.status === 403) lock();
        showError(failure);
      }
    }
    root.addEventListener('input', event => {
      const input = event.target;
      if (input.dataset.filter === 'search') { search = input.value; root.querySelector('#people-list').innerHTML = list(); return; }
      if (!draft || busy) return;
      if (input.name === 'person-name') draft.name = input.value;
      if (input.dataset.hour) draft.hours[input.dataset.hour] = input.value;
      if (input.dataset.percent !== undefined) draft.allocations[Number(input.dataset.percent)].percent = input.value;
      updateTotals();
    });
    root.addEventListener('change', event => {
      const input = event.target;
      if (input.dataset.filter === 'department') { department = input.value; render(); }
      if (input.dataset.filter === 'archived') { archived = input.value === 'archived'; render(); }
      if (draft && input.dataset.department !== undefined) draft.allocations[Number(input.dataset.department)].department = input.value;
    });
    root.addEventListener('submit', async event => {
      event.preventDefault();
      if (event.target.id === 'people-form') { await save(); return; }
      if (event.target.id !== 'people-unlock' || busy) return;
      const password = event.target.elements.password.value, token = ++generation;
      event.target.elements.password.value = ''; busy = true; error = ''; render();
      try { await unlock(password); if (token !== generation) return; unlockOpen = false; busy = false; render(); if (!draft) await refresh(); }
      catch (failure) { if (token === generation) { busy = false; showError(failure); } }
    });
    root.addEventListener('click', async event => {
      const button = event.target.closest('button');
      if (!button || busy) return;
      const action = button.dataset.action;
      if (action === 'unlock') { unlockOpen = !unlockOpen; render(); root.querySelector('#people-unlock input')?.focus(); return; }
      if (action === 'refresh') { await refresh(); return; }
      if (action === 'cancel') { if (mayLeave()) { draft = null; error = ''; render(); } return; }
      if (action === 'reload') {
        if (!mayLeave()) return;
        const id = draft?.id; draft = null; await refresh();
        if (!error && id && isAdmin()) begin(people.find(person => person.id === id));
        return;
      }
      if (!isAdmin()) return;
      if (action === 'add') begin();
      if (button.dataset.edit) begin(people.find(person => person.id === Number(button.dataset.edit)));
      if (button.dataset.restore) await save(false, people.find(person => person.id === Number(button.dataset.restore)));
      if (action === 'add-department') { draft.allocations.push({ department: '', percent: draft.allocations.length ? '' : 100 }); render(); }
      if (button.dataset.remove !== undefined) { draft.allocations.splice(Number(button.dataset.remove), 1); if (draft.allocations.length === 1) draft.allocations[0].percent = 100; render(); }
      if (action === 'archive' && window.confirm(`${draft.archived ? 'Restore' : 'Archive'} ${draft.name}?${dirty() ? ' Unsaved edits will be discarded.' : ''}`)) await save(!draft.archived);
    });
    window.addEventListener('beforeunload', event => { if (dirty() || busy) { event.preventDefault(); event.returnValue = ''; } });
    return { refresh, clear, canLeave: mayLeave, leave() { draft = null; baseline = ''; }, authChanged() { if (isActive()) render(); } };
  };
})();
