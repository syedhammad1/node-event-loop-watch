import { createEventLoopWatch } from '../src/index.js';
import { setTimeout as sleep } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';

const watcher = createEventLoopWatch({
  intervalMs: 250,
  thresholdMs: 80,
  cooldownMs: 0,
  onSample: sample => console.log('metrics:', JSON.stringify(sample)),
  onAlert: sample => console.warn(`ALERT: max delay ${sample.maxMs.toFixed(1)} ms`),
}).start();

try {
  await sleep(300); // Let the sampling timer warm up before introducing the block.
  console.log('Blocking the main thread for 200 ms (demonstration only)…');
  const until = performance.now() + 200;
  while (performance.now() < until) { /* intentionally block */ }
  await sleep(500);
} finally { watcher.stop(); }
