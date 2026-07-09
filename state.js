export const DEFAULT_SOURCE_NAME = "Awaiting source";
export const DEFAULT_DAILY_CAPACITY = 8;
export const THEME_STORAGE_KEY = "screen-print-scheduler-theme";
export const CAPACITY_STORAGE_KEY = "screen-print-scheduler-capacities";
export const SIDEBAR_STORAGE_KEY = "screen-print-scheduler-sidebar";

export function createInitialState() {
  return {
    rawRows: [],
    jobs: [],
    workCenters: [],
    sourceName: DEFAULT_SOURCE_NAME,
    currentView: "sequencers",
    capacities: {},
    filters: {
      search: "",
      selectedSchedulerCenter: "",
      includeIncoming: true,
      partialsOnly: false,
    },
  };
}

export function setSearchFilter(state, value) {
  state.filters.search = String(value || "").trim().toLowerCase();
}

export function setSelectedSchedulerCenter(state, value) {
  state.filters.selectedSchedulerCenter = value;
}

export function setIncludeIncoming(state, checked) {
  state.filters.includeIncoming = Boolean(checked);
}

export function setPartialsOnly(state, checked) {
  state.filters.partialsOnly = Boolean(checked);
}

export function setCurrentView(state, view) {
  state.currentView = view === "capacity" ? "capacity" : "sequencers";
}

export function ensureSelectedSchedulerCenter(state) {
  if (!state.workCenters.length) {
    state.filters.selectedSchedulerCenter = "";
    return;
  }

  const options = ["ALL", ...state.workCenters];
  if (!options.includes(state.filters.selectedSchedulerCenter)) {
    state.filters.selectedSchedulerCenter = "ALL";
  }
}

export function syncCapacities(state) {
  const stored = loadStoredCapacities();
  const next = {};
  state.workCenters.forEach((center) => {
    next[center] = stored[center] ?? state.capacities[center] ?? DEFAULT_DAILY_CAPACITY;
  });
  state.capacities = next;
  saveCapacities(state.capacities);
}

export function updateCenterCapacity(state, center, rawValue) {
  const parsed = Number.parseFloat(String(rawValue).trim());
  state.capacities[center] = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  saveCapacities(state.capacities);
}

export function getCapacityForCenter(state, center) {
  return state.capacities[center] ?? DEFAULT_DAILY_CAPACITY;
}

export function loadStoredCapacities() {
  return loadStoredObject(CAPACITY_STORAGE_KEY);
}

export function saveCapacities(capacities) {
  saveStoredObject(CAPACITY_STORAGE_KEY, capacities);
}

export function loadThemePreference() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveThemePreference(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures and keep the in-memory preference.
  }
}

export function loadSidebarPreference() {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) || "collapsed";
  } catch {
    return "collapsed";
  }
}

export function saveSidebarPreference(sidebarState) {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarState);
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
