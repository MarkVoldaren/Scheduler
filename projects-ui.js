/* Projects is deliberately independent of scheduler filters and local storage. */
(function () {
  "use strict";
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const number = value => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 1 });
  const date = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "No target date";
  const timestamp = value => value ? new Date(value).toLocaleString("en-US", { timeZone: "America/Chicago", timeZoneName: "short" }) : "No upload";
  const button = (action, label, primary = false) => `<button type="button" class="button button-${primary ? "primary" : "secondary"}" data-project-action="${action}">${label}</button>`;

  function operationTable(operations) {
    return `<div class="project-table-wrap"><table class="project-table"><thead><tr><th>Operation</th><th>Department</th><th>Status</th><th>Quantity complete</th><th>Progress</th><th>Hours left</th></tr></thead><tbody>${operations.map(op => `<tr><td>Op ${esc(op.sequence)} · ${esc(op.operationName)}</td><td>${esc(op.workCenter)}</td><td>${esc(op.status)}</td><td>${number(op.completedQuantity)} / ${number(op.totalQuantity)}</td><td>${number(op.progressPercent)}%</td><td>${number(op.hoursRemaining)}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function memberContent(member, print = false) {
    return `${member.inferredComplete ? `<p class="project-notice">Completed — absent from latest upload. Last seen ${esc(timestamp(member.lastSeenAt))}. Quantities below are last reported values.</p>` : ""}
      ${member.overlapping ? '<p class="project-notice">Overlapping WOs are counted once in project totals. WOs counted elsewhere are identified below.</p>' : ""}
      ${member.type === "combo" && member.operations.length ? `<h4>Combo operations — counted once</h4>${operationTable(member.operations)}` : ""}
      ${member.workOrders.map(wo => `<${print ? "section" : "details"} class="project-wo">${print ? "<h4>" : "<summary>"}<strong>${esc(wo.identifier)}</strong> · ${esc(wo.part)} · ${number(wo.quantity)} units ${!wo.counted ? '<span class="project-tag">Counted elsewhere</span>' : ""}${print ? "</h4>" : "</summary>"}<p>${esc(wo.description)}</p>${operationTable(wo.operations)}</${print ? "section" : "details"}>`).join("")}`;
  }

  function cards(detail) {
    const s = detail.summary;
    return `<div class="project-cards">${[
      ["Hours remaining", `${number(s.remainingHours)} <small>hrs</small>`, "Across project scope"],
      ["Work in scope", `${number(s.workOrderCount)} <small>WOs</small>`, `${s.comboCount} combos · ${s.individualCount} individual WOs`],
      ["Production quantity", number(s.quantity), "Total ordered units · unique WOs"],
      ["Production progress", `${number(s.progress)}%`, "Average operation quantity progress"],
    ].map(([label, value, note]) => `<div class="project-card"><span>${label}</span><strong>${value}</strong><small>${esc(note)}</small></div>`).join("")}</div>`;
  }

  function departments(detail) {
    const max = Math.max(1, ...detail.departments.map(department => department.hours));
    return `<section class="project-panel"><div class="project-heading"><h3>Hours remaining by department</h3><span>${number(detail.summary.remainingHours)} hrs total</span></div><div class="project-departments">${detail.departments.map(department => `<div><div class="project-heading"><span>${esc(department.name)}</span><strong>${number(department.hours)} h</strong></div><progress max="${max}" value="${Math.max(0, department.hours)}" aria-label="${esc(department.name)} remaining hours"></progress></div>`).join("") || '<p class="project-muted">Add work to see department hours.</p>'}</div></section>`;
  }

  const printHtml = detail => globalThis.ProjectPrint.buildHtml(detail);

  function trendChart(detail) {
    const { readings = [], events = [] } = detail.trend || {};
    const title = '<h3>Remaining operations</h3>';
    if (!readings.length) return `<section class="project-panel">${title}<p class="project-muted">${detail.members.length ? "Waiting for valid Work Center data to start tracking." : "Add work to start tracking."}</p></section>`;
    const latest = readings[readings.length - 1];
    const time = value => Date.parse(`${value}T12:00:00Z`);
    const start = time(readings[0].date), end = Math.max(time(latest.date), ...events.map(event => time(event.date)));
    const x = value => end === start ? 390 : 55 + (time(value) - start) / (end - start) * 670;
    const max = Math.max(1, ...readings.map(point => point.remainingOperations));
    const y = count => 205 - count / max * 165;
    const label = point => `${point.date}: ${point.remainingOperations} remaining operations. ${point.type === "baseline" ? "Baseline" : "Daily upload"}. Captured ${timestamp(point.capturedAt)}. Source ${timestamp(point.sourceUploadedAt)}.`;
    const ticks = [...new Set([0, Math.round(max / 2), max])];
    return `<section class="project-panel project-trend">${title}<p><strong>${number(latest.remainingOperations)} operations</strong> · Last recorded ${esc(latest.date)}</p>
      <svg class="project-trend-chart" viewBox="0 0 780 255" role="img" aria-label="Remaining operations over the project lifetime. Full readings are available in the history table below.">
      ${ticks.map(count => `<line class="trend-grid" x1="55" x2="725" y1="${y(count)}" y2="${y(count)}"/><text x="45" y="${y(count) + 4}" text-anchor="end">${count}</text>`).join("")}
      ${events.filter(event => time(event.date) >= start).map(event => `<line class="trend-event" x1="${x(event.date)}" x2="${x(event.date)}" y1="25" y2="205"><title>${esc(event.date + ": " + event.description)}</title></line>`).join("")}
      <polyline class="trend-line" points="${readings.map(point => `${x(point.date)},${y(point.remainingOperations)}`).join(" ")}"/>
      ${readings.map(point => `<circle class="trend-point" cx="${x(point.date)}" cy="${y(point.remainingOperations)}" r="5" tabindex="0" role="img" aria-label="${esc(label(point))}"><title>${esc(label(point))}</title></circle>`).join("")}
      <text x="55" y="238">${esc(readings[0].date)}</text>${end !== start ? `<text x="725" y="238" text-anchor="end">${esc(new Date(end).toISOString().slice(0,10))}</text>` : ""}</svg>
      <p class="project-muted">First accepted Work Center upload each day · Central time. Baselines mark the start of tracking. Counts may differ from live metrics after later uploads or edits. Dashed markers show scope changes; added work can increase the count. Days without uploads have no reading.</p>
      <details><summary>View trend history and scope changes</summary><div class="project-table-wrap"><table class="project-table"><thead><tr><th>Date</th><th>Operations remaining</th><th>Reading</th><th>Captured</th><th>Source upload</th></tr></thead><tbody>${readings.map(point => `<tr><td>${esc(point.date)}</td><td>${point.remainingOperations}</td><td>${point.type === "baseline" ? "Baseline" : "Daily upload"}</td><td>${esc(timestamp(point.capturedAt))}</td><td>${esc(timestamp(point.sourceUploadedAt))}</td></tr>`).join("")}</tbody></table></div><h4>Scope changes</h4>${events.map(event => `<p class="project-trend-event"><strong>${esc(timestamp(event.occurredAt))}</strong> · ${esc(event.description)}</p>`).join("") || '<p class="project-muted">No scope changes recorded.</p>'}</details></section>`;
  }

  globalThis.createProjectsUI = function ({ root, request, download, isActive }) {
    let projects = [], selectedId = null, detail = null, archived = false;
    let mode = "", candidateList = [], selectedMembers = new Set(), search = "", error = "", notice = "";
    let busy = false, generation = 0;
    const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const key = member => `${member.type}:${member.identifier}`;
    function status() {
      const target = root.querySelector(".project-status");
      if (target) { target.textContent = error || notice; target.classList.toggle("is-error", Boolean(error)); }
    }
    function render() {
      const expanded = new Set([...root.querySelectorAll("details[open][data-member-id]")].map(node => node.dataset.memberId));
      const visible = projects.filter(project => project.archived === archived);
      root.innerHTML = `<header class="project-heading project-title"><div><p class="panel-kicker">Production Scheduler</p><h1>Projects</h1><p class="project-muted">Group production work. See the full scope.</p></div>${button("create", "+ Create Project", true)}</header>
        <div class="project-toolbar"><label>Select project<select data-project-select aria-label="Select project"><option value="">${visible.length ? "Select a project" : archived ? "No archived projects" : "No projects yet"}</option>${visible.map(project => `<option value="${project.id}"${project.id === selectedId ? " selected" : ""}>${esc(project.name)}</option>`).join("")}</select></label><label class="project-checkbox"><input type="checkbox" data-project-archived${archived ? " checked" : ""}> Archived projects</label>${button("refresh", "Refresh")}</div>
        <p class="project-status" role="status" aria-live="polite"></p><div class="project-editor"></div><div class="project-dashboard"></div>`;
      status();
      renderEditor();
      const dashboard = root.querySelector(".project-dashboard");
      if (!detail) {
        dashboard.innerHTML = '<section class="project-panel project-empty">Create or select a project to start tracking production work.</section>';
        return;
      }
      const project = detail.project;
      dashboard.innerHTML = `<div class="project-heading"><div><h2>${esc(project.name)}${project.archived ? ' <span class="project-tag">Archived</span>' : ""}</h2><p class="project-muted">${esc(project.customer || "No customer specified")} · Target ${esc(date(project.targetDate))}</p></div><div class="project-actions">${button("edit", "Edit details")}${button("archive", project.archived ? "Restore" : "Archive")}${button("print", "Print Project")}${button("download", "Download CSV")}</div></div>
        ${trendChart(detail)}
        ${project.notes ? `<section class="project-panel"><h3>Project notes</h3><div class="project-notes-text">${esc(project.notes)}</div></section>` : ""}
        <p class="project-source">${esc(detail.source?.originalName || "No work-center source")} · Uploaded ${esc(timestamp(detail.source?.uploadedAt))}</p>
        ${detail.warning ? `<p class="project-notice" role="status">${esc(detail.warning)}</p>` : ""}${cards(detail)}${departments(detail)}
        <section class="project-panel"><div class="project-heading"><h3>Project scope</h3>${!project.archived ? button("add", "+ Add WOs &amp; Combos") : ""}</div>
        ${detail.members.map(member => `<div class="project-scope-row"><details data-member-id="${member.id}"${expanded.has(String(member.id)) ? " open" : ""}><summary><span class="project-tag">${member.type === "combo" ? "COMBO" : "WO"}</span> <strong>${esc(member.identifier)}</strong><span class="project-description">${esc(member.description)}</span><span class="project-row-metric">${member.workOrders.length} WOs · <strong>${number(member.remainingHours)} h</strong>${member.inferredComplete ? ' <span class="project-tag">Inferred complete</span>' : ""}</span></summary>${memberContent(member)}</details>${!project.archived ? `<button class="project-remove" type="button" data-remove-member="${member.id}" aria-label="Remove ${esc(member.identifier)} from project">Remove</button>` : ""}</div>`).join("") || '<p class="project-empty">No work added yet. Add combos and standalone work orders to define this project.</p>'}
        <p class="project-muted project-footnote">Combo operations and overlapping WOs are counted once in project totals. Progress uses operation quantities, not elapsed hours.</p></section>`;
    }
    function renderEditor() {
      const editor = root.querySelector(".project-editor");
      if (mode === "create" || mode === "edit") {
        const project = mode === "edit" ? detail.project : {};
        editor.innerHTML = `<form class="project-panel project-form" data-project-form><h3>${mode === "create" ? "Create project" : "Edit project"}</h3><div class="project-fields"><label>Project name<input name="name" required maxlength="200" value="${esc(project.name || "")}" placeholder="e.g. Bush Hog — Fall launch"></label><label>Customer<input name="customer" maxlength="200" value="${esc(project.customer || "")}" placeholder="Customer name"></label><label>Target date<input type="date" name="targetDate" value="${esc(project.targetDate || "")}"></label></div><div class="project-heading"><span class="project-muted">${mode === "create" ? "Add combos and individual WOs after creating." : "Changes are shared with all viewers."}</span><div class="project-actions">${button("cancel", "Cancel")}<button type="submit" class="button button-primary">${mode === "create" ? "Create project" : "Save changes"}</button></div></div></form>`;
        const label = document.createElement("label");
        label.className = "project-notes-editor";
        label.innerHTML = `Project notes<textarea name="notes" maxlength="5000" rows="5" placeholder="Add project instructions, updates, or reminders…">${esc(project.notes || "")}</textarea><small class="project-muted">Optional · Up to 5,000 characters</small>`;
        editor.querySelector(".project-fields").after(label);
      } else if (mode === "picker") {
        editor.innerHTML = `<section class="project-panel"><h3>Add WOs &amp; Combos</h3><label>Search production work<input type="search" data-project-search placeholder="WO, combo, customer, part, description…" value="${esc(search)}"></label><p class="project-muted">Select whole combos or standalone WOs. Combo membership follows the latest upload.</p><div class="project-candidates"></div><div class="project-heading"><span data-project-selection-count></span><div class="project-actions">${button("cancel", "Cancel")}${button("save-members", "Add selected work", true)}</div></div></section>`;
        renderCandidates();
      } else editor.innerHTML = "";
    }
    function renderCandidates() {
      const existing = new Set(detail.members.map(key));
      const matches = candidateList.filter(member => `${member.identifier} ${member.description} ${member.workOrders.join(" ")}`.toLowerCase().includes(search.toLowerCase()));
      root.querySelector(".project-candidates").innerHTML = matches.map(member => `<label class="project-candidate"><input type="checkbox" data-candidate="${esc(key(member))}"${selectedMembers.has(key(member)) ? " checked" : ""}${existing.has(key(member)) ? " disabled" : ""}><span><strong>${member.type === "combo" ? "Combo" : "WO"} ${esc(member.identifier)}</strong> · ${member.workOrders.length} WOs ${existing.has(key(member)) ? " · Already added" : ""}<small>${esc(member.description)}</small></span></label>`).join("") || '<p class="project-empty">No matching production work.</p>';
      root.querySelector("[data-project-selection-count]").textContent = `${selectedMembers.size} selected`;
    }
    async function refresh() {
      if (!isActive()) return;
      if (mode || busy) { notice = "Finish or cancel editing to refresh shared project data."; status(); return; }
      const token = ++generation;
      notice = "Loading shared projects…"; error = ""; status();
      try {
        const result = await request("/api/projects");
        if (token !== generation) return;
        const visible = result.projects.filter(project => project.archived === archived);
        const nextId = visible.some(project => project.id === selectedId) ? selectedId : visible[0]?.id || null;
        const next = nextId ? await request(`/api/projects/${nextId}`) : null;
        if (token !== generation || mode) return;
        projects = result.projects; selectedId = nextId; detail = next; notice = "";
        render();
      } catch (err) {
        if (token !== generation) return;
        error = err.message; notice = ""; status();
      }
    }
    async function perform(action) {
      if (busy) return;
      busy = true; ++generation; error = ""; notice = "Saving…"; status();
      const controls = [...root.querySelectorAll("button, select, input, textarea")].filter(node => !node.disabled);
      controls.forEach(node => { node.disabled = true; });
      try { await action(); }
      catch (err) { error = err.message; notice = ""; status(); }
      finally { busy = false; controls.forEach(node => { if (node.isConnected) node.disabled = false; }); }
    }
    async function saved(result) {
      detail = result; selectedId = result.project.id; archived = result.project.archived;
      mode = ""; selectedMembers.clear(); notice = "Saved. Changes are shared with all viewers.";
      // Update locally first so a failed list refresh cannot leave a successful
      // mutation looking unsaved and invite an accidental duplicate creation.
      projects = projects.filter(project => project.id !== result.project.id).concat(result.project).sort((a, b) => a.name.localeCompare(b.name));
      render();
    }
    function leaveEditor() {
      if (mode && !window.confirm("Discard the open project form or selection?")) return false;
      mode = ""; selectedMembers.clear(); ++generation;
      return true;
    }
    root.addEventListener("submit", event => {
      if (!event.target.matches("[data-project-form]")) return;
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.target));
      const creating = mode === "create";
      const url = creating ? "/api/projects" : `/api/projects/${selectedId}`;
      perform(async () => saved(await request(url, json(creating ? "POST" : "PUT", { ...values, revision: detail?.project.revision }))));
    });
    root.addEventListener("input", event => {
      if (event.target.matches("[data-project-search]")) { search = event.target.value; renderCandidates(); }
    });
    root.addEventListener("change", event => {
      const target = event.target;
      if (target.matches("[data-candidate]")) {
        if (target.checked) selectedMembers.add(target.dataset.candidate); else selectedMembers.delete(target.dataset.candidate);
        root.querySelector("[data-project-selection-count]").textContent = `${selectedMembers.size} selected`;
      } else if (target.matches("[data-project-select]")) {
        if (!leaveEditor()) { target.value = selectedId || ""; return; }
        selectedId = Number(target.value) || null; detail = null; render(); refresh();
      } else if (target.matches("[data-project-archived]")) {
        if (!leaveEditor()) { target.checked = archived; return; }
        archived = target.checked; selectedId = null; detail = null; render(); refresh();
      }
    });
    root.addEventListener("click", event => {
      const target = event.target.closest("[data-project-action], [data-remove-member]");
      if (!target || busy) return;
      const action = target.dataset.projectAction;
      if (action === "download" && detail) {
        busy = true; error = ""; notice = "Preparing CSV…"; status();
        download(`/api/projects/${selectedId}/export.csv`).then(() => { notice = "CSV downloaded."; status(); }).catch(err => { error = err.message; notice = ""; status(); }).finally(() => { busy = false; });
        return;
      }
      if (action === "print" && detail) {
        const popup = window.open("", "_blank");
        if (!popup) { error = "Allow popups to print this project."; status(); return; }
        popup.document.write(printHtml(detail)); popup.document.close(); popup.focus();
        popup.setTimeout(() => { globalThis.ProjectPrint.prepare(popup.document); popup.print(); }, 250); return;
      }
      if (action === "refresh") { if (leaveEditor()) refresh(); return; }
      if (action === "cancel") { mode = ""; selectedMembers.clear(); render(); refresh(); return; }
      if (action === "create" || action === "edit") {
        if (!leaveEditor()) return;
        mode = action; error = ""; notice = ""; render(); root.querySelector('[name="name"]').focus(); return;
      }
      if (action === "add") {
        if (!leaveEditor()) return;
        perform(async () => {
          candidateList = (await request("/api/projects/candidates")).candidates;
          mode = "picker"; search = ""; notice = ""; render(); root.querySelector("[data-project-search]").focus();
        }); return;
      }
      if (action === "save-members") {
        if (!selectedMembers.size) { error = "Select at least one WO or combo."; status(); return; }
        const members = candidateList.filter(member => selectedMembers.has(key(member))).map(({ type, identifier }) => ({ type, identifier }));
        perform(async () => saved(await request(`/api/projects/${selectedId}/members`, json("POST", { revision: detail.project.revision, members }))));
        return;
      }
      if (mode && !leaveEditor()) return;
      if (action === "archive") {
        perform(async () => saved(await request(`/api/projects/${selectedId}/archive`, json("PUT", { revision: detail.project.revision, archived: !detail.project.archived }))));
      } else if (target.dataset.removeMember) {
        perform(async () => saved(await request(`/api/projects/${selectedId}/members/${target.dataset.removeMember}`, json("DELETE", { revision: detail.project.revision }))));
      }
    });
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
    render();
    return { refresh, clear() { ++generation; mode = ""; selectedId = null; detail = null; projects = []; selectedMembers.clear(); error = ""; notice = ""; render(); } };
  };
})();
