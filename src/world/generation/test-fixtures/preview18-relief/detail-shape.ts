/** Test-only preview18 oracle dependencies. Exact selected original declarations; see SOURCE_MANIFEST.json. */

export interface DetailShapeControl {
  signal?: AbortSignal; yieldControl?: () => Promise<void>;
  onProgress?: (phase: string, completed: number, total: number) => void;
  batchWork?: number;
}
