(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ProjectPrint = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const num = value => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 1 });
  const stamp = value => value ? new Date(value).toLocaleString("en-US", { timeZone: "America/Chicago", timeZoneName: "short" }) : "Unavailable";
  const shorten = (text, limit) => { text = String(text || ""); return text.length > limit ? text.slice(0, limit - 3) + "..." : text; };
  const sum = values => values.reduce((total, value) => total + value, 0);

  function scopeRow(member) {
    const counted = member.workOrders.filter(wo => wo.counted !== false);
    const departments = new Map();
    member.operations.forEach(op => departments.set(op.workCenter, (departments.get(op.workCenter) || 0) + op.hoursRemaining));
    const ranked = [...departments].filter(([, hours]) => hours > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const departmentText = ranked.slice(0, 3).map(([name, hours]) => `${name} ${num(hours)} h`);
    if (ranked.length > 3) departmentText.push(`${ranked.length - 3} other departments ${num(sum(ranked.slice(3).map(([, hours]) => hours)))} h`);
    const notes = [];
    if (member.inferredComplete) notes.push(`Inferred complete. Last seen ${stamp(member.lastSeenAt)}.`);
    if (member.overlapping) notes.push("Overlapping work counted elsewhere; figures show this row's contribution.");
    return `<tr><td><div class="item"><span class="tag">${member.type === "combo" ? "COMBO" : "WO"}</span><strong>${esc(member.identifier)}</strong></div><p class="description">${esc(shorten(member.description, 130))}</p><p class="breakdown">${esc(departmentText.join(" | ") || "No remaining department hours.")}</p>${notes.length ? `<p class="row-note">${esc(notes.join(" "))}</p>` : ""}</td><td>${counted.length}</td><td>${num(sum(counted.map(wo => wo.quantity)))}</td><td><strong>${num(member.remainingHours)} h</strong></td><td class="progress-value">${counted.length || member.operations.length ? `${num(member.progress)}%` : "-"}</td></tr>`;
  }

  function buildHtml(detail) {
    const p = detail.project, s = detail.summary;
    const pages = [];
    for (let i = 0; i < detail.members.length; i += 6) pages.push(detail.members.slice(i, i + 6));
    if (!pages.length) pages.push([]);
    const totalPages = pages.length + 1;
    const header = '<header><b>PRODUCTION SCHEDULER</b><span>PROJECT SUMMARY</span></header>';
    const footer = (page, label) => `<footer><span>${esc(shorten(p.name, 70))}</span><span>${label}</span><span>${page} / ${totalPages}</span></footer>`;
    const largest = [...detail.departments].sort((a, b) => b.hours - a.hours)[0];
    const max = Math.max(1, ...detail.departments.map(d => d.hours));
    const inferred = detail.members.filter(m => m.inferredComplete).length;
    const target = p.targetDate ? new Date(`${p.targetDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Not set";
    const metrics = [["HOURS REMAINING",num(s.remainingHours),"hours"],["WORK IN SCOPE",num(s.workOrderCount),"unique WOs"],["PRODUCTION QTY",num(s.quantity),"ordered units"],["PRODUCTION PROGRESS",`${num(s.progress)}%`,"operation quantities"]];
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(p.name)} - Project summary</title><style>
      @page { size: letter portrait; margin: .55in; }
      * { box-sizing: border-box; } body { margin: 0; color: #172940; font: 10pt Arial, sans-serif; background: white; }
      .page { min-height: 9.85in; display: flex; flex-direction: column; break-after: page; } .page:last-child { break-after: auto; }
      header { display: flex; justify-content: space-between; gap: 12pt; border-bottom: .6pt solid #dce3ec; padding-bottom: 13pt; margin-bottom: 22pt; font-size: 8pt; color: #607086; }
      header b,.section-number { color: #3267c8; } h1 { margin: 0 0 10pt; font-size: 27pt; overflow-wrap: anywhere; } h2 { font-size: 16pt; margin: 0 0 18pt; } p { line-height: 1.45; margin: 6pt 0; } .meta { color: #607086; font-size: 9pt; overflow-wrap: anywhere; }
      .cards { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 10pt; margin: 26pt 0 28pt; } .card { padding: 13pt 10pt; background: #f3f6fa; border: .5pt solid #dce3ec; border-radius: 5pt; } .card span { display: block; font-size: 6.7pt; font-weight: bold; color: #607086; } .card strong { display: block; font-size: 25pt; margin: 17pt 0 10pt; overflow-wrap: anywhere; } .card small { color: #607086; font-size: 8pt; }
      .section-number { margin-right: 12pt; font-size: 10pt; } .departments { display: grid; gap: 17pt; } .departments.many { grid-template-columns: 1fr 1fr; gap: 11pt 18pt; } .department { display: grid; grid-template-columns: 29% 1fr 40pt; gap: 10pt; align-items: center; font-size: 9pt; break-inside: avoid; } .many .department { grid-template-columns: 40% 1fr 35pt; font-size: 8pt; gap: 6pt; } .department strong { text-align: right; } .track { height: 6pt; background: #edf1f6; border-radius: 3pt; } .fill { height: 6pt; background: #3267c8; border-radius: 3pt; }
      .glance { margin-top: 30pt; } .glance p { color: #607086; } .method { font-size: 8pt; color: #607086; border-top: .6pt solid #dce3ec; padding-top: 12pt; margin-top: 22pt; } .warning { color: #805000; border-left: 2pt solid #b67a12; padding-left: 8pt; font-size: 9pt; }
      footer { margin-top: auto; padding-top: 12pt; border-top: .6pt solid #dce3ec; display: flex; justify-content: space-between; gap: 16pt; color: #607086; font-size: 7pt; } footer span:first-child { flex: 1; } .footer-space { height: 20pt; }
      table { width: 100%; table-layout: fixed; border-collapse: collapse; margin-top: 16pt; font-size: 9pt; } th { text-align: left; font-size: 7pt; padding: 10pt 6pt; color: white; background: #172940; } th:first-child { width: 53%; } th:nth-child(2) { width: 7%; } th:nth-child(3) { width: 14%; } th:nth-child(4) { width: 14%; } th:last-child { width: 12%; }
      td { vertical-align: top; padding: 14pt 6pt; border-bottom: .6pt solid #dce3ec; overflow-wrap: anywhere; } td:not(:first-child) { white-space: nowrap; } tbody tr:nth-child(odd) { background: #f3f6fa; } tr { break-inside: avoid; } thead { display: table-header-group; } .item { display: flex; gap: 10pt; align-items: baseline; } .tag { font-size: 7pt; color: #3267c8; } .description { font-size: 8.5pt; } .breakdown,.row-note { color: #607086; font-size: 7.5pt; line-height: 1.4; } .row-note { color: #805000; } .progress-value { color: #1c7b6b; font-weight: bold; } .total td { color: white; background: #172940; font-size: 8pt; font-weight: bold; padding: 10pt 6pt; } .notes { color: #607086; font-size: 8pt; margin-top: 14pt; }
      .scope:has(tbody:first-of-type > tr:nth-child(5)) td { padding: 6pt; }
      @media screen { body { background: #e8edf3; padding: 24px; } .page { width: 8.5in; min-height: 11in; margin: 0 auto 24px; padding: .55in; background: white; box-shadow: 0 2px 12px #0002; } }
      @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
    </style></head><body><section class="page overview">${header}<h1>${esc(p.name)}</h1><p class="meta">Customer: ${esc(p.customer || "Not specified")} | Target: ${esc(target)}${p.archived ? " | Archived" : ""}</p><p class="meta">Source: ${esc(detail.source?.originalName || "Unavailable")}<br>Updated ${esc(stamp(detail.source?.uploadedAt))} | Printed ${esc(stamp(new Date().toISOString()))}</p>
      ${detail.warning ? `<p class="warning">${esc(detail.warning)}</p>` : ""}<div class="cards">${metrics.map(([label,value,note]) => `<div class="card"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join("")}</div>
      <h2><span class="section-number">01</span>Remaining hours by department</h2><div class="departments${detail.departments.length > 8 ? " many" : ""}">${detail.departments.map(d => `<div class="department"><span>${esc(d.name)}</span><div class="track"><div class="fill" style="width:${Math.max(0, Math.min(100, d.hours / max * 100))}%"></div></div><strong>${num(d.hours)} h</strong></div>`).join("") || '<p class="meta">No department hours in scope.</p>'}</div>
      <div class="glance"><h2><span class="section-number">02</span>Project at a glance</h2><p><b>${s.comboCount} ${s.comboCount === 1 ? "combo" : "combos"} + ${s.individualCount} standalone ${s.individualCount === 1 ? "work order" : "work orders"}</b></p>${largest?.hours > 0 ? `<p>${esc(largest.name)} holds the largest share of remaining work: ${num(largest.hours)} hours (${num(Math.round(largest.hours / s.remainingHours * 100))}%).</p>` : ""}<p>${detail.warning ? "Source data is unavailable; figures reflect last-known records." : inferred ? `${inferred} scope ${inferred === 1 ? "item is" : "items are"} marked inferred complete from absence in the latest upload.` : detail.members.length ? "All scope items have current source data." : "No work has been added to this project."}</p></div>
      <p class="method">Production progress reflects operation quantities, not hours completed. Project totals count each WO and included operation once.</p><div class="footer-space"></div>${footer(1,"PROJECT OVERVIEW")}</section>
      ${pages.map((members,i) => `<section class="page scope">${header}<h1>Project scope${i ? " (continued)" : ""}</h1><p class="meta">One summary row per combo or standalone work order.<br>Combo member WOs remain included in totals without individual listings.</p><table><thead><tr><th>SCOPE ITEM</th><th>WOs</th><th>QUANTITY</th><th>HOURS LEFT</th><th>PROGRESS</th></tr></thead><tbody>${members.map(scopeRow).join("") || '<tr><td colspan="5">No work added yet.</td></tr>'}</tbody>${i === pages.length-1 ? `<tbody class="total"><tr><td>PROJECT TOTAL</td><td>${s.workOrderCount}</td><td>${num(s.quantity)}</td><td>${num(s.remainingHours)} h</td><td>${num(s.progress)}%</td></tr></tbody>` : ""}</table>${i === pages.length-1 ? '<div class="notes"><p><b>Progress:</b> Project progress averages included operations; it is not a simple average of scope-row percentages.</p><p><b>Completion labels:</b> Inferred complete means absent from an accepted upload. Last-known quantities are retained; returning work resumes live values.</p><p>Descriptions are shortened for this summary. Department breakdowns show the three largest departments, with remaining hours grouped as other departments. Full details remain in the dashboard.</p></div>' : '<p class="notes">Scope continues on the next page. Project totals appear on the final page.</p>'}<div class="footer-space"></div>${footer(i+2,"SCOPE SUMMARY")}</section>`).join("")}</body></html>`;
  }
  // Measure at the report's letter-paper screen width before opening print.
  // Move whole rows when long IDs, department names or completion notes need
  // more room than the initial six-row estimate. Never truncate scope members.
  function prepare(doc) {
    const pageLimit = 11 * 96 + 1;
    const overview = doc.querySelector('.overview');
    if (overview && overview.getBoundingClientRect().height > pageLimit) {
      overview.style.fontSize = '8pt';
      overview.querySelectorAll('.departments').forEach(el => { el.style.gap = '6pt 12pt'; });
      overview.querySelectorAll('.cards, .glance').forEach(el => { el.style.marginTop = '12pt'; el.style.marginBottom = '12pt'; });
    }
    let page = doc.querySelector('.scope');
    while (page) {
      const rows = page.querySelector('tbody');
      while (page.getBoundingClientRect().height > pageLimit && rows.children.length > 1) {
        let next = page.nextElementSibling;
        if (!next || !next.classList.contains('scope')) {
          next = page.cloneNode(true);
          next.querySelector('tbody').replaceChildren();
          next.querySelector('h1').textContent = 'Project scope (continued)';
          page.after(next);
        }
        // Totals and explanatory notes belong to the final scope page only.
        if (page.querySelector('.total')) {
          page.querySelector('.total').remove();
          page.querySelector('.notes')?.remove();
        }
        next.querySelector('tbody').prepend(rows.lastElementChild);
      }
      page = page.nextElementSibling;
    }
    const pages = [...doc.querySelectorAll('.page')];
    pages.forEach((el, index) => { el.querySelector('footer span:last-child').textContent = `${index + 1} / ${pages.length}`; });
  }
  return { buildHtml, prepare };
});
