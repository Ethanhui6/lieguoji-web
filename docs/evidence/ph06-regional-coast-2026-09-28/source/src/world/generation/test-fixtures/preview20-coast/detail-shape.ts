/** Test-only immutable preview20 coast oracle type. See SOURCE_MANIFEST.json. */
export interface DetailShapeControl {
  signal?: AbortSignal; yieldControl?: () => Promise<void>;
  onProgress?: (phase: string, completed: number, total: number) => void;
  batchWork?: number;
}
