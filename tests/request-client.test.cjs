const test = require('node:test');
const assert = require('node:assert/strict');
const create = require('../request-client');
const ok = value => ({ status: 200, ok: true, json: async () => value });
const never = () => new Promise(() => {});
function setup(fetch, overrides = {}) {
  let generation = 1, unauthorized = 0;
  const client = create({ fetch, resolveUrl: url => '/scheduler' + url, getGeneration: () => generation,
    onUnauthorized: () => { unauthorized++; generation++; client.cancelAll(); }, readTimeout: 25, writeTimeout: 25, ...overrides });
  return { client, changeSession() { generation++; client.cancelAll(); }, unauthorized: () => unauthorized };
}

test('read deadline includes stalled JSON/text/blob bodies and aborts the fetch', async () => {
  for (const format of ['json', 'text', 'blob']) {
    let signal;
    const { client } = setup(async (url, init) => { assert.equal(url, '/scheduler/api/test'); signal = init.signal; return { ...ok(), [format]: never }; });
    await assert.rejects(client.request('/api/test', {}, format), error => error.timeout === true);
    assert.equal(signal.aborted, true);
  }
});

test('malformed successful JSON is rejected; HTTP failures keep their status', async () => {
  const broken = () => { throw new Error('Malformed'); };
  await assert.rejects(setup(async () => ({...ok(),json:broken})).client.request('/api/test'), /invalid JSON/);
  await assert.rejects(setup(async () => ({status:503,ok:false,json:broken})).client.request('/api/test'), error => error.status === 503 && !error.outcomeUnknown);
});

test('ambiguous writes are never retried and known rejection stays distinct', async () => {
  for (const fetch of [never, async () => {throw new Error('Connection lost');}, async () => ({...ok(),json:never}), async () => ({...ok(),json:async()=>{throw new Error('invalid');}})]) {
    let calls = 0;
    const { client } = setup((...args) => { calls++; return fetch(...args); });
    await assert.rejects(client.request('/api/test', {method:'POST',body:'{}'}), error => error.outcomeUnknown && /may have reached/.test(error.message));
    assert.equal(calls,1);
  }
  const {client} = setup(async()=>({status:409,ok:false,json:async()=>({error:'Conflict'})}));
  await assert.rejects(client.request('/api/test',{method:'PUT'}),error=>error.status===409&&!error.outcomeUnknown);
});

test('logout cancels body consumption and late responses cannot expire a new session', async () => {
  let resolve;
  const app = setup(() => new Promise(done => {resolve=done;}));
  const pending = app.client.request('/api/test');
  app.changeSession();
  await assert.rejects(pending,error=>error.cancelled);
  resolve({status:401,ok:false,json:async()=>({})});
  await new Promise(done=>setImmediate(done));
  assert.equal(app.unauthorized(),0);
  const expired = setup(async()=>({status:401,ok:false}));
  await assert.rejects(expired.client.request('/api/test'),error=>error.status===401);
  assert.equal(expired.unauthorized(),1);
});

test('caller cancellation composes with deadline and listeners are cleaned up', async () => {
  const controller = new AbortController();
  const app = setup(never);
  const pending = app.client.request('/api/test',{signal:controller.signal});
  controller.abort();
  await assert.rejects(pending,error=>error.cancelled);
  const preAborted = new AbortController(); preAborted.abort();
  await assert.rejects(app.client.request('/api/test',{signal:preAborted.signal}),error=>error.cancelled);
  const writeController=new AbortController();
  const write=app.client.request('/api/test',{method:'POST',signal:writeController.signal});writeController.abort();
  await assert.rejects(write,error=>error.outcomeUnknown);
  let completedSignal;
  const success=setup(async(url,options)=>{completedSignal=options.signal;return ok({});});
  await success.client.request('/api/test');await new Promise(done=>setTimeout(done,40));assert.equal(completedSignal.aborted,false);
});
