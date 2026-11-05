(function(root) {
  const key = m => `${m.type}:${m.identifier}`;
  function collect(model) {
    const members = new Map(); let skipped = 0;
    for (const group of Object.values(model.groupedRows)) for (const row of group.rows) {
      const match = row.match;
      if (!match?.job || !['linked', 'suggested'].includes(match.matchType)) { skipped++; continue; }
      const member = match.job.combo ? { type: 'combo', identifier: String(match.job.combo) } : { type: 'wo', identifier: match.matchedWo };
      if (!member.identifier) { skipped++; continue; }
      members.set(key(member), member);
    }
    return { members: [...members.values()], skipped };
  }
  function create({ request, getModel, getVersion, viewProject, esc }) {
    let dialog, snapshot, version, projects = [], detail, candidates = [], busy = false, invalid = false, message = '', savedProject;
    const json = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    function remaining() {
      const existing = new Set((detail?.members || []).map(key));
      return snapshot.members.filter(m => !existing.has(key(m)));
    }
    function render() {
      if (!dialog) return;
      const pending = remaining();
      const available = new Set(candidates.map(key));
      const stale = pending.some(m => !available.has(key(m)));
      dialog.innerHTML = `<h2 id="pick-project-title">Add picklist work to Project</h2><p>${esc(snapshot.filters)}</p>
        <p>Whole combos include WOs outside these filters. This is a one-time addition.</p>
        <label>Project <select data-project-target ${busy || savedProject ? 'disabled' : ''}><option value="">Select an active project</option>${projects.map(p => `<option value="${p.id}" ${detail?.project.id === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        ${!projects.length && !busy ? '<p>No active projects. Create one in Projects first.</p><button data-project-go>Open Projects</button>' : ''}
        <p>${snapshot.members.length} unique WOs/combos · ${detail ? snapshot.members.length - pending.length : 0} already added · ${snapshot.skipped} skipped lines</p>
        <ul>${snapshot.members.map(m => `<li>${m.type === 'combo' ? 'Combo' : 'WO'} ${esc(m.identifier)}${detail?.members.some(e => key(e) === key(m)) ? ' — Already added' : ''}</li>`).join('')}</ul>
        ${stale ? '<p>Production matches changed. Rebuild the preview before adding.</p>' : ''}
        ${pending.length > 500 ? '<p>More than 500 new members. Narrow the picklist filters.</p>' : ''}
        <p role="status" aria-live="polite">${esc(message)}</p>
        ${savedProject ? '<button data-project-go>View Project</button>' : `<button data-project-save ${busy || invalid || stale || !detail || !pending.length || pending.length > 500 ? 'disabled' : ''}>Add ${pending.length} to Project</button><button data-project-rebuild ${busy ? 'disabled' : ''}>Rebuild preview</button>`}
        <button data-project-close ${busy ? 'disabled' : ''}>${savedProject ? 'Close' : 'Cancel'}</button>`;
    }
    async function reload() {
      const [list, work] = await Promise.all([request('/api/projects'), request('/api/projects/candidates')]);
      projects = list.projects.filter(p => !p.archived); candidates = work.candidates;
      detail = detail && projects.some(p => p.id === detail.project.id) ? await request(`/api/projects/${detail.project.id}`) : null;
    }
    function capture() {
      const model = getModel(); snapshot = collect(model); version = getVersion();
      snapshot.filters = `Customer: ${model.selectedCustomer || 'None'} · Drill down: ${model.selectedCustomerDetail || 'All'} · Commitment: ${model.commitmentFilter} · Accelerated: ${model.acceleratedOnly ? 'Yes' : 'No'} · Dates: ${model.dateFrom || 'Any'} to ${model.dateTo || 'Any'} · Search: ${model.search || 'None'}`;
    }
    async function rebuild() {
      busy = true; invalid = true; message = 'Loading preview…'; capture(); render();
      try { await reload(); invalid = version !== getVersion(); message = invalid ? 'Picklist changed. Rebuild preview.' : 'Review the work before adding.'; }
      catch(e) { message = e.message; }
      finally { busy = false; render(); }
    }
    async function open() {
      if (dialog) return;
      detail = null; savedProject = null; projects = []; candidates = [];
      dialog = document.createElement('dialog'); dialog.className = 'pick-project-dialog'; dialog.setAttribute('aria-labelledby', 'pick-project-title'); document.body.append(dialog);
      dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
      dialog.addEventListener('close', () => { dialog.remove(); dialog = null; });
      dialog.addEventListener('change', async e => {
        if (!e.target.matches('[data-project-target]') || busy) return;
        busy = true; const id = e.target.value; detail = null; render();
        try { if (id) detail = await request(`/api/projects/${id}`); message = 'Review the work before adding.'; }
        catch(err) { message = err.message; }
        finally { busy = false; check(); render(); }
      });
      dialog.addEventListener('click', async e => {
        if (busy) return;
        if (e.target.closest('[data-project-close]')) dialog.close();
        else if (e.target.closest('[data-project-go]')) { const id = savedProject?.id; dialog.close(); viewProject(id); }
        else if (e.target.closest('[data-project-rebuild]')) await rebuild();
        else if (e.target.closest('[data-project-save]')) {
          check(); if (invalid || !detail) return;
          const members = remaining(); if (!members.length || members.length > 500) return;
          busy = true; render();
          try {
            const result = await request(`/api/projects/${detail.project.id}/members`, json({ revision: detail.project.revision, members }));
            savedProject = result.project; detail = result; message = `Added ${members.length} WOs/combos to ${result.project.name}.`;
          } catch(err) {
            invalid = true; message = err.message;
            try { await reload(); message += ' Saved membership reloaded. Review and rebuild the preview before submitting again.'; }
            catch(readError) { message += ' Could not reconcile saved membership: ' + readError.message; }
          } finally { busy = false; render(); }
        }
      });
      capture(); render(); dialog.showModal(); await rebuild();
    }
    function check() { if (dialog && !savedProject && version !== getVersion()) { invalid = true; message = 'Picklist or production data changed. Rebuild the preview before adding.'; render(); } }
    return { open, check, clear() { if (dialog) { dialog.close(); } } };
  }
  if (typeof module === 'object' && module.exports) module.exports = { collect, create };
  else root.PickProject = { collect, create };
})(globalThis);
