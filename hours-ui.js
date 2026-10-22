(function() {
  const H = globalThis.HoursDomain;
  const toolbar = document.createElement('div');
  toolbar.className = 'hours-toolbar';
  toolbar.innerHTML = '<button class="button button-primary" data-hours-plant>Full Plant Booked / Earned</button> <button class="button button-secondary" data-hours-upload>Upload Earned Hours</button><input type="file" accept=".csv" hidden><span role="status"></span>';
  document.querySelector('.kpi-board-head').after(toolbar);
  const dialog = document.createElement('dialog');
  dialog.className = 'hours-dialog';
  document.body.append(dialog);
  let earned = [], metadata = null, scope = null, mode = 'month', trigger;
  const status = toolbar.querySelector('[role=status]');
  async function refresh() {
    const generation = state.authGeneration;
    const app = await fetchJson('/api/app-state');
    const nextMetadata = app.csvs?.earnedHours || null;
    const nextEarned = nextMetadata ? H.readEarned(await fetchText('/api/csv/earned-hours')) : [];
    if (generation !== state.authGeneration || !state.authenticated) return false;
    metadata = nextMetadata;
    earned = nextEarned;
    status.textContent = metadata ? `Earned hours uploaded ${formatCentralUploadTime(metadata.uploadedAt)}` : 'No earned-hours CSV uploaded';
    return true;
  }
  globalThis.HoursUI = {refresh, clear() { earned = []; metadata = null; if (dialog.open) dialog.close(); dialog.innerHTML = ''; status.textContent = 'No earned-hours CSV uploaded'; }};
  toolbar.querySelector('input').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const form = new FormData(); form.append('csv', file);
      await fetchJson('/api/csv/earned-hours', {method:'POST', body:form});
      if (await refresh() && dialog.open) render();
    } catch(error) { alert(error.message); }
    finally { event.target.value = ''; }
  });
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-hours-center], [data-hours-flow], [data-hours-plant], [data-hours-upload]');
    if (!button) return;
    if (button.hasAttribute('data-hours-upload')) { toolbar.querySelector('input').click(); return; }
    trigger = button;
    scope = button.hasAttribute('data-hours-center') ? {type:'center', name:button.dataset.hoursCenter} : button.hasAttribute('data-hours-flow') ? {type:'flow', name:button.dataset.hoursFlow} : {type:'plant', name:'Full Plant'};
    mode = 'month';
    try { if (await refresh()) { render(); if (!dialog.open) dialog.showModal(); } }
    catch(error) { alert(error.message); }
  });
  dialog.addEventListener('close', () => trigger?.focus());
  for (const eventName of ['focusin', 'mouseover']) dialog.addEventListener(eventName, event => {
    const label = event.target.closest('circle')?.getAttribute('aria-label');
    if (label) dialog.querySelector('.hours-readout').textContent = label;
  });
  dialog.addEventListener('click', event => {
    if (event.target.closest('[data-hours-close]')) dialog.close();
    const toggle = event.target.closest('[data-hours-mode]');
    if (toggle) { mode = toggle.dataset.hoursMode; render(); dialog.querySelector(`[data-hours-mode="${mode}"]`).focus(); }
  });
  function render() {
    const now = H.today();
    const booked = H.booked(state.rawRows, earned, now);
    const canonical = name => [...state.workCenters, ...Object.keys(state.flowLocations)].find(c => H.normalize(c) === H.normalize(name)) || name;
    const accepts = name => scope.type === 'center' ? H.normalize(name) === H.normalize(scope.name) : H.normalize(name) !== 'art' && (scope.type === 'plant' || getDepartmentFlowLocation(state, canonical(name)) === scope.name);
    const art = scope.type === 'center' && H.normalize(scope.name) === 'art';
    const result = H.series(booked, earned, accepts, mode, now, art);
    const d = result.diagnostics;
    const coverage = value => value ? value.join(' to ') : 'No data';
    const timestamp = value => value ? formatCentralUploadTime(value.uploadedAt) : 'Not uploaded';
    dialog.innerHTML = `<div class="hours-dialog-head"><h2 id="hours-title">${escapeHtml(scope.name)} Booked / Earned Hours</h2><button class="button" data-hours-close autofocus>Close</button></div>
      <div class="hours-toolbar"><button class="button" data-hours-mode="month" aria-pressed="${mode === 'month'}">Month</button><button class="button" data-hours-mode="day" aria-pressed="${mode === 'day'}">Day</button></div>
      <p>${art ? 'Art: earned hours are not applicable.' : scope.type !== 'center' ? 'Art is excluded from both totals.' : 'Hours by ship date and completion date.'}</p>
      <p class="hours-coverage">Booked source coverage: ${coverage(result.bookedCoverage)} · Uploaded ${escapeHtml(timestamp(state.activeCsvMeta.workCenter))}<br>Earned source coverage: ${art ? 'Not applicable' : coverage(result.earnedCoverage)} · Uploaded ${escapeHtml(timestamp(metadata))}</p>
      ${!metadata && !art ? '<p>Upload an earned-hours CSV to compare performance. <button class="button" data-hours-upload>Upload Earned Hours</button></p>' : ''}
      <div class="hours-calculation-notes">
        <p>Booked hours in this view: <strong>${d.calculatedHours.toFixed(2)}</strong> calculated · <strong>${d.fallbackHours.toFixed(2)}</strong> historical fallback · <strong>${d.futureHours.toFixed(2)}</strong> future Hours Remaining.</p>
        <p>${d.hasDetail ? 'Historical booked = (largest setup minutes + WO quantity × weighted minutes per piece) ÷ 60. Missing calculation inputs use Hours Remaining.' : 'Completion-based rates are unavailable. Upload the detailed earned-hours export to calculate historical booked hours; currently using Hours Remaining.'}</p>
        ${!art ? `<p>${d.missingEarned} blank earned entries in this view; ${d.unusableRateInputs} completion rows in the selected source scope excluded from run-rate estimation. Blank-only buckets are gaps; hollow earned markers show incomplete reported totals.</p>` : ''}
        ${d.skippedNonOperations ? `<p>${d.skippedNonOperations} source transaction rows with no operation, work center, quantity, or hours were skipped.</p>` : ''}
        ${d.missingEarned ? `<details><summary>Periods with missing earned values</summary><ul>${result.points.filter(p => p.missingEarned).map(p => `<li>${p.date}: ${p.missingEarned} blank ${p.missingEarned === 1 ? 'entry' : 'entries'}${p.earned === null ? ' — no reported earned hours' : ' — earned total is incomplete'}</li>`).join('')}</ul></details>` : ''}
      </div>
      <p><span class="hours-booked">━ Booked hours</span> <span class="hours-earned">━ ${art ? 'Earned: Not applicable' : 'Earned hours'}</span></p>
      <p class="hours-readout" role="status">Hover or focus a point to see its hours.</p><div class="hours-chart-scroll">${chart(result.points)}</div>`;
    dialog.setAttribute('aria-labelledby', 'hours-title');
  }
  function chart(points) {
    if (!points.length) return '<p>No dated hours available for this selection.</p>';
    const w = Math.max(850, points.length * (mode === 'day' ? 24 : 90)), h = 380, left = 65, bottom = 300;
    const values = points.flatMap(p => [p.booked,p.earned]).filter(v => v !== null);
    const min = Math.min(0,...values), max = Math.max(1,...values), range = max-min;
    const x = i => left + (w-left-30) * (points.length === 1 ? 0.5 : i/(points.length-1));
    const y = v => bottom - (v-min)/range * 260;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" role="img" aria-label="${escapeHtml(scope.name)} booked and earned hours, ${points[0].date} to ${points.at(-1).date}"><text x="5" y="18">Hours</text>`;
    for(let i=0;i<=5;i++) {const value=min+range*i/5; svg+=`<line x1="${left}" x2="${w-20}" y1="${y(value)}" y2="${y(value)}" stroke="#cbd5e1"/><text x="55" y="${y(value)+4}" text-anchor="end">${value.toFixed(0)}</text>`;}
    for (const [key,color] of [['booked','#087bab'],['earned','#e87824']]) {
      let path='', active=false;
      points.forEach((p,i) => {if(p[key] === null) {active=false;return;} path+=`${active?'L':'M'}${x(i)},${y(p[key])} `;active=true;});
      svg+=`<path d="${path}" fill="none" stroke="${color}" stroke-width="2.5"/>`;
      points.forEach((p,i) => {if(p[key] !== null) {const missing = key === 'earned' && p.missingEarned; const label=`${p.date}: ${key} ${p[key].toFixed(2)} hours${missing ? `; incomplete, ${p.missingEarned} blank entries` : ''}`;svg+=`<circle cx="${x(i)}" cy="${y(p[key])}" r="${missing ? 5 : 4}" fill="${missing ? 'white' : color}" stroke="${color}" stroke-width="2" tabindex="0" aria-label="${label}"><title>${label}</title></circle>`;}});
    }
    points.forEach((p,i) => {if(mode !== 'day' || i%7===0 || i===points.length-1) svg+=`<text transform="translate(${x(i)},320) rotate(-40)" text-anchor="end">${p.date}</text>`;});
    return `<p>${points[0].date} to ${points.at(-1).date}</p>${svg}</svg>`;
  }
})();
