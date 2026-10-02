export interface EventLoopSample {
  readonly timestamp: string;
  readonly windowMs: number;
  readonly samples: number;
  readonly minMs: number | null;
  readonly meanMs: number | null;
  readonly maxMs: number | null;
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
  readonly p99Ms: number | null;
  /** Fraction between 0 and 1; event loop utilization, not CPU utilization. */
  readonly utilization: number;
}
export interface WatchOptions {
  resolutionMs?: number;
  intervalMs?: number;
  thresholdMs?: number;
  alertMetric?: 'max' | 'p99';
  cooldownMs?: number;
  onSample?: (sample: EventLoopSample) => void | Promise<void>;
  onAlert?: (sample: EventLoopSample) => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
  unref?: boolean;
}
export interface EventLoopWatch {
  readonly running: boolean;
  start(): EventLoopWatch;
  stop(): EventLoopWatch;
  /** Returns and resets the current window. Does not invoke callbacks. */
  sample(): EventLoopSample;
}
export declare function createEventLoopWatch(options?: WatchOptions): EventLoopWatch;
