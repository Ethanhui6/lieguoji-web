import type { Order, StateAction, StateVersion, World } from '../sim/types';

/** Only accepted simulation inputs belong in history; previews and step:0 do not. */
export type HistoryInput =
  | { type: 'step'; days: 1 }
  | { type: 'order'; order: Order }
  | { type: 'state-action'; action: StateAction; expected: StateVersion };

export type HistoryStateRef = { day: number; nextEventId: number; hash: string };
export type HistoryEntry = { seq: number; input: HistoryInput; before: HistoryStateRef; after: HistoryStateRef };
export type HistoryCheckpoint = { seq: number; world: World; hash: string };
export type HistoryParent = { runId: string; seq: number; worldHash: string };
export type HistoryLog = {
  format: 'lieguoji-history';
  version: 1;
  runId: string;
  engineFingerprint: string;
  rulesVersion: World['rulesVersion'];
  startDay: number;
  checkpointEvery: 32;
  parent: HistoryParent | null;
  initial: HistoryCheckpoint;
  entries: HistoryEntry[];
  checkpoints: HistoryCheckpoint[];
};
