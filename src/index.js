import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

const integer = (name, value, min, max = 2147483647) => {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer between ${min} and ${max}`);
  }
};

/** Create a stopped watcher. Call start() to begin sampling. */
export function createEventLoopWatch(options = {}) {
  const {
    resolutionMs = 10,
    intervalMs = 1000,
    thresholdMs = 100,
    alertMetric = 'max',
    cooldownMs = 10000,
    onSample,
    onAlert,
    onError = error => console.error('[node-event-loop-watch] callback error:', error),
    unref = true,
  } = options;
  integer('resolutionMs', resolutionMs, 1);
  integer('intervalMs', intervalMs, resolutionMs * 2);
  integer('cooldownMs', cooldownMs, 0, Number.MAX_SAFE_INTEGER);
  if (!Number.isFinite(thresholdMs) || thresholdMs <= 0) throw new RangeError('thresholdMs must be positive and finite');
  if (!['max', 'p99'].includes(alertMetric)) throw new TypeError('alertMetric must be max or p99');
  if (typeof unref !== 'boolean') throw new TypeError('unref must be boolean');
  for (const [name, fn] of Object.entries({onSample, onAlert, onError})) {
    if (fn !== undefined && typeof fn !== 'function') throw new TypeError(`${name} must be a function`);
  }
  if (!onError) throw new TypeError('onError must be a function');

  const histogram = monitorEventLoopDelay({ resolution: resolutionMs });
  let timer;
  let running = false;
  let startedAt = 0;
  let previousUtilization;
  let lastAlertAt = -Infinity;

  // Callback failures must not escape into the host application, including rejected promises.
  const reportError = error => {
    try { Promise.resolve(onError(error)).catch(() => {}); } catch { /* error sink is isolated */ }
  };
  const call = (fn, sample) => {
    if (!fn) return;
    try { Promise.resolve(fn(sample)).catch(reportError); } catch (error) { reportError(error); }
  };

  const snapshot = () => {
    const now = performance.now();
    const current = performance.eventLoopUtilization();
    const utilization = performance.eventLoopUtilization(current, previousUtilization);
    const count = histogram.count;
    const ms = value => count ? value / 1e6 : null;
    const sample = Object.freeze({
      timestamp: new Date().toISOString(),
      windowMs: now - startedAt,
      samples: count,
      minMs: ms(histogram.min),
      meanMs: ms(histogram.mean),
      maxMs: ms(histogram.max),
      p50Ms: ms(histogram.percentile(50)),
      p95Ms: ms(histogram.percentile(95)),
      p99Ms: ms(histogram.percentile(99)),
      utilization: utilization.utilization,
    });
    histogram.reset();
    startedAt = now;
    previousUtilization = current;
    return sample;
  };

  const watcher = {
    get running() { return running; },
    start() {
      if (running) return watcher;
      histogram.reset();
      previousUtilization = performance.eventLoopUtilization();
      startedAt = performance.now();
      lastAlertAt = -Infinity;
      histogram.enable();
      running = true;
      timer = setInterval(() => {
        const sample = snapshot();
        const metric = alertMetric === 'max' ? sample.maxMs : sample.p99Ms;
        const now = performance.now();
        const shouldAlert = metric !== null && metric >= thresholdMs && now - lastAlertAt >= cooldownMs;
        if (shouldAlert) lastAlertAt = now;
        call(onSample, sample);
        if (shouldAlert) call(onAlert, sample);
      }, intervalMs);
      if (unref) timer.unref();
      return watcher;
    },
    stop() {
      if (!running) return watcher;
      clearInterval(timer);
      histogram.disable();
      running = false;
      return watcher;
    },
    sample() {
      if (!running) throw new Error('watcher is stopped; call start() first');
      return snapshot();
    },
  };
  return watcher;
}
