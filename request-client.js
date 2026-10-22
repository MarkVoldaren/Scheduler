(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.createSchedulerRequestClient = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  return function createSchedulerRequestClient({ fetch: send, resolveUrl, getGeneration, onUnauthorized, readTimeout = 15000, writeTimeout = 60000 }) {
    const active = new Set();
    function cancelled() { return Object.assign(new Error('Request belongs to an earlier session.'), { cancelled: true }); }
    async function request(url, options = {}, format = 'json') {
      const generation = getGeneration();
      const { allowUnauthorized, signal, ...init } = options;
      const write = !['GET', 'HEAD'].includes((init.method || 'GET').toUpperCase());
      const controller = new AbortController();
      let timer, rejectStop, timedOut = false;
      const stop = new Promise((_, reject) => { rejectStop = reject; });
      const entry = { cancel() { rejectStop(cancelled()); controller.abort(); } };
      const abort = () => { rejectStop(Object.assign(new Error('Request cancelled.'), { cancelled: true })); controller.abort(signal?.reason); };
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
      active.add(entry);
      timer = setTimeout(() => {
        timedOut = true;
        rejectStop(new Error('Request deadline exceeded.'));
        controller.abort();
      }, write ? writeTimeout : readTimeout);
      try {
        return await Promise.race([stop, (async () => {
          const response = await send(resolveUrl(url), { credentials: 'same-origin', cache: 'no-store', ...init, signal: controller.signal });
          if (controller.signal.aborted) throw cancelled();
          if (generation !== getGeneration()) throw cancelled();
          if (response.status === 401 && !allowUnauthorized) {
            active.delete(entry);
            onUnauthorized();
            throw Object.assign(new Error('Session expired.'), { status: 401 });
          }
          let payload;
          if (format === 'json' || !response.ok) {
            try { payload = await response.json(); }
            catch {
              if (response.ok) throw new Error('The server returned invalid JSON. Refresh before continuing.');
            }
          } else payload = await response[format]();
          if (generation !== getGeneration()) throw cancelled();
          if (!response.ok) throw Object.assign(new Error(payload?.error || `Request failed with status ${response.status}`), { status: response.status });
          return payload;
        })()]);
      } catch (error) {
        if (error.status === 401) throw error;
        if (generation !== getGeneration()) throw cancelled();
        if (write && !error.status) {
          throw Object.assign(new Error('The save outcome is unknown. It may have reached the server. Refresh saved data and compare it with your draft before submitting again.'), { outcomeUnknown: true, cause: error });
        }
        if (timedOut) throw Object.assign(new Error('The server took too long to respond. Retry the request.'), { timeout: true });
        throw error;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        active.delete(entry);
      }
    }
    return { request, cancelAll() { for (const entry of active) entry.cancel(); active.clear(); } };
  };
});
