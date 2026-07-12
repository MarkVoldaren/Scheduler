const DEFAULT_SOURCE_NAME = "Awaiting source";
const DEFAULT_DAILY_CAPACITY = 8;
const THEME_STORAGE_KEY = "screen-print-scheduler-theme";
const CAPACITY_STORAGE_KEY = "screen-print-scheduler-capacities";
const MACHINE_CAPACITY_STORAGE_KEY = "screen-print-scheduler-machine-capacities";
const MAN_HOURS_STORAGE_KEY = "screen-print-scheduler-man-hours";
const MAN_HOURS_BY_DAY_STORAGE_KEY = "screen-print-scheduler-man-hours-by-day";
const CAPACITY_MODE_STORAGE_KEY = "screen-print-scheduler-capacity-modes";
const CAPACITY_HORIZON_SHIFT_STORAGE_KEY = "screen-print-scheduler-capacity-horizon-shifts";
const FLOW_LOCATION_STORAGE_KEY = "screen-print-scheduler-flow-locations";
const SIDEBAR_STORAGE_KEY = "screen-print-scheduler-sidebar";
const DEPARTMENT_VIEW_MODE_STORAGE_KEY = "screen-print-scheduler-department-view-mode";
const SERVER_SETTINGS_SAVE_DELAY = 350;
const OPERATIONAL_SETTING_KEYS = [
  "capacities",
  "machineCapacities",
  "manHourCapacities",
  "manHoursByDay",
  "capacityModes",
  "capacityHorizonShifts",
  "flowLocations",
];
const API_BASE_PATH = getApiBasePath();
const DEPARTMENT_VIEW_MODES = new Set(["compact", "detailed"]);
const DEFAULT_MACHINE_CAPACITY_PER_DAY = DEFAULT_DAILY_CAPACITY;
const DEFAULT_MAN_HOURS_PER_DAY = DEFAULT_DAILY_CAPACITY;
const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const CAPACITY_WEEKDAYS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];
const CAPACITY_HORIZON_SHIFT_OPTIONS = [0, 1, 2, 3, 5, 7, 10, 14];
const CAPACITY_MODE_OPTIONS = ["Both constrained", "Machine constrained", "Labor constrained"];
const CAPACITY_MODE_SET = new Set(CAPACITY_MODE_OPTIONS);
const DEFAULT_CAPACITY_MODES = {
  "stock cutting": "Both constrained",
  shearcut: "Both constrained",
  "screen-flat bed": "Both constrained",
  "screen-cylinder": "Both constrained",
  "screen-roll": "Both constrained",
  "digital-r2000": "Both constrained",
  "digital-3600": "Both constrained",
  "digital-indigo": "Both constrained",
  "digital-zebra": "Both constrained",
  lamination: "Both constrained",
  "lamination-lg": "Both constrained",
  scoring: "Both constrained",
  "die cut": "Both constrained",
  "die cut-thermal": "Both constrained",
  "digital cut": "Both constrained",
  "heat bend": "Both constrained",
  "roll cut": "Both constrained",
  finishing: "Labor constrained",
  kitting: "Labor constrained",
  "quality control": "Labor constrained",
  art: "Labor constrained",
  ink: "Labor constrained",
  weeding: "Labor constrained",
};
const FLOW_LOCATION_OPTIONS = [
  "Material Handling",
  "Screen Printing",
  "Digital Printing",
  "Finishing Prep",
  "Cutting",
  "Finishing",
  "Auxiliary",
];
const FLOW_LOCATION_SET = new Set(FLOW_LOCATION_OPTIONS);
const FLOW_LOCATION_FILTER_PREFIX = "FLOW::";
const DEFAULT_FLOW_LOCATIONS = {
  "stock cutting": "Material Handling",
  shearcut: "Material Handling",
  "screen-flat bed": "Screen Printing",
  "screen-cylinder": "Screen Printing",
  "screen-roll": "Screen Printing",
  "digital-r2000": "Digital Printing",
  "digital-3600": "Digital Printing",
  "digital-indigo": "Digital Printing",
  "digital-zebra": "Digital Printing",
  lamination: "Finishing Prep",
  "lamination-lg": "Finishing Prep",
  scoring: "Finishing Prep",
  "die cut": "Cutting",
  "die cut-thermal": "Cutting",
  "digital cut": "Cutting",
  "roll cut": "Cutting",
  finishing: "Finishing",
  "heat bend": "Finishing",
  "quality control": "Finishing",
  weeding: "Finishing",
  art: "Auxiliary",
  ink: "Auxiliary",
  kitting: "Auxiliary",
};
const MAX_DATE = new Date(8640000000000000);

const refs = createRefs();
const state = createInitialState();

init();

async function init() {
  applyInitialTheme();
  applyInitialSidebar();
  bindEvents();
  setAuthenticated(false);
  renderSharedChrome(refs, state);
  renderError(refs, "Sign in to load the shared schedule.");
  globalThis.schedulerApp = { parseCsv, buildJobs, state };
  await initializeServerSession();
}

function createInitialState() {
  return {
    rawRows: [],
    jobs: [],
    shippingRows: [],
    workCenters: [],
    sourceName: DEFAULT_SOURCE_NAME,
    shippingSourceName: "",
    currentView: "sequencers",
    capacities: {},
    machineCapacities: {},
    manHourCapacities: {},
    manHoursByDay: {},
    capacityModes: {},
    capacityHorizonShifts: {},
    flowLocations: {},
    serverSettings: createEmptyOperationalSettings(),
    usesServerSettings: false,
    settingsSaveTimer: null,
    activeCsvMeta: {
      workCenter: null,
      pickList: null,
    },
    filters: {
      search: "",
      selectedSchedulerCenter: "",
      selectedDepartmentViewerCenter: "",
      capacitySearch: "",
      capacitySortBy: "flow-order",
      capacityCompactView: false,
      capacityFlowLocation: "ALL",
      selectedKpiDepartmentGroup: "ALL",
      kpiHorizonDays: 14,
      kpiCurrentOnly: false,
      kpiSortBy: "highest-load",
      departmentViewerMode: loadStoredDepartmentViewMode(),
      departmentViewerCurrentOnly: false,
      includeIncoming: true,
      partialsOnly: false,
      selectedPickListCustomer: "",
      selectedPickListCustomerDetail: "",
      pickListCommitmentFilter: "all",
      pickListDateFrom: "",
      pickListDateTo: "",
      pickListSearch: "",
    },
  };
}

function createRefs() {
  return {
    loginScreen: document.querySelector("#login-screen"),
    loginForm: document.querySelector("#login-form"),
    loginPassword: document.querySelector("#login-password"),
    loginError: document.querySelector("#login-error"),
    logoutButton: document.querySelector("#logout-button"),
    csvInput: document.querySelector("#csv-input"),
    searchInput: document.querySelector("#search-input"),
    emptyStateTemplate: document.querySelector("#empty-state-template"),
    themeToggle: document.querySelector("#theme-toggle"),
    sourcePill: document.querySelector("#source-pill"),
    viewCapacity: document.querySelector("#view-capacity"),
    viewDepartments: document.querySelector("#view-departments"),
    viewKpi: document.querySelector("#view-kpi"),
    viewPickList: document.querySelector("#view-pick-list"),
    viewSequencers: document.querySelector("#view-sequencers"),
    pageCapacity: document.querySelector("#page-capacity"),
    pageDepartments: document.querySelector("#page-departments"),
    pageKpi: document.querySelector("#page-kpi"),
    pagePickList: document.querySelector("#page-pick-list"),
    pageSequencers: document.querySelector("#page-sequencers"),
    shippingCsvInput: document.querySelector("#shipping-csv-input"),
    pickListRoot: document.querySelector("#pick-list-root"),
    capacityGrid: document.querySelector("#capacity-grid"),
    kpiDepartmentGroup: document.querySelector("#kpi-department-group"),
    kpiHorizon: document.querySelector("#kpi-horizon"),
    kpiCurrentOnly: document.querySelector("#kpi-current-only"),
    kpiSort: document.querySelector("#kpi-sort"),
    kpiBoardRoot: document.querySelector("#kpi-board-root"),
    departmentViewerCenterSelect: document.querySelector("#department-viewer-center-select"),
    departmentViewerCurrentOnly: document.querySelector("#department-viewer-current-only"),
    departmentModeToggleLabel: document.querySelector("#department-mode-toggle-label"),
    departmentModeToggle: document.querySelector("#department-mode-toggle"),
    departmentCustomerExport: document.querySelector("#department-customer-export"),
    departmentViewer: document.querySelector("#department-viewer"),
    workOrderModal: document.querySelector("#work-order-modal"),
    workOrderModalBody: document.querySelector("#work-order-modal-body"),
    workOrderModalClose: document.querySelector("#work-order-modal-close"),
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

function bindEvents() {
  refs.csvInput.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }

    await uploadAndHydrateCsv("work-center", file);
    event.target.value = "";
  });

  refs.shippingCsvInput.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }

    await uploadAndHydrateCsv("pick-list", file);
    event.target.value = "";
  });

  refs.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await loginWithPassword(refs.loginPassword.value);
  });

  refs.logoutButton.addEventListener("click", logout);

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
  refs.viewKpi.addEventListener("click", () => switchView("kpi"));
  refs.viewDepartments.addEventListener("click", () => switchView("departments"));
  refs.viewPickList.addEventListener("click", () => switchView("pick-list"));
  refs.kpiDepartmentGroup.addEventListener("change", (event) => {
    setKpiDepartmentGroup(state, event.target.value);
    renderKpiSurface();
  });
  refs.kpiHorizon.addEventListener("change", (event) => {
    setKpiHorizonDays(state, event.target.value);
    renderKpiSurface();
  });
  refs.kpiCurrentOnly.addEventListener("change", (event) => {
    setKpiCurrentOnly(state, event.target.checked);
    renderKpiSurface();
  });
  refs.kpiSort.addEventListener("change", (event) => {
    setKpiSortBy(state, event.target.value);
    renderKpiSurface();
  });
  refs.departmentViewerCenterSelect.addEventListener("change", (event) => {
    setSelectedDepartmentViewerCenter(state, event.target.value);
    renderDepartmentViewerSurface();
  });
  refs.departmentViewerCurrentOnly.addEventListener("change", (event) => {
    setDepartmentViewerCurrentOnly(state, event.target.checked);
    renderDepartmentViewerSurface();
  });
  refs.departmentModeToggle.addEventListener("change", (event) => {
    setDepartmentViewerMode(state, event.target.checked ? "detailed" : "compact");
    renderDepartmentViewerSurface();
  });
  refs.departmentCustomerExport.addEventListener("click", exportDepartmentCustomerHours);
  refs.departmentViewer.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    const card = event.target.closest(".department-job-card[data-job-key]");
    if (!card) {
      return;
    }

    openWorkOrderSchedule(card.dataset.jobKey);
  });
  refs.workOrderModalClose.addEventListener("click", closeWorkOrderSchedule);
  refs.workOrderModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-modal-close]")) {
      closeWorkOrderSchedule();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !refs.workOrderModal.hidden) {
      closeWorkOrderSchedule();
    }
  });
  refs.sidebarToggle.addEventListener("click", toggleSidebar);
  refs.mobileSidebarToggle.addEventListener("click", () => openMobileSidebar(refs));
  refs.sidebarScrim.addEventListener("click", () => closeMobileSidebar(refs));

  refs.capacityGrid.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    if (target.dataset.capacitySearch !== undefined) {
      setCapacitySearch(state, target.value);
      renderCapacitySurface();
      focusCapacitySearch();
      return;
    }

    if (isCapacityValueInput(target)) {
      target.classList.toggle("is-dirty", target.value !== target.dataset.savedValue);
    }
  });

  refs.capacityGrid.addEventListener("change", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.dataset.capacityCompact !== undefined) {
      setCapacityCompactView(state, target.checked);
      renderCapacitySurface();
      return;
    }

    if (target instanceof HTMLInputElement && isCapacityValueInput(target)) {
      commitCapacityValueInput(target);
      return;
    }

    if (!(target instanceof HTMLSelectElement)) {
      return;
    }

    if (target.dataset.capacitySort !== undefined) {
      setCapacitySortBy(state, target.value);
      renderCapacitySurface();
      return;
    }

    if (target.dataset.capacityFlowFilter !== undefined) {
      setCapacityFlowLocation(state, target.value);
      renderCapacitySurface();
      return;
    }

    if (target.dataset.modeCenter) {
      updateCapacityMode(state, target.dataset.modeCenter, target.value);
      renderAfterCapacitySettingsChange();
      return;
    }

    if (target.dataset.horizonShiftCenter) {
      updateCapacityHorizonShift(state, target.dataset.horizonShiftCenter, target.value);
      renderAfterCapacitySettingsChange();
      return;
    }

    if (target.dataset.flowCenter) {
      updateCenterFlowLocation(state, target.dataset.flowCenter, target.value);
      renderAfterCapacitySettingsChange();
    }
  });

  refs.capacityGrid.addEventListener("keydown", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !isCapacityValueInput(target)) {
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      commitCapacityValueInput(target);
      target.blur();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      target.value = target.dataset.savedValue || "";
      target.classList.remove("is-dirty");
      target.blur();
    }
  });

  refs.capacityGrid.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (target.closest("[data-capacity-reset]")) {
      resetCapacityFilters(state);
      renderCapacitySurface();
    }
  });

  refs.pickListRoot.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.dataset.pickListSearch === undefined) {
      return;
    }

    setPickListSearch(state, target.value);
    renderPickListSurface();
    focusPickListSearch();
  });

  refs.pickListRoot.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) && !(target instanceof HTMLInputElement)) {
      return;
    }

    if (target.dataset.pickListCustomer !== undefined) {
      setSelectedPickListCustomer(state, target.value);
      renderPickListSurface();
      return;
    }

    if (target.dataset.pickListCustomerDetail !== undefined) {
      setSelectedPickListCustomerDetail(state, target.value);
      renderPickListSurface();
      return;
    }

    if (target.dataset.pickListDateFrom !== undefined) {
      setPickListDateFrom(state, target.value);
      renderPickListSurface();
      return;
    }

    if (target.dataset.pickListDateTo !== undefined) {
      setPickListDateTo(state, target.value);
      renderPickListSurface();
      return;
    }

    if (target.dataset.pickListCommitment !== undefined) {
      setPickListCommitmentFilter(state, target.value);
      renderPickListSurface();
    }
  });

  refs.pickListRoot.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (target.closest("[data-pick-list-upload]")) {
      refs.shippingCsvInput.click();
      return;
    }

    const exportButton = target.closest("[data-pick-list-export]");
    if (exportButton) {
      exportPickListGroup(exportButton.dataset.pickListExport);
      return;
    }

    const printButton = target.closest("[data-pick-list-print]");
    if (printButton) {
      printPickList(printButton.dataset.pickListPrint);
      return;
    }

    const woButton = target.closest("[data-pick-list-wo]");
    if (woButton) {
      if (woButton.dataset.pickListJobKey) {
        openWorkOrderSchedule(woButton.dataset.pickListJobKey);
      } else {
        openJobDetailByWorkOrder(woButton.dataset.pickListWo);
      }
    }
  });

}

async function initializeServerSession() {
  try {
    const session = await fetchJson("/api/session", { allowUnauthorized: true });
    if (!session.authenticated) {
      setAuthenticated(false);
      return;
    }
    setAuthenticated(true);
    await loadServerAppState();
  } catch (error) {
    console.error(error);
    setAuthenticated(false, "Unable to reach the Scheduler server.");
  }
}

async function loginWithPassword(password) {
  setLoginError("");
  try {
    const session = await fetchJson("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
      allowUnauthorized: true,
    });
    if (!session.authenticated) {
      setLoginError("The password was not accepted.");
      return;
    }
    refs.loginPassword.value = "";
    setAuthenticated(true);
    await loadServerAppState();
  } catch (error) {
    console.error(error);
    setLoginError(error.message || "Unable to sign in.");
  }
}

async function logout() {
  try {
    await fetchJson("/api/logout", { method: "POST", allowUnauthorized: true });
  } catch (error) {
    console.error(error);
  }
  state.rawRows = [];
  state.jobs = [];
  state.shippingRows = [];
  state.workCenters = [];
  state.sourceName = DEFAULT_SOURCE_NAME;
  state.shippingSourceName = "";
  setAuthenticated(false);
  renderSharedChrome(refs, state);
  renderError(refs, "Sign in to load the shared schedule.");
}

function setAuthenticated(isAuthenticated, message = "") {
  document.body.dataset.auth = isAuthenticated ? "unlocked" : "locked";
  refs.loginScreen.hidden = isAuthenticated;
  if (!isAuthenticated) {
    setLoginError(message);
    refs.loginPassword.focus();
  }
}

function setLoginError(message) {
  refs.loginError.textContent = message;
  refs.loginError.hidden = !message;
}

async function loadServerAppState() {
  const appState = await fetchJson("/api/app-state");
  applyServerOperationalSettings(appState.settings || {});
  state.activeCsvMeta = {
    workCenter: appState.csvs?.workCenter || null,
    pickList: appState.csvs?.pickList || null,
  };

  let loadedWorkCenter = false;
  if (state.activeCsvMeta.workCenter) {
    const text = await fetchText("/api/csv/work-center");
    hydrateFromCsv(text, state.activeCsvMeta.workCenter.originalName || "work-center.csv");
    loadedWorkCenter = true;
  }

  if (state.activeCsvMeta.pickList) {
    const text = await fetchText("/api/csv/pick-list");
    hydrateShippingCsv(text, state.activeCsvMeta.pickList.originalName || "pick-list.csv");
  }

  if (!loadedWorkCenter) {
    renderSharedChrome(refs, state);
    renderError(refs, "No work-center CSV uploaded yet. Choose CSV to create the active schedule.");
  }
}

async function uploadAndHydrateCsv(kind, file) {
  try {
    const formData = new FormData();
    formData.append("csv", file);
    const uploadResult = await fetchJson(`/api/csv/${kind}`, {
      method: "POST",
      body: formData,
    });
    const text = await fetchText(`/api/csv/${kind}`);
    if (kind === "work-center") {
      state.activeCsvMeta.workCenter = uploadResult.metadata || null;
      hydrateFromCsv(text, uploadResult.metadata?.originalName || file.name);
    } else {
      state.activeCsvMeta.pickList = uploadResult.metadata || null;
      hydrateShippingCsv(text, uploadResult.metadata?.originalName || file.name);
    }
  } catch (error) {
    console.error(error);
    alert(error.message || "CSV upload failed.");
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(resolveApiUrl(url), {
    credentials: "same-origin",
    ...options,
  });
  if (response.status === 401 && !options.allowUnauthorized) {
    setAuthenticated(false, "Your session expired. Sign in again.");
    throw new Error("Session expired.");
  }
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with status ${response.status}`);
  }
  return payload;
}

async function fetchText(url) {
  const response = await fetch(resolveApiUrl(url), { credentials: "same-origin" });
  if (response.status === 401) {
    setAuthenticated(false, "Your session expired. Sign in again.");
    throw new Error("Session expired.");
  }
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const payload = await response.json();
      message = payload.error || message;
    } catch {
      // Keep the generic HTTP status message.
    }
    throw new Error(message);
  }
  return response.text();
}

function resolveApiUrl(url) {
  if (!url.startsWith("/api")) {
    return url;
  }
  return `${API_BASE_PATH}${url}`;
}

function getApiBasePath() {
  const path = window.location.pathname || "/";
  return path === "/scheduler" || path.startsWith("/scheduler/") ? "/scheduler" : "";
}

function renderAfterCapacitySettingsChange() {
  if (state.currentView === "capacity") {
    renderCapacitySurface();
    return;
  }

  if (state.currentView === "kpi") {
    renderKpiSurface();
    return;
  }

  if (state.currentView === "departments") {
    renderDepartmentViewerSurface();
    return;
  }

  renderSchedulerSurface();
}

function focusCapacitySearch() {
  const searchInput = refs.capacityGrid.querySelector("[data-capacity-search]");
  if (searchInput instanceof HTMLInputElement) {
    searchInput.focus();
    searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
  }
}

function isCapacityValueInput(input) {
  return input.dataset.machineCenter !== undefined || input.dataset.laborCenter !== undefined || input.dataset.manDayCenter !== undefined;
}

function commitCapacityValueInput(input) {
  const rawValue = normalizeCapacityInputText(input.value);
  if (input.dataset.machineCenter !== undefined) {
    updateMachineCapacityPerDay(state, input.dataset.machineCenter, rawValue);
  } else if (input.dataset.laborCenter !== undefined) {
    updateManHoursPerDay(state, input.dataset.laborCenter, rawValue);
  } else if (input.dataset.manDayCenter !== undefined) {
    updateManHoursForWeekday(state, input.dataset.manDayCenter, input.dataset.manDay, rawValue);
  } else {
    return;
  }
  renderAfterCapacitySettingsChange();
}

function normalizeCapacityInputText(value) {
  const normalized = String(value || "").trim().replace(",", ".");
  if (normalized === "" || normalized === ".") {
    return "0";
  }
  return normalized;
}

function focusPickListSearch() {
  const searchInput = refs.pickListRoot.querySelector("[data-pick-list-search]");
  if (searchInput instanceof HTMLInputElement) {
    searchInput.focus();
    searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
  }
}

function hydrateFromCsv(text, sourceName) {
  const rows = parseCsv(text).filter(isSchedulableRow);
  state.rawRows = rows;
  state.jobs = buildJobs(rows);
  state.workCenters = deriveWorkCenters(state.jobs);
  state.sourceName = sourceName;
  syncCapacities(state);
  syncFlowLocations(state);
  ensureSelectedSchedulerCenter(state);
  ensureSelectedDepartmentViewerCenter(state);
  ensureSelectedKpiDepartmentGroup(state);
  renderSharedChrome(refs, state);
  renderActiveSurface();
}

function hydrateShippingCsv(text, sourceName) {
  state.shippingRows = parseShippingScheduleCsv(text);
  state.shippingSourceName = sourceName;
  ensureSelectedPickListCustomer(state);
  renderActiveSurface();
}

function renderActiveSurface() {
  if (state.currentView === "capacity") {
    renderCapacitySurface();
    return;
  }

  if (state.currentView === "kpi") {
    renderKpiSurface();
    return;
  }

  if (state.currentView === "departments") {
    renderDepartmentViewerSurface();
    return;
  }

  if (state.currentView === "pick-list") {
    renderPickListSurface();
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

function renderKpiSurface() {
  renderSharedChrome(refs, state);
  renderKpiBoard(refs, getKpiBoardViewModel(state));
}

function renderDepartmentViewerSurface() {
  renderSharedChrome(refs, state);
  renderDepartmentViewer(refs, getDepartmentViewerModel(state));
}

function renderPickListSurface() {
  renderSharedChrome(refs, state);
  renderPickList(refs, getPickListViewModel(state));
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

function setSearchFilter(targetState, value) {
  targetState.filters.search = String(value || "").trim().toLowerCase();
}

function setSelectedSchedulerCenter(targetState, value) {
  targetState.filters.selectedSchedulerCenter = value;
}

function setSelectedDepartmentViewerCenter(targetState, value) {
  targetState.filters.selectedDepartmentViewerCenter = value;
}

function setCapacitySearch(targetState, value) {
  targetState.filters.capacitySearch = String(value || "").trim().toLowerCase();
}

function setCapacitySortBy(targetState, value) {
  targetState.filters.capacitySortBy = ["flow-order", "department-az", "highest-load", "overloaded", "effective-capacity"].includes(value)
    ? value
    : "flow-order";
}

function setCapacityCompactView(targetState, checked) {
  targetState.filters.capacityCompactView = Boolean(checked);
}

function setCapacityFlowLocation(targetState, value) {
  targetState.filters.capacityFlowLocation = value === "ALL" || FLOW_LOCATION_SET.has(value) ? value : "ALL";
}

function setSelectedPickListCustomer(targetState, value) {
  targetState.filters.selectedPickListCustomer = value || "";
  targetState.filters.selectedPickListCustomerDetail = "";
}

function setSelectedPickListCustomerDetail(targetState, value) {
  targetState.filters.selectedPickListCustomerDetail = value || "";
}

function setPickListCommitmentFilter(targetState, value) {
  targetState.filters.pickListCommitmentFilter = ["all", "fully", "not-fully"].includes(value) ? value : "all";
}

function setPickListDateFrom(targetState, value) {
  targetState.filters.pickListDateFrom = normalizeDateInputValue(value);
}

function setPickListDateTo(targetState, value) {
  targetState.filters.pickListDateTo = normalizeDateInputValue(value);
}

function setPickListSearch(targetState, value) {
  targetState.filters.pickListSearch = String(value || "").trim().toLowerCase();
}

function resetCapacityFilters(targetState) {
  targetState.filters.capacitySearch = "";
  targetState.filters.capacitySortBy = "flow-order";
  targetState.filters.capacityCompactView = false;
  targetState.filters.capacityFlowLocation = "ALL";
}

function setKpiDepartmentGroup(targetState, value) {
  const nextValue = value || "ALL";
  const validFlowValue =
    nextValue.startsWith(FLOW_LOCATION_FILTER_PREFIX) &&
    FLOW_LOCATION_SET.has(nextValue.slice(FLOW_LOCATION_FILTER_PREFIX.length));
  targetState.filters.selectedKpiDepartmentGroup =
    nextValue === "ALL" || targetState.workCenters.includes(nextValue) || validFlowValue ? nextValue : "ALL";
}

function setKpiHorizonDays(targetState, value) {
  const parsed = Number.parseInt(value, 10);
  targetState.filters.kpiHorizonDays = [7, 14, 28].includes(parsed) ? parsed : 14;
}

function setKpiCurrentOnly(targetState, checked) {
  targetState.filters.kpiCurrentOnly = Boolean(checked);
}

function setKpiSortBy(targetState, value) {
  targetState.filters.kpiSortBy = ["highest-load", "most-past-due", "most-open-hours", "department-az"].includes(value)
    ? value
    : "highest-load";
}

function setDepartmentViewerCurrentOnly(targetState, checked) {
  targetState.filters.departmentViewerCurrentOnly = Boolean(checked);
}

function setDepartmentViewerMode(targetState, mode) {
  const nextMode = DEPARTMENT_VIEW_MODES.has(mode) ? mode : "compact";
  targetState.filters.departmentViewerMode = nextMode;
  saveStoredDepartmentViewMode(nextMode);
}

function setIncludeIncoming(targetState, checked) {
  targetState.filters.includeIncoming = Boolean(checked);
}

function setPartialsOnly(targetState, checked) {
  targetState.filters.partialsOnly = Boolean(checked);
}

function setCurrentView(targetState, view) {
  targetState.currentView = ["capacity", "departments", "kpi", "pick-list"].includes(view) ? view : "sequencers";
}

function ensureSelectedSchedulerCenter(targetState) {
  if (!targetState.workCenters.length) {
    targetState.filters.selectedSchedulerCenter = "";
    return;
  }

  const options = ["ALL", ...targetState.workCenters];
  if (!options.includes(targetState.filters.selectedSchedulerCenter)) {
    targetState.filters.selectedSchedulerCenter = "ALL";
  }
}

function ensureSelectedDepartmentViewerCenter(targetState) {
  if (!targetState.workCenters.length) {
    targetState.filters.selectedDepartmentViewerCenter = "";
    return;
  }

  if (!targetState.workCenters.includes(targetState.filters.selectedDepartmentViewerCenter)) {
    targetState.filters.selectedDepartmentViewerCenter = targetState.workCenters[0];
  }
}

function ensureSelectedKpiDepartmentGroup(targetState) {
  const options = [
    "ALL",
    ...FLOW_LOCATION_OPTIONS.map((flowLocation) => `${FLOW_LOCATION_FILTER_PREFIX}${flowLocation}`),
    ...targetState.workCenters,
  ];
  if (!options.includes(targetState.filters.selectedKpiDepartmentGroup)) {
    targetState.filters.selectedKpiDepartmentGroup = "ALL";
  }
}

function ensureSelectedPickListCustomer(targetState) {
  const customers = getShippingCustomers(targetState.shippingRows);
  if (!customers.includes(targetState.filters.selectedPickListCustomer) && targetState.filters.selectedPickListCustomer !== "ALL") {
    targetState.filters.selectedPickListCustomer = "";
    targetState.filters.selectedPickListCustomerDetail = "";
    return;
  }

  const customerDetails = getShippingCustomerDetails(targetState.shippingRows, targetState.filters.selectedPickListCustomer);
  if (
    targetState.filters.selectedPickListCustomerDetail &&
    !customerDetails.includes(targetState.filters.selectedPickListCustomerDetail)
  ) {
    targetState.filters.selectedPickListCustomerDetail = "";
  }
}

function syncCapacities(targetState) {
  const legacyCapacities = loadStoredCapacities();
  const storedMachineCapacities = loadStoredMachineCapacities();
  const storedManHourCapacities = loadStoredManHourCapacities();
  const storedManHoursByDay = loadStoredManHoursByDay();
  const storedCapacityModes = loadStoredCapacityModes();
  const storedHorizonShifts = loadStoredCapacityHorizonShifts();
  const nextEffective = {};
  const nextMachine = {};
  const nextLabor = {};
  const nextLaborByDay = {};
  const nextModes = {};
  const nextHorizonShifts = {};

  targetState.workCenters.forEach((center) => {
    const legacyCapacity = legacyCapacities[center] ?? targetState.capacities[center];
    nextMachine[center] = parseCapacityValue(
      storedMachineCapacities[center] ?? targetState.machineCapacities[center] ?? legacyCapacity,
      DEFAULT_MACHINE_CAPACITY_PER_DAY
    );
    nextLabor[center] = parseCapacityValue(
      storedManHourCapacities[center] ?? targetState.manHourCapacities[center] ?? legacyCapacity,
      DEFAULT_MAN_HOURS_PER_DAY
    );
    nextLaborByDay[center] = normalizeManHoursByDay(
      storedManHoursByDay[center] ?? targetState.manHoursByDay[center],
      nextLabor[center]
    );
    nextModes[center] = normalizeCapacityMode(
      storedCapacityModes[center] ?? targetState.capacityModes[center] ?? getDefaultCapacityMode(center)
    );
    nextHorizonShifts[center] = normalizeHorizonShift(storedHorizonShifts[center] ?? targetState.capacityHorizonShifts[center]);
    nextEffective[center] = getEffectiveCapacityFromSettings(nextMachine[center], nextLaborByDay[center][getWeekdayKey(startOfToday())], nextModes[center]);
  });

  targetState.machineCapacities = nextMachine;
  targetState.manHourCapacities = nextLabor;
  targetState.manHoursByDay = nextLaborByDay;
  targetState.capacityModes = nextModes;
  targetState.capacityHorizonShifts = nextHorizonShifts;
  targetState.capacities = nextEffective;
  saveMachineCapacities(targetState.machineCapacities);
  saveManHourCapacities(targetState.manHourCapacities);
  saveManHoursByDay(targetState.manHoursByDay);
  saveCapacityModes(targetState.capacityModes);
  saveCapacityHorizonShifts(targetState.capacityHorizonShifts);
}

function syncFlowLocations(targetState) {
  const stored = loadStoredFlowLocations();
  const next = {};
  targetState.workCenters.forEach((center) => {
    next[center] = normalizeFlowLocation(stored[center] ?? targetState.flowLocations[center] ?? getDefaultFlowLocation(center));
  });
  targetState.flowLocations = next;
  saveFlowLocations(targetState.flowLocations);
}

function updateMachineCapacityPerDay(targetState, center, rawValue) {
  targetState.machineCapacities[center] = parseCapacityValue(rawValue, 0);
  targetState.capacities[center] = getCapacityForCenter(targetState, center);
  saveMachineCapacities(targetState.machineCapacities);
}

function updateManHoursPerDay(targetState, center, rawValue) {
  targetState.manHourCapacities[center] = parseCapacityValue(rawValue, 0);
  targetState.manHoursByDay[center] = normalizeManHoursByDay(null, targetState.manHourCapacities[center]);
  targetState.capacities[center] = getCapacityForCenter(targetState, center);
  saveManHourCapacities(targetState.manHourCapacities);
  saveManHoursByDay(targetState.manHoursByDay);
}

function updateManHoursForWeekday(targetState, center, weekday, rawValue) {
  const key = normalizeWeekdayKey(weekday);
  if (!key) {
    return;
  }
  const currentSchedule = normalizeManHoursByDay(targetState.manHoursByDay[center], getManHoursPerDay(targetState, center));
  currentSchedule[key] = parseCapacityValue(rawValue, 0);
  targetState.manHoursByDay[center] = currentSchedule;
  targetState.manHourCapacities[center] = getAverageManHoursByDay(currentSchedule);
  targetState.capacities[center] = getCapacityForCenter(targetState, center);
  saveManHoursByDay(targetState.manHoursByDay);
  saveManHourCapacities(targetState.manHourCapacities);
}

function updateCapacityMode(targetState, center, rawValue) {
  targetState.capacityModes[center] = normalizeCapacityMode(rawValue);
  targetState.capacities[center] = getCapacityForCenter(targetState, center);
  saveCapacityModes(targetState.capacityModes);
}

function updateCapacityHorizonShift(targetState, center, rawValue) {
  targetState.capacityHorizonShifts[center] = normalizeHorizonShift(rawValue);
  saveCapacityHorizonShifts(targetState.capacityHorizonShifts);
}

function updateCenterFlowLocation(targetState, center, rawValue) {
  targetState.flowLocations[center] = normalizeFlowLocation(rawValue);
  saveFlowLocations(targetState.flowLocations);
  ensureSelectedKpiDepartmentGroup(targetState);
}

function getCapacityForCenter(targetState, center) {
  const settings = getDepartmentCapacitySettings(targetState, center);
  return settings.effectiveDailyCapacity;
}

function getDepartmentCapacitySettings(targetState, center) {
  const machineCapacity = getMachineCapacityPerDay(targetState, center);
  const manHoursByDay = getManHoursByDay(targetState, center);
  const today = startOfToday();
  const manHours = getManHoursForDate(targetState, center, today);
  const mode = getCapacityMode(targetState, center);
  const effectiveDailyCapacity = getEffectiveCapacityFromSettings(machineCapacity, manHours, mode);
  return {
    machineCapacity,
    manHours,
    manHoursByDay,
    mode,
    actualConstraint: getActualCapacityConstraint(machineCapacity, manHours, mode),
    effectiveDailyCapacity,
    weeklyEffectiveCapacity: getRollingEffectiveCapacity(targetState, center, today, 7),
    averageEffectiveDailyCapacity: getAverageEffectiveDailyCapacity(targetState, center, today, 7),
    horizonShift: getCapacityHorizonShift(targetState, center),
  };
}

function getMachineCapacityPerDay(targetState, center) {
  return parseCapacityValue(targetState.machineCapacities[center], DEFAULT_MACHINE_CAPACITY_PER_DAY);
}

function getManHoursPerDay(targetState, center) {
  return parseCapacityValue(targetState.manHourCapacities[center], DEFAULT_MAN_HOURS_PER_DAY);
}

function getManHoursByDay(targetState, center) {
  return normalizeManHoursByDay(targetState.manHoursByDay?.[center], getManHoursPerDay(targetState, center));
}

function getManHoursForDate(targetState, center, date) {
  const weekday = getWeekdayKey(date);
  const schedule = getManHoursByDay(targetState, center);
  return parseCapacityValue(schedule[weekday], DEFAULT_MAN_HOURS_PER_DAY);
}

function getEffectiveCapacityForDate(targetState, center, date) {
  const machineCapacity = getMachineCapacityPerDay(targetState, center);
  const manHours = getManHoursForDate(targetState, center, date);
  const mode = getCapacityMode(targetState, center);
  return getEffectiveCapacityFromSettings(machineCapacity, manHours, mode);
}

function getActualCapacityConstraintForDate(targetState, center, date) {
  return getActualCapacityConstraint(
    getMachineCapacityPerDay(targetState, center),
    getManHoursForDate(targetState, center, date),
    getCapacityMode(targetState, center)
  );
}

function getRollingEffectiveCapacity(targetState, center, startDate, dayCount) {
  return Array.from({ length: Math.max(0, dayCount) }, (_, index) => getEffectiveCapacityForDate(targetState, center, addDays(startDate, index)))
    .reduce((sum, capacity) => sum + capacity, 0);
}

function getAverageEffectiveDailyCapacity(targetState, center, startDate, dayCount) {
  const days = Math.max(0, dayCount);
  return days > 0 ? getRollingEffectiveCapacity(targetState, center, startDate, days) / days : 0;
}

function getCapacityHorizonShift(targetState, center) {
  return normalizeHorizonShift(targetState.capacityHorizonShifts?.[center]);
}

function getCapacityMode(targetState, center) {
  return normalizeCapacityMode(targetState.capacityModes[center] || getDefaultCapacityMode(center));
}

function getDefaultCapacityMode(workCenter) {
  return DEFAULT_CAPACITY_MODES[normalizeDepartmentName(workCenter)] || "Labor constrained";
}

function normalizeCapacityMode(value) {
  return CAPACITY_MODE_SET.has(value) ? value : "Labor constrained";
}

function normalizeManHoursByDay(value, fallback = DEFAULT_MAN_HOURS_PER_DAY) {
  const fallbackValue = parseCapacityValue(fallback, DEFAULT_MAN_HOURS_PER_DAY);
  return CAPACITY_WEEKDAYS.reduce((schedule, { key }) => {
    schedule[key] = parseCapacityValue(value?.[key], fallbackValue);
    return schedule;
  }, {});
}

function getAverageManHoursByDay(schedule) {
  const normalized = normalizeManHoursByDay(schedule);
  return CAPACITY_WEEKDAYS.reduce((sum, { key }) => sum + normalized[key], 0) / CAPACITY_WEEKDAYS.length;
}

function normalizeWeekdayKey(value) {
  const key = String(value || "").trim().toLowerCase().slice(0, 3);
  return WEEKDAY_KEYS.includes(key) ? key : "";
}

function getWeekdayKey(date) {
  return WEEKDAY_KEYS[(isKnownDate(date) ? date : startOfToday()).getDay()];
}

function normalizeHorizonShift(value) {
  const numericValue = Number(value);
  return CAPACITY_HORIZON_SHIFT_OPTIONS.includes(numericValue) ? numericValue : 0;
}

function getEffectiveCapacityFromSettings(machineCapacity, manHours, mode) {
  if (mode === "Machine constrained") {
    return machineCapacity;
  }

  if (mode === "Labor constrained") {
    return manHours;
  }

  return Math.min(machineCapacity, manHours);
}

function getActualCapacityConstraint(machineCapacity, manHours, mode) {
  if (mode === "Machine constrained") {
    return "Machine constrained";
  }

  if (mode === "Labor constrained") {
    return "Labor constrained";
  }

  if (machineCapacity < manHours) {
    return "Machine constrained";
  }

  if (manHours < machineCapacity) {
    return "Labor constrained";
  }

  return "Both constrained";
}

function parseCapacityValue(rawValue, fallback) {
  const parsed = Number.parseFloat(String(rawValue ?? "").trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function getDefaultFlowLocation(workCenter) {
  return DEFAULT_FLOW_LOCATIONS[normalizeDepartmentName(workCenter)] || "Auxiliary";
}

function getDepartmentFlowLocation(targetState, workCenter) {
  return normalizeFlowLocation(targetState.flowLocations[workCenter] || getDefaultFlowLocation(workCenter));
}

function normalizeFlowLocation(value) {
  if (value === "Lamination and Scoring") {
    return "Finishing Prep";
  }

  return FLOW_LOCATION_SET.has(value) ? value : "Auxiliary";
}

function normalizeDepartmentName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function loadStoredCapacities() {
  return loadOperationalSetting("capacities", CAPACITY_STORAGE_KEY);
}

function loadStoredMachineCapacities() {
  return loadOperationalSetting("machineCapacities", MACHINE_CAPACITY_STORAGE_KEY);
}

function saveMachineCapacities(capacities) {
  saveOperationalSetting("machineCapacities", MACHINE_CAPACITY_STORAGE_KEY, capacities);
}

function loadStoredManHourCapacities() {
  return loadOperationalSetting("manHourCapacities", MAN_HOURS_STORAGE_KEY);
}

function saveManHourCapacities(capacities) {
  saveOperationalSetting("manHourCapacities", MAN_HOURS_STORAGE_KEY, capacities);
}

function loadStoredManHoursByDay() {
  return loadOperationalSetting("manHoursByDay", MAN_HOURS_BY_DAY_STORAGE_KEY);
}

function saveManHoursByDay(manHoursByDay) {
  saveOperationalSetting("manHoursByDay", MAN_HOURS_BY_DAY_STORAGE_KEY, manHoursByDay);
}

function loadStoredCapacityModes() {
  return loadOperationalSetting("capacityModes", CAPACITY_MODE_STORAGE_KEY);
}

function saveCapacityModes(capacityModes) {
  saveOperationalSetting("capacityModes", CAPACITY_MODE_STORAGE_KEY, capacityModes);
}

function loadStoredCapacityHorizonShifts() {
  return loadOperationalSetting("capacityHorizonShifts", CAPACITY_HORIZON_SHIFT_STORAGE_KEY);
}

function saveCapacityHorizonShifts(horizonShifts) {
  saveOperationalSetting("capacityHorizonShifts", CAPACITY_HORIZON_SHIFT_STORAGE_KEY, horizonShifts);
}

function loadStoredFlowLocations() {
  return loadOperationalSetting("flowLocations", FLOW_LOCATION_STORAGE_KEY);
}

function saveFlowLocations(flowLocations) {
  saveOperationalSetting("flowLocations", FLOW_LOCATION_STORAGE_KEY, flowLocations);
}

function createEmptyOperationalSettings() {
  return OPERATIONAL_SETTING_KEYS.reduce((settings, key) => {
    settings[key] = {};
    return settings;
  }, {});
}

function applyServerOperationalSettings(settings) {
  const normalized = normalizeOperationalSettings(settings);
  if (isOperationalSettingsEmpty(normalized)) {
    normalized.capacities = loadStoredObject(CAPACITY_STORAGE_KEY);
    normalized.machineCapacities = loadStoredObject(MACHINE_CAPACITY_STORAGE_KEY);
    normalized.manHourCapacities = loadStoredObject(MAN_HOURS_STORAGE_KEY);
    normalized.manHoursByDay = loadStoredObject(MAN_HOURS_BY_DAY_STORAGE_KEY);
    normalized.capacityModes = loadStoredObject(CAPACITY_MODE_STORAGE_KEY);
    normalized.capacityHorizonShifts = loadStoredObject(CAPACITY_HORIZON_SHIFT_STORAGE_KEY);
    normalized.flowLocations = loadStoredObject(FLOW_LOCATION_STORAGE_KEY);
  }

  state.serverSettings = normalized;
  state.usesServerSettings = true;
  state.capacities = { ...normalized.capacities };
  state.machineCapacities = { ...normalized.machineCapacities };
  state.manHourCapacities = { ...normalized.manHourCapacities };
  state.manHoursByDay = clonePlainObject(normalized.manHoursByDay);
  state.capacityModes = { ...normalized.capacityModes };
  state.capacityHorizonShifts = { ...normalized.capacityHorizonShifts };
  state.flowLocations = { ...normalized.flowLocations };
}

function normalizeOperationalSettings(settings) {
  const normalized = createEmptyOperationalSettings();
  OPERATIONAL_SETTING_KEYS.forEach((key) => {
    normalized[key] = clonePlainObject(settings?.[key]);
  });
  return normalized;
}

function isOperationalSettingsEmpty(settings) {
  return OPERATIONAL_SETTING_KEYS.every((key) => !Object.keys(settings[key] || {}).length);
}

function loadOperationalSetting(serverKey, storageKey) {
  if (state.usesServerSettings) {
    return clonePlainObject(state.serverSettings[serverKey]);
  }
  return loadStoredObject(storageKey);
}

function saveOperationalSetting(serverKey, storageKey, value) {
  if (state.usesServerSettings) {
    state.serverSettings[serverKey] = clonePlainObject(value);
    queueServerSettingsSave();
    return;
  }
  saveStoredObject(storageKey, value);
}

function queueServerSettingsSave() {
  if (!state.usesServerSettings) {
    return;
  }
  window.clearTimeout(state.settingsSaveTimer);
  state.settingsSaveTimer = window.setTimeout(saveServerSettingsNow, SERVER_SETTINGS_SAVE_DELAY);
}

async function saveServerSettingsNow() {
  try {
    const settings = getOperationalSettingsPayload();
    const payload = await fetchJson("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    state.serverSettings = normalizeOperationalSettings(payload.settings || settings);
  } catch (error) {
    console.error("Failed to save shared settings.", error);
  }
}

function getOperationalSettingsPayload() {
  return {
    capacities: clonePlainObject(state.capacities),
    machineCapacities: clonePlainObject(state.machineCapacities),
    manHourCapacities: clonePlainObject(state.manHourCapacities),
    manHoursByDay: clonePlainObject(state.manHoursByDay),
    capacityModes: clonePlainObject(state.capacityModes),
    capacityHorizonShifts: clonePlainObject(state.capacityHorizonShifts),
    flowLocations: clonePlainObject(state.flowLocations),
  };
}

function clonePlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return JSON.parse(JSON.stringify(value));
}

function loadThemePreference() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveThemePreference(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures and keep the in-memory preference.
  }
}

function loadSidebarPreference() {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) || "collapsed";
  } catch {
    return "collapsed";
  }
}

function saveSidebarPreference(sidebarState) {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarState);
  } catch {
    // Ignore storage failures and keep the in-memory preference.
  }
}

function loadStoredDepartmentViewMode() {
  try {
    const mode = localStorage.getItem(DEPARTMENT_VIEW_MODE_STORAGE_KEY);
    return DEPARTMENT_VIEW_MODES.has(mode) ? mode : "compact";
  } catch {
    return "compact";
  }
}

function saveStoredDepartmentViewMode(mode) {
  try {
    localStorage.setItem(DEPARTMENT_VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage failures and keep the in-memory preference.
  }
}

function loadStoredObject(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStoredObject(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures and keep the in-memory value.
  }
}

function normalizeStoredArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current);
      current = "";
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    current += char;
  }

  if (current.length || row.length) {
    row.push(current);
    rows.push(row);
  }

  const [headerRow = [], ...bodyRows] = rows;
  return bodyRows.map((cells) => {
    const record = {};
    headerRow.forEach((header, index) => {
      record[header] = cells[index] ?? "";
    });
    return record;
  });
}

function parseCsvMatrix(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current.trim());
      current = "";
      if (row.some((cell) => String(cell || "").trim())) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    current += char;
  }

  if (current.length || row.length) {
    row.push(current.trim());
    if (row.some((cell) => String(cell || "").trim())) {
      rows.push(row);
    }
  }

  return rows;
}

function parseShippingScheduleCsv(text) {
  const matrix = parseCsvMatrix(text);
  const headerIndex = findShippingHeaderRow(matrix);
  if (headerIndex < 0) {
    return [];
  }

  const headers = matrix[headerIndex].map((header) => String(header || "").trim());
  return matrix
    .slice(headerIndex + 1)
    .map((cells, index) => {
      const row = {};
      headers.forEach((header, headerIndex) => {
        row[header] = cells[headerIndex] ?? "";
      });
      return normalizeShippingRow(row, index);
    })
    .filter(Boolean);
}

function findShippingHeaderRow(rows) {
  return rows.findIndex((row) => {
    const normalized = row.map(normalizeHeaderName);
    return (
      normalized.includes("ship date") &&
      normalized.includes("part #") &&
      normalized.includes("cust.") &&
      normalized.includes("qty needed") &&
      normalized.includes("qty committed")
    );
  });
}

function normalizeShippingRow(row, index) {
  const values = Object.values(row).map((value) => String(value || "").trim());
  if (!values.some(Boolean)) {
    return null;
  }

  const qtyNeeded = parseShippingQuantity(row["Qty Needed"]);
  const qtyCommitted = parseShippingQuantity(row["Qty Committed"]);
  const shipDate = parseShippingDate(row["Ship Date"]);

  return {
    id: `shipping-${index}`,
    shipDate,
    shipDateLabel: shipDate ? formatDate(shipDate) : "Unknown",
    poNumber: String(row["P O #"] || "").trim(),
    soTo: String(row["SO / TO"] || "").trim(),
    partNumber: String(row["Part #"] || "").trim(),
    normalizedPart: normalizePartNumber(row["Part #"]),
    outsourcedSo: String(row["Outsourced? SO"] || "").trim(),
    customer: String(row["Cust."] || "").trim() || "No customer",
    qtyNeeded,
    qtyCommitted,
    qtyRemaining: qtyNeeded - qtyCommitted,
    assocPrintWo: String(row["Assoc. Print/WO"] || "").trim(),
    normalizedAssocWo: normalizeWorkOrder(row["Assoc. Print/WO"]),
    shelf: String(row["Shelf #"] || "").trim(),
    faPpap: String(row["FA/PPAP"] || "").trim(),
    cell: String(row.Cell || "").trim(),
    accReport: String(row["Acc Report"] || "").trim(),
    raw: row,
  };
}

function normalizeHeaderName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function parseShippingDate(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const [, month, day, year] = match;
    const fullYear = year.length === 2 ? 2000 + Number(year) : Number(year);
    return new Date(fullYear, Number(month) - 1, Number(day));
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : stripTime(parsed);
}

function normalizeDateInputValue(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function parseDateInputValue(value) {
  const text = normalizeDateInputValue(value);
  if (!text) {
    return null;
  }
  const [year, month, day] = text.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateInputValue(date) {
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseShippingQuantity(value) {
  return parseNumber(value);
}

function normalizeWorkOrder(value) {
  const text = String(value || "").toUpperCase();
  const match = text.match(/\b(\d+WO)\b/);
  return match ? match[1] : text.replace(/WORK\s*ORDER\s*#?/i, "").trim();
}

function normalizePartNumber(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9-]/g, "");
}

function isSchedulableRow(row) {
  const shipBy = String(row["Ship By"] || "").trim().toLowerCase();
  const workOrder = String(row["WO #"] || "").trim();
  const combo = String(row["Combo #"] || "").trim();
  const workCenter = String(row["Manufacturing Work Center"] || "").trim();

  if (shipBy.includes("total")) {
    return false;
  }

  if (!workOrder && !combo && !workCenter) {
    return false;
  }

  return true;
}

function parseNumber(value) {
  const number = Number.parseFloat(String(value || "").replace(/,/g, "").trim());
  return Number.isFinite(number) ? number : 0;
}

function parseDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildJobs(rows) {
  const groups = new Map();

  rows.forEach((row) => {
    const workOrder = (row["WO #"] || "").trim();
    const combo = (row["Combo #"] || "").trim();
    const groupKey = combo ? `combo:${combo}` : `wo:${workOrder}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        key: groupKey,
        combo,
        workOrders: new Set(),
        rows: [],
      });
    }

    const group = groups.get(groupKey);
    group.rows.push(row);
    if (workOrder) {
      group.workOrders.add(workOrder);
    }
  });

  return [...groups.values()]
    .map((group) => normalizeGroup(group))
    .sort((a, b) => a.shipByDate - b.shipByDate || a.displayId.localeCompare(b.displayId));
}

function normalizeGroup(group) {
  const rows = group.rows;
  const firstRow = rows[0] || {};
  const operationMap = new Map();
  const shipDates = rows
    .map((row) => parseDate(row["Ship By"]))
    .filter(Boolean)
    .sort((a, b) => a - b);
  const customers = unique(rows.map((row) => row.Customer));
  const parts = unique(rows.map((row) => row.Part));
  const descriptions = unique(rows.map((row) => row.Description));

  rows.forEach((row) => {
    const sequenceNumber = parseNumber(row["Operation Sequence"]);
    const operationName = (row["Operation Name"] || row["Formula (Text)"] || "").trim() || "Operation";
    const workCenter = (row["Manufacturing Work Center"] || "").trim() || "Unassigned";
    const hoursRemaining = parseNumber(row["Hours Remaining"]);
    const status = normalizeStatus(row.Status);
    const woQty = parseNumber(row["WO Quantity"]);
    const completedQuantity = parseNumber(row["Completed Quantity"]);
    const remainingQuantity = parseNumber(row["Remaining Quantity"]);
    const qtyCompleted = parseNumber(row["Qty Completed"]);
    const totalQuantity = woQty || completedQuantity + remainingQuantity || qtyCompleted + remainingQuantity || 0;
    const effectiveCompleted =
      completedQuantity > 0
        ? completedQuantity
        : totalQuantity > 0 && remainingQuantity > 0
          ? Math.max(totalQuantity - remainingQuantity, 0)
          : qtyCompleted;

    const operationKey = createOperationKey(sequenceNumber || 0, workCenter, operationName);
    if (!operationMap.has(operationKey)) {
      operationMap.set(operationKey, {
        key: operationKey,
        sequence: sequenceNumber || 0,
        sequenceLabel: `Op ${sequenceNumber || "?"}`,
        workCenter,
        operationName,
        rows: [],
        sourceRowCount: 0,
        hoursRemaining: 0,
        completedQuantity: 0,
        totalQuantity: 0,
        statusRank: 0,
        isDone: true,
        isPlaceholder: false,
      });
    }

    const operation = operationMap.get(operationKey);
    operation.rows.push(row);
    operation.sourceRowCount += 1;
    operation.hoursRemaining += hoursRemaining;
    operation.completedQuantity += effectiveCompleted;
    operation.totalQuantity += totalQuantity;
    operation.statusRank = Math.max(operation.statusRank, status.rank);
    operation.isDone = operation.isDone && status.isDone && hoursRemaining <= 0;
  });

  const operations = [...operationMap.values()]
    .sort(compareOperations)
    .map((operation) => finalizeOperation(operation));
  const correctedOperations = applyClaimCorrection(operations);
  const firstOpenSequence = correctedOperations.find((operation) => operation.phase !== "complete")?.sequence ?? null;

  correctedOperations.forEach((operation) => {
    if (operation.phase === "complete") {
      operation.fillRatio = operation.progressRatio;
      return;
    }

    operation.phase = firstOpenSequence !== null && operation.sequence === firstOpenSequence ? "current" : "future";
    operation.fillRatio = operation.progressRatio;
  });

  const currentOperations = correctedOperations.filter((operation) => operation.phase === "current");
  const currentOperation = currentOperations[0] || null;
  const totalHoursRemaining = correctedOperations.reduce((sum, operation) => sum + operation.hoursRemaining, 0);
  const remainingDepartmentCount = correctedOperations.filter(
    (operation) => operation.phase !== "complete" && operation.hoursRemaining > 0
  ).length;
  const percentComplete = calculateOverallProgress(correctedOperations);
  const shipByDate = shipDates[0] || MAX_DATE;
  const productionDate = calculateProductionDate(shipByDate, totalHoursRemaining, remainingDepartmentCount);
  const displayId = group.combo || [...group.workOrders][0] || "Unidentified";
  const isComplete = correctedOperations.every((operation) => operation.phase === "complete");
  const statusSummary = summarizeStatus(currentOperations, isComplete);

  return {
    key: group.key,
    combo: group.combo,
    displayId,
    typeLabel: group.combo ? "Combo" : "Solo WO",
    customer: customers.join(" / "),
    part: parts.slice(0, 2).join(" / "),
    description: descriptions.join(" / "),
    shipByDate,
    shipByLabel: isKnownDate(shipByDate) ? formatDate(shipByDate) : "Unknown",
    productionDate,
    productionDateLabel: isKnownDate(productionDate) ? formatDate(productionDate) : "Unknown",
    operations: correctedOperations,
    currentOperations,
    currentOperation,
    currentSequence: currentOperation?.sequence || Number.MAX_SAFE_INTEGER,
    percentComplete,
    totalHoursRemaining,
    remainingDepartmentCount,
    statusSummary,
    isComplete,
    isLate: !isComplete && stripTime(shipByDate) < startOfToday(),
    workOrders: [...group.workOrders],
    workOrderCountLabel: group.combo ? `${group.workOrders.size} WOs` : "1 WO",
    firstRow,
    sourceRows: rows,
  };
}

function calculateProductionDate(shipByDate, totalHoursRemaining, remainingDepartmentCount) {
  if (!isKnownDate(shipByDate)) {
    return MAX_DATE;
  }

  const leadDays = Math.ceil(totalHoursRemaining / 8 + remainingDepartmentCount / 2);
  return subtractWorkingDays(shipByDate, leadDays);
}

function calculateOverallProgress(operations) {
  if (!operations.length) {
    return 0;
  }

  const total = operations.length;
  const completed = operations.reduce((sum, operation) => sum + operation.progressRatio, 0);
  return Math.round((completed / total) * 100);
}

function hasPartialNonFinishingOperation(job) {
  return job.operations.some((operation) => {
    if (!operation || operation.progressRatio <= 0 || operation.progressRatio >= 1) {
      return false;
    }

    return !isFinishingOperation(operation);
  });
}

function isFinishingOperation(operation) {
  const haystack = `${operation.workCenter || ""} ${operation.operationName || ""}`.trim().toLowerCase();
  return haystack.includes("finish");
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatHours(hours) {
  return Number(hours || 0).toFixed(hours >= 10 ? 0 : 1).replace(".0", "");
}

function formatPercent(value) {
  return `${Math.round((value || 0) * 100)}%`;
}

function roundForCsv(value) {
  return Number((value || 0).toFixed(2));
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function stripTime(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addWorkingDays(date, workingDays) {
  let next = stripTime(date);
  let remaining = workingDays;

  while (remaining > 0) {
    next = addDays(next, 1);
    if (isWorkingDay(next)) {
      remaining -= 1;
    }
  }

  return next;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function finalizeOperation(operation) {
  const quantityProgress =
    operation.totalQuantity > 0 ? clamp(operation.completedQuantity / operation.totalQuantity, 0, 1) : null;
  const status = statusFromRank(operation.statusRank);
  const phase = operation.isDone ? "complete" : "future";
  const progressRatio = operation.isDone ? 1 : quantityProgress ?? (operation.hoursRemaining <= 0 ? 1 : 0);

  return {
    ...operation,
    status,
    hasSourceRows: operation.sourceRowCount > 0,
    progressRatio,
    progressPercent: Math.round(progressRatio * 100),
    fillRatio: progressRatio,
    phase,
  };
}

function applyClaimCorrection(operations) {
  if (!operations.length) {
    return operations;
  }

  const firstOpenSequence = operations.find((operation) => operation.phase !== "complete")?.sequence ?? null;
  const furthestProgressSequence = operations.reduce((maxSequence, operation) => {
    if (operation.phase === "complete") {
      return maxSequence;
    }
    if (operation.progressRatio > 0 && operation.progressRatio < 1) {
      return Math.max(maxSequence, operation.sequence);
    }
    return maxSequence;
  }, -1);

  if (firstOpenSequence === null || furthestProgressSequence <= firstOpenSequence) {
    return operations;
  }

  return operations.map((operation) => {
    if (
      operation.sequence < furthestProgressSequence &&
      operation.phase !== "complete" &&
      operation.isPlaceholder &&
      !operation.hasSourceRows
    ) {
      return {
        ...operation,
        hoursRemaining: 0,
        isDone: true,
        status: "Complete",
        progressRatio: 1,
        progressPercent: 100,
        fillRatio: 1,
        phase: "complete",
      };
    }
    return operation;
  });
}

function summarizeStatus(currentOperations, isComplete) {
  if (currentOperations.some((operation) => operation.status === "In Process")) {
    return "In Process";
  }
  if (currentOperations[0]?.status) {
    return currentOperations[0].status;
  }
  return isComplete ? "Complete" : "Released";
}

function normalizeStatus(status) {
  const normalized = (status || "").trim().toLowerCase();
  if (["complete", "completed", "closed"].includes(normalized)) {
    return { label: "Complete", rank: 3, isDone: true };
  }
  if (normalized === "in process") {
    return { label: "In Process", rank: 2, isDone: false };
  }
  if (normalized === "released") {
    return { label: "Released", rank: 1, isDone: false };
  }
  return { label: status?.trim() || "Released", rank: normalized ? 1 : 0, isDone: false };
}

function statusFromRank(rank) {
  if (rank >= 3) {
    return "Complete";
  }
  if (rank === 2) {
    return "In Process";
  }
  return "Released";
}

function createOperationKey(sequence, workCenter, operationName) {
  return `${sequence}::${workCenter}::${operationName}`;
}

function compareOperations(a, b) {
  return (
    a.sequence - b.sequence ||
    a.workCenter.localeCompare(b.workCenter) ||
    a.operationName.localeCompare(b.operationName) ||
    a.key.localeCompare(b.key)
  );
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function subtractWorkingDays(date, workingDays) {
  let next = stripTime(date);
  let remaining = workingDays;

  while (remaining > 0) {
    next = addDays(next, -1);
    if (isWorkingDay(next)) {
      remaining -= 1;
    }
  }

  return next;
}

function isWorkingDay(date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function unique(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isKnownDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime()) && date.getTime() !== MAX_DATE.getTime();
}

function deriveWorkCenters(jobs) {
  const centers = new Set();
  jobs.forEach((job) => {
    getOpenOperations(job).forEach((operation) => {
      if (operation.workCenter) {
        centers.add(operation.workCenter);
      }
    });
  });
  return [...centers].sort((a, b) => a.localeCompare(b));
}

function getVisibleSchedulerJobs(targetState) {
  return targetState.jobs
    .filter((job) => !job.isComplete && getOpenOperations(job).length > 0)
    .filter((job) => !targetState.filters.partialsOnly || hasPartialNonFinishingOperation(job))
    .filter((job) => matchesSearch(job, targetState.filters.search));
}

function getSchedulerViewModel(targetState) {
  const centerOptions = targetState.workCenters.length
    ? [{ value: "ALL", label: "All departments" }].concat(
        targetState.workCenters.map((center) => ({ value: center, label: center }))
      )
    : [];
  const selectedCenter = targetState.filters.selectedSchedulerCenter || (centerOptions[0] && centerOptions[0].value) || "";
  const visibleJobs = getVisibleSchedulerJobs(targetState);

  if (!selectedCenter) {
    return createEmptySchedulerModel({
      centerOptions,
      selectedCenter,
      includeIncoming: targetState.filters.includeIncoming,
      partialsOnly: targetState.filters.partialsOnly,
      emptyMessage: "Choose a CSV to build the scheduler.",
    });
  }

  if (selectedCenter === "ALL") {
    return createMasterSchedulerModel(targetState, visibleJobs, centerOptions, selectedCenter);
  }

  return createDepartmentSchedulerModel(targetState, visibleJobs, centerOptions, selectedCenter);
}

function getPickListViewModel(targetState) {
  const customers = getShippingCustomers(targetState.shippingRows);
  const selectedCustomer = targetState.filters.selectedPickListCustomer || "";
  const customerDetails = getShippingCustomerDetails(targetState.shippingRows, selectedCustomer);
  const selectedCustomerDetail = targetState.filters.selectedPickListCustomerDetail || "";
  const commitmentFilter = targetState.filters.pickListCommitmentFilter || "all";
  const dateFrom = targetState.filters.pickListDateFrom || "";
  const dateTo = targetState.filters.pickListDateTo || "";
  const search = targetState.filters.pickListSearch || "";
  const loaded = targetState.shippingRows.length > 0;

  if (!loaded) {
    return {
      loaded: false,
      sourceName: "",
      customers: [],
      customerDetails: [],
      selectedCustomer,
      selectedCustomerDetail,
      commitmentFilter,
      dateFrom,
      dateTo,
      search,
      groupedRows: createEmptyPickListGroups(),
      counts: { total: 0, pastDue: 0, today: 0, upcoming: 0 },
      scheduleLoaded: targetState.jobs.length > 0,
    };
  }

  const enrichedRows = targetState.shippingRows
    .map((row) => enrichShippingRow(row, targetState.jobs))
    .filter((row) => matchesPickListFilters(row, selectedCustomer, selectedCustomerDetail, commitmentFilter, dateFrom, dateTo, search))
    .sort(sortPickListRows);
  const groupedRows = groupPickListRowsByShipDate(enrichedRows);

  return {
    loaded: true,
    sourceName: targetState.shippingSourceName,
    customers,
    customerDetails,
    selectedCustomer,
    selectedCustomerDetail,
    commitmentFilter,
    dateFrom,
    dateTo,
    search,
    groupedRows,
    counts: {
      total: enrichedRows.length,
      pastDue: groupedRows.pastDue.rows.length,
      today: groupedRows.today.rows.length,
      upcoming: groupedRows.upcoming.rows.length,
    },
    scheduleLoaded: targetState.jobs.length > 0,
  };
}

function getShippingCustomers(rows) {
  return [...new Set(rows.map((row) => getCustomerGroupName(row.customer)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function getShippingCustomerDetails(rows, selectedCustomer) {
  if (!selectedCustomer || selectedCustomer === "ALL") {
    return [];
  }
  return [...new Set(rows.filter((row) => getCustomerGroupName(row.customer) === selectedCustomer).map((row) => row.customer).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function getCustomerGroupName(customer) {
  return String(customer || "").split(/\s+:\s+/)[0].trim();
}

function createEmptyPickListGroups() {
  return {
    pastDue: { key: "pastDue", label: "Past Due", rows: [], tone: "danger" },
    today: { key: "today", label: "Today", rows: [], tone: "today" },
    upcoming: { key: "upcoming", label: "Upcoming", rows: [], tone: "upcoming" },
  };
}

function enrichShippingRow(row, jobs) {
  const commitmentStatus = getCommitStatus(row);
  const match = matchShippingRowToSchedule(row, jobs);
  const currentOperation = match.job ? getCurrentOperationForMatchedJob(match.job) : null;
  return {
    ...row,
    commitmentStatus,
    match,
    matchedWo: match.matchedWo || "",
    matchedDisplayId: getPickListMatchDisplayId(match),
    matchType: match.matchType,
    possibleMatchCount: match.possibleMatchCount || 0,
    currentDepartment: currentOperation?.workCenter || "",
    currentOperation: currentOperation?.operationName || "",
    hoursRemaining: match.job?.totalHoursRemaining || 0,
  };
}

function getCommitStatus(row) {
  if (row.qtyCommitted > row.qtyNeeded) {
    return "Overcommitted";
  }
  if (row.qtyNeeded === row.qtyCommitted) {
    return "Fully Committed";
  }
  if (row.qtyCommitted > 0) {
    return "Partial";
  }
  return "Uncommitted";
}

function matchesPickListFilters(row, selectedCustomer, selectedCustomerDetail, commitmentFilter, dateFrom, dateTo, search) {
  if (selectedCustomer && selectedCustomer !== "ALL" && getCustomerGroupName(row.customer) !== selectedCustomer) {
    return false;
  }

  if (selectedCustomerDetail && row.customer !== selectedCustomerDetail) {
    return false;
  }

  if (commitmentFilter === "fully" && row.qtyNeeded !== row.qtyCommitted) {
    return false;
  }

  if (commitmentFilter === "not-fully" && row.qtyNeeded === row.qtyCommitted) {
    return false;
  }

  const fromDate = parseDateInputValue(dateFrom);
  const toDate = parseDateInputValue(dateTo);
  if ((fromDate || toDate) && !row.shipDate) {
    return false;
  }
  if (fromDate && stripTime(row.shipDate) < fromDate) {
    return false;
  }
  if (toDate && stripTime(row.shipDate) > toDate) {
    return false;
  }

  if (!search) {
    return true;
  }

  return [
    row.partNumber,
    row.customer,
    row.soTo,
    row.poNumber,
    row.shelf,
    row.assocPrintWo,
    row.outsourcedSo,
    row.matchedWo,
    row.matchedDisplayId,
    row.cell,
    row.accReport,
  ]
    .join(" ")
    .toLowerCase()
    .includes(search);
}

function getPickListMatchDisplayId(match) {
  if (match.matchType === "suggested" && match.job?.combo) {
    return match.job.displayId;
  }
  return match.matchedWo || "";
}

function groupPickListRowsByShipDate(rows) {
  const groups = createEmptyPickListGroups();
  const today = startOfToday();
  rows.forEach((row) => {
    if (!row.shipDate) {
      groups.upcoming.rows.push(row);
      return;
    }

    const shipDate = stripTime(row.shipDate);
    if (shipDate < today) {
      groups.pastDue.rows.push(row);
      return;
    }

    if (shipDate.getTime() === today.getTime()) {
      groups.today.rows.push(row);
      return;
    }

    groups.upcoming.rows.push(row);
  });
  return groups;
}

function sortPickListRows(a, b) {
  const aTime = a.shipDate ? a.shipDate.getTime() : Number.MAX_SAFE_INTEGER;
  const bTime = b.shipDate ? b.shipDate.getTime() : Number.MAX_SAFE_INTEGER;
  return aTime - bTime || a.customer.localeCompare(b.customer) || a.partNumber.localeCompare(b.partNumber);
}

function matchShippingRowToSchedule(row, jobs) {
  if (!jobs.length) {
    return { matchType: "schedule-not-loaded", matchedWo: "", job: null, possibleMatchCount: 0 };
  }

  if (row.normalizedAssocWo) {
    const linkedJob = findJobByWorkOrder(jobs, row.normalizedAssocWo);
    return {
      matchType: linkedJob ? "linked" : "linked-not-found",
      matchedWo: row.normalizedAssocWo,
      job: linkedJob,
      possibleMatchCount: linkedJob ? 1 : 0,
    };
  }

  if (!row.normalizedPart) {
    return { matchType: "none", matchedWo: "", job: null, possibleMatchCount: 0 };
  }

  const candidates = jobs.filter((job) => jobMatchesPart(job, row.normalizedPart));
  if (!candidates.length) {
    return { matchType: "none", matchedWo: "", job: null, possibleMatchCount: 0 };
  }

  const chosenJob = candidates.slice().sort((a, b) => scoreShippingJobMatch(a, row) - scoreShippingJobMatch(b, row))[0];
  const matchedWo = getMatchedWorkOrderForPart(chosenJob, row.normalizedPart) || chosenJob.workOrders[0] || chosenJob.displayId;
  return {
    matchType: "suggested",
    matchedWo,
    job: chosenJob,
    possibleMatchCount: candidates.length,
  };
}

function scoreShippingJobMatch(job, row) {
  const openPenalty = job.totalHoursRemaining > 0 && !job.isComplete ? 0 : 100000000000;
  const customerPenalty = isSimilarCustomer(job.customer, row.customer) ? 0 : 50000000000;
  const datePenalty =
    row.shipDate && isKnownDate(job.shipByDate) ? Math.abs(stripTime(job.shipByDate).getTime() - stripTime(row.shipDate).getTime()) : 25000000000;
  return openPenalty + customerPenalty + datePenalty;
}

function jobMatchesPart(job, normalizedPart) {
  return getJobPartCandidates(job).some((part) => normalizePartNumber(part) === normalizedPart);
}

function getJobPartCandidates(job) {
  return uniqueValues([
    job.part,
    job.firstRow?.Part,
    ...(job.sourceRows || []).map((row) => row.Part),
    ...String(job.part || "").split("/"),
    ...String(job.firstRow?.Part || "").split("/"),
  ]);
}

function getMatchedWorkOrderForPart(job, normalizedPart) {
  const matchedSourceRow = (job.sourceRows || []).find((row) => normalizePartNumber(row.Part) === normalizedPart && normalizeWorkOrder(row["WO #"]));
  return matchedSourceRow ? normalizeWorkOrder(matchedSourceRow["WO #"]) : "";
}

function isSimilarCustomer(jobCustomer, shippingCustomer) {
  const left = normalizeCustomerName(jobCustomer);
  const right = normalizeCustomerName(shippingCustomer);
  return Boolean(left && right && (left.includes(right) || right.includes(left)));
}

function normalizeCustomerName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findJobByWorkOrder(jobs, woNumber) {
  const normalizedWo = normalizeWorkOrder(woNumber);
  return jobs.find((job) => job.workOrders.some((workOrder) => normalizeWorkOrder(workOrder) === normalizedWo)) || null;
}

function getCurrentOperationForMatchedJob(job) {
  return (
    job.currentOperation ||
    job.operations.find((operation) => operation.phase !== "complete" && operation.hoursRemaining > 0) ||
    job.operations[0] ||
    null
  );
}

function getCapacityViewModel(targetState) {
  if (!targetState.workCenters.length) {
    return {
      emptyMessage: "Choose a CSV to load department capacity.",
      cards: [],
      groups: [],
      summary: null,
      filters: getCapacityFilterState(targetState),
    };
  }

  const allCards = targetState.workCenters.map((center) => {
    const currentItems = getCurrentItemsForCenter(center, targetState.jobs);
    const incomingItems = getIncomingItemsForCenter(center, targetState.jobs);
    const currentHours = currentItems.reduce((sum, item) => sum + item.hours, 0);
    const incomingHours = incomingItems.reduce((sum, item) => sum + item.hours, 0);
    const queueHours = currentHours + incomingHours;
    const capacitySettings = getDepartmentCapacitySettings(targetState, center);
    const capacity = capacitySettings.effectiveDailyCapacity;
    const planningCapacity = capacitySettings.averageEffectiveDailyCapacity;
    const days = planningCapacity > 0 ? queueHours / planningCapacity : 0;

    return {
      center,
      activeJobCount: uniqueJobCount(currentItems),
      currentHours,
      incomingHours,
      queueHours,
      capacity,
      planningCapacity,
      weeklyEffectiveCapacity: capacitySettings.weeklyEffectiveCapacity,
      machineCapacity: capacitySettings.machineCapacity,
      manHours: capacitySettings.manHours,
      manHoursByDay: capacitySettings.manHoursByDay,
      capacityMode: capacitySettings.mode,
      actualConstraint: capacitySettings.actualConstraint,
      horizonShift: capacitySettings.horizonShift,
      days,
      flowLocation: getDepartmentFlowLocation(targetState, center),
    };
  });
  const filters = getCapacityFilterState(targetState);
  const filteredCards = sortCapacityCards(
    allCards.filter((card) => matchesCapacityFilters(card, filters)),
    filters.sortBy
  );
  const groups = groupCapacityDepartmentsByFlowLocation(filteredCards);

  return {
    cards: filteredCards,
    allCards,
    groups,
    summary: getCapacityPageSummary(allCards),
    filters,
    capacityModeOptions: CAPACITY_MODE_OPTIONS,
    horizonShiftOptions: CAPACITY_HORIZON_SHIFT_OPTIONS,
    weekdayOptions: CAPACITY_WEEKDAYS,
    flowLocationOptions: FLOW_LOCATION_OPTIONS,
    emptyMessage: "No departments match the selected capacity filters.",
  };
}

function getCapacityFilterState(targetState) {
  return {
    search: targetState.filters.capacitySearch || "",
    sortBy: targetState.filters.capacitySortBy || "flow-order",
    compactView: Boolean(targetState.filters.capacityCompactView),
    flowLocation: targetState.filters.capacityFlowLocation || "ALL",
  };
}

function getCapacityPageSummary(cards) {
  return {
    departmentCount: cards.length,
    totalEffectiveCapacity: cards.reduce((sum, card) => sum + card.capacity, 0),
    overloadedCount: cards.filter((card) => card.capacity > 0 && card.queueHours > card.capacity).length,
    laborConstrainedCount: cards.filter((card) => card.actualConstraint === "Labor constrained").length,
  };
}

function matchesCapacityFilters(card, filters) {
  const matchesFlow = filters.flowLocation === "ALL" || card.flowLocation === filters.flowLocation;
  if (!matchesFlow) {
    return false;
  }

  if (!filters.search) {
    return true;
  }

  return [card.center, card.flowLocation, card.capacityMode].join(" ").toLowerCase().includes(filters.search);
}

function sortCapacityCards(cards, sortBy) {
  return cards.slice().sort((a, b) => {
    if (sortBy === "department-az") {
      return a.center.localeCompare(b.center);
    }

    if (sortBy === "highest-load") {
      return b.queueHours - a.queueHours || b.days - a.days || a.center.localeCompare(b.center);
    }

    if (sortBy === "overloaded") {
      return Number(b.queueHours > b.capacity) - Number(a.queueHours > a.capacity) || b.days - a.days || a.center.localeCompare(b.center);
    }

    if (sortBy === "effective-capacity") {
      return b.capacity - a.capacity || a.center.localeCompare(b.center);
    }

    return FLOW_LOCATION_OPTIONS.indexOf(a.flowLocation) - FLOW_LOCATION_OPTIONS.indexOf(b.flowLocation) || a.center.localeCompare(b.center);
  });
}

function groupCapacityDepartmentsByFlowLocation(cards) {
  return FLOW_LOCATION_OPTIONS.map((flowLocation) => ({
    flowLocation,
    departments: cards.filter((card) => card.flowLocation === flowLocation),
  })).filter((group) => group.departments.length > 0);
}

function getKpiBoardViewModel(targetState) {
  const horizonDays = targetState.filters.kpiHorizonDays;
  const selectedGroup = targetState.filters.selectedKpiDepartmentGroup || "ALL";
  const currentOnly = targetState.filters.kpiCurrentOnly;
  const sortBy = targetState.filters.kpiSortBy;
  const groupOptions = [{ value: "ALL", label: "All" }].concat(
    FLOW_LOCATION_OPTIONS.map((flowLocation) => ({
      value: `${FLOW_LOCATION_FILTER_PREFIX}${flowLocation}`,
      label: `Flow: ${flowLocation}`,
    })),
    targetState.workCenters.map((center) => ({ value: center, label: center }))
  );

  if (!targetState.workCenters.length || !targetState.jobs.length) {
    return {
      emptyMessage: "Load a schedule CSV to view department KPI data.",
      groupOptions,
      selectedGroup,
      horizonDays,
      currentOnly,
      sortBy,
      summary: null,
      departments: [],
      flowGroups: [],
      bottlenecks: [],
      attentionItems: [],
    };
  }

  const today = startOfToday();
  const horizonEnd = addDays(today, horizonDays - 1);
  const departments = targetState.workCenters
    .filter((center) => {
      if (selectedGroup === "ALL") {
        return true;
      }

      if (selectedGroup.startsWith(FLOW_LOCATION_FILTER_PREFIX)) {
        return getDepartmentFlowLocation(targetState, center) === selectedGroup.slice(FLOW_LOCATION_FILTER_PREFIX.length);
      }

      return center === selectedGroup;
    })
    .map((department) => createDepartmentLoadKpi(department, targetState, today, horizonEnd, horizonDays, currentOnly))
    .filter((department) => department.openHours > 0 || department.pastDueHours > 0);
  const sortedDepartments = sortDepartmentKpis(departments, sortBy);
  const flowGroups = groupDepartmentsByFlowLocation(sortedDepartments);
  const summary = createDepartmentLoadSummary(sortedDepartments);
  const bottlenecks = sortedDepartments.slice(0, 5);
  const attentionItems = sortedDepartments.map(createDepartmentAttentionItem).filter(Boolean).slice(0, 8);

  return {
    emptyMessage: "No department load found for the selected filters.",
    groupOptions,
    selectedGroup,
    horizonDays,
    currentOnly,
    sortBy,
    summary,
    departments: sortedDepartments,
    flowGroups,
    bottlenecks,
    attentionItems,
  };
}

function createDepartmentLoadKpi(department, targetState, today, horizonEnd, horizonDays, currentOnly) {
  const capacitySettings = getDepartmentCapacitySettings(targetState, department);
  const effectiveDailyCapacity = capacitySettings.effectiveDailyCapacity;
  const horizonShift = getCapacityHorizonShift(targetState, department);
  const demandEnd = addDays(horizonEnd, horizonShift);
  const dailyLoad = Array.from({ length: horizonDays }, (_, index) => {
    const date = addDays(today, index);
    const dailyCapacity = getEffectiveCapacityForDate(targetState, department, date);
    return {
      date,
      dateKey: localDateKey(date),
      dateLabel: formatDayLabel(date),
      hours: 0,
      capacity: dailyCapacity,
      utilization: 0,
      bucketUtilization: 0,
      carryoverHours: 0,
      backlogHours: 0,
      jobKeys: new Set(),
      jobCount: 0,
    };
  });
  const openJobKeys = new Set();
  const pastDueJobKeys = new Set();
  const capacity = dailyLoad.reduce((sum, day) => sum + day.capacity, 0);
  let openHours = 0;
  let pastDueHours = 0;

  targetState.jobs.forEach((job) => {
    const shipDateKnown = isKnownDate(job.shipByDate);
    const dueDate = shipDateKnown ? stripTime(job.shipByDate) : demandEnd;
    if (dueDate > demandEnd) {
      return;
    }

    job.operations
      .filter(
        (operation) =>
          operation.phase !== "complete" &&
          operation.workCenter === department &&
          operation.hoursRemaining > 0 &&
          (!currentOnly || operation.phase === "current")
      )
      .forEach((operation) => {
        const hours = operation.hoursRemaining;
        const dayIndex = dueDate < today ? 0 : clamp(Math.floor((dueDate - today) / 86400000), 0, horizonDays - 1);
        openHours += hours;
        openJobKeys.add(job.key);
        dailyLoad[dayIndex].hours += hours;
        dailyLoad[dayIndex].jobKeys.add(job.key);

        if (dueDate < today) {
          pastDueHours += hours;
          pastDueJobKeys.add(job.key);
        }
      });
  });

  let cumulativeDemand = 0;
  let cumulativeCapacity = 0;

  dailyLoad.forEach((day) => {
    day.jobCount = day.jobKeys.size;
    day.bucketUtilization = day.capacity > 0 ? day.hours / day.capacity : 0;
    cumulativeDemand += day.hours;
    cumulativeCapacity += day.capacity;
    day.utilization = cumulativeCapacity > 0 ? cumulativeDemand / cumulativeCapacity : 0;
    day.carryoverHours = Math.max(0, cumulativeCapacity - cumulativeDemand);
    day.backlogHours = Math.max(0, cumulativeDemand - cumulativeCapacity);
  });

  const utilization = capacity > 0 ? openHours / capacity : 0;
  const overloadedDays = dailyLoad.filter((day) => day.backlogHours > 0).length;
  const severeDailyOverload = dailyLoad.some((day) => day.utilization > 1.1);
  const status = getDepartmentLoadStatus(utilization, severeDailyOverload);

  return {
    department,
    flowLocation: getDepartmentFlowLocation(targetState, department),
    openHours,
    capacity,
    machineCapacity: capacitySettings.machineCapacity,
    manHours: capacitySettings.manHours,
    capacityMode: capacitySettings.mode,
    actualConstraint: capacitySettings.actualConstraint,
    effectiveDailyCapacity,
    horizonShift,
    utilization,
    pastDueHours,
    pastDueJobCount: pastDueJobKeys.size,
    overloadedDays,
    jobCount: openJobKeys.size,
    status,
    dailyLoad,
  };
}

function groupDepartmentsByFlowLocation(departments) {
  return FLOW_LOCATION_OPTIONS.map((flowLocation) => ({
    flowLocation,
    departments: departments.filter((department) => department.flowLocation === flowLocation),
  })).filter((group) => group.departments.length > 0);
}

function createDepartmentLoadSummary(departments) {
  const totalOpenHours = departments.reduce((sum, department) => sum + department.openHours, 0);
  const totalCapacity = departments.reduce((sum, department) => sum + department.capacity, 0);
  const pastDueHours = departments.reduce((sum, department) => sum + department.pastDueHours, 0);

  return {
    totalOpenHours,
    totalCapacity,
    averageUtilization: totalCapacity > 0 ? totalOpenHours / totalCapacity : 0,
    overloadedDepartmentCount: departments.filter((department) => department.status === "overloaded").length,
    pastDueHours,
    departmentCount: departments.length,
  };
}

function sortDepartmentKpis(departments, sortBy) {
  return departments.slice().sort((a, b) => {
    if (sortBy === "most-past-due") {
      return b.pastDueHours - a.pastDueHours || b.utilization - a.utilization || a.department.localeCompare(b.department);
    }
    if (sortBy === "most-open-hours") {
      return b.openHours - a.openHours || b.utilization - a.utilization || a.department.localeCompare(b.department);
    }
    if (sortBy === "department-az") {
      return a.department.localeCompare(b.department);
    }
    return b.utilization - a.utilization || b.openHours - a.openHours || a.department.localeCompare(b.department);
  });
}

function getDepartmentLoadStatus(utilization, severeDailyOverload) {
  if (utilization > 1 || severeDailyOverload) {
    return "overloaded";
  }
  if (utilization >= 0.85) {
    return "high";
  }
  if (utilization < 0.4) {
    return "low";
  }
  return "normal";
}

function createDepartmentAttentionItem(department) {
  if (department.utilization > 1.1 && department.pastDueHours > 0) {
    return {
      department: department.department,
      severity: "danger",
      issue: "Severe overload & high past due",
      impact: `${formatHours(department.pastDueHours)} hrs past due`,
      recommendation: "Add capacity or reschedule jobs",
    };
  }
  if (department.utilization > 1) {
    return {
      department: department.department,
      severity: "danger",
      issue: "Overloaded in selected horizon",
      impact: `${department.overloadedDays} overloaded days`,
      recommendation: "Shift work or review capacity",
    };
  }
  if (department.pastDueHours > 0) {
    return {
      department: department.department,
      severity: "warning",
      issue: "Past due backlog",
      impact: `${formatHours(department.pastDueHours)} hrs past due`,
      recommendation: "Review aging work orders",
    };
  }
  if (department.utilization >= 0.85) {
    return {
      department: department.department,
      severity: "warning",
      issue: "Near capacity",
      impact: `${formatPercent(department.utilization)} utilization`,
      recommendation: "Monitor and balance load",
    };
  }
  return null;
}

function getDepartmentViewerModel(targetState) {
  if (!targetState.workCenters.length) {
    return {
      emptyMessage: "Choose a CSV to load department hours.",
      centerOptions: [],
      selectedCenter: "",
      currentOnly: targetState.filters.departmentViewerCurrentOnly,
      viewMode: targetState.filters.departmentViewerMode,
      dayColumns: [],
      totalHours: 0,
      totalJobs: 0,
      exportDisabled: true,
    };
  }

  const centerOptions = targetState.workCenters.map((center) => ({ value: center, label: center }));
  const selectedCenter = targetState.filters.selectedDepartmentViewerCenter || targetState.workCenters[0];
  const currentOnly = targetState.filters.departmentViewerCurrentOnly;
  const viewMode = targetState.filters.departmentViewerMode;
  const capacity = getCapacityForCenter(targetState, selectedCenter);
  const jobsForDepartment = getDepartmentShipDateJobs(selectedCenter, targetState.jobs, currentOnly);
  const groupedByDate = new Map();
  const today = startOfToday();

  jobsForDepartment.forEach((jobItem) => {
    const bucket = getDepartmentDateBucket(jobItem, today);
    if (!groupedByDate.has(bucket.key)) {
      groupedByDate.set(bucket.key, {
        key: bucket.key,
        label: bucket.label,
        date: bucket.date,
        sortRank: bucket.sortRank,
        isPastDue: bucket.isPastDue,
        isPastDueBucket: bucket.isPastDueBucket,
        jobs: [],
      });
    }
    groupedByDate.get(bucket.key).jobs.push({
      ...jobItem,
      dateNote: bucket.isPastDueBucket ? jobItem.shipDateLabel : "",
    });
  });

  const dayColumns = [...groupedByDate.values()]
    .sort((a, b) => a.sortRank - b.sortRank || a.date - b.date || a.label.localeCompare(b.label))
    .map((day) => {
      const jobs = day.jobs.sort(
        (a, b) => {
          if (day.isPastDueBucket) {
            return a.shipByDate - b.shipByDate || b.hours - a.hours || a.job.displayId.localeCompare(b.job.displayId);
          }

          return b.hours - a.hours || a.job.displayId.localeCompare(b.job.displayId);
        }
      );
      const hours = jobs.reduce((sum, jobItem) => sum + jobItem.hours, 0);
      const dayCapacity = getEffectiveCapacityForDate(targetState, selectedCenter, day.date);
      return {
        ...day,
        jobs,
        hours,
        capacity: dayCapacity,
        overCapacity: dayCapacity > 0 && hours > dayCapacity,
      };
    });
  const pastDueColumns = dayColumns.filter((day) => day.isPastDue);
  const pastDueJobCount = pastDueColumns.reduce((sum, day) => sum + day.jobs.length, 0);
  const pastDueHours = pastDueColumns.reduce((sum, day) => sum + day.hours, 0);

  return {
    centerOptions,
    selectedCenter,
    currentOnly,
    viewMode,
    capacity,
    dayColumns,
    totalHours: jobsForDepartment.reduce((sum, jobItem) => sum + jobItem.hours, 0),
    totalJobs: jobsForDepartment.length,
    pastDueJobCount,
    pastDueHours,
    exportDisabled: !targetState.jobs.length,
    emptyMessage: currentOnly
      ? `No open jobs are currently at ${selectedCenter}.`
      : `No open jobs are routed through ${selectedCenter}.`,
  };
}

function createMasterSchedulerModel(targetState, visibleJobs, centerOptions, selectedCenter) {
  const today = startOfToday();
  const queueRows = visibleJobs
    .slice()
    .sort((a, b) =>
      a.productionDate - b.productionDate ||
      a.shipByDate - b.shipByDate ||
      a.currentSequence - b.currentSequence ||
      a.displayId.localeCompare(b.displayId)
    )
    .map((job) => {
      const focusOperation = job.currentOperations[0] || job.currentOperation || getOpenOperations(job)[0] || null;
      const currentCenterNames = uniqueValues(job.currentOperations.map((operation) => operation.workCenter));
      const currentCenterLabel = currentCenterNames.length
        ? currentCenterNames.join(" / ")
        : (focusOperation && focusOperation.workCenter) || "Unassigned";

      return {
        id: `${job.key}:master`,
        job,
        operation: focusOperation,
        queueType: "job",
        hours: job.totalHoursRemaining,
        focusOperationId: focusOperation && focusOperation.key,
        projectedLate: stripTime(job.productionDate) < today,
        metaText: buildMetaText(job, focusOperation, job.productionDateLabel),
        statLabel: `${currentCenterLabel} | ${job.remainingDepartmentCount} depts left`,
        dateLabel: formatDate(job.productionDate),
      };
    });

  const totalHours = queueRows.reduce((sum, row) => sum + row.hours, 0);
  const totalRemainingDepartments = queueRows.reduce((sum, row) => sum + row.job.remainingDepartmentCount, 0);

  return {
    mode: "master",
    centerLabel: "All Departments",
    badgeLabel: "Master list",
    hint: "Master list sorted by production date across all departments.",
    countLabel: `${queueRows.length} jobs`,
    centerOptions,
    selectedCenter,
    includeIncoming: targetState.filters.includeIncoming,
    partialsOnly: targetState.filters.partialsOnly,
    rows: queueRows,
    stats: [
      { label: "Queue Jobs", value: String(queueRows.length) },
      { label: "Remaining Hours", value: `${formatHours(totalHours)} hrs` },
      { label: "Open Departments", value: String(totalRemainingDepartments) },
      { label: "Projected Load", value: "Master list" },
      { label: "Projected Lates", value: "Dept-driven", late: true },
      { label: "Late Catchup", value: "Use departments", late: true },
    ],
    emptyMessage: "No jobs match the active Scheduler filters.",
  };
}

function createDepartmentSchedulerModel(targetState, visibleJobs, centerOptions, selectedCenter) {
  const capacity = getCapacityForCenter(targetState, selectedCenter);
  const currentItems = getCurrentItemsForCenter(selectedCenter, visibleJobs);
  const incomingItems = targetState.filters.includeIncoming ? getIncomingItemsForCenter(selectedCenter, visibleJobs) : [];
  const queueItems = currentItems.concat(incomingItems).sort((a, b) =>
    a.job.productionDate - b.job.productionDate ||
    a.job.shipByDate - b.job.shipByDate ||
    a.operation.sequence - b.operation.sequence ||
    a.operation.key.localeCompare(b.operation.key) ||
    a.queueRank - b.queueRank
  );

  const schedulingStartDate = getSchedulingStartDate();
  let cumulativeHours = 0;
  const queueRows = queueItems.map((item) => {
    const startDay = capacity > 0 ? Math.floor(cumulativeHours / capacity) + 1 : null;
    const finishDay = capacity > 0 ? Math.floor(Math.max(cumulativeHours + item.hours - 0.0001, 0) / capacity) + 1 : null;
    const projectedCompletionDate = finishDay ? addWorkingDays(schedulingStartDate, finishDay - 1) : item.job.productionDate;
    const projectedLate = projectedCompletionDate > stripTime(item.job.shipByDate);
    cumulativeHours += item.hours;

    return {
      id: `${item.job.key}:${item.operation.key}:${item.queueType}`,
      job: item.job,
      operation: item.operation,
      queueType: item.queueType,
      hours: item.hours,
      focusOperationId: item.operation.key,
      projectedLate,
      startDay,
      finishDay,
      metaText: buildMetaText(item.job, item.operation, item.job.productionDateLabel),
      statLabel: item.queueType === "incoming"
        ? `After ${item.arrivalSequenceOffset} prior step${item.arrivalSequenceOffset === 1 ? "" : "s"}`
        : `Day ${startDay}${finishDay > startDay ? ` -> Day ${finishDay}` : ""}`,
      dateLabel: formatDate(projectedCompletionDate),
    };
  });

  const projectedLateRows = queueRows.filter((row) => row.projectedLate);
  const lateHours = projectedLateRows.reduce((sum, row) => sum + row.hours, 0);
  const lastProjectedLateRow = projectedLateRows[projectedLateRows.length - 1] || null;
  const currentHours = currentItems.reduce((sum, item) => sum + item.hours, 0);
  const incomingHours = incomingItems.reduce((sum, item) => sum + item.hours, 0);
  const totalHours = queueRows.reduce((sum, row) => sum + row.hours, 0);
  const projectedDays = capacity > 0 ? totalHours / capacity : 0;

  return {
    mode: "department",
    centerLabel: selectedCenter,
    badgeLabel: `${formatHours(capacity)} hrs/day`,
    hint: projectedLateRows.length
      ? `This department gets out of lates on Day ${lastProjectedLateRow.finishDay} (${lastProjectedLateRow.dateLabel}) based on projected completion versus ship date.`
      : "This department has no projected late backlog in its current queue.",
    countLabel: `${queueRows.length} operations`,
    centerOptions,
    selectedCenter,
    includeIncoming: targetState.filters.includeIncoming,
    partialsOnly: targetState.filters.partialsOnly,
    rows: queueRows,
    stats: [
      { label: "Queue Ops", value: String(queueRows.length) },
      { label: "Current Hours", value: `${formatHours(currentHours)} hrs` },
      { label: "Incoming Hours", value: `${formatHours(incomingHours)} hrs` },
      { label: "Projected Load", value: `${capacity > 0 ? formatHours(projectedDays) : "0"} days` },
      {
        label: "Projected Lates",
        value: `${projectedLateRows.length} jobs | ${formatHours(lateHours)} hrs`,
        late: true,
      },
      {
        label: "Late Catchup",
        value: projectedLateRows.length ? `Clear by Day ${lastProjectedLateRow.finishDay}` : "No projected lates",
        late: true,
      },
    ],
    emptyMessage: "No queued work is currently routed into this department.",
  };
}

function createEmptySchedulerModel({ centerOptions, selectedCenter, includeIncoming, partialsOnly, emptyMessage }) {
  return {
    mode: "master",
    centerLabel: selectedCenter === "ALL" ? "All Departments" : selectedCenter || "Scheduler",
    badgeLabel: selectedCenter === "ALL" ? "Master list" : "0 hrs/day",
    hint: emptyMessage,
    countLabel: "0 jobs",
    centerOptions,
    selectedCenter,
    includeIncoming,
    partialsOnly,
    rows: [],
    stats: [],
    emptyMessage,
  };
}

function getCurrentItemsForCenter(center, jobs) {
  return jobs.flatMap((job) =>
    job.currentOperations
      .filter((operation) => operation.workCenter === center && operation.hoursRemaining > 0)
      .map((operation) => ({
        job,
        operation,
        hours: operation.hoursRemaining,
        queueRank: 0,
        queueType: "current",
      }))
  );
}

function getIncomingItemsForCenter(center, jobs) {
  return jobs.flatMap((job) => {
    const openOperations = getOpenOperations(job);

    return job.operations
      .filter((operation) => operation.phase === "future" && operation.workCenter === center && operation.hoursRemaining > 0)
      .map((operation) => ({
        job,
        operation,
        hours: operation.hoursRemaining,
        queueRank: 1,
        queueType: "incoming",
        arrivalSequenceOffset: Math.max(openOperations.findIndex((candidate) => candidate.key === operation.key), 1),
      }));
  });
}

function getAllOpenItemsForCenter(center, jobs) {
  return jobs
    .flatMap((job) =>
      job.operations
        .filter((operation) => operation.phase !== "complete" && operation.workCenter === center && operation.hoursRemaining > 0)
        .map((operation) => ({
          job,
          operation,
          hours: operation.hoursRemaining,
        }))
    )
    .sort((a, b) =>
      a.job.productionDate - b.job.productionDate ||
      a.job.shipByDate - b.job.shipByDate ||
      a.operation.sequence - b.operation.sequence ||
      a.operation.key.localeCompare(b.operation.key)
    );
}

function getDepartmentShipDateJobs(center, jobs, currentOnly = false) {
  return jobs
    .map((job) => {
      const operations = job.operations.filter(
        (operation) =>
          operation.phase !== "complete" &&
          operation.workCenter === center &&
          operation.hoursRemaining > 0 &&
          (!currentOnly || operation.phase === "current")
      );
      if (!operations.length) {
        return null;
      }

      const hours = operations.reduce((sum, operation) => sum + operation.hoursRemaining, 0);
      const operationLabels = uniqueValues(operations.map((operation) => operation.operationName));
      const sequenceLabels = uniqueValues(operations.map((operation) => operation.sequenceLabel));
      const workCenterLabels = uniqueValues(operations.map((operation) => operation.workCenter));
      const shipDateKnown = isKnownDate(job.shipByDate);

      return {
        job,
        hours,
        operationCount: operations.length,
        operationLabels,
        sequenceLabels,
        workCenterLabels,
        focusOperationId: operations[0]?.key || "",
        shipByDate: job.shipByDate,
        shipDateKey: shipDateKnown ? localDateKey(job.shipByDate) : "unknown",
        shipDateLabel: shipDateKnown ? formatDayLabel(job.shipByDate) : "Unknown",
      };
    })
    .filter(Boolean)
    .sort((a, b) =>
      a.shipByDate - b.shipByDate ||
      b.hours - a.hours ||
      a.job.displayId.localeCompare(b.job.displayId)
    );
}

function getDepartmentCustomerHourRows(jobs) {
  const today = startOfToday();
  const groups = new Map();

  jobs.forEach((job) => {
    const customer = job.customer || "No customer";
    const isPastDue = isKnownDate(job.shipByDate) && stripTime(job.shipByDate) < today;

    job.operations
      .filter((operation) => operation.phase !== "complete" && operation.hoursRemaining > 0)
      .forEach((operation) => {
        const key = `${operation.workCenter}|||${customer}`;
        if (!groups.has(key)) {
          groups.set(key, {
            department: operation.workCenter,
            customer,
            workOrders: new Set(),
            pastDueWorkOrders: new Set(),
            currentWorkOrders: new Set(),
            incomingWorkOrders: new Set(),
            openHours: 0,
            pastDueHours: 0,
            currentHours: 0,
            incomingHours: 0,
          });
        }

        const group = groups.get(key);
        group.workOrders.add(job.displayId);
        group.openHours += operation.hoursRemaining;

        if (isPastDue) {
          group.pastDueWorkOrders.add(job.displayId);
          group.pastDueHours += operation.hoursRemaining;
        }

        if (operation.phase === "current") {
          group.currentWorkOrders.add(job.displayId);
          group.currentHours += operation.hoursRemaining;
        } else {
          group.incomingWorkOrders.add(job.displayId);
          group.incomingHours += operation.hoursRemaining;
        }
      });
  });

  return [...groups.values()]
    .map((group) => ({
      Department: group.department,
      Customer: group.customer,
      "Open WO Count": group.workOrders.size,
      "Open Hours": roundForCsv(group.openHours),
      "Past Due WO Count": group.pastDueWorkOrders.size,
      "Past Due Hours": roundForCsv(group.pastDueHours),
      "Current WO Count": group.currentWorkOrders.size,
      "Current Hours": roundForCsv(group.currentHours),
      "Incoming WO Count": group.incomingWorkOrders.size,
      "Incoming Hours": roundForCsv(group.incomingHours),
    }))
    .sort((a, b) => a.Department.localeCompare(b.Department) || a.Customer.localeCompare(b.Customer));
}

function matchesSearch(job, searchValue) {
  if (!searchValue) {
    return true;
  }

  const haystack = [
    job.displayId,
    job.customer,
    job.part,
    job.description,
    ...job.workOrders,
    ...job.operations.map((operation) => operation.workCenter),
    ...job.operations.map((operation) => operation.operationName),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(searchValue);
}

function buildMetaText(job, operation, productionDateLabel) {
  return `${job.customer || "No customer"} | ${job.part || "No part"} | ${
    (operation && operation.sequenceLabel) || "Complete"
  } | ${((operation && operation.operationName) || "No operation")} | Production ${productionDateLabel}`;
}

function getOpenOperations(job) {
  return job.operations.filter((operation) => operation.phase !== "complete" && operation.hoursRemaining > 0);
}

function getSchedulingStartDate() {
  let next = startOfToday();
  while (!isWorkingDay(next)) {
    next = new Date(next.getFullYear(), next.getMonth(), next.getDate() + 1);
  }
  return next;
}

function formatDayLabel(date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDepartmentDateBucket(jobItem, today) {
  const shipDateKnown = isKnownDate(jobItem.shipByDate);
  if (!shipDateKnown) {
    return {
      key: "unknown",
      label: "Unknown",
      date: MAX_DATE,
      sortRank: Number.MAX_SAFE_INTEGER,
      isPastDue: false,
      isPastDueBucket: false,
    };
  }

  const shipDate = stripTime(jobItem.shipByDate);
  if (shipDate >= today) {
    return {
      key: jobItem.shipDateKey,
      label: jobItem.shipDateLabel,
      date: shipDate,
      sortRank: shipDate.getTime(),
      isPastDue: false,
      isPastDueBucket: false,
    };
  }

  const daysPastDue = Math.max(1, Math.ceil((today - shipDate) / 86400000));
  const weeksPastDue = Math.max(1, Math.ceil(daysPastDue / 7));
  const label = weeksPastDue === 1 ? "1 wk past due" : `${weeksPastDue} wks past due`;

  return {
    key: `past-due-${weeksPastDue}`,
    label,
    date: addDays(today, -weeksPastDue * 7),
    sortRank: -weeksPastDue,
    isPastDue: true,
    isPastDueBucket: true,
  };
}

function uniqueJobCount(items) {
  return new Set(items.map((item) => item.job.key)).size;
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function renderSharedChrome(targetRefs, targetState) {
  targetRefs.sourcePill.textContent = targetState.sourceName;

  const views = [
    { id: "capacity", button: targetRefs.viewCapacity, page: targetRefs.pageCapacity },
    { id: "departments", button: targetRefs.viewDepartments, page: targetRefs.pageDepartments },
    { id: "kpi", button: targetRefs.viewKpi, page: targetRefs.pageKpi },
    { id: "pick-list", button: targetRefs.viewPickList, page: targetRefs.pagePickList },
    { id: "sequencers", button: targetRefs.viewSequencers, page: targetRefs.pageSequencers },
  ];

  views.forEach(({ id, button, page }) => {
    const active = targetState.currentView === id;
    page.classList.toggle("is-active", active);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderScheduler(targetRefs, viewModel) {
  renderSchedulerControls(targetRefs, viewModel);
  targetRefs.sequencerTopStats.innerHTML = createSchedulerTopStats(viewModel.stats);

  if (!viewModel.rows.length) {
    targetRefs.sequencersGrid.replaceChildren(
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

  targetRefs.sequencersGrid.replaceChildren(createFragment(createSchedulerCard(viewModel)));
}

function renderCapacity(targetRefs, viewModel) {
  if (!viewModel.allCards?.length && !viewModel.cards.length) {
    targetRefs.capacityGrid.innerHTML = createEmptyState(viewModel.emptyMessage || "Choose a CSV to load capacity.");
    return;
  }

  const markup = `
    <div class="capacity-page-copy">
      <span>Set machine capacity, labor hours, capacity mode, and flow location for each department.</span>
      <span>Effective Capacity is calculated from Machine Capacity, Man Hours, and Capacity Mode.</span>
    </div>
    ${createCapacitySummaryStrip(viewModel.summary)}
    ${createCapacityToolbar(viewModel)}
    ${
      viewModel.groups.length
        ? `<div class="capacity-flow-groups ${viewModel.filters.compactView ? "capacity-flow-groups-compact" : ""}">
            ${viewModel.groups.map((group) => createCapacityFlowSection(group, viewModel)).join("")}
          </div>`
        : createEmptyState(viewModel.emptyMessage || "No departments match the selected capacity filters.")
    }
  `;

  targetRefs.capacityGrid.replaceChildren(createFragment(markup));
}

function renderPickList(targetRefs, viewModel) {
  const markup = `
    <div class="pick-list-shell ${viewModel.loaded ? "" : "pick-list-shell-empty"}">
      <div class="pick-list-backdrop" aria-hidden="${viewModel.loaded ? "true" : "false"}">
        ${createPickListControls(viewModel)}
        ${viewModel.loaded ? createPickListSections(viewModel) : createPickListPlaceholderBoard()}
      </div>
      ${viewModel.loaded ? "" : createPickListUploadCard()}
    </div>
  `;

  targetRefs.pickListRoot.replaceChildren(createFragment(markup));
}

function createPickListUploadCard() {
  return `
    <section class="pick-list-upload-card">
      <span class="pick-list-upload-icon" aria-hidden="true">CSV</span>
      <h3>Upload Shipping Schedule CSV</h3>
      <p>Load the shipping schedule to build customer pick lists grouped by Past Due, Today, and Upcoming.</p>
      <button class="button button-primary" type="button" data-pick-list-upload>Choose Shipping CSV</button>
    </section>
  `;
}

function createPickListPlaceholderBoard() {
  return `
    <div class="pick-list-placeholder-grid">
      ${["Past Due", "Today", "Upcoming"].map((label) => `<div class="pick-list-placeholder-card"><span>${label}</span></div>`).join("")}
    </div>
  `;
}

function createPickListControls(viewModel) {
  if (!viewModel.loaded) {
    return "";
  }

  return `
    <section class="pick-list-controls">
      <div>
        <span class="live-pill">${escapeHtml(viewModel.sourceName || "Shipping CSV loaded")}</span>
        <p class="pick-list-note">${
          viewModel.scheduleLoaded ? "Work center schedule loaded. WO links and suggestions are active." : "Load work center schedule to link WOs."
        }</p>
      </div>
      <div class="control-field">
        <label for="pick-list-customer">Customer Group</label>
        <select id="pick-list-customer" data-pick-list-customer>
          <option value=""${viewModel.selectedCustomer === "" ? " selected" : ""}>Select Customer Group</option>
          <option value="ALL"${viewModel.selectedCustomer === "ALL" ? " selected" : ""}>All Customer Groups</option>
          ${viewModel.customers
            .map(
              (customer) =>
                `<option value="${escapeHtml(customer)}"${viewModel.selectedCustomer === customer ? " selected" : ""}>${escapeHtml(customer)}</option>`
            )
            .join("")}
        </select>
      </div>
      <div class="control-field">
        <label for="pick-list-customer-detail">Drill Down</label>
        <select id="pick-list-customer-detail" data-pick-list-customer-detail${viewModel.customerDetails.length > 1 ? "" : " disabled"}>
          <option value=""${viewModel.selectedCustomerDetail === "" ? " selected" : ""}>All in group</option>
          ${viewModel.customerDetails
            .map(
              (customer) =>
                `<option value="${escapeHtml(customer)}"${viewModel.selectedCustomerDetail === customer ? " selected" : ""}>${escapeHtml(customer)}</option>`
            )
            .join("")}
        </select>
      </div>
      <div class="control-field">
        <label for="pick-list-commitment">Commitment</label>
        <select id="pick-list-commitment" data-pick-list-commitment>
          <option value="all"${viewModel.commitmentFilter === "all" ? " selected" : ""}>All</option>
          <option value="fully"${viewModel.commitmentFilter === "fully" ? " selected" : ""}>Fully committed only</option>
          <option value="not-fully"${viewModel.commitmentFilter === "not-fully" ? " selected" : ""}>Not fully committed only</option>
        </select>
      </div>
      <div class="control-field">
        <label for="pick-list-date-from">From</label>
        <input id="pick-list-date-from" type="date" value="${escapeHtml(viewModel.dateFrom)}" data-pick-list-date-from />
      </div>
      <div class="control-field">
        <label for="pick-list-date-to">To</label>
        <input id="pick-list-date-to" type="date" value="${escapeHtml(viewModel.dateTo)}" data-pick-list-date-to />
      </div>
      <label class="pick-list-search">
        <span class="sr-only">Search pick list</span>
        <input type="search" value="${escapeHtml(viewModel.search)}" placeholder="Search part, SO/TO, PO, shelf, WO..." data-pick-list-search />
      </label>
      <button class="button button-secondary" type="button" data-pick-list-upload>Reload CSV</button>
      <button class="button button-secondary" type="button" data-pick-list-print="all">Print All</button>
      <button class="button button-primary" type="button" data-pick-list-export="all">Export All</button>
    </section>
  `;
}

function createPickListSections(viewModel) {
  const groups = [viewModel.groupedRows.pastDue, viewModel.groupedRows.today, viewModel.groupedRows.upcoming];
  return `
    <section class="pick-list-summary">
      <div><span>Total Rows</span><strong>${viewModel.counts.total}</strong></div>
      <div><span>Past Due</span><strong>${viewModel.counts.pastDue}</strong></div>
      <div><span>Today</span><strong>${viewModel.counts.today}</strong></div>
      <div><span>Upcoming</span><strong>${viewModel.counts.upcoming}</strong></div>
    </section>
    <div class="pick-list-sections">
      ${groups.map(createPickListSection).join("")}
    </div>
  `;
}

function createPickListSection(group) {
  return `
    <section class="pick-list-section pick-list-section-${group.tone}">
      <div class="pick-list-section-head">
        <div>
          <h3>${escapeHtml(group.label)}</h3>
          <span>${group.rows.length} ${group.rows.length === 1 ? "row" : "rows"}</span>
        </div>
        <div class="pick-list-section-actions">
          <button class="button button-secondary" type="button" data-pick-list-print="${escapeHtml(group.key)}"${
            group.rows.length ? "" : " disabled"
          }>Print ${escapeHtml(group.label)}</button>
          <button class="button button-secondary" type="button" data-pick-list-export="${escapeHtml(group.key)}">Export ${escapeHtml(group.label)}</button>
        </div>
      </div>
      ${
        group.rows.length
          ? `<div class="pick-list-table-scroll">
              <table class="pick-list-table">
                <thead>
                  <tr>
                    <th>Ship Date</th>
                    <th>Part #</th>
                    <th>Customer</th>
                    <th>SO / TO</th>
                    <th>P O #</th>
                    <th>Needed</th>
                    <th>Committed</th>
                    <th>Remaining</th>
                    <th>Status</th>
                    <th>Shelf</th>
                    <th>FA/PPAP</th>
                    <th>Cell</th>
                    <th>Acc Report</th>
                    <th>WO Match</th>
                    <th>Current Dept</th>
                    <th>Current Op</th>
                  </tr>
                </thead>
                <tbody>${group.rows.map(createPickListRow).join("")}</tbody>
              </table>
            </div>`
          : `<p class="pick-list-empty">No ${escapeHtml(group.label.toLowerCase())} rows for the selected filters.</p>`
      }
    </section>
  `;
}

function createPickListRow(row) {
  const outsourcedTag =
    row.outsourcedSo.toLowerCase() === "outsourced" ? `<span class="pick-list-os-tag" title="${escapeHtml(row.outsourcedSo)}">OS</span>` : "";
  return `
    <tr class="pick-list-row pick-list-commit-${slugify(row.commitmentStatus)}">
      <td>${escapeHtml(row.shipDateLabel)}</td>
      <td><span class="pick-list-part"><strong>${escapeHtml(row.partNumber)}</strong>${outsourcedTag}</span></td>
      <td>${escapeHtml(row.customer)}</td>
      <td>${escapeHtml(row.soTo)}</td>
      <td>${escapeHtml(row.poNumber)}</td>
      <td>${formatHours(row.qtyNeeded)}</td>
      <td>${formatHours(row.qtyCommitted)}</td>
      <td class="${row.qtyRemaining > 0 ? "pick-list-short" : ""}">${formatHours(row.qtyRemaining)}</td>
      <td>${createCommitStatusBadge(row.commitmentStatus)}</td>
      <td>${escapeHtml(row.shelf)}</td>
      <td>${escapeHtml(row.faPpap)}</td>
      <td>${escapeHtml(row.cell)}</td>
      <td>${escapeHtml(row.accReport)}</td>
      <td>${createPickListMatchCell(row)}</td>
      <td>${escapeHtml(row.currentDepartment || "-")}</td>
      <td>${escapeHtml(row.currentOperation || "-")}</td>
    </tr>
  `;
}

function createCommitStatusBadge(status) {
  return `<span class="pick-list-status pick-list-status-${slugify(status)}">${escapeHtml(status)}</span>`;
}

function createPickListMatchCell(row) {
  if (row.matchType === "schedule-not-loaded") {
    return `<span class="pick-list-match-muted">Load work center schedule to link WOs</span>`;
  }

  if (row.matchType === "none") {
    return `<span class="pick-list-match-muted">No WO match</span>`;
  }

  const clickable = row.match?.job;
  const displayId = row.matchedDisplayId || row.matchedWo;
  const label =
    row.matchType === "suggested"
      ? `Suggested ${displayId}`
      : row.matchType === "linked-not-found"
        ? `Linked missing ${displayId}`
        : `Linked ${displayId}`;
  const badge =
    row.matchType === "suggested" && row.possibleMatchCount > 1
      ? `<span class="pick-list-match-badge">${row.possibleMatchCount} possible matches</span>`
      : "";
  const className =
    row.matchType === "suggested"
      ? "pick-list-wo-suggested"
      : row.matchType === "linked-not-found"
        ? "pick-list-wo-missing"
        : "pick-list-wo-linked";

  return `
    <span class="pick-list-match-wrap">
      ${
        clickable
          ? `<button class="pick-list-wo ${className}" type="button" data-pick-list-wo="${escapeHtml(row.matchedWo)}" data-pick-list-job-key="${escapeHtml(row.match.job.key)}">${escapeHtml(label)}</button>`
          : `<span class="pick-list-wo ${className}">${escapeHtml(label)}</span>`
      }
      ${badge}
    </span>
  `;
}

function createCapacitySummaryStrip(summary) {
  if (!summary) {
    return "";
  }

  return `
    <section class="capacity-summary-grid" aria-label="Capacity summary">
      ${createCapacitySummaryTile("Total Departments", summary.departmentCount, "Dept", "blue")}
      ${createCapacitySummaryTile(
        "Total Effective Capacity / Day",
        `${formatHours(summary.totalEffectiveCapacity)} hrs`,
        "Cap",
        "green"
      )}
      ${createCapacitySummaryTile("Departments Over Load", summary.overloadedCount, "Warn", "amber")}
      ${createCapacitySummaryTile("Labor-Constrained Depts", summary.laborConstrainedCount, "Labor", "purple")}
    </section>
  `;
}

function createCapacitySummaryTile(label, value, icon, tone) {
  return `
    <article class="capacity-summary-tile capacity-summary-${tone}">
      <span class="capacity-summary-label">${escapeHtml(label)}</span>
      <strong class="capacity-summary-value">${escapeHtml(String(value))}</strong>
      <span class="capacity-summary-icon" aria-hidden="true">${escapeHtml(icon)}</span>
    </article>
  `;
}

function createCapacityToolbar(viewModel) {
  return `
    <section class="capacity-toolbar" aria-label="Capacity controls">
      <label class="capacity-search-shell">
        <span class="sr-only">Search departments</span>
        <input type="search" value="${escapeHtml(viewModel.filters.search)}" placeholder="Search departments..." data-capacity-search />
      </label>
      <div class="control-field capacity-toolbar-control">
        <label for="capacity-sort">Sort by</label>
        <select id="capacity-sort" data-capacity-sort>
          ${[
            ["flow-order", "Flow Order"],
            ["department-az", "Department A-Z"],
            ["highest-load", "Highest Load"],
            ["overloaded", "Overloaded First"],
            ["effective-capacity", "Effective Capacity"],
          ]
            .map(([value, label]) => `<option value="${value}"${value === viewModel.filters.sortBy ? " selected" : ""}>${label}</option>`)
            .join("")}
        </select>
      </div>
      <label class="capacity-compact-toggle">
        <span>Compact view</span>
        <span class="sequencer-toggle-track">
          <input type="checkbox" ${viewModel.filters.compactView ? "checked" : ""} data-capacity-compact />
          <span class="sequencer-toggle-thumb" aria-hidden="true"></span>
        </span>
      </label>
      <div class="control-field capacity-toolbar-control">
        <label for="capacity-flow-filter">Flow Location</label>
        <select id="capacity-flow-filter" data-capacity-flow-filter>
          <option value="ALL"${viewModel.filters.flowLocation === "ALL" ? " selected" : ""}>All Locations</option>
          ${viewModel.flowLocationOptions
            .map(
              (flowLocation) =>
                `<option value="${escapeHtml(flowLocation)}"${viewModel.filters.flowLocation === flowLocation ? " selected" : ""}>${escapeHtml(
                  flowLocation
                )}</option>`
            )
            .join("")}
        </select>
      </div>
      <button class="button button-secondary capacity-reset-button" type="button" data-capacity-reset>Reset</button>
    </section>
  `;
}

function createCapacityFlowSection(group, viewModel) {
  const meta = getFlowLocationMeta(group.flowLocation);
  return `
    <section class="capacity-flow-section capacity-flow-${slugify(group.flowLocation)}" style="--flow-accent:${meta.color}">
      <aside class="capacity-flow-section-header">
        <span class="capacity-flow-icon" aria-hidden="true">${escapeHtml(meta.icon)}</span>
        <div>
          <h3>${escapeHtml(group.flowLocation)}</h3>
          <span>${group.departments.length} ${group.departments.length === 1 ? "department" : "departments"}</span>
        </div>
      </aside>
      <div class="capacity-flow-section-cards">
        ${group.departments.map((card) => createCapacityDepartmentCard(card, viewModel)).join("")}
      </div>
    </section>
  `;
}

function createCapacityDepartmentCard(card, viewModel) {
  return `
    <article class="capacity-card">
      <div class="capacity-card-head">
        <div>
          <h3 class="capacity-center-name">${escapeHtml(card.center)}</h3>
        </div>
        <span class="capacity-badge">${card.activeJobCount} jobs</span>
      </div>
      <div class="capacity-card-body">
        <div class="capacity-settings-grid">
          <div class="control-field">
            <label for="machine-capacity-${slugify(card.center)}">Machine Cap / Day</label>
            <div class="capacity-input-row capacity-input-row-compact">
              <input
                id="machine-capacity-${slugify(card.center)}"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                spellcheck="false"
                value="${escapeHtml(String(card.machineCapacity))}"
                data-machine-center="${escapeHtml(card.center)}"
                data-saved-value="${escapeHtml(String(card.machineCapacity))}"
              />
              <button class="button button-secondary" type="button" disabled>hrs</button>
            </div>
          </div>
          <div class="control-field">
            <label for="capacity-horizon-shift-${slugify(card.center)}">Time Horizon Shift</label>
            <select id="capacity-horizon-shift-${slugify(card.center)}" data-horizon-shift-center="${escapeHtml(card.center)}">
              ${viewModel.horizonShiftOptions
                .map((days) => `<option value="${days}"${days === card.horizonShift ? " selected" : ""}>${days === 0 ? "0 days" : `+${days} ${days === 1 ? "day" : "days"}`}</option>`)
                .join("")}
            </select>
          </div>
          <div class="control-field">
            <label for="capacity-mode-${slugify(card.center)}">Capacity Mode</label>
            <select id="capacity-mode-${slugify(card.center)}" data-mode-center="${escapeHtml(card.center)}">
              ${viewModel.capacityModeOptions
                .map(
                  (mode) =>
                    `<option value="${escapeHtml(mode)}"${mode === card.capacityMode ? " selected" : ""}>${escapeHtml(mode)}</option>`
                )
                .join("")}
            </select>
          </div>
          <div class="control-field">
            <label for="flow-location-${slugify(card.center)}">Flow Location</label>
            <select id="flow-location-${slugify(card.center)}" data-flow-center="${escapeHtml(card.center)}">
              ${viewModel.flowLocationOptions
                .map(
                  (flowLocation) =>
                    `<option value="${escapeHtml(flowLocation)}"${flowLocation === card.flowLocation ? " selected" : ""}>${escapeHtml(
                      flowLocation
                    )}</option>`
                )
                .join("")}
              </select>
          </div>
        </div>
        <div class="capacity-manning-section">
          <span class="capacity-manning-label">Manning Hours / Day</span>
          <div class="capacity-manning-grid">
            ${viewModel.weekdayOptions.map((day) => createCapacityManningDayInput(card, day)).join("")}
          </div>
        </div>
        <div class="capacity-stats">
          <div class="capacity-stat capacity-stat-effective">
            <span class="capacity-stat-label">Effective Capacity</span>
            <span class="capacity-stat-value">${formatHours(card.capacity)} hrs/day</span>
            <small>${formatHours(card.weeklyEffectiveCapacity)} hrs/week</small>
          </div>
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
            <span class="capacity-stat-value">${card.planningCapacity > 0 ? formatHours(card.days) : "0"}</span>
          </div>
        </div>
        <span class="capacity-mode-pill capacity-mode-${slugify(card.actualConstraint)}">${escapeHtml(formatCapacityModeShort(card.actualConstraint))} Constrained</span>
      </div>
    </article>
  `;
}

function createCapacityManningDayInput(card, day) {
  const value = card.manHoursByDay?.[day.key] ?? card.manHours;
  return `
    <label class="capacity-manning-day">
      <span>${escapeHtml(day.label)}</span>
      <input
        type="text"
        inputmode="decimal"
        autocomplete="off"
        spellcheck="false"
        value="${escapeHtml(String(value))}"
        data-man-day-center="${escapeHtml(card.center)}"
        data-man-day="${escapeHtml(day.key)}"
        data-saved-value="${escapeHtml(String(value))}"
      />
      <small>hrs</small>
    </label>
  `;
}

function getFlowLocationMeta(flowLocation) {
  const meta = {
    "Material Handling": { icon: "MH", color: "#14b8a6" },
    "Screen Printing": { icon: "SP", color: "#06b6d4" },
    "Digital Printing": { icon: "DP", color: "#8b5cf6" },
    "Finishing Prep": { icon: "FP", color: "#f97316" },
    Cutting: { icon: "CT", color: "#3b82f6" },
    Finishing: { icon: "FN", color: "#ec4899" },
    Auxiliary: { icon: "AX", color: "#7c3aed" },
  };
  return meta[flowLocation] || meta.Auxiliary;
}

function renderKpiBoard(targetRefs, viewModel) {
  renderKpiControls(targetRefs, viewModel);

  if (!viewModel.summary || !viewModel.departments.length) {
    targetRefs.kpiBoardRoot.innerHTML = createEmptyState(viewModel.emptyMessage);
    return;
  }

  const markup = `
    ${createKpiFlowLegend()}
    <section class="kpi-summary-strip">
      ${createSummaryKpiCard("Total Open Hours", `${formatHours(viewModel.summary.totalOpenHours)} hrs`, `vs capacity ${formatHours(viewModel.summary.totalCapacity)} hrs`, "clock", "blue")}
      ${createSummaryKpiCard("Total Capacity", `${formatHours(viewModel.summary.totalCapacity)} hrs`, `next ${viewModel.horizonDays} days`, "team", "blue")}
      ${createSummaryKpiCard("Average Utilization", formatPercent(viewModel.summary.averageUtilization), `across ${viewModel.summary.departmentCount} departments`, "chart", viewModel.summary.averageUtilization > 1 ? "red" : viewModel.summary.averageUtilization >= 0.85 ? "amber" : "blue")}
      ${createSummaryKpiCard("Overloaded Departments", String(viewModel.summary.overloadedDepartmentCount), "> 100% utilization", "alert", viewModel.summary.overloadedDepartmentCount ? "red" : "blue")}
      ${createSummaryKpiCard("Past Due Hours", `${formatHours(viewModel.summary.pastDueHours)} hrs`, `across ${viewModel.summary.departmentCount} departments`, "calendar", viewModel.summary.pastDueHours ? "amber" : "blue")}
    </section>
    <section class="kpi-flow-board">
      ${viewModel.flowGroups.map(createFlowLocationSection).join("")}
    </section>
    <section class="kpi-bottom-grid">
      ${createTopBottlenecksTable(viewModel.bottlenecks, viewModel.horizonDays)}
      ${createDepartmentsNeedingAttention(viewModel.attentionItems)}
    </section>
  `;

  targetRefs.kpiBoardRoot.replaceChildren(createFragment(markup));
}

function renderDepartmentViewer(targetRefs, viewModel) {
  renderDepartmentViewerControls(targetRefs, viewModel);

  if (!viewModel.dayColumns.length) {
    targetRefs.departmentViewer.innerHTML = createEmptyState(viewModel.emptyMessage || "Choose a CSV to load department hours.");
    return;
  }

  const maxHours = Math.max(1, ...viewModel.dayColumns.map((day) => day.hours));
  const markup = `
    <div class="department-summary-strip">
      <div class="department-summary-card">
        <span class="department-summary-label">Department</span>
        <span class="department-summary-value">${escapeHtml(viewModel.selectedCenter)}</span>
      </div>
      <div class="department-summary-card">
        <span class="department-summary-label">Open Hours</span>
        <span class="department-summary-value">${formatHours(viewModel.totalHours)} hrs</span>
      </div>
      <div class="department-summary-card">
        <span class="department-summary-label">Past Due WO Count / Hours</span>
        <span class="department-summary-value">${viewModel.pastDueJobCount} / ${formatHours(viewModel.pastDueHours)} hrs</span>
      </div>
    </div>
    <div class="department-date-board department-date-board-${escapeHtml(viewModel.viewMode)}" style="--department-date-columns:${viewModel.dayColumns.length}">
      ${viewModel.dayColumns.map((day) => createDepartmentDateColumn(day, maxHours)).join("")}
    </div>
  `;

  targetRefs.departmentViewer.replaceChildren(createFragment(markup));
}

function renderError(targetRefs, message) {
  targetRefs.sourcePill.textContent = "No source loaded";
  targetRefs.sequencerCenterSelect.innerHTML = "";
  targetRefs.sequencerTopStats.innerHTML = "";
  targetRefs.sequencersGrid.innerHTML = createEmptyCard("Scheduler", "Master list", message);
  targetRefs.capacityGrid.innerHTML = createEmptyState(message);
  targetRefs.kpiBoardRoot.innerHTML = createEmptyState("Load a schedule CSV to view department KPI data.");
  renderPickList(targetRefs, getPickListViewModel(state));
  targetRefs.departmentViewer.innerHTML = createEmptyState(message);
}

function setTheme(targetRefs, theme) {
  document.body.dataset.theme = theme;
  targetRefs.themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
  targetRefs.themeToggle.setAttribute("title", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
}

function applySidebarState(sidebarState) {
  document.body.dataset.sidebar = sidebarState;
  document.body.dataset.sidebarMobile = "closed";
}

function openMobileSidebar(targetRefs) {
  document.body.dataset.sidebarMobile = "open";
  targetRefs.sidebarScrim.hidden = false;
}

function closeMobileSidebar(targetRefs) {
  document.body.dataset.sidebarMobile = "closed";
  targetRefs.sidebarScrim.hidden = true;
}

function renderSchedulerControls(targetRefs, viewModel) {
  targetRefs.sequencerCenterSelect.innerHTML = viewModel.centerOptions
    .map(({ value, label }) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join("");
  targetRefs.sequencerCenterSelect.value = viewModel.selectedCenter;
  targetRefs.sequencerIncludeIncoming.checked = viewModel.includeIncoming;
  targetRefs.sequencerPartialsOnly.checked = viewModel.partialsOnly;
}

function renderKpiControls(targetRefs, viewModel) {
  targetRefs.kpiDepartmentGroup.innerHTML = viewModel.groupOptions
    .map(({ value, label }) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join("");
  targetRefs.kpiDepartmentGroup.value = viewModel.selectedGroup;
  targetRefs.kpiHorizon.value = String(viewModel.horizonDays);
  targetRefs.kpiCurrentOnly.checked = viewModel.currentOnly;
  targetRefs.kpiSort.value = viewModel.sortBy;
}

function renderDepartmentViewerControls(targetRefs, viewModel) {
  targetRefs.departmentViewerCenterSelect.innerHTML = viewModel.centerOptions
    .map(({ value, label }) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join("");
  targetRefs.departmentViewerCenterSelect.value = viewModel.selectedCenter;
  targetRefs.departmentViewerCurrentOnly.checked = viewModel.currentOnly;
  targetRefs.departmentModeToggle.checked = viewModel.viewMode === "detailed";
  targetRefs.departmentModeToggleLabel.dataset.mode = viewModel.viewMode;
  targetRefs.departmentCustomerExport.disabled = viewModel.exportDisabled;
}

function exportDepartmentCustomerHours() {
  const rows = getDepartmentCustomerHourRows(state.jobs);
  if (!rows.length) {
    return;
  }

  const csv = serializeCsvRows(rows);
  const baseName = state.sourceName.replace(/\.csv$/i, "") || "scheduler";
  downloadTextFile(csv, `${baseName}-department-hours-by-customer.csv`, "text/csv;charset=utf-8");
}

function exportPickListGroup(groupKey) {
  const viewModel = getPickListViewModel(state);
  const rows =
    groupKey === "all"
      ? [
          ...viewModel.groupedRows.pastDue.rows.map((row) => ({ group: "Past Due", row })),
          ...viewModel.groupedRows.today.rows.map((row) => ({ group: "Today", row })),
          ...viewModel.groupedRows.upcoming.rows.map((row) => ({ group: "Upcoming", row })),
        ]
      : getPickListExportRowsForGroup(viewModel, groupKey);

  if (!rows.length) {
    return;
  }

  const csv = serializeCsvRows(rows.map(({ group, row }) => createPickListExportRow(group, row)));
  const baseName = (state.shippingSourceName || "shipping-pick-list").replace(/\.csv$/i, "");
  downloadTextFile(csv, `${baseName}-${groupKey || "all"}.csv`, "text/csv;charset=utf-8");
}

function getPickListExportRowsForGroup(viewModel, groupKey) {
  const group = viewModel.groupedRows[groupKey];
  if (!group) {
    return [];
  }

  return group.rows.map((row) => ({ group: group.label, row }));
}

function getPickListRowsForAction(viewModel, groupKey) {
  return groupKey === "all"
    ? [
        { group: "Past Due", key: "pastDue", rows: viewModel.groupedRows.pastDue.rows },
        { group: "Today", key: "today", rows: viewModel.groupedRows.today.rows },
        { group: "Upcoming", key: "upcoming", rows: viewModel.groupedRows.upcoming.rows },
      ]
    : [viewModel.groupedRows[groupKey]].filter(Boolean).map((group) => ({ group: group.label, key: group.key, rows: group.rows }));
}

function printPickList(groupKey = "all") {
  const viewModel = getPickListViewModel(state);
  const groups = getPickListRowsForAction(viewModel, groupKey);
  const totalRows = groups.reduce((total, group) => total + group.rows.length, 0);
  if (!totalRows) {
    window.alert("No pick list rows are available to print for the current filters.");
    return;
  }

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    window.alert("Allow popups for this page to print the pick list.");
    return;
  }

  printWindow.document.write(buildPickListPrintHtml(viewModel, groups, groupKey));
  printWindow.document.close();
  printWindow.focus();
  printWindow.setTimeout(() => {
    printWindow.print();
  }, 150);
}

function buildPickListPrintHtml(viewModel, groups, groupKey) {
  const totals = groups.reduce(
    (summary, group) => {
      group.rows.forEach((row) => {
        summary.rows += 1;
        summary.needed += Number(row.qtyNeeded || 0);
        summary.committed += Number(row.qtyCommitted || 0);
        summary.remaining += Number(row.qtyRemaining || 0);
      });
      return summary;
    },
    { rows: 0, needed: 0, committed: 0, remaining: 0 }
  );
  const printedGroup = groupKey === "all" ? "All Groups" : groups[0]?.group || "Selected Group";
  const customerLabel =
    viewModel.selectedCustomerDetail || (viewModel.selectedCustomer === "ALL" ? "All Customers" : viewModel.selectedCustomer || "All Customers");
  const dateRange = [viewModel.dateFrom ? `From ${formatPrintDateLabel(viewModel.dateFrom)}` : "", viewModel.dateTo ? `To ${formatPrintDateLabel(viewModel.dateTo)}` : ""]
    .filter(Boolean)
    .join(" ");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Shipping Pick List</title>
  <style>
    @page { size: landscape; margin: 0.35in; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #fff; color: #111827; font-family: Arial, Helvetica, sans-serif; font-size: 9px; line-height: 1.15; }
    h1 { margin: 0; font-size: 16pt; line-height: 1.05; }
    h2 { margin: 8px 0 3px; padding: 4px 6px; border: 1px solid #cbd5e1; background: #f1f5f9; font-size: 10pt; line-height: 1.1; }
    .print-header { border-bottom: 1.5px solid #111827; padding-bottom: 6px; margin-bottom: 7px; }
    .print-meta { display: grid; grid-template-columns: 1.2fr 0.8fr 0.9fr 1fr 1.2fr 0.8fr 1.1fr; gap: 3px 9px; margin-top: 5px; color: #374151; }
    .print-meta div { min-width: 0; }
    .print-meta span { display: block; color: #6b7280; font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
    .print-meta strong { display: block; color: #111827; font-size: 8.5px; line-height: 1.08; overflow-wrap: normal; }
    .print-legend { margin-top: 4px; color: #374151; font-size: 8px; }
    .print-section { break-inside: auto; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; }
    th, td { border: 1px solid #cbd5e1; padding: 3px 4px; vertical-align: top; }
    th { background: #e5e7eb; color: #111827; font-size: 8px; line-height: 1.05; text-align: left; text-transform: uppercase; letter-spacing: 0.02em; white-space: nowrap; }
    td { font-size: 8.5px; line-height: 1.12; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    .num, .status, .shelf, .hours, .dept, .wo { white-space: nowrap; }
    .num, .hours { text-align: right; }
    .part { font-weight: 700; overflow-wrap: anywhere; }
    .po, .operation { overflow-wrap: break-word; word-break: normal; }
    .operation { font-size: 8px; line-height: 1.1; color: #374151; }
    .muted { color: #6b7280; }
    .status { font-weight: 700; }
    .wo { font-weight: 700; }
    .no-print-rows { padding: 6px; border: 1px solid #cbd5e1; color: #6b7280; }
  </style>
</head>
<body>
  <header class="print-header">
    <h1>Shipping Pick List</h1>
    <div class="print-meta">
      <div><span>Customer</span><strong>${escapeHtml(customerLabel)}</strong></div>
      <div><span>Group</span><strong>${escapeHtml(printedGroup)}</strong></div>
      <div><span>Commit</span><strong>${escapeHtml(getPickListCommitmentLabel(viewModel.commitmentFilter))}</strong></div>
      <div><span>Generated</span><strong>${escapeHtml(formatPrintTimestamp(new Date()))}</strong></div>
      <div><span>Source</span><strong>${escapeHtml(viewModel.sourceName || "Shipping CSV")}</strong></div>
      <div><span>Rows</span><strong>${totals.rows}</strong></div>
      <div><span>Totals</span><strong>N ${escapeHtml(formatPrintNumber(totals.needed))} / C ${escapeHtml(formatPrintNumber(totals.committed))} / R ${escapeHtml(formatPrintNumber(totals.remaining))}</strong></div>
    </div>
    <div class="print-legend">* Suggested WO${dateRange ? ` | ${escapeHtml(dateRange)}` : ""}${viewModel.search ? ` | Search: ${escapeHtml(viewModel.search)}` : ""}</div>
  </header>
  ${groups.map(createPickListPrintSection).join("")}
</body>
</html>`;
}

function createPickListPrintSection(group) {
  return `
    <section class="print-section">
      <h2>${escapeHtml(group.group)} <span class="muted">- ${group.rows.length} ${group.rows.length === 1 ? "row" : "rows"}</span></h2>
      ${
        group.rows.length
          ? `<table>
              ${getPickListPrintColgroup()}
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Part</th>
                  <th>Need</th>
                  <th>Com</th>
                  <th>Rem</th>
                  <th>Status</th>
                  <th>Shelf</th>
                  <th>SO/TO</th>
                  <th>PO</th>
                  <th>WO</th>
                  <th>Dept</th>
                  <th>Op</th>
                  <th>Hrs</th>
                </tr>
              </thead>
              <tbody>${group.rows.map(createPickListPrintRow).join("")}</tbody>
            </table>`
          : `<div class="no-print-rows">No rows in this group for the current filters.</div>`
      }
    </section>
  `;
}

function getPickListPrintColgroup() {
  const widths = [7, 18, 5, 5, 5, 6, 6, 8, 10, 8, 7, 12, 3];
  return `<colgroup>${widths.map((width) => `<col style="width:${width}%">`).join("")}</colgroup>`;
}

function createPickListPrintRow(row) {
  return `
    <tr>
      <td>${escapeHtml(formatPrintShipDate(row.shipDate) || row.shipDateLabel || "")}</td>
      <td class="part">${escapeHtml(row.partNumber || "")}</td>
      <td class="num">${escapeHtml(formatPrintNumber(row.qtyNeeded))}</td>
      <td class="num">${escapeHtml(formatPrintNumber(row.qtyCommitted))}</td>
      <td class="num">${escapeHtml(formatPrintNumber(row.qtyRemaining))}</td>
      <td class="status">${escapeHtml(formatPrintCommitStatus(row.commitmentStatus))}</td>
      <td class="shelf">${escapeHtml(row.shelf || "")}</td>
      <td>${escapeHtml(row.soTo || "")}</td>
      <td class="po">${escapeHtml(row.poNumber || "")}</td>
      <td class="wo">${escapeHtml(getPrintWoLabel(row))}</td>
      <td class="dept">${escapeHtml(row.currentDepartment || "")}</td>
      <td class="operation">${escapeHtml(row.currentOperation || "")}</td>
      <td class="hours">${row.hoursRemaining ? escapeHtml(formatHours(row.hoursRemaining)) : ""}</td>
    </tr>
  `;
}

function getPrintWoLabel(row) {
  const displayWo = row.matchedDisplayId || row.matchedWo;
  if (displayWo) {
    if (row.matchType === "suggested") {
      return `${displayWo}*`;
    }
    if (row.matchType === "linked-not-found") {
      return `${displayWo} Missing`;
    }
    return displayWo;
  }
  const assocWo = normalizeWorkOrder(row.assocPrintWo) || row.assocPrintWo;
  return assocWo || "No match";
}

function formatPrintCommitStatus(status) {
  if (status === "Fully Committed") {
    return "Full";
  }
  if (status === "Uncommitted") {
    return "None";
  }
  if (status === "Overcommitted") {
    return "Over";
  }
  return status || "";
}

function formatPrintShipDate(date) {
  if (!date) {
    return "";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  }).format(date);
}

function getPickListCommitmentLabel(value) {
  if (value === "fully") {
    return "Fully committed only";
  }
  if (value === "not-fully") {
    return "Not fully committed only";
  }
  return "All";
}

function formatPrintDateLabel(value) {
  const parsed = parseDateInputValue(value);
  return parsed ? formatDate(parsed) : value;
}

function formatPrintTimestamp(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatPrintNumber(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(".0", "");
}

function createPickListExportRow(group, row) {
  return {
    Group: group,
    "Ship Date": row.shipDateLabel,
    Customer: row.customer,
    "Part #": row.partNumber,
    "SO / TO": row.soTo,
    "P O #": row.poNumber,
    "Qty Needed": row.qtyNeeded,
    "Qty Committed": row.qtyCommitted,
    "Qty Remaining": row.qtyRemaining,
    "Commit Status": row.commitmentStatus,
    "Shelf #": row.shelf,
    "FA/PPAP": row.faPpap,
    Cell: row.cell,
    "Acc Report": row.accReport,
    "Assoc. Print/WO": row.assocPrintWo,
    "Matched WO": row.matchedDisplayId || row.matchedWo,
    "Match Type": row.matchType,
    "Current Department": row.currentDepartment,
    "Current Operation": row.currentOperation,
    "Hours Remaining": roundForCsv(row.hoursRemaining),
  };
}

function openJobDetailByWorkOrder(woNumber) {
  const job = findJobByWorkOrder(state.jobs, woNumber);
  if (!job) {
    return;
  }

  openWorkOrderSchedule(job.key);
}

function openWorkOrderSchedule(jobKey) {
  const job = state.jobs.find((candidate) => candidate.key === jobKey);
  if (!job) {
    return;
  }

  const selectedCenter = state.filters.selectedDepartmentViewerCenter;
  const focusOperation =
    job.operations.find(
      (operation) => operation.phase !== "complete" && operation.workCenter === selectedCenter && operation.hoursRemaining > 0
    ) ||
    job.currentOperation ||
    job.operations.find((operation) => operation.phase !== "complete") ||
    job.operations[0];

  refs.workOrderModalBody.replaceChildren(createFragment(createWorkOrderScheduleModal(job, focusOperation?.key || "")));
  refs.workOrderModal.hidden = false;
  document.body.dataset.modalOpen = "true";
  refs.workOrderModalClose.focus();
}

function closeWorkOrderSchedule() {
  refs.workOrderModal.hidden = true;
  refs.workOrderModalBody.replaceChildren();
  delete document.body.dataset.modalOpen;
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

function createSummaryKpiCard(title, value, detail, icon, tone) {
  return `
    <article class="kpi-summary-card kpi-tone-${tone}">
      <span class="kpi-summary-icon" aria-hidden="true">${escapeHtml(getKpiIcon(icon))}</span>
      <div>
        <span class="kpi-summary-title">${escapeHtml(title)}</span>
        <strong class="kpi-summary-value">${escapeHtml(value)}</strong>
        <span class="kpi-summary-detail">${escapeHtml(detail)}</span>
      </div>
    </article>
  `;
}

function createKpiFlowLegend() {
  return `
    <section class="kpi-flow-legend-card" aria-label="Flow location legend">
      <div>
        <span class="kpi-flow-kicker">Flow Location (Shop Flow)</span>
        <div class="kpi-flow-legend-items">
          ${FLOW_LOCATION_OPTIONS.map(
            (flowLocation) => `
              <span class="kpi-flow-legend-item kpi-flow-${slugify(flowLocation)}">
                <span class="kpi-flow-dot" aria-hidden="true"></span>
                ${escapeHtml(flowLocation)}
              </span>
            `
          ).join("")}
        </div>
      </div>
      <div class="kpi-flow-direction" aria-hidden="true">
        <span>Shop Flow Direction</span>
        <span class="kpi-flow-arrow"></span>
      </div>
    </section>
  `;
}

function createFlowLocationSection(group) {
  return `
    <section class="kpi-flow-group kpi-flow-${slugify(group.flowLocation)}" style="--flow-span:${getFlowLocationColumnSpan(group)}">
      <div class="kpi-flow-group-head">
        <div>
          <h3>${escapeHtml(group.flowLocation)}</h3>
        </div>
        <span class="kpi-flow-count">${group.departments.length} ${group.departments.length === 1 ? "department" : "departments"}</span>
      </div>
      <div class="kpi-card-grid">
        ${group.departments.map(createDepartmentLoadCard).join("")}
      </div>
    </section>
  `;
}

function getFlowLocationColumnSpan(group) {
  if (group.flowLocation === "Auxiliary") {
    return group.departments.length > 4 ? 8 : 5;
  }

  if (group.departments.length <= 2) {
    return 4;
  }

  if (group.departments.length <= 3) {
    return 5;
  }

  if (group.departments.length <= 5) {
    return 7;
  }

  return 12;
}

function createDepartmentLoadCard(department) {
  const utilization = formatPercent(department.utilization);
  const donutValue = `${clamp(department.utilization, 0, 1.4) * 100}%`;
  const constraintLabel = formatCapacityModeShort(department.actualConstraint || department.capacityMode);
  const capacityTitle = `Effective capacity: ${formatHours(department.capacity)} hrs over horizon. Machine/day: ${formatHours(
    department.machineCapacity
  )} hrs. Labor/day: ${formatHours(department.manHours)} hrs. Constraint: ${department.actualConstraint || department.capacityMode}. Mode: ${department.capacityMode}. Horizon shift: +${department.horizonShift || 0} days.`;
  return `
    <article class="kpi-department-card kpi-status-${department.status}" title="${escapeHtml(capacityTitle)}">
      <div class="kpi-department-head">
        <h3>${escapeHtml(department.department)}</h3>
        <span class="kpi-status-badge">${escapeHtml(department.status.toUpperCase())}</span>
      </div>
      <div class="kpi-department-body">
        <div class="kpi-donut" style="--util:${donutValue}">
          <span>${escapeHtml(utilization)}</span>
        </div>
        <dl class="kpi-metric-list">
          <div><dt>Open Hours</dt><dd>${formatHours(department.openHours)} hrs</dd></div>
          <div><dt>Capacity</dt><dd>${formatHours(department.capacity)} hrs</dd></div>
          <div><dt>Past Due Hours</dt><dd>${formatHours(department.pastDueHours)} hrs</dd></div>
          <div><dt>Overloaded Days</dt><dd>${department.overloadedDays}</dd></div>
          <div><dt>Job Count</dt><dd>${department.jobCount}</dd></div>
        </dl>
      </div>
      <div class="kpi-capacity-context">
        <span>Machine/day: ${formatHours(department.machineCapacity)} hrs</span>
        <span>Labor/day: ${formatHours(department.manHours)} hrs</span>
        <span>Constraint: ${escapeHtml(constraintLabel)}</span>
        <span>Shift: +${department.horizonShift || 0} days</span>
      </div>
      ${createDailyLoadHeatStrip(department.dailyLoad)}
    </article>
  `;
}

function formatCapacityModeShort(mode) {
  if (mode === "Both constrained") {
    return "Both";
  }

  if (mode === "Machine constrained") {
    return "Machine";
  }

  return "Labor";
}

function createDailyLoadHeatStrip(dailyLoad) {
  return `
    <div class="kpi-heat-wrap">
      <span class="kpi-heat-label">${dailyLoad.length}-Day Load</span>
      <div class="kpi-heat-strip">
        ${dailyLoad
          .map(
            (day, index) => `
              <span
                class="kpi-heat-cell kpi-heat-${getDailyLoadTone(day)}"
                title="${escapeHtml(
                  `${day.dateLabel}: ${formatHours(day.hours)} due / ${formatHours(day.capacity)} capacity. Planned ${formatPercent(
                    day.utilization
                  )}${day.backlogHours > 0 ? `, ${formatHours(day.backlogHours)} hrs short` : `, ${formatHours(day.carryoverHours)} hrs available`}`
                )}"
              >
                <span class="sr-only">Day ${index + 1}</span>
              </span>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function createTopBottlenecksTable(departments, horizonDays) {
  return `
    <article class="kpi-table-panel">
      <h3>Top Bottlenecks</h3>
      <div class="kpi-table-scroll">
        <table class="kpi-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Department</th>
              <th>Utilization</th>
              <th>Open Hours</th>
              <th>Past Due Hours</th>
              <th>Overloaded Days</th>
              <th>Trend (${horizonDays}-Day)</th>
            </tr>
          </thead>
          <tbody>
            ${departments.map((department, index) => createBottleneckRow(department, index)).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function createBottleneckRow(department, index) {
  return `
    <tr>
      <td><span class="kpi-rank kpi-rank-${index + 1}">${index + 1}</span></td>
      <td><strong>${escapeHtml(department.department)}</strong></td>
      <td><span class="kpi-util-bar"><span style="--util:${clamp(department.utilization, 0, 1) * 100}%"></span></span>${formatPercent(department.utilization)}</td>
      <td>${formatHours(department.openHours)} hrs</td>
      <td class="${department.pastDueHours > 0 ? "kpi-danger-text" : ""}">${formatHours(department.pastDueHours)} hrs</td>
      <td>${department.overloadedDays}</td>
      <td>${createDailyLoadHeatStrip(department.dailyLoad)}</td>
    </tr>
  `;
}

function createDepartmentsNeedingAttention(items) {
  return `
    <article class="kpi-table-panel">
      <h3>Departments Needing Attention</h3>
      ${
        items.length
          ? `<div class="kpi-table-scroll">
              <table class="kpi-table">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th>Issue</th>
                    <th>Impact</th>
                    <th>Action Recommendation</th>
                  </tr>
                </thead>
                <tbody>${items.map(createAttentionRow).join("")}</tbody>
              </table>
            </div>`
          : `<p class="kpi-empty-note">No departments need attention for the selected horizon.</p>`
      }
    </article>
  `;
}

function createAttentionRow(item) {
  return `
    <tr>
      <td><span class="kpi-alert-dot kpi-alert-${item.severity}"></span><strong>${escapeHtml(item.department)}</strong></td>
      <td>${escapeHtml(item.issue)}</td>
      <td>${escapeHtml(item.impact)}</td>
      <td>${escapeHtml(item.recommendation)}</td>
    </tr>
  `;
}

function getDailyLoadTone(day) {
  if (!day.hours && !day.backlogHours) {
    return "muted";
  }
  if (day.backlogHours > 0) {
    return "red";
  }
  if (day.utilization >= 0.85) {
    return "amber";
  }
  return "blue";
}

function getKpiIcon(icon) {
  const icons = {
    alert: "!",
    calendar: "Cal",
    chart: "%",
    clock: "Hrs",
    team: "Cap",
  };
  return icons[icon] || "KPI";
}

function createDepartmentDateColumn(day, maxHours) {
  const fillRatio = Math.min(day.hours / maxHours, 1);
  const stateClasses = [day.overCapacity ? "is-over" : "", day.isPastDue ? "is-past-due" : ""].filter(Boolean).join(" ");
  const capacity = Number(day.capacity || 0);
  return `
    <section class="department-date-column${stateClasses ? ` ${stateClasses}` : ""}">
      <div class="department-date-head">
        <span class="department-date-label">${escapeHtml(day.label)}</span>
        <span class="department-date-total">${formatHours(day.hours)} hrs</span>
        <span class="department-date-capacity">${day.jobs.length} jobs${capacity > 0 ? ` | ${formatHours(capacity)} hrs/day` : ""}</span>
        <span class="department-date-fill" style="--fill:${fillRatio}"></span>
      </div>
      <div class="department-job-list">
        ${day.jobs.map(createDepartmentJobCard).join("")}
      </div>
    </section>
  `;
}

function createDepartmentJobCard(jobItem) {
  const sequenceText = jobItem.sequenceLabels.join(", ");
  const workCenterText = jobItem.workCenterLabels.join(" / ");
  const dateText = jobItem.dateNote || jobItem.shipDateLabel;
  return `
    <button class="department-job-card" type="button" data-job-key="${escapeHtml(jobItem.job.key)}" aria-label="Open schedule view for ${escapeHtml(jobItem.job.displayId)}">
      <div class="department-job-head">
        <span class="department-job-id">${escapeHtml(jobItem.job.displayId)}</span>
        <span class="department-job-hours">${formatHours(jobItem.hours)} hrs</span>
      </div>
      <div class="department-job-meta">${escapeHtml(jobItem.job.customer || "No customer")} - ${escapeHtml(
        jobItem.job.part || "No part"
      )}</div>
      <div class="department-job-op">${escapeHtml(dateText)} - ${escapeHtml(sequenceText || "Open")} - ${escapeHtml(
        workCenterText || "Department"
      )}</div>
    </button>
  `;
}

function createWorkOrderScheduleModal(job, focusOperationId) {
  const currentCenterNames = uniqueValues(job.currentOperations.map((operation) => operation.workCenter)).join(" / ") || "Complete";
  return `
    <div class="work-order-modal-head">
      <div>
        <p class="panel-kicker">Schedule View</p>
        <h2 id="work-order-modal-title">${escapeHtml(job.displayId)}</h2>
        <p class="work-order-modal-subtitle">${escapeHtml(job.customer || "No customer")} | ${escapeHtml(job.part || "No part")}</p>
      </div>
      <span class="sequencer-badge">${escapeHtml(currentCenterNames)}</span>
    </div>
    <div class="work-order-modal-stats">
      <div class="department-summary-card">
        <span class="department-summary-label">Production Date</span>
        <span class="department-summary-value">${escapeHtml(job.productionDateLabel)}</span>
      </div>
      <div class="department-summary-card">
        <span class="department-summary-label">Ship By</span>
        <span class="department-summary-value">${escapeHtml(job.shipByLabel)}</span>
      </div>
      <div class="department-summary-card">
        <span class="department-summary-label">Hours Remaining</span>
        <span class="department-summary-value">${formatHours(job.totalHoursRemaining)} hrs</span>
      </div>
    </div>
    <div class="work-order-modal-track">
      ${renderMiniSequenceTrack(job, focusOperationId)}
    </div>
    <div class="work-order-operation-list">
      ${job.operations.map((operation) => createWorkOrderOperationRow(operation, operation.key === focusOperationId)).join("")}
    </div>
  `;
}

function createWorkOrderOperationRow(operation, isFocus) {
  return `
    <div class="work-order-operation-row${isFocus ? " is-focus" : ""}">
      <div>
        <span class="work-order-operation-title">${escapeHtml(operation.sequenceLabel)} | ${escapeHtml(operation.workCenter)}</span>
        <span class="work-order-operation-name">${escapeHtml(operation.operationName || "Operation")}</span>
      </div>
      <div class="work-order-operation-stats">
        <span>${escapeHtml(operation.status || operation.phase)}</span>
        <strong>${formatHours(operation.hoursRemaining)} hrs</strong>
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
            title: `Inferred completed prior operation | Op ${sequence}`,
            label: "Completed Op",
            fillRatio: 1,
          })
        );
      }
    }

    if (previousSequence !== null && operation.sequence - previousSequence > 1) {
      for (let sequence = previousSequence + 1; sequence < operation.sequence; sequence += 1) {
        segments.push(`
          <span class="mini-segment mini-segment-gap" title="${escapeHtml(`Missing source operation | Op ${sequence}`)}">
            <span class="mini-segment-fill"></span>
            <span class="mini-segment-label">Missing Op</span>
          </span>
        `);
      }
    }

    const classes = ["mini-segment", `mini-segment-${operation.phase}`, operation.key === focusOperationId ? "is-focus" : ""]
      .filter(Boolean)
      .join(" ");

    segments.push(
      createMiniTrackSegment({
        classes,
        title: `${operation.workCenter || operation.sequenceLabel} | ${operation.operationName || "Operation"} | ${formatHours(
          operation.hoursRemaining
        )} Hours`,
        label: formatOperationTrackLabel(operation),
        fillRatio: operation.fillRatio,
      })
    );

    previousSequence = operation.sequence;
  });

  return `<div class="mini-track">${segments.join("")}</div>`;
}

function formatOperationTrackLabel(operation) {
  const operationLabel = operation.workCenter || operation.operationName || operation.sequenceLabel;
  return `${operationLabel} | ${formatHours(operation.hoursRemaining)} Hours`;
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

function serializeCsvRows(rows) {
  if (!rows.length) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header])).join(",")),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

function escapeCsvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadTextFile(text, filename, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}
