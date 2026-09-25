(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PeoplePrint = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const num = value => Number(value).toFixed(2);
  const colors = ['#139c91', '#0796b5', '#8056cf', '#ba810a', '#d66d28', '#c34a71', '#60748b'];
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  function createReport(people, departments, flowLocations, flowOrder, now = new Date()) {
    const active = people.filter(person => !person.archived);
    const catalog = new Set(departments);
    const names = [...new Set([...departments, ...active.flatMap(person => person.allocations.map(a => a.department))])];
    const groups = flowOrder.map((name, index) => ({ name, color: colors[index % colors.length], departments: [], people: [], hours: 0 }));
    let totalUnits = 0;
    for (const department of names.sort((a, b) => a.localeCompare(b))) {
      const group = groups.find(g => g.name === flowLocations[department]) || groups[groups.length - 1];
      let units = 0;
      for (const person of active) {
        const assignment = person.allocations.find(a => a.department === department);
        if (!assignment) continue;
        // Integer hundredths of hours times basis points; convert only after summing.
        const weekly = days.reduce((sum, day) => sum + Math.round(Number(person.hours[day] || 0) * 100), 0);
        const contribution = weekly * Math.round(Number(assignment.percent) * 100);
        units += contribution;
        let member = group.people.find(p => p.id === person.id);
        if (!member) { member = { id: person.id, name: person.name, units: 0 }; group.people.push(member); }
        member.units += contribution;
      }
      group.departments.push({ name: department, hours: units / 1000000, unavailable: !catalog.has(department) });
      group.hours += units / 1000000;
      totalUnits += units;
    }
    groups.forEach(group => { group.people.sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id); });
    const central = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const part = type => central.find(p => p.type === type).value;
    const monday = new Date(Date.UTC(Number(part('year')), Number(part('month')) - 1, Number(part('day'))));
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    const sunday = new Date(monday); sunday.setUTCDate(sunday.getUTCDate() + 6);
    const date = value => value.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
    return { groups, count: active.length, hours: totalUnits / 1000000, week: `${date(monday)} - ${date(sunday)}`,
      generated: now.toLocaleString('en-US', { timeZone: 'America/Chicago', timeZoneName: 'short' }),
      unavailable: groups.some(g => g.departments.some(d => d.unavailable)) };
  }

  function buildHtml(report) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>People - Weekly manning report</title><style>
      @page { size: letter landscape; margin: .4in; }
      * { box-sizing: border-box; } body { margin: 0; background: #edf1f5; color: #142a43; font: 9pt 'Segoe UI', Arial, sans-serif; }
      .toolbar { padding: 12px; text-align: center; font: 14px Arial,sans-serif; } .toolbar button { padding: 9px 16px; margin-right: 12px; cursor: pointer; }
      .frame { width: 10.2in; margin: 12px auto; background: white; overflow: hidden; }
      .sheet { width: 10.2in; transform-origin: top left; padding: 0; background: white; }
      header { display: flex; justify-content: space-between; border-top: 6pt solid #142a43; padding: 13pt 0 10pt; font-size: 8pt; font-weight: bold; }
      h1 { margin: 0 0 5pt; font-size: 24pt; } .subtitle { color: #65758a; margin: 0 0 12pt; font-size: 9pt; }
      .metrics { display: flex; justify-content: space-between; background: #f3f6fa; padding: 9pt; margin-bottom: 9pt; font-weight: bold; font-size: 10pt; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; } col.flow { width: 19%; } col.dept { width: 34%; } col.people { width: 32%; } col.hours { width: 8%; } col.manning { width: 7%; }
      th { text-align: left; } thead th, tfoot td { background: #142a43; color: white; padding: 8pt 6pt; font-size: 8pt; }
      tbody td, tbody th { vertical-align: top; padding: 7pt 6pt; border-bottom: .5pt solid #dce3eb; }
      tbody tr:nth-child(odd) { background: #f3f6fa; } tbody th { border-left: 3pt solid var(--flow); font-size: 9pt; overflow-wrap: anywhere; }
      .count { display: block; margin-top: 5pt; font-size: 8pt; font-weight: normal; color: #65758a; }
      .pair { display: flex; justify-content: space-between; align-items: baseline; gap: 8pt; line-height: 1.32; }
      .pair span { overflow-wrap: anywhere; min-width: 0; } .pair b { flex-shrink: 0; } .zero { color: #65758a; }
      .number { text-align: right; font-variant-numeric: tabular-nums; } .muted { color: #65758a; } tfoot { display: table-row-group; }
      .notes { margin: 10pt 0 0; font-size: 7.5pt; line-height: 1.45; color: #65758a; }
      footer { display: flex; justify-content: space-between; border-top: .5pt solid #dce3eb; margin-top: 10pt; padding-top: 7pt; font-size: 7.5pt; color: #65758a; }
      @media print { body { background: white; } .toolbar { display: none; } .frame { margin: 0; } * { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
    </style></head><body><div class="toolbar"><button id="print-report">Print / Save PDF</button><span id="fit-status">Landscape letter - all active people, regardless of roster filters.</span></div><div class="frame"><main class="sheet">
      <header><span>SCHEDULER / PEOPLE</span><span>WEEKLY LABOR ALLOCATION</span></header>
      <h1>Weekly people &amp; manning</h1><p class="subtitle">${esc(report.week)} | Recurring weekly schedule | 40 weekly hours = 1.00 manning</p>
      <div class="metrics"><span>${report.count} UNIQUE PEOPLE</span><span>${num(report.hours)} WEEKLY HOURS</span><span>${num(report.hours / 40)} TOTAL MANNING</span></div>
      <table><colgroup><col class="flow"><col class="dept"><col class="people"><col class="hours"><col class="manning"></colgroup><thead><tr><th>FLOW LOCATION</th><th>DEPARTMENT / MANNING</th><th>PEOPLE / MANNING IN FLOW</th><th class="number">HOURS</th><th class="number">MNG.</th></tr></thead><tbody>
      ${report.groups.map(group => `<tr style="--flow:${group.color}"><th scope="row">${esc(group.name)}<span class="count">${group.people.length} ${group.people.length === 1 ? 'person' : 'people'}</span></th><td>${group.departments.map(d => `<div class="pair${d.hours === 0 ? ' zero' : ''}"><span>${esc(d.name)}${d.unavailable ? '*' : ''}</span><b>${num(d.hours / 40)}</b></div>`).join('') || '<span class="muted">No departments assigned</span>'}</td><td>${group.people.map(p => `<div class="pair"><span>${esc(p.name)}</span><b>${num(p.units / 1000000 / 40)}</b></div>`).join('') || '<span class="muted">No people assigned</span>'}</td><td class="number">${num(group.hours)}</td><td class="number"><b>${num(group.hours / 40)}</b></td></tr>`).join('')}
      </tbody><tfoot><tr><td><b>SHOP TOTAL</b></td><td colspan="2">${report.count} unique people across all flows</td><td class="number"><b>${num(report.hours)}</b></td><td class="number"><b>${num(report.hours / 40)}</b></td></tr></tfoot></table>
      <p class="notes">People may appear in multiple flows; only their allocated hours count in each flow. Shop totals do not double-count labor.<br>Department and person figures are weekly manning. Values are rounded; totals use unrounded allocations. Zero coverage is shown.${report.unavailable ? '<br>*Department unavailable in the current schedule; saved allocations are included.' : ''}</p>
      <footer><span>Generated ${esc(report.generated)} | Active saved roster</span><span>1 / 1</span></footer>
      </main></div></body></html>`;
  }

  function prepare(doc) {
    const sheet = doc.querySelector('.sheet'), frame = doc.querySelector('.frame');
    sheet.style.transform = 'none';
    const scale = Math.min(1, (7.7 * 96 - 4) / sheet.scrollHeight, (10.2 * 96 - 2) / sheet.scrollWidth);
    sheet.style.transform = `scale(${scale})`;
    frame.style.height = `${Math.ceil(sheet.scrollHeight * scale)}px`;
    const status = doc.querySelector('#fit-status');
    if (status) status.textContent = scale < .75 ? `All entries fit on one page at ${Math.round(scale * 100)}% size. A large roster will have small text.` : 'Landscape letter - all active people, regardless of roster filters.';
    return scale;
  }
  return { createReport, buildHtml, prepare };
});
