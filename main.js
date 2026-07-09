import { buildJobs } from "./domain.js";
import { isSchedulableRow, parseCsv } from "./csv.js";
import { createRefs, renderCapacity, renderError, renderScheduler, renderSharedChrome, setTheme, applySidebarState, openMobileSidebar, closeMobileSidebar } from "./render.js";
import { deriveWorkCenters, getCapacityViewModel, getSchedulerViewModel } from "./selectors.js";
import {
  createInitialState,
  ensureSelectedSchedulerCenter,
  loadSidebarPreference,
  loadThemePreference,
  saveSidebarPreference,
  saveThemePreference,
  setCurrentView,
  setIncludeIncoming,
  setPartialsOnly,
  setSearchFilter,
  setSelectedSchedulerCenter,
  syncCapacities,
  updateCenterCapacity,
} from "./state.js";

const refs = createRefs();
const state = createInitialState();

init();

function init() {
  applyInitialTheme();
  applyInitialSidebar();
  bindEvents();
  renderSharedChrome(refs, state);
  renderError(refs, "Choose a CSV to build the scheduler.");
  globalThis.schedulerApp = { parseCsv, buildJobs, state };
}

function bindEvents() {
  refs.csvInput.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }

    const text = await file.text();
    hydrateFromCsv(text, file.name);
  });

  refs.searchInput.addEventListener("input", (event) => {
    setSearchFilter(state, event.target.value);
    renderSchedulerSurface();
  });

  refs.sequencerCenterSelect.addEventListener("change", (event) => {
    setSelectedSchedulerCenter(state, event.target.value);
    renderSchedulerSurface();
  });

  refs.sequencerIncludeIncoming.addEventListener("change", (event) => {
    setIncludeIncoming(state, event.target.checked);
    renderSchedulerSurface();
  });

  refs.sequencerPartialsOnly.addEventListener("change", (event) => {
    setPartialsOnly(state, event.target.checked);
    renderSchedulerSurface();
  });

  refs.themeToggle.addEventListener("click", toggleTheme);
  refs.viewSequencers.addEventListener("click", () => switchView("sequencers"));
  refs.viewCapacity.addEventListener("click", () => switchView("capacity"));
  refs.sidebarToggle.addEventListener("click", toggleSidebar);
  refs.mobileSidebarToggle.addEventListener("click", () => openMobileSidebar(refs));
  refs.sidebarScrim.addEventListener("click", () => closeMobileSidebar(refs));

  refs.capacityGrid.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.dataset.center) {
      return;
    }

    updateCenterCapacity(state, target.dataset.center, target.value);
    if (state.currentView === "capacity") {
      renderCapacitySurface();
      return;
    }

    renderSchedulerSurface();
  });
}

function hydrateFromCsv(text, sourceName) {
  const rows = parseCsv(text).filter(isSchedulableRow);
  state.rawRows = rows;
  state.jobs = buildJobs(rows);
  state.workCenters = deriveWorkCenters(state.jobs);
  state.sourceName = sourceName;
  syncCapacities(state);
  ensureSelectedSchedulerCenter(state);
  renderSharedChrome(refs, state);
  renderActiveSurface();
}

function renderActiveSurface() {
  if (state.currentView === "capacity") {
    renderCapacitySurface();
    return;
  }

  renderSchedulerSurface();
}

function renderSchedulerSurface() {
  renderSharedChrome(refs, state);
  renderScheduler(refs, getSchedulerViewModel(state));
}

function renderCapacitySurface() {
  renderSharedChrome(refs, state);
  renderCapacity(refs, getCapacityViewModel(state));
}

function switchView(view) {
  setCurrentView(state, view);
  renderActiveSurface();
  closeMobileSidebar(refs);
}

function applyInitialTheme() {
  const savedTheme = loadThemePreference();
  const preferredDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(refs, savedTheme || (preferredDark ? "dark" : "light"));
}

function toggleTheme() {
  const currentTheme = document.body.dataset.theme === "dark" ? "dark" : "light";
  const nextTheme = currentTheme === "dark" ? "light" : "dark";
  setTheme(refs, nextTheme);
  saveThemePreference(nextTheme);
}

function applyInitialSidebar() {
  applySidebarState(loadSidebarPreference());
}

function toggleSidebar() {
  const nextState = document.body.dataset.sidebar === "expanded" ? "collapsed" : "expanded";
  applySidebarState(nextState);
  saveSidebarPreference(nextState);
}
