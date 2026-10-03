export interface DetailShapeControl {
  signal?: AbortSignal; yieldControl?: () => Promise<void>;
  onProgress?: (phase: string, completed: number, total: number) => void;
  batchWork?: number;
}
