/** Local PH03 structure experiment. Never a production World or save format. */
export type ScaleProfile = 'basic' | 'standard' | 'extended';
export type ScaleScenario = 'continent' | 'archipelago' | 'mountains';
export type ScalePoint = { x: number; y: number };
export type ScaleBudget = { regions: number; nations: number; cities: number; groups: number; people: number; families: number; organizations: number; armies: number };
export type ScaleOptions = { seed: string; scenario: ScaleScenario; geoProfile: ScaleProfile; entityProfile: ScaleProfile };
export type ScaleProgress = { stage: string; completed: number; total: number };
export type ScaleControl = { signal?: AbortSignal; onProgress?: (progress: ScaleProgress) => void; yieldTask?: () => Promise<void> };
export type ScaleNation = { id: number; name: string; color: number; depth: number };
export type ScaleAdmin = { id: number; nationId: number; parentId: number | null; level: number; leaf: boolean; name: string };
export type ScaleRegion = { id: number; anchorCell: number; initialAdminId: number };
export type ScaleCity = { id: number; cellId: number; regionId: number; name: string };
export type ScaleGroup = { id: number; cityId: number; cultureId: number; faithId: number };
export type ScalePerson = { id: number; groupId: number; familyId: number; name: string };
export type ScaleFamily = { id: number; originNationId: number; name: string };
export type ScaleOrganization = { id: number; cityId: number; memberIds: number[] };
export type ScaleArmy = { id: number; nationId: number; homeCityId: number; personnel: number };
export type ScaleAtlas = {
  columns: number; rows: number; width: number; height: number;
  /** Shared row-major vertices: (columns+1)*(rows+1). Cell corners are implicit. */
  vertexX: Float32Array; vertexY: Float32Array;
  land: Uint8Array; elevation: Float32Array; moisture: Float32Array;
  /** Land cells point to a simulation region; ocean uses 0xffffffff. */
  regionByCell: Uint32Array;
};
export type ScaleEntities = { nations: ScaleNation[]; administration: ScaleAdmin[]; regions: ScaleRegion[]; cities: ScaleCity[]; groups: ScaleGroup[]; people: ScalePerson[]; families: ScaleFamily[]; organizations: ScaleOrganization[]; armies: ScaleArmy[] };
export type ScaleState = {
  revision: number; batch: number;
  /** Sorted sparse overrides preserve immutable terrain in the shared atlas. */
  elevationOverrides: { cellId: number; elevation: number }[];
  regionAdmin: Uint32Array; population: Float64Array; grain: Float64Array; armyCell: Uint32Array;
};
export type ScaleFixture = {
  format: 'lieguoji-scale-fixture'; version: 1; generatorVersion: 'ph03-structure-v1';
  options: ScaleOptions; atlas: ScaleAtlas; entities: ScaleEntities; state: ScaleState;
  counts: ScaleBudget & { samples: number; land: number; adminParents: number; adminTotal: number };
  limitations: string[];
};
export type ScaleTransaction =
  | { type: 'elevation'; cellIds: number[]; delta: number }
  | { type: 'administration'; regionId: number; adminId: number }
  | { type: 'structure-batch'; count: number }
  | { type: 'restore-state'; state: ScaleState };
export type ScaleUndo = { expectedRevision: number; before: ScaleState };
export type ScaleTransactionResult = { fixture: ScaleFixture; undo: ScaleUndo; summary: string };
export type ScaleHistoryEntry = { seq: number; input: ScaleTransaction; beforeHash: string; afterHash: string };
export type ScaleCheckpoint = { seq: number; state: ScaleState; hash: string };
export type ScaleHistory = {
  format: 'lieguoji-scale-history'; version: 1; runId: string;
  parent: { runId: string; seq: number; hash: string } | null;
  initial: ScaleFixture; initialHash: string; checkpointEvery: 32;
  entries: ScaleHistoryEntry[]; checkpoints: ScaleCheckpoint[];
};
