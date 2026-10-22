(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./scheduler-core'));
  else root.HoursDomain = factory(root.SchedulerCore);
})(globalThis, function(core) {
  const normalize = value => String(value || '').trim().toLowerCase();
  const numberOrNull = value => {
    const text = String(value ?? '').trim().replace(/,/g, '');
    return text && Number.isFinite(Number(text)) ? Number(text) : null;
  };
  function operationKey(wo, sequence, center) {
    const order = normalize(wo).replace(/^work order\s*#\s*/, '');
    const seq = String(sequence ?? '').trim();
    if (!order || !seq || !normalize(center)) return null;
    return JSON.stringify([order, Number.isFinite(Number(seq)) ? String(Number(seq)) : normalize(seq), normalize(center)]);
  }
  function dateKey(value) {
    const s = String(value || '').trim();
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m && !iso) return null;
    const [y, mo, d] = m ? [+m[3], +m[1], +m[2]] : [+iso[1], +iso[2], +iso[3]];
    const date = new Date(Date.UTC(y, mo - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date.toISOString().slice(0, 10) : null;
  }
  function readEarned(text) {
    const headers = core.parseCsvMatrix(String(text).replace(/^\uFEFF/, ''))[0] || [];
    const detailed = headers.includes('Earned Hours');
    const required = ['Manufacturing Work Center', 'Date', ...(detailed ? ['Earned Hours', 'Created From', 'Operation Sequence', 'Completed Quantity', 'Labor Setup Time (Min)', 'Labor Run Time (Min)'] : ['Earned Hours (Sum)'])];
    for (const h of required) {
      if (!headers.includes(h)) throw new Error(`Missing required column: ${h}`);
    }
    let skippedNonOperations = 0;
    const rows = core.parseCsv(text).filter(row => Object.values(row).some(v => String(v).trim())).map((row, i) => {
      if (detailed && ['Manufacturing Work Center', 'Operation Sequence', 'Completed Quantity', 'Labor Setup Time (Min)', 'Labor Run Time (Min)', 'Earned Hours'].every(column => !String(row[column] ?? '').trim())) {
        skippedNonOperations += 1;
        return null;
      }
      const center = String(row['Manufacturing Work Center'] || '').trim();
      const date = dateKey(row.Date);
      const earnedColumn = detailed ? 'Earned Hours' : 'Earned Hours (Sum)';
      if (!center || !date) throw new Error(`Earned hours row ${i + 2}: valid work center and date are required`);
      const numericColumns = [earnedColumn, ...(detailed ? ['Completed Quantity', 'Labor Setup Time (Min)', 'Labor Run Time (Min)'] : [])];
      for (const column of numericColumns) {
        if (String(row[column] ?? '').trim() && numberOrNull(row[column]) === null) throw new Error(`Earned hours row ${i + 2}: ${column} must be numeric or blank`);
      }
      const result = { center, date, hours: numberOrNull(row[earnedColumn]) };
      if (detailed) {
        const key = operationKey(row['Created From'], row['Operation Sequence'], center);
        if (!key) throw new Error(`Earned hours row ${i + 2}: work order and operation sequence are required`);
        const quantity = numberOrNull(row['Completed Quantity']);
        const runMinutes = numberOrNull(row['Labor Run Time (Min)']);
        Object.assign(result, { detailed: true, operationKey: key, quantity, setupMinutes: numberOrNull(row['Labor Setup Time (Min)']), runMinutes, rateUsable: quantity !== null && quantity > 0 && runMinutes !== null && runMinutes >= 0 });
      }
      return result;
    }).filter(Boolean);
    rows.format = detailed ? 'detail' : 'summary';
    rows.skippedNonOperations = skippedNonOperations;
    return rows;
  }
  function booked(rows, earnedRows = [], now = today()) {
    const rates = new Map();
    for (const row of earnedRows) {
      if (!row.detailed) continue;
      const rate = rates.get(row.operationKey) || { quantity: 0, runMinutes: 0, setupMinutes: null };
      if (row.rateUsable) { rate.quantity += row.quantity; rate.runMinutes += row.runMinutes; }
      if (row.setupMinutes !== null && row.setupMinutes >= 0) rate.setupMinutes = Math.max(rate.setupMinutes ?? 0, row.setupMinutes);
      rates.set(row.operationKey, rate);
    }
    const seen = new Set(), result = [];
    for (const row of rows) {
      const center = String(row['Manufacturing Work Center'] || '').trim(), date = dateKey(row['Ship By']);
      if (!center || !date) continue;
      const key = operationKey(row['WO #'], row['Operation Sequence'], center);
      if (key && seen.has(key)) continue;
      const rate = key && rates.get(key), quantity = numberOrNull(row['WO Quantity']);
      const calculated = date <= now && rate && rate.quantity > 0 && rate.setupMinutes !== null && quantity !== null && quantity >= 0;
      const hours = calculated ? (rate.setupMinutes + quantity * rate.runMinutes / rate.quantity) / 60 : numberOrNull(row['Hours Remaining']);
      if (hours === null || hours < 0 || !Number.isFinite(hours)) continue;
      if (key) seen.add(key);
      result.push({ center, date, hours, method: calculated ? 'calculated' : date > now ? 'future' : 'fallback' });
    }
    return result;
  }
  function today(instant = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {timeZone: 'America/Chicago', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(instant);
    const p = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return `${p.year}-${p.month}-${p.day}`;
  }
  function series(bookedRows, earnedRows, accepts, mode, now = today(), art = false) {
    const b = bookedRows.filter(r => accepts(r.center));
    const e = art ? [] : earnedRows.filter(r => accepts(r.center) && normalize(r.center) !== 'art');
    const coverage = rows => {
      const dates = rows.map(r => r.date).sort();
      return dates.length ? [dates[0], dates[dates.length - 1]] : null;
    };
    const bc = coverage(bookedRows), ec = coverage(earnedRows);
    const dates = [...b, ...e].map(r => r.date).sort();
    let start, end;
    if (mode === 'month') {
      const dt = new Date(`${now.slice(0,7)}-01T00:00:00Z`);
      dt.setUTCMonth(dt.getUTCMonth() - 3);
      start = dt.toISOString().slice(0,7);
      end = b.reduce((last,r) => r.date.slice(0,7) > last ? r.date.slice(0,7) : last, now.slice(0,7));
    } else { start = dates[0]; end = dates[dates.length - 1]; }
    const sum = (rows, period, coverage, earned) => {
      const first = mode === 'month' ? `${period}-01` : period;
      const last = mode === 'month' ? new Date(Date.UTC(+period.slice(0,4), +period.slice(5,7), 0)).toISOString().slice(0,10) : period;
      if (!coverage || last < coverage[0] || first > coverage[1] || (earned && first > now)) return null;
      const bucket = rows.filter(r => (mode === 'month' ? r.date.slice(0,7) : r.date) === period && (!earned || r.date <= now));
      const reported = bucket.filter(r => r.hours !== null);
      return earned && bucket.length && !reported.length ? null : reported.reduce((s,r) => s + r.hours, 0);
    };
    const points = [];
    for (let key = start; key && key <= end;) {
      const inBucket = r => (mode === 'month' ? r.date.slice(0,7) : r.date) === key;
      points.push({date:key, booked:sum(b,key,bc,false), earned:art ? null : sum(e,key,ec,true), missingEarned:e.filter(r => inBucket(r) && r.date <= now && r.hours === null).length});
      const dt = new Date(`${mode === 'month' ? key + '-01' : key}T00:00:00Z`);
      if (mode === 'month') dt.setUTCMonth(dt.getUTCMonth()+1); else dt.setUTCDate(dt.getUTCDate()+1);
      key = dt.toISOString().slice(0,mode === 'month' ? 7 : 10);
    }
    const displayed = r => start && (mode === 'month' ? r.date.slice(0,7) : r.date) >= start && (mode === 'month' ? r.date.slice(0,7) : r.date) <= end;
    const totalMethod = method => b.filter(r => displayed(r) && r.method === method).reduce((s,r) => s + r.hours, 0);
    return {points, bookedCoverage:bc, earnedCoverage:ec, diagnostics: {
      calculatedHours:totalMethod('calculated'), fallbackHours:totalMethod('fallback'), futureHours:totalMethod('future'),
      missingEarned:points.reduce((s,p) => s + p.missingEarned, 0),
      unusableRateInputs: earnedRows.filter(r => !art && accepts(r.center) && normalize(r.center) !== 'art' && r.detailed && !r.rateUsable).length,
      hasDetail:earnedRows.format === 'detail' || earnedRows.some(r => r.detailed),
      skippedNonOperations:earnedRows.skippedNonOperations || 0,
    }};
  }
  return {normalize, dateKey, operationKey, readEarned, booked, series, today};
});
