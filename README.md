# node-event-loop-watch

Small, dependency-free event loop monitoring for Node.js, with TypeScript declarations.

Find out when the main thread is falling behind. Get windowed delay statistics, event loop utilization and threshold alerts without choosing an observability vendor.

## Try it

Requires Node.js 20+. No dependency installation or build step is needed.

```bash
git clone https://github.com/syedhammad1/node-event-loop-watch.git
cd node-event-loop-watch
npm test
npm run demo
```

The demo intentionally blocks the main thread for 200 ms and prints a delay alert. For a local JSON metrics endpoint, run `node examples/http-server.js`.

**Not published on npm yet.** Install from a local checkout with `npm install /path/to/node-event-loop-watch`, or import the source directly. Package imports use the scoped name below.

## Usage

```js
import { createEventLoopWatch } from '@syedhammad1/node-event-loop-watch';

const watch = createEventLoopWatch({
  intervalMs: 1000,
  thresholdMs: 100,
  alertMetric: 'max',
  cooldownMs: 10000,
  onSample: sample => {
    // Forward milliseconds to your preferred metrics client.
    console.log(sample);
  },
  onAlert: sample => console.warn('Main thread delayed:', sample.maxMs),
  onError: error => console.error('Metrics callback failed:', error),
}).start();

// During application shutdown:
watch.stop();
```

## Options

| Option | Default | Meaning |
|---|---|---|
| `resolutionMs` | `10` | Native histogram sampling interval; positive integer |
| `intervalMs` | `1000` | Reporting interval; integer at least twice the resolution |
| `thresholdMs` | `100` | Alert when the selected delay metric reaches this value |
| `alertMetric` | `'max'` | `'max'` detects spikes; `'p99'` uses the window percentile |
| `cooldownMs` | `10000` | Minimum time between alerts, measured with a monotonic clock |
| `onSample` | none | Receives every reporting window |
| `onAlert` | none | Receives windows exceeding the threshold, subject to cooldown |
| `onError` | console error | Receives thrown/rejected callback errors |
| `unref` | `true` | Reporting timer does not keep an otherwise idle process running |

Callbacks may return promises. They are not awaited; keep them fast and bounded to avoid overlapping work. Errors from `onSample` and `onAlert` go to `onError`; failures inside `onError` are swallowed so monitoring does not crash the host.

## Snapshot

Each immutable snapshot contains `timestamp` (UTC ISO string), actual `windowMs`, histogram `samples`, `minMs`, `meanMs`, `maxMs`, `p50Ms`, `p95Ms`, `p99Ms`, and `utilization` (0–1). Delays are milliseconds; empty windows return `null` for delays. Utilization measures event loop activity, **not CPU usage**.

`start()` and `stop()` are idempotent. Restart clears the histogram and alert cooldown. `sample()` returns and resets the current window while running; it does not invoke callbacks or alerts. Calling it also shortens the next scheduled reporting window. Already-started asynchronous callbacks may finish after `stop()`.

## How it works and its limits

Uses Node's `monitorEventLoopDelay()` histogram and `performance.eventLoopUtilization()`. Each report converts nanoseconds to milliseconds and resets the histogram. Reports can only happen once the event loop runs again: this cannot alert in real time during a complete freeze.

Timer-based delay measurements normally include a baseline around the sampling resolution. Set thresholds comfortably above that baseline. Very short blocks can be missed, and blocking before the histogram has warmed up may not be observed. Scheduler contention and garbage collection can increase delay; this identifies a symptom, not the offending function. Profile the application to find the cause.

One watcher observes its own Node process/thread. Run one per worker when using worker threads or cluster. This package does not collect traces, expose Prometheus metrics automatically, or restart your application. The HTTP example exposes JSON on localhost only.

## Tests and CI

`npm test` covers validation, lifecycle, empty windows, a real blocking workload, histogram reset, alerts, cooldown, p99 selection, callback failures and process-exit behavior. GitHub Actions runs tests on Node 20, 22 and 24. Timing tests use broad thresholds but may still be affected by severely overloaded hosts. Type declarations are included; no TypeScript compiler check has been performed in the creation environment.

## Contributing

Open an issue with your Node version, options and a minimal reproduction. Keep core runtime dependencies at zero. Add tests and update the API documentation when changing behavior.

## License

MIT. Created with AI assistance and tested using Node's built-in test runner.

## Reference

[Node.js performance hooks documentation](https://nodejs.org/api/perf_hooks.html#perf_hooksmonitoreventloopdelayoptions)
