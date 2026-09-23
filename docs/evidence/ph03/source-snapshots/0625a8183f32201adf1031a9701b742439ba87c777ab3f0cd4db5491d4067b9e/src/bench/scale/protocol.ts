import type { ScaleFixture, ScaleHistory, ScaleOptions, ScaleProgress, ScaleTransaction } from './types';

export type ScaleSnapshot = { format: 'lieguoji-scale-experiment'; version: 1; history: ScaleHistory };
export type ScaleTimings = { workerMs: number; prepareMs: number; roundTripMs: number; payloadBytes: number; transport: 'clone' | 'transfer' };
export type ScaleResult = {
  fixture: ScaleFixture; runId: string; sequence: number; historyLength: number; readOnly: boolean;
  hash: string; summary: string; snapshot?: ScaleSnapshot; measurements?: unknown;
  metrics: ScaleTimings;
};
export type ScaleOperation =
  | { type: 'generate'; options: ScaleOptions }
  | { type: 'edit'; input: ScaleTransaction }
  | { type: 'undo' }
  | { type: 'seek'; sequence: number }
  | { type: 'live' }
  | { type: 'branch'; sequence: number }
  | { type: 'snapshot'; includeHistory?: boolean }
  | { type: 'load'; snapshot: ScaleSnapshot; expectedHash?: string }
  | { type: 'measure'; historyLengths?: number[]; querySamples?: number; transactionSamples?: number; persistHistory?: boolean };
export type ScaleRequest = { id: number; operation: ScaleOperation; transport: 'clone' | 'transfer' } | { type: 'cancel' };
export type ScaleReply =
  | { id: number; kind: 'progress'; progress: ScaleProgress }
  | { id: number; kind: 'result'; result: Omit<ScaleResult, 'metrics'>; metrics: Omit<ScaleTimings, 'roundTripMs'> }
  | { id: number; kind: 'error'; message: string; cancelled: boolean };

declare global {
  const __BENCH_BUILD__: { format: string; version: number; commit: string; sourceFingerprint: string; localOnly: true; engineFingerprint: string };
}
