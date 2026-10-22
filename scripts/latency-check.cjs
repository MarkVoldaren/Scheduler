'use strict';
// Read-only deployment check. Credentials and response bodies are never logged.
const { performance } = require('node:perf_hooks');
const { setTimeout: delay } = require('node:timers/promises');
async function main() {
  const base = new URL(process.env.SCHEDULER_URL || 'https://duramark.jays-apps.com/scheduler/');
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  if (base.username || base.password || base.search || base.hash || (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)))) throw new Error('Use an HTTPS scheduler URL, or HTTP localhost, without credentials/query/hash.');
  if (!process.env.SCHEDULER_PASSWORD) throw new Error('Set SCHEDULER_PASSWORD in the environment before running this check.');
  let cookie = '';
  async function request(route, password) {
    const started = performance.now(), controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(new URL(route, base), { signal: controller.signal, redirect: 'error', method: password ? 'POST' : 'GET', headers: { Cookie: cookie, ...(password ? {'Content-Type':'application/json'} : {}) }, body: password ? JSON.stringify({password}) : undefined });
      if (response.headers.getSetCookie().length) cookie = response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
      await response.arrayBuffer();
      if (!response.ok) throw new Error(`${route}: HTTP ${response.status}`);
      return Math.round(performance.now()-started);
    } finally { clearTimeout(timer); }
  }
  await request('api/login', process.env.SCHEDULER_PASSWORD);
  const samples = Object.fromEntries(['api/app-state','api/people','api/session','api/projects'].map(route=>[route,[]]));
  for (let i=0;i<3;i++) for (const route of Object.keys(samples)) samples[route].push(await request(route));
  const overlap=[];
  for(let i=0;i<3;i++) {
    const slow=request('api/app-state');
    // Observe early rejections immediately while waiting to launch the second request.
    const settled=slow.then(ms=>({ms}),error=>({error}));
    await delay(150);
    const session=await request('api/session');
    const result=await settled;if(result.error)throw result.error;
    overlap.push(session);
  }
  const median=values=>[...values].sort((a,b)=>a-b)[1];
  const rows=Object.entries(samples).map(([route,ms])=>({route,samplesMs:ms.join(', '),medianMs:median(ms)}));
  rows.push({route:'api/session overlapping app-state',samplesMs:overlap.join(', '),medianMs:median(overlap)});
  console.log('Target:',base.origin+base.pathname);
  console.table(rows);
  const passed = median(samples['api/app-state'])<300 && median(samples['api/people'])<300 && overlap.every(ms=>ms<300);
  console.log(passed?'PASS: latency acceptance checks met.':'FAIL: investigate host CPU, network, and remaining synchronous work before accepting this release.');
  if(!passed)process.exitCode=1;
}
main().catch(error=>{console.error('Latency check failed:',error.message);process.exitCode=1;});
