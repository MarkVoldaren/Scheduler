import { escapeHtml, formatHours } from "./domain.js";

export function createRefs() {
  return {
    csvInput: document.querySelector("#csv-input"),
    searchInput: document.querySelector("#search-input"),
    emptyStateTemplate: document.querySelector("#empty-state-template"),
    themeToggle: document.querySelector("#theme-toggle"),
    sourcePill: document.querySelector("#source-pill"),
    viewCapacity: document.querySelector("#view-capacity"),
    viewSequencers: document.querySelector("#view-sequencers"),
    pageCapacity: document.querySelector("#page-capacity"),
    pageSequencers: document.querySelector("#page-sequencers"),
    capacityGrid: document.querySelector("#capacity-grid"),
    sequencersGrid: document.querySelector("#sequencers-grid"),
    sequencerCenterSelect: document.querySelector("#sequencer-center-select"),
    sequencerIncludeIncoming: document.querySelector("#sequencer-include-incoming"),
    sequencerPartialsOnly: document.querySelector("#sequencer-partials-only"),
    sequencerTopStats: document.querySelector("#sequencer-top-stats"),
    sidebarToggle: document.querySelector("#sidebar-toggle"),
    mobileSidebarToggle: document.querySelector("#mobile-sidebar-toggle"),
    sidebarScrim: document.querySelector("#sidebar-scrim"),
  };
}

export function renderSharedChrome(refs, state) {
  refs.sourcePill.textContent = state.sourceName;

  const views = [
    { id: "capacity", button: refs.viewCapacity, page: refs.pageCapacity },
    { id: "sequencers", button: refs.viewSequencers, page: refs.pageSequencers },
  ];

  views.forEach(({ id, button, page }) => {
    const active = state.currentView === id;
    page.classList.toggle("is-active", active);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

export function renderScheduler(refs, viewModel) {
  renderSchedulerControls(refs, viewModel);
  refs.sequencerTopStats.innerHTML = createSchedulerTopStats(viewModel.stats);

  if (!viewModel.rows.length) {
    refs.sequencersGrid.replaceChildren(
      createFragment(
        createEmptyCard(
          viewModel.centerLabel,
          viewModel.badgeLabel,
          viewModel.emptyMessage || "No queued work is currently routed into this department."
        )
      )
    );
    return;
  }

  refs.sequencersGrid.replaceChildren(createFragment(createSchedulerCard(viewModel)));
}

export function renderCapacity(refs, viewModel) {
  if (!viewModel.cards.length) {
    refs.capacityGrid.innerHTML = createEmptyState(viewModel.emptyMessage || "Choose a CSV to load capacity.");
    return;
  }

  const markup = viewModel.cards
    .map(
      (card) => `
        <article class="capacity-card">
          <div class="capacity-card-head">
            <div>
              <h3 class="capacity-center-name">${escapeHtml(card.center)}</h3>
            </div>
            <span class="capacity-badge">${card.activeJobCount} jobs</span>
          </div>
          <div class="capacity-card-body">
            <div class="control-field">
              <label for="capacity-${slugify(card.center)}">Daily capacity (hours)</label>
              <div class="capacity-input-row">
                <input
                  id="capacity-${slugify(card.center)}"
                  type="number"
                  min="0"
                  step="0.5"
                  value="${escapeHtml(String(card.capacity))}"
                  data-center="${escapeHtml(card.center)}"
                />
                <button class="button button-secondary" type="button" disabled>hrs/day</button>
              </div>
            </div>
            <div class="capacity-stats">
              <div class="capacity-stat">
                <span class="capacity-stat-label">Current Hours</span>
                <span class="capacity-stat-value">${formatHours(card.currentHours)} hrs</span>
              </div>
              <div class="capacity-stat">
                <span class="capacity-stat-label">Incoming Hours</span>
                <span class="capacity-stat-value">${formatHours(card.incomingHours)} hrs</span>
              </div>
              <div class="capacity-stat">
                <span class="capacity-stat-label">Total Load</span>
                <span class="capacity-stat-value">${formatHours(card.queueHours)} hrs</span>
              </div>
              <div class="capacity-stat">
                <span class="capacity-stat-label">Load</span>
                <span class="capacity-stat-value">${card.capacity > 0 ? formatHours(card.days) : "0"} days</span>
              </div>
            </div>
            <p class="capacity-hint">Used by the department sequencer to roll queued work into day-based capacity buckets.</p>
          </div>
        </article>
      `
    )
    .join("");

  refs.capacityGrid.replaceChildren(createFragment(markup));
}

export function renderError(refs, message) {
  refs.sourcePill.textContent = "No source loaded";
  refs.sequencerCenterSelect.innerHTML = "";
  refs.sequencerTopStats.innerHTML = "";
  refs.sequencersGrid.innerHTML = createEmptyCard("Scheduler", "Master list", message);
  refs.capacityGrid.innerHTML = createEmptyState(message);
}

export function setTheme(refs, theme) {
  document.body.dataset.theme = theme;
  refs.themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
  refs.themeToggle.setAttribute("title", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
}

export function applySidebarState(sidebarState) {
  document.body.dataset.sidebar = sidebarState;
  document.body.dataset.sidebarMobile = "closed";
}

export function openMobileSidebar(refs) {
  document.body.dataset.sidebarMobile = "open";
  refs.sidebarScrim.hidden = false;
}

export function closeMobileSidebar(refs) {
  document.body.dataset.sidebarMobile = "closed";
  refs.sidebarScrim.hidden = true;
}

function renderSchedulerControls(refs, viewModel) {
  refs.sequencerCenterSelect.innerHTML = viewModel.centerOptions
    .map(({ value, label }) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join("");
  refs.sequencerCenterSelect.value = viewModel.selectedCenter;
  refs.sequencerIncludeIncoming.checked = viewModel.includeIncoming;
  refs.sequencerPartialsOnly.checked = viewModel.partialsOnly;
}

function createSchedulerTopStats(stats) {
  return stats
    .map(
      ({ label, value, late }) => `
        <div class="sequencer-top-stat${late ? " is-late" : ""}">
          <span class="sequencer-top-stat-label">${escapeHtml(label)}</span>
          <span class="sequencer-top-stat-value">${escapeHtml(value)}</span>
        </div>
      `
    )
    .join("");
}

function createSchedulerCard(viewModel) {
  return `
    <article class="sequencer-card sequencer-card-single">
      <div class="sequencer-card-head sequencer-card-head-compact">
        <h3 class="sequencer-center-name">${escapeHtml(viewModel.centerLabel)}</h3>
        <span class="sequencer-badge">${escapeHtml(viewModel.badgeLabel)}</span>
      </div>
      <p class="sequencer-hint sequencer-catchup-note">${escapeHtml(viewModel.hint)}</p>
      <div class="sequencer-section sequencer-section-panel">
        <div class="sequencer-section-head">
          <h4>Queue</h4>
          <span>${escapeHtml(viewModel.countLabel)}</span>
        </div>
        <div class="sequencer-list">
          ${viewModel.rows.map(createSchedulerRow).join("")}
        </div>
      </div>
    </article>
  `;
}

function createSchedulerRow(row) {
  return `
    <div class="sequencer-row ${row.queueType === "incoming" ? "sequencer-row-incoming" : ""}" data-late="${row.projectedLate}">
      <div class="sequencer-row-main">
        <div class="sequencer-row-title">
          <span class="sequencer-row-id">${escapeHtml(row.job.displayId)}</span>
          ${
            row.queueType === "incoming"
              ? `<span class="sequencer-row-badge sequencer-row-badge-incoming" aria-label="Incoming operation">+ Incoming</span>`
              : ""
          }
        </div>
        <div class="sequencer-row-meta">${escapeHtml(row.metaText)}</div>
      </div>
      <div class="sequencer-row-track">${renderMiniSequenceTrack(row.job, row.focusOperationId)}</div>
      <div class="sequencer-row-stats">
        <span class="sequencer-row-hours">${formatHours(row.hours)} hrs</span>
        <span class="sequencer-row-day">${escapeHtml(row.statLabel)}</span>
        <span class="sequencer-row-date">${escapeHtml(row.dateLabel)}</span>
      </div>
    </div>
  `;
}

function renderMiniSequenceTrack(job, focusOperationId) {
  const segments = [];
  let previousSequence = null;

  job.operations.forEach((operation) => {
    if (previousSequence === null && operation.sequence > 1) {
      for (let sequence = 1; sequence < operation.sequence; sequence += 1) {
        segments.push(
          createMiniTrackSegment({
            classes: "mini-segment mini-segment-complete mini-segment-implicit",
            title: `Completed prior operation | Op ${sequence}`,
            label: "Complete",
            fillRatio: 1,
          })
        );
      }
    }

    if (previousSequence !== null && operation.sequence - previousSequence > 1) {
      segments.push(`
        <span class="mini-segment mini-segment-gap" title="${escapeHtml(`Missing operations between Op ${previousSequence} and Op ${operation.sequence}`)}">
          <span class="mini-segment-fill"></span>
          <span class="mini-segment-label">Gap</span>
        </span>
      `);
    }

    const classes = [
      "mini-segment",
      `mini-segment-${operation.phase}`,
      operation.key === focusOperationId ? "is-focus" : "",
    ]
      .filter(Boolean)
      .join(" ");

    segments.push(
      createMiniTrackSegment({
        classes,
        title: `${operation.workCenter || operation.sequenceLabel} | ${operation.operationName || "Operation"}`,
        label: operation.workCenter || operation.sequenceLabel,
        fillRatio: operation.fillRatio,
      })
    );

    previousSequence = operation.sequence;
  });

  return `<div class="mini-track">${segments.join("")}</div>`;
}

function createMiniTrackSegment({ classes, title, label, fillRatio }) {
  return `
    <span
      class="${classes}"
      title="${escapeHtml(title)}"
      style="--fill:${fillRatio}"
    >
      <span class="mini-segment-fill"></span>
      <span class="mini-segment-label">${escapeHtml(label)}</span>
    </span>
  `;
}

function createEmptyCard(centerLabel, badgeLabel, message) {
  return `
    <article class="sequencer-card sequencer-card-single">
      <div class="sequencer-card-head sequencer-card-head-compact">
        <h3 class="sequencer-center-name">${escapeHtml(centerLabel)}</h3>
        <span class="sequencer-badge">${escapeHtml(badgeLabel)}</span>
      </div>
      <p class="sequencer-empty">${escapeHtml(message)}</p>
    </article>
  `;
}

function createEmptyState(message) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon" aria-hidden="true">Queue</div>
      <h3>No jobs to show</h3>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function createFragment(markup) {
  const template = document.createElement("template");
  template.innerHTML = markup.trim();
  return template.content;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}
