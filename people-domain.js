(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PeopleDomain = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  function fail(message) { const error = new Error(message); error.status = 400; throw error; }
  function hundredths(value, max, label) {
    if (!['string', 'number'].includes(typeof value) || !/^\d+(\.\d{1,2})?$/.test(String(value).trim())) fail(`${label} must be a number with up to two decimal places.`);
    const result = Math.round(Number(value) * 100);
    if (!Number.isSafeInteger(result) || result > max * 100) fail(`${label} must be between 0 and ${max}.`);
    return result;
  }
  function validate(input, departments, retained = []) {
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 120) fail('Name must contain 1–120 characters.');
    const hours = Object.fromEntries(days.map(day => [day, hundredths(input.hours?.[day], 24, `${day.toUpperCase()} hours`)]));
    if (!Array.isArray(input.allocations) || !input.allocations.length) fail('Select at least one department.');
    const allowed = new Set([...departments, ...retained]), seen = new Set();
    const allocations = input.allocations.map(item => {
      const department = typeof item?.department === 'string' ? item.department : '';
      if (!allowed.has(department)) fail('Choose a department from the current schedule. Existing unavailable assignments may be retained.');
      if (seen.has(department)) fail('Each department can only be assigned once.');
      seen.add(department);
      const basisPoints = hundredths(item.percent, 100, 'Allocation');
      if (!basisPoints) fail('Every allocation must be greater than 0%.');
      return { department, basisPoints };
    });
    if (allocations.reduce((sum, item) => sum + item.basisPoints, 0) !== 10000) fail('Department allocations must total exactly 100%.');
    return { name: input.name.trim(), hours, allocations };
  }
  function totals(hours, allocations) {
    const weeklyHours = days.reduce((sum, day) => sum + Number(hours[day] || 0), 0);
    return { weeklyHours, allocations: allocations.map(item => ({ ...item, weeklyHours: weeklyHours * Number(item.percent || 0) / 100,
      dailyHours: Object.fromEntries(days.map(day => [day, Number(hours[day] || 0) * Number(item.percent || 0) / 100])) })) };
  }
  return { days, validate, totals };
});
