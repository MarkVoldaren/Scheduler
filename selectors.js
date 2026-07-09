import {
  addWorkingDays,
  formatDate,
  formatHours,
  hasPartialNonFinishingOperation,
  startOfToday,
  stripTime,
} from "./domain.js";
import { getCapacityForCenter } from "./state.js";

export function deriveWorkCenters(jobs) {
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

export function getVisibleSchedulerJobs(state) {
  return state.jobs
    .filter((job) => !job.isComplete && getOpenOperations(job).length > 0)
    .filter((job) => !state.filters.partialsOnly || hasPartialNonFinishingOperation(job))
    .filter((job) => matchesSearch(job, state.filters.search));
}

export function getSchedulerViewModel(state) {
  const centerOptions = state.workCenters.length
    ? [
        { value: "ALL", label: "All departments" },
        ...state.workCenters.map((center) => ({ value: center, label: center })),
      ]
    : [];
  const selectedCenter = state.filters.selectedSchedulerCenter || centerOptions[0]?.value || "";
  const visibleJobs = getVisibleSchedulerJobs(state);

  if (!selectedCenter) {
    return createEmptySchedulerModel({
      centerOptions,
      selectedCenter,
      includeIncoming: state.filters.includeIncoming,
      partialsOnly: state.filters.partialsOnly,
      emptyMessage: "Choose a CSV to build the scheduler.",
    });
  }

  if (selectedCenter === "ALL") {
    return createMasterSchedulerModel(state, visibleJobs, centerOptions, selectedCenter);
  }

  return createDepartmentSchedulerModel(state, visibleJobs, centerOptions, selectedCenter);
}

export function getCapacityViewModel(state) {
  if (!state.workCenters.length) {
    return {
      emptyMessage: "Choose a CSV to load department capacity.",
      cards: [],
    };
  }

  const cards = state.workCenters.map((center) => {
    const currentItems = getCurrentItemsForCenter(center, state.jobs);
    const incomingItems = getIncomingItemsForCenter(center, state.jobs);
    const currentHours = currentItems.reduce((sum, item) => sum + item.hours, 0);
    const incomingHours = incomingItems.reduce((sum, item) => sum + item.hours, 0);
    const queueHours = currentHours + incomingHours;
    const capacity = getCapacityForCenter(state, center);
    const days = capacity > 0 ? queueHours / capacity : 0;

    return {
      center,
      activeJobCount: uniqueJobCount(currentItems),
      currentHours,
      incomingHours,
      queueHours,
      capacity,
      days,
    };
  });

  return { cards, emptyMessage: "" };
}

function createMasterSchedulerModel(state, visibleJobs, centerOptions, selectedCenter) {
  const today = startOfToday();
  const queueRows = [...visibleJobs]
    .sort(
      (a, b) =>
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
        : focusOperation?.workCenter || "Unassigned";

      return {
        id: `${job.key}:master`,
        job,
        operation: focusOperation,
        queueType: "job",
        hours: job.totalHoursRemaining,
        focusOperationId: focusOperation?.key || null,
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
    includeIncoming: state.filters.includeIncoming,
    partialsOnly: state.filters.partialsOnly,
    rows: queueRows,
    stats: [
      { label: "Queue Jobs", value: queueRows.length.toString() },
      { label: "Remaining Hours", value: `${formatHours(totalHours)} hrs` },
      { label: "Open Departments", value: totalRemainingDepartments.toString() },
      { label: "Projected Load", value: "Master list" },
      { label: "Projected Lates", value: "Dept-driven", late: true },
      { label: "Late Catchup", value: "Use departments", late: true },
    ],
    emptyMessage: "No jobs match the active Scheduler filters.",
  };
}

function createDepartmentSchedulerModel(state, visibleJobs, centerOptions, selectedCenter) {
  const capacity = getCapacityForCenter(state, selectedCenter);
  const currentItems = getCurrentItemsForCenter(selectedCenter, visibleJobs);
  const incomingItems = state.filters.includeIncoming ? getIncomingItemsForCenter(selectedCenter, visibleJobs) : [];
  const queueItems = [...currentItems, ...incomingItems].sort(
    (a, b) =>
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
      statLabel:
        item.queueType === "incoming"
          ? `After ${item.arrivalSequenceOffset} prior step${item.arrivalSequenceOffset === 1 ? "" : "s"}`
          : `Day ${startDay}${finishDay > startDay ? ` -> Day ${finishDay}` : ""}`,
      dateLabel: formatDate(projectedCompletionDate),
    };
  });

  const projectedLateRows = queueRows.filter((row) => row.projectedLate);
  const lateHours = projectedLateRows.reduce((sum, row) => sum + row.hours, 0);
  const lastProjectedLateRow = projectedLateRows.at(-1) || null;
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
    includeIncoming: state.filters.includeIncoming,
    partialsOnly: state.filters.partialsOnly,
    rows: queueRows,
    stats: [
      { label: "Queue Ops", value: queueRows.length.toString() },
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
    operation?.sequenceLabel || "Complete"
  } | ${operation?.operationName || "No operation"} | Production ${productionDateLabel}`;
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

function isWorkingDay(date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function uniqueJobCount(items) {
  return new Set(items.map((item) => item.job.key)).size;
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}
