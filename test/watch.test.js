import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { createEventLoopWatch } from '../src/index.js';
const block = duration => { const until = performance.now() + duration; while (performance.now() < until) {} };

test('validates configuration', () => {
  for (const options of [{resolutionMs:0}, {resolutionMs:1.5}, {intervalMs:5}, {intervalMs:Infinity}, {thresholdMs:NaN}, {thresholdMs:0}, {cooldownMs:-1}, {alertMetric:'mean'}, {onSample:1}, {onError:null}, {unref:'yes'}]) {
    assert.throws(() => createEventLoopWatch(options));
  }
});
test('lifecycle is idempotent and samples require start', () => {
  const w = createEventLoopWatch();
  assert.equal(w.running, false); assert.throws(() => w.sample());
  assert.equal(w.start(), w); assert.equal(w.start(), w); assert.equal(w.running, true);
  assert.equal(w.stop(), w); assert.equal(w.stop(), w); assert.equal(w.running, false);
  assert.throws(() => w.sample());
});
test('empty histogram uses null delays rather than sentinel values', () => {
  const w = createEventLoopWatch().start();
  try { const s = w.sample(); assert.equal(s.samples,0); assert.equal(s.minMs,null); assert.equal(s.meanMs,null); assert.equal(s.p99Ms,null); assert.ok(Object.isFrozen(s)); }
  finally { w.stop(); }
});
test('detects a real main-thread block and resets the window', async () => {
  const w = createEventLoopWatch({resolutionMs:5, intervalMs:10000}).start();
  try {
    await sleep(40); block(100); await sleep(30);
    const s = w.sample(); assert.ok(s.samples > 0); assert.ok(s.maxMs >= 80, JSON.stringify(s));
    assert.ok(s.utilization >= 0 && s.utilization <= 1);
    assert.equal(w.sample().samples,0);
  } finally { w.stop(); }
});
test('alerts and respects cooldown; sample callbacks continue', async () => {
  const samples = []; const alerts = [];
  const w = createEventLoopWatch({resolutionMs:5,intervalMs:100,thresholdMs:40,cooldownMs:10000,onSample:s=>samples.push(s),onAlert:s=>alerts.push(s)}).start();
  try {
    await sleep(30); block(80); await sleep(140);
    await sleep(30); block(80); await sleep(140);
    assert.ok(samples.length >= 2); assert.equal(alerts.length,1);
  } finally { w.stop(); }
});
test('p99 is supported as the alert metric', async () => {
  let alerts=0;
  const w=createEventLoopWatch({resolutionMs:5,intervalMs:100,thresholdMs:1,alertMetric:'p99',onAlert:()=>alerts++}).start();
  try { await sleep(150); assert.ok(alerts>=1); } finally {w.stop();}
});
test('contains synchronous throws and rejected callbacks', async () => {
  const errors=[];
  const w=createEventLoopWatch({resolutionMs:5,intervalMs:30,thresholdMs:1,cooldownMs:0,onSample:()=>{throw new Error('sync')},onAlert:async()=>{throw new Error('async')},onError:e=>errors.push(e.message)}).start();
  try { await sleep(100); assert.ok(errors.includes('sync')); assert.ok(errors.includes('async')); } finally {w.stop();}
});
test('stop prevents later interval callbacks and restart gets a fresh window', async () => {
  let calls=0;
  const w=createEventLoopWatch({resolutionMs:5,intervalMs:30,onSample:()=>calls++}).start();
  await sleep(70); w.stop(); const previous=calls; await sleep(70); assert.equal(calls,previous);
  try {w.start(); assert.equal(w.sample().samples,0); await sleep(70); assert.ok(calls>previous);} finally {w.stop();}
});
test('default timer does not keep a process alive', () => {
  const r=spawnSync(process.execPath,['--input-type=module','-e',"import {createEventLoopWatch} from './src/index.js'; createEventLoopWatch().start();"],{cwd:new URL('../',import.meta.url),timeout:2000});
  assert.equal(r.status,0,r.stderr?.toString()); assert.equal(r.error,undefined);
});
test('unref false keeps monitoring alive until stopped', () => {
  const r=spawnSync(process.execPath,['--input-type=module','-e',"import {createEventLoopWatch} from './src/index.js'; const w=createEventLoopWatch({intervalMs:30,unref:false,onSample:()=>{console.log('sample');w.stop()}}).start();"],{cwd:new URL('../',import.meta.url),timeout:2000});
  assert.equal(r.status,0,r.stderr?.toString()); assert.match(r.stdout.toString(),/sample/);
});
