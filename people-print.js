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
      @page { size: letter portrait; margin: .5in; }
      * { box-sizing: border-box; } body { margin: 0; background: #edf1f5; color: #142a43; font: 8.4pt 'Segoe UI', Arial, sans-serif; }
      .toolbar { padding: 12px; text-align: center; font: 14px Arial,sans-serif; } .toolbar button { padding: 9px 16px; margin-right: 12px; cursor: pointer; }
      .frame { width: 7.5in; margin: 12px auto; background: white; overflow: hidden; }
      .sheet { width: 7.5in; transform-origin: top left; padding: 0; background: white; }
      header { display: flex; justify-content: space-between; border-top: 6pt solid #142a43; padding: 10pt 0; font-size: 8pt; font-weight: bold; }
      h1 { margin: 0 0 5pt; font-size: 24pt; } .subtitle { color: #65758a; margin: 0 0 10pt; font-size: 8pt; }
      .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10pt; margin-bottom: 8pt; }
      .metric { background: #f3f6fa; padding: 6pt 10pt; } .metric b { display: block; font-size: 15pt; } .metric span { font-size: 7pt; font-weight: bold; color: #65758a; }
      .column-headings { display: grid; grid-template-columns: 31% 69%; background: #142a43; color: white; padding: 7pt 6pt; font-size: 7.4pt; font-weight: bold; }
      .flow-heading, .shop-total { display: flex; align-items: baseline; gap: 8pt; padding: 5pt 6pt; }
      .flow-heading { background: #f3f6fa; border-left: 3pt solid var(--flow); }
      .flow-heading h2 { font-size: 10pt; margin: 0; flex: 1; overflow-wrap: anywhere; }
      .count { font-size: 8pt; color: #65758a; } .flow-totals { margin-left: auto; display: flex; gap: 16pt; white-space: nowrap; }
      .flow-totals b { min-width: 60pt; text-align: right; }
      .flow-body { display: grid; grid-template-columns: 29% 1fr 1fr; gap: 16pt; padding: 5pt 6pt 6pt; border-bottom: .5pt solid #dce3eb; }
      .pair { display: flex; justify-content: space-between; align-items: baseline; gap: 6pt; line-height: 1.35; }
      .pair span { overflow-wrap: anywhere; min-width: 0; } .pair b { flex-shrink: 0; font-variant-numeric: tabular-nums; } .zero, .muted { color: #65758a; }
      .shop-total { background: #142a43; color: white; padding: 8pt 6pt; } .shop-total > b { flex: 1; }
      .notes { margin: 8pt 0 0; font-size: 7pt; line-height: 1.4; color: #65758a; }
      footer { display: flex; justify-content: space-between; border-top: .5pt solid #dce3eb; margin-top: 8pt; padding-top: 6pt; font-size: 7pt; color: #65758a; }
      @media print { body { background: white; } .toolbar { display: none; } .frame { margin: 0 auto; } * { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
    </style></head><body><div class="toolbar"><button id="print-report">Print / Save PDF</button><span id="fit-status">Portrait letter - all active people, regardless of roster filters. Turn off browser headers and footers.</span></div><div class="frame"><main class="sheet">
      <header><span>SCHEDULER / PEOPLE</span><span>WEEKLY LABOR ALLOCATION</span></header>
      <h1>Weekly people &amp; manning</h1><p class="subtitle">${esc(report.week)} | Recurring weekly schedule | 40 weekly hours = 1.00 manning</p>
      <div class="metrics"><div class="metric"><b>${report.count}</b><span>UNIQUE PEOPLE</span></div><div class="metric"><b>${num(report.hours)}</b><span>WEEKLY HOURS</span></div><div class="metric"><b>${num(report.hours / 40)}</b><span>TOTAL MANNING</span></div></div>
      <div class="column-headings"><span>DEPARTMENT / MANNING</span><span>PEOPLE / MANNING IN FLOW</span></div>
      ${report.groups.map(group => {
        const split = Math.ceil(group.people.length / 2);
        const columns = [group.people.slice(0, split), group.people.slice(split)];
        return `<section style="--flow:${group.color}"><div class="flow-heading"><h2>${esc(group.name)}</h2><span class="count">${group.people.length} ${group.people.length === 1 ? 'person' : 'people'}</span><div class="flow-totals"><span>${num(group.hours)} hrs</span><b>${num(group.hours / 40)} mng</b></div></div><div class="flow-body"><div>${group.departments.map(d => `<div class="pair${d.hours === 0 ? ' zero' : ''}"><span>${esc(d.name)}${d.unavailable ? '*' : ''}</span><b>${num(d.hours / 40)}</b></div>`).join('') || '<span class="muted">No departments assigned</span>'}</div>${columns.map((people, index) => `<div class="people-column">${people.map(p => `<div class="pair"><span>${esc(p.name)}</span><b>${num(p.units / 1000000 / 40)}</b></div>`).join('') || (index === 0 ? '<span class="muted">No people assigned</span>' : '')}</div>`).join('')}</div></section>`;
      }).join('')}
      <div class="shop-total"><b>SHOP TOTAL</b><span>${report.count} unique people</span><div class="flow-totals"><span>${num(report.hours)} hrs</span><b>${num(report.hours / 40)} mng</b></div></div>
      <p class="notes">People may appear in multiple flows; only their allocated hours count in each flow. Shop totals do not double-count labor.<br>Department and person figures are weekly manning. Values are rounded; totals use unrounded allocations. Zero coverage is shown.${report.unavailable ? '<br>*Department unavailable in the current schedule; saved allocations are included.' : ''}</p>
      <footer><span>Generated ${esc(report.generated)} | Active saved roster</span><span>1 / 1</span></footer>
      </main></div></body></html>`;
  }

  function prepare(doc) {
    const sheet = doc.querySelector('.sheet'), frame = doc.querySelector('.frame');
    sheet.style.transform = 'none';
    const scale = Math.min(1, (10 * 96 - 4) / sheet.scrollHeight, (7.5 * 96 - 2) / sheet.scrollWidth);
    sheet.style.transform = `scale(${scale})`;
    frame.style.width = `${Math.ceil(sheet.scrollWidth * scale)}px`;
    frame.style.height = `${Math.ceil(sheet.scrollHeight * scale)}px`;
    const status = doc.querySelector('#fit-status');
    if (status) status.textContent = scale < .75 ? `All entries fit on one page at ${Math.round(scale * 100)}% size. A large roster will have small text.` : 'Portrait letter - all active people, regardless of roster filters. Turn off browser headers and footers.';
    return scale;
  }
  return { createReport, buildHtml, prepare };
});
