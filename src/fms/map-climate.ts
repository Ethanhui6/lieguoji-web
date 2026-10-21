import { FmsEditHistory, FmsModelError, type FmsDocument, type FmsEditPatch } from './model';

/** Saved map climate. model.ts is frozen as a live validator for old worlds,
 * so climate lives beside the terrain document (save envelope v3), never in it. */
export interface FmsMapClimate { readonly precipitation: number }
export const FMS_DEFAULT_PRECIPITATION = 80;
export const FMS_PRECIPITATION_RANGE = Object.freeze({ min: 1, max: 200 });
export const FMS_DEFAULT_CLIMATE: FmsMapClimate = Object.freeze({ precipitation: FMS_DEFAULT_PRECIPITATION });

export const validFmsPrecipitation = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= FMS_PRECIPITATION_RANGE.min && value <= FMS_PRECIPITATION_RANGE.max;
export function validFmsMapClimate(value: unknown): value is FmsMapClimate {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1
    && validFmsPrecipitation((value as FmsMapClimate).precipitation);
}
export const isDefaultFmsClimate = (climate: FmsMapClimate) => climate.precipitation === FMS_DEFAULT_PRECIPITATION;

type Entry = 'terrain' | { previous: FmsMapClimate; next: FmsMapClimate; promoted: boolean };
const MAX_STEPS = 100;

/** One undo timeline over terrain edits (delegated to FmsEditHistory) and
 * whole-map climate edits. Each terrain entry here matches exactly one entry
 * on top of the inner history, so LIFO order stays aligned. */
export class FmsMapHistory {
  private past: Entry[] = [];
  private future: Entry[] = [];
  private currentClimate: FmsMapClimate;
  constructor(private inner: FmsEditHistory, climate: FmsMapClimate = FMS_DEFAULT_CLIMATE) {
    if (!validFmsMapClimate(climate)) throw new FmsModelError('invalid-document', '地图气候无效。');
    this.currentClimate = Object.freeze({ ...climate });
  }
  get document(): FmsDocument { return this.inner.document; }
  get climate(): FmsMapClimate { return this.currentClimate; }
  get canUndo(): boolean { const top = this.past.at(-1); return top !== undefined && ((top !== 'terrain' && !top.promoted) || this.inner.canUndo); }
  get canRedo(): boolean { const top = this.future.at(-1); return top !== undefined && ((top !== 'terrain' && !top.promoted) || this.inner.canRedo); }
  private record(entry: Entry): void { this.past.push(entry); this.future = []; if (this.past.length > MAX_STEPS) this.past.shift(); }
  commit(patch: FmsEditPatch): FmsDocument {
    const before = this.inner.document, next = this.inner.commit(patch);
    if (next !== before) this.record('terrain');
    return next;
  }
  replaceDocument(candidate: FmsDocument, baseRevision: number): FmsDocument {
    const next = this.inner.replaceDocument(candidate, baseRevision);
    this.record('terrain');
    return next;
  }
  /** Returns false when the value is unchanged; nothing is recorded then.
   * A climate save is envelope v3 over a v2 document, so a v1 map first opts
   * into v2 (no locks) in the same undo step; undo keeps v2, as for locks. */
  setPrecipitation(precipitation: number): boolean {
    if (!validFmsPrecipitation(precipitation)) throw new FmsModelError('invalid-edit', `降水须为${FMS_PRECIPITATION_RANGE.min}至${FMS_PRECIPITATION_RANGE.max}之间的整数。`);
    if (precipitation === this.currentClimate.precipitation) return false;
    const doc = this.inner.document, promoted = doc.version === 1;
    if (promoted) this.inner.replaceDocument({ ...doc, version: 2, revision: doc.revision + 1, terrainLocks: new Uint8Array(doc.points.length) }, doc.revision);
    const next = Object.freeze({ precipitation });
    this.record({ previous: this.currentClimate, next, promoted });
    this.currentClimate = next;
    return true;
  }
  /** A fresh terrain history (blank-grid switch) starts a new timeline; climate is kept. */
  resetTerrain(inner: FmsEditHistory): void { this.inner = inner; this.past = []; this.future = []; }
  undo(): FmsDocument {
    if (!this.canUndo) return this.inner.document;
    const entry = this.past.pop()!;
    if (entry === 'terrain') this.inner.undo(); else { this.currentClimate = entry.previous; if (entry.promoted) this.inner.undo(); }
    this.future.push(entry);
    return this.inner.document;
  }
  redo(): FmsDocument {
    if (!this.canRedo) return this.inner.document;
    const entry = this.future.pop()!;
    if (entry === 'terrain') this.inner.redo(); else { this.currentClimate = entry.next; if (entry.promoted) this.inner.redo(); }
    this.past.push(entry);
    return this.inner.document;
  }
}
