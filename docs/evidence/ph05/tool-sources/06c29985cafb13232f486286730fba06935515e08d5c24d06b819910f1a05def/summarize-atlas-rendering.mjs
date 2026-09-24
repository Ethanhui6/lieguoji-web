import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

// Evidence only: no browser/game execution, no task-state or deployment writes.
const args = Object.fromEntries(process.argv.slice(2).map(value => { const split = value.indexOf('='); return [value.slice(2, split < 0 ? undefined : split), split < 0 ? 'true' : value.slice(split + 1)]; }));
if (args.help) { console.log('node scripts/summarize-atlas-rendering.mjs --headless-dpr1=report.json --headless-dpr2=report.json --headed-dpr1=report.json --headed-dpr2=report.json --out=evaluation.json\nPartial/smoke evidence is summarized but cannot pass formal coverage.'); process.exit(0); }
if (!args.out) throw new Error('Missing --out=path/to/evaluation.json');
const configurations = ['headless-dpr1', 'headless-dpr2', 'headed-dpr1', 'headed-dpr2'], scenes = ['continental', 'archipelago', 'mountains'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const equals = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Four IEEE float32 unit roundoffs (4 * 2^-24). Only native wheel/DPR
// representation comparisons use this bound; no performance gate uses it.
const nativeRelativeTolerance = 2 ** -22;
const nativeClose = (actual, expected) => Number.isFinite(actual) && Number.isFinite(expected)
  && Math.abs(actual - expected) <= Math.abs(expected) * nativeRelativeTolerance;
function validFingerprint(value) {
  if (!/^[a-f0-9]{64}$/.test(value?.sha256 ?? '') || !Array.isArray(value.files) || !value.files.length) return false;
  const rows = value.files;
  return new Set(rows.map(row => row.path)).size === rows.length && equals(rows.map(row => row.path), rows.map(row => row.path).toSorted())
    && rows.every(row => typeof row.path === 'string' && row.path.length > 0 && !row.path.startsWith('/') && !row.path.includes('\\')
      && !row.path.split('/').some(part => part === '..' || part === '.') && Number.isSafeInteger(row.bytes) && row.bytes >= 0 && /^[a-f0-9]{64}$/.test(row.sha256))
    && sha(JSON.stringify(rows.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })))) === value.sha256;
}
function stats(values) {
  if (!values.length || values.some(value => !Number.isFinite(value) || value < 0)) return { valid: false, count: values.length };
  const ordered = values.toSorted((a, b) => a - b);
  return { valid: true, count: values.length, min: ordered[0], median: ordered[Math.floor(ordered.length / 2)], p95: ordered[Math.ceil(ordered.length * .95) - 1], max: ordered.at(-1), over33_3Count: values.filter(value => value > 33.3).length, over33_3Ratio: values.filter(value => value > 33.3).length / values.length };
}
function validateWheelCalibration(report) {
  const calibration = report.wheelCalibration, multiplier = calibration?.apiUnitsPerCssUnit;
  if (!calibration || calibration.id !== 'ph05-native-wheel-css-v2' || calibration.status !== 'calibrated'
    || !equals(calibration.apiUnitsPerCssUnitRange, { min: .25, max: 4 }) || !Number.isFinite(multiplier) || multiplier < .25 || multiplier > 4
    || calibration.targetCssMagnitude !== 320
    || !equals(calibration.numericPrecision, { model: 'ieee754-float32-four-unit-roundoffs-v1', float32UnitRoundoff: 2 ** -24, relativeTolerance: nativeRelativeTolerance,
      wheelAbsoluteTolerance: 320 * nativeRelativeTolerance, dprAbsoluteTolerance: report.dpr * nativeRelativeTolerance,
      appliesOnlyTo: ['native-wheel-delta', 'reported-dpr', 'renderer-resolution'], zeroAxes: 'exact', physicalPixels: 'exact-round-css-times-target-dpr' })
    || calibration.presentation !== report.presentation || calibration.browserVersion !== report.browserVersion
    || !equals(calibration.contextOptions, { viewport: report.viewport, deviceScaleFactor: report.dpr })
    || calibration.pageClosed !== true || calibration.contextClosed !== true
    || !['requests', 'workers', 'errors'].every(key => Array.isArray(calibration[key]) && calibration[key].length === 0)
    || !Array.isArray(calibration.probes) || calibration.probes.length !== 6 || !Array.isArray(calibration.allEvents)) return false;
  const negativeRatio = calibration.probes[0].events?.[0]?.deltaY / -320;
  if (!Number.isFinite(negativeRatio) || negativeRatio <= 0 || calibration.observedCssUnitsPerApiUnit !== negativeRatio || multiplier !== 1 / negativeRatio) return false;
  const validEnvironment = env => env?.url === 'about:blank' && nativeClose(env.dpr, report.dpr) && equals(env.viewport, report.viewport)
    && env.visibility === 'visible' && (report.presentation !== 'headed' || env.focused === true)
    && Array.isArray(env.resources) && env.resources.length === 0 && env.canvases === 0 && env.scripts === 0;
  if (!validEnvironment(calibration.environmentBefore) || !validEnvironment(calibration.environmentAfter)
    || !equals(calibration.allEvents, calibration.probes.flatMap(row => row.events ?? []))) return false;
  const start = Date.parse(calibration.startedAt), end = Date.parse(calibration.completedAt), reportStart = Date.parse(report.startedAt), reportEnd = Date.parse(report.completedAt);
  if (![start, end, reportStart, reportEnd].every(Number.isFinite) || start < reportStart || end < start || end > reportEnd) return false;
  return calibration.probes.every((probe, index) => {
    const discovery = index < 2, sign = index % 2 ? 1 : -1, apiDeltaY = sign * 320 * (discovery ? 1 : multiplier);
    if (probe.index !== index || probe.stage !== (discovery ? 'discovery' : 'verification') || probe.eventOffset !== index
      || probe.apiDeltaX !== 0 || probe.apiDeltaY !== apiDeltaY || probe.targetCssDeltaY !== (discovery ? null : sign * 320)
      || !Array.isArray(probe.events) || probe.events.length !== 1 || !Number.isFinite(probe.startedAt) || !Number.isFinite(probe.endedAt)
      || probe.endedAt < probe.startedAt || index > 0 && probe.startedAt < calibration.probes[index - 1].endedAt) return false;
    const event = probe.events[0];
    return event?.type === 'wheel' && event.trusted === true && event.target === 'wheel-calibration-target' && event.deltaMode === 0
      && event.deltaX === 0 && event.deltaZ === 0 && nativeClose(event.deltaY, discovery ? apiDeltaY / multiplier : sign * 320)
      && Number.isFinite(event.at) && event.at >= probe.startedAt && event.at <= probe.endedAt
      && event.x === report.viewport.width / 2 && event.y === report.viewport.height / 2;
  });
}
function expectedSceneHeights(scene) {
  if (!scene || scene.recipe !== 'ph05-ui-geography-v1' || !Array.isArray(scene.commands)) return null;
  const heights = new Int32Array(256 * 256).fill(-100);
  for (const { cellId, column, row, range, height } of scene.commands) {
    if (![cellId, column, row, range, height].every(Number.isSafeInteger) || cellId !== row * 256 + column
      || ![8, 32].includes(range) || column - range / 2 < 0 || row - range / 2 < 0
      || column + range / 2 > 256 || row + range / 2 > 256 || height < -12000 || height > 12000) return null;
    for (let y = row - range / 2; y < row + range / 2; y++) for (let x = column - range / 2; x < column + range / 2; x++) heights[y * 256 + x] = height;
  }
  return heights;
}
function expectedLabelText(label, lod) {
  const { cellId, elevationMeters, selected } = label;
  if (selected) return `地块 #${cellId} · ${elevationMeters < 0 ? `水深 ${-elevationMeters}` : `高程 ${elevationMeters}`} 米`;
  return lod === 'near' ? `#${cellId} · ${elevationMeters} 米` : `${elevationMeters} 米`;
}
function validateDomLabels(labels, metrics, heights) {
  if (!heights || !Array.isArray(labels) || labels.length > 32 || !Array.isArray(metrics?.labels?.visibleIds)
    || labels.length !== metrics.labels.visibleCount || labels.length !== new Set(labels.map(row => row.cellId)).size) return false;
  return labels.every(label => Number.isSafeInteger(label.cellId) && label.cellId >= 0 && label.cellId < heights.length
    && label.elevationMeters === heights[label.cellId] && typeof label.selected === 'boolean'
    && label.selected === (label.cellId === metrics.selected) && (label.selected || label.elevationMeters >= 0 && metrics.lod !== 'far')
    && metrics.labels.visibleIds.includes(label.cellId) && label.text === expectedLabelText(label, metrics.lod));
}
function validateSelectionPlan(scene, heights) {
  const plan = scene?.selectionPlan;
  if (!heights || plan?.source !== 'completed-legal-ui-edits-v1' || plan.initialOceanMeters !== -100) return false;
  const valid = target => target && Number.isSafeInteger(target.cellId) && target.cellId >= 0 && target.cellId < heights.length
    && target.expectedElevation === heights[target.cellId]
    && target.world?.x === (target.cellId % 256 + .5) * 16 && target.world?.y === (Math.floor(target.cellId / 256) + .5) * 16;
  return valid(plan.land) && valid(plan.sea) && plan.land.expectedElevation >= 0 && plan.sea.expectedElevation < 0
    && Math.abs(plan.land.cellId % 256 - plan.sea.cellId % 256) + Math.abs(Math.floor(plan.land.cellId / 256) - Math.floor(plan.sea.cellId / 256)) === 1;
}
function validateLodMetrics(row) {
  const labels = row?.labels, lod = row?.lod, viewport = row?.viewport;
  const cellId = value => Number.isSafeInteger(value) && value >= 0 && value < 256 * 256;
  const count = value => Number.isSafeInteger(value) && value >= 0;
  const validLod = ['far', 'medium', 'near'].includes(lod);
  const validViewport = viewport && Number.isFinite(viewport.width) && viewport.width > 0 && Number.isFinite(viewport.height) && viewport.height > 0;
  const labelFields = !!labels && ['visibleCount', 'examinedCells', 'candidateCount', 'visibleNodes', 'probeNodes', 'measurementCacheEntries'].every(key => count(labels[key]))
    && Array.isArray(labels.visibleIds) && Array.isArray(labels.boxes)
    && (labels.latticeStride === null || Number.isSafeInteger(labels.latticeStride) && labels.latticeStride >= 1 && labels.latticeStride <= 256 && Number.isInteger(Math.log2(labels.latticeStride)));
  const maxLabels = validLod && validViewport ? lod === 'far' ? 1 : lod === 'medium' ? viewport.width >= 600 ? 8 : 4 : viewport.width >= 600 ? 32 : 12 : 0;
  // Pool sizes include reusable hidden nodes. Neither a selected label nor a
  // hidden display slot is exempted from the respective display/pool budget.
  const boundedDisplay = labelFields && validLod && validViewport && labels.visibleCount <= maxLabels && labels.visibleIds.length <= maxLabels && labels.boxes.length <= maxLabels;
  const identities = boundedDisplay && labels.visibleIds.length === labels.visibleCount && labels.boxes.length === labels.visibleCount
    && labels.visibleIds.every(cellId) && new Set(labels.visibleIds).size === labels.visibleCount
    && labels.boxes.every(box => box && cellId(box.cellId)) && new Set(labels.boxes.map(box => box.cellId)).size === labels.visibleCount
    && labels.boxes.every(box => labels.visibleIds.includes(box.cellId));
  const boxesInViewport = identities && labels.boxes.every(box => ['x', 'y', 'width', 'height'].every(key => Number.isFinite(box[key]))
    && box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0
    && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height);
  // Only enter the pairwise check after the <=32 display cap is verified.
  // Edge-touching rectangles do not overlap; all positive-area overlaps fail.
  const separated = boxesInViewport && labels.boxes.every((box, index) => labels.boxes.slice(index + 1).every(other =>
    box.x + box.width <= other.x || other.x + other.width <= box.x || box.y + box.height <= other.y || other.y + other.height <= box.y));
  return {
    lodAndLabelFields: validLod && Number.isFinite(row?.cellPixels) && row.cellPixels > 0 && typeof row?.gridVisible === 'boolean' && labelFields,
    lodGridPolicy: validLod && row.gridVisible === (lod === 'near')
      && (lod === 'far' ? row.cellPixels < 7 : lod === 'medium' ? row.cellPixels >= 5 && row.cellPixels < 26 : row.cellPixels >= 22),
    labelDisplayAndIdentity: identities,
    labelWorkBudget: labelFields && labels.examinedCells <= 256 && labels.candidateCount <= 256 && labels.candidateCount <= labels.examinedCells && labels.visibleCount <= labels.candidateCount,
    labelPoolBudget: labelFields && labels.visibleNodes <= 32 && labels.visibleCount <= labels.visibleNodes && labels.probeNodes <= 256 && labels.visibleNodes + labels.probeNodes <= 288 && labels.measurementCacheEntries <= 256,
    labelBoxesInViewport: boxesInViewport,
    labelBoxesDoNotOverlap: separated,
  };
}
function validateGeometryMetrics(row) {
  const cache = row?.geometryCache;
  const fields = !!cache && ['entries', 'quads', 'liveQuads', 'reservedQuads', 'reservedEntries', 'peakQuads', 'quadLimit', 'entryLimit',
    'created', 'destroyed', 'hits', 'misses', 'evictions', 'releaseFailures'].every(key => Number.isSafeInteger(cache[key]) && cache[key] >= 0);
  return {
    geometryLedgerFields: fields,
    geometryCapacity: fields && cache.quadLimit === 131072 && cache.entryLimit === 128
      && cache.entries + cache.reservedEntries <= cache.entryLimit && cache.quads <= cache.peakQuads && cache.peakQuads <= cache.quadLimit,
    geometryCurrentBalance: fields && cache.quads === cache.liveQuads + cache.reservedQuads
      && cache.created - cache.destroyed === cache.entries && cache.entries <= cache.liveQuads
      && (cache.entries > 0 || cache.liveQuads === 0),
    // Measurements are taken after complete cache operations, never from an
    // allocator's private in-flight state. Failed releases must remain failures;
    // a zeroed counter cannot excuse the renderer's independent fatal state.
    geometryReadyReleaseState: fields && row.gpu?.state === 'ready' && row.destroyed === false && row.fatal === false
      && cache.reservedQuads === 0 && cache.reservedEntries === 0 && cache.releaseFailures === 0,
  };
}
function validateSample(raw, report, scene) {
  const observation = raw.observation ?? {}, frames = observation.frames ?? [], intervals = frames.slice(1).map((at, index) => at - frames[index]);
  const drawRecords = [...(observation.draws ?? []), ...(raw.metricsAfter ? [{ at: observation.endedAt, metrics: raw.metricsAfter, labels: raw.labelsAfter, finalFlush: true }] : [])];
  const startSequence = raw.metricsBefore?.completedFrameSequence, endSequence = raw.metricsAfter?.completedFrameSequence, bySequence = new Map(); let conflicts = false;
  for (const { metrics } of drawRecords) {
    const sequence = metrics?.completedFrameSequence;
    if (Number.isSafeInteger(sequence) && sequence > startSequence && sequence <= endSequence) {
      if (bySequence.has(sequence) && bySequence.get(sequence) !== metrics.completedDrawCpuMs) conflicts = true;
      bySequence.set(sequence, metrics.completedDrawCpuMs);
    }
  }
  // Previous-draw events are deduplicated by their explicit completed sequence;
  // every original event remains in raw evidence, including malformed records.
  const drawCpu = stats([...bySequence.values()]), raf = stats(intervals);
  const metricRows = [raw.metricsBefore, ...drawRecords.map(row => row.metrics)];
  const domLabelRows = [raw.labelsBefore, ...drawRecords.map(row => row.labels)], heights = expectedSceneHeights(scene);
  const invalidDomLabelRows = domLabelRows.flatMap((labels, index) => validateDomLabels(labels, metricRows[index], heights) ? [] : [index]);
  const lodCoverage = Object.fromEntries(['far', 'medium', 'near'].map(lod => {
    const indexes = metricRows.flatMap((row, index) => row?.lod === lod ? [index] : []);
    return [lod, { rawRows: indexes.length, nonemptyDomLabelRows: indexes.filter(index => domLabelRows[index]?.length > 0).length,
      ordinaryDomLabelRows: indexes.filter(index => domLabelRows[index]?.some(label => label.selected === false)).length,
      maxVisibleLabels: Math.max(0, ...indexes.map(index => domLabelRows[index]?.length ?? 0)) }];
  }));
  // Validate every raw moment, including repeated completed-frame sequences.
  // Sequence deduplication is only for CPU timing, never for label correctness.
  const lodRows = metricRows.map(validateLodMetrics), lodCheckNames = Object.keys(validateLodMetrics(null));
  const lodChecks = Object.fromEntries(lodCheckNames.map(key => [key, lodRows.every(row => row[key] === true)]));
  const invalidLodRows = lodRows.flatMap((checks, index) => {
    const failedChecks = lodCheckNames.filter(key => checks[key] !== true);
    return failedChecks.length ? [{ metricRowIndex: index, frameSequence: metricRows[index]?.frameSequence ?? null, failedChecks }] : [];
  });
  // Cache correctness includes every raw draw even when its completed CPU slot
  // repeats. Never collapse resource evidence to just the first/last samples.
  const geometryRows = metricRows.map(validateGeometryMetrics), geometryCheckNames = Object.keys(validateGeometryMetrics(null));
  const geometryChecks = Object.fromEntries(geometryCheckNames.map(key => [key, geometryRows.every(row => row[key] === true)]));
  const cumulativeGeometryFields = ['created', 'destroyed', 'hits', 'misses', 'evictions', 'releaseFailures', 'peakQuads'];
  const geometryMonotonic = geometryRows.map((checks, index) => checks.geometryLedgerFields && (index === 0
    || geometryRows[index - 1].geometryLedgerFields && cumulativeGeometryFields.every(key => metricRows[index].geometryCache[key] >= metricRows[index - 1].geometryCache[key])));
  const invalidGeometryRows = geometryRows.flatMap((checks, index) => {
    const failedChecks = geometryCheckNames.filter(key => checks[key] !== true);
    if (!geometryMonotonic[index]) failedChecks.push('geometryCumulativeCountersMonotonic');
    return failedChecks.length ? [{ metricRowIndex: index, frameSequence: metricRows[index]?.frameSequence ?? null, failedChecks,
      geometryCache: metricRows[index]?.geometryCache ?? null }] : [];
  });
  const geometryFieldsValid = geometryRows.every(row => row.geometryLedgerFields);
  const geometryLedger = { checkedRawRows: geometryRows.length, quadLimit: 131072, entryLimit: 128, invalidRows: invalidGeometryRows,
    observedPeakQuads: geometryFieldsValid ? Math.max(...metricRows.map(row => row.geometryCache.peakQuads)) : null,
    observedMaxEntries: geometryFieldsValid ? Math.max(...metricRows.map(row => row.geometryCache.entries)) : null,
    before: raw.metricsBefore?.geometryCache ?? null, after: raw.metricsAfter?.geometryCache ?? null };
  const completeMetric = row => row && ['repaintBlocks', 'frameRepaintBlocks', 'visibleBlocks', 'acceptedRevision', 'frameSequence', 'completedFrameSequence'].every(key => Number.isSafeInteger(row[key]) && row[key] >= 0)
    && ['correctFrameAt', 'completedDrawCpuMs'].every(key => Number.isFinite(row[key]) && row[key] >= 0)
    && row.completedFrameSequence <= row.frameSequence && row.frameSequence - row.completedFrameSequence <= 1
    && row.camera && ['x', 'y', 'scale'].every(key => Number.isFinite(row.camera[key])) && row.camera.scale > 0
    && row.viewport && ['width', 'height', 'resolution'].every(key => Number.isFinite(row.viewport[key]))
    && row.gpu?.state === 'ready' && Number.isSafeInteger(row.gpu.epoch) && row.destroyed === false && row.fatal === false
    && row.cache && ['pixels', 'livePixels', 'reservedPixels', 'peakPixels', 'budgetPixels', 'entries', 'created', 'destroyed', 'hits', 'misses', 'evictions'].every(key => Number.isSafeInteger(row.cache[key]) && row.cache[key] >= 0)
    && row.cache.releaseFailures === 0;
  const validMetrics = metricRows.length > 1 && metricRows.every(completeMetric);
  const cachePeakPixels = validMetrics ? Math.max(...metricRows.map(row => row.cache.peakPixels)) : null;
  const before = raw.auditBefore, after = raw.auditAfter, root = raw.rootBefore;
  let decodedRoot = null; try { decodedRoot = JSON.parse(Buffer.from(root ?? []).toString('utf8')); } catch { /* Invalid root evidence is a failed check, not omitted. */ }
  const actions = raw.actions ?? [], picks = actions.filter(row => row.kind === 'select'), zooms = actions.filter(row => row.kind === 'zoom'), drags = actions.filter(row => row.kind === 'drag');
  const wheelEvents = (observation.inputs ?? []).flatMap((event, inputIndex) => event.type === 'wheel' ? [{ event, inputIndex }] : []);
  const apiUnitsPerCssUnit = report.wheelCalibration?.apiUnitsPerCssUnit;
  const invalidWheelRows = wheelEvents.flatMap(({ event, inputIndex }, index) => {
    const action = zooms[index], failedChecks = [];
    if (!action || action.wheelIndex !== index) failedChecks.push('matchingNativeEventAndActionOrdinal');
    if (event.trusted !== true || event.target !== 'atlas-canvas' || event.deltaMode !== 0 || event.deltaX !== 0 || event.deltaZ !== 0) failedChecks.push('trustedCanvasPixelWheel');
    if (!action || ![-320, 320].includes(action.cssDeltaY) || action.deltaY !== action.cssDeltaY || action.cssDeltaX !== 0
      || action.apiDeltaX !== 0 || action.apiDeltaY !== action.cssDeltaY * apiUnitsPerCssUnit || !nativeClose(event.deltaY, action.cssDeltaY)) failedChecks.push('requestedCssDeltaWithinNativeFloat32Bound');
    if (!action || ![event.x, event.y, action.x, action.y].every(Number.isFinite) || Math.abs(event.x - action.x) > 1 || Math.abs(event.y - action.y) > 1) failedChecks.push('sameNativeCssAnchor');
    if (!Number.isFinite(event.at) || event.at < observation.startedAt || event.at > observation.endedAt
      || index > 0 && event.at < wheelEvents[index - 1].event.at) failedChecks.push('nativeWheelTimeOrder');
    return failedChecks.length ? [{ wheelIndex: index, inputIndex, action: action ?? null, event, failedChecks }] : [];
  });
  const nativeWheelTrajectory = { requestedActions: zooms.length, observedEvents: wheelEvents.length,
    apiUnitsPerCssUnit: apiUnitsPerCssUnit ?? null, relativeRepresentationTolerance: nativeRelativeTolerance,
    cssAbsoluteRepresentationTolerance: 320 * nativeRelativeTolerance, invalidRows: invalidWheelRows };
  const cycles = report.trajectory?.cycles;
  const expectedZoomKeys = Array.from({ length: cycles ?? 0 }, (_, cycle) => ['in', 'out'].flatMap(direction => Array.from({ length: 6 }, (_, slot) => `${cycle}/${direction}/${slot}`))).flat();
  const expectedPickKeys = Array.from({ length: cycles ?? 0 }, (_, cycle) => Array.from({ length: 4 }, (_, slot) => `${cycle}/select/${slot}`)).flat();
  const cycleStarts = actions.filter(row => row.kind === 'cycle-start');
  const correctPicks = validateSelectionPlan(scene, heights) && picks.every(pick => {
    const slot = Number(pick.key?.split('/').at(-1)), terrain = slot % 2 ? 'sea' : 'land', target = scene.selectionPlan[terrain];
    return pick.terrain === terrain && pick.expected === target.cellId && pick.actual === target.cellId && pick.expectedElevation === target.expectedElevation
      && equals(pick.safeWorld, target.world) && pick.lod === 'near' && pick.gridVisible === true
      && pick.selectedLabel?.cellId === target.cellId && pick.selectedLabel.selected === true
      && pick.selectedLabel.elevationMeters === target.expectedElevation && pick.selectedLabel.text === expectedLabelText(pick.selectedLabel, 'near');
  });
  const checks = {
    completedWithoutError: raw.completed === true && Array.isArray(raw.errors) && raw.errors.length === 0,
    realDuration: raw.targetDurationMs === report.durationMs && Number.isFinite(observation.endedAt - observation.startedAt) && observation.endedAt - observation.startedAt >= report.durationMs,
    productionViewport: report.viewport?.width === 1440 && report.viewport?.height === 960 && raw.boundsBefore?.width >= 1280 && raw.boundsBefore?.height >= 800 && equals(raw.boundsBefore, raw.boundsAfter),
    correctDprAndWebgl: nativeClose(raw.webgl?.dpr, report.dpr) && raw.webgl?.lost === false && typeof raw.webgl?.renderer === 'string'
      && metricRows.every(row => nativeClose(row?.viewport?.resolution, report.dpr)),
    exactPhysicalCanvasPixels: Number.isFinite(raw.boundsBefore?.width) && Number.isFinite(raw.boundsBefore?.height)
      && raw.webgl?.canvasWidth === Math.round(raw.boundsBefore.width * report.dpr) && raw.webgl?.canvasHeight === Math.round(raw.boundsBefore.height * report.dpr)
      && raw.webgl?.drawingBufferWidth === raw.webgl?.canvasWidth && raw.webgl?.drawingBufferHeight === raw.webgl?.canvasHeight,
    noContextLossDuringTiming: Array.isArray(observation.gpuEvents) && observation.gpuEvents.length === 0,
    visibleThroughout: observation.initialVisibility === 'visible' && (observation.visibility ?? []).every(row => row.state === 'visible'),
    headedFocus: report.presentation !== 'headed' || observation.initialFocus === true && (observation.focus ?? []).every(row => row.focused === true),
    allMetricFields: validMetrics,
    ...lodChecks,
    ...geometryChecks,
    geometryCumulativeCountersMonotonic: geometryMonotonic.every(Boolean),
    geometryCacheObservedNonempty: metricRows.some(row => row?.geometryCache?.entries > 0 && row.geometryCache.liveQuads > 0),
    actualDomLabelsMatchCurrentGeography: invalidDomLabelRows.length === 0,
    allThreeLodsWithRealLandLabels: Object.values(lodCoverage).every(row => row.rawRows > 0)
      && ['medium', 'near'].every(lod => lodCoverage[lod].ordinaryDomLabelRows > 0) && lodCoverage.near.maxVisibleLabels > 1,
    nearGridAndRealLandSeaSelections: picks.length === cycles * 4 && correctPicks,
    atomicObserverBoundaries: raw.browserSampleStartedAt === observation.startedAt
      && raw.metricsBefore?.frameSequence === startSequence && raw.metricsAfter?.frameSequence === endSequence
      && drawRecords.every(row => Number.isFinite(row.at) && row.at >= observation.startedAt && row.at <= observation.endedAt)
      && frames.every(at => Number.isFinite(at) && at >= 0 && at <= observation.endedAt),
    allCompletedDrawsMeasured: !conflicts && Number.isSafeInteger(startSequence) && Number.isSafeInteger(endSequence) && endSequence > startSequence && bySequence.size === endSequence - startSequence && drawCpu.valid,
    completedDrawSequenceOrder: drawRecords.every((row, index) => row.metrics?.completedFrameSequence >= startSequence && row.metrics?.completedFrameSequence <= endSequence
      && (index === 0 || row.metrics.completedFrameSequence >= drawRecords[index - 1].metrics?.completedFrameSequence)),
    allRafIntervalsValid: raf.valid && intervals.every(value => value > 0),
    cacheBudget: validMetrics && metricRows.every(row => row.cache.budgetPixels === 32 * 1024 * 1024 && row.cache.pixels === row.cache.livePixels + row.cache.reservedPixels && row.cache.peakPixels >= row.cache.pixels && row.cache.peakPixels <= 32 * 1024 * 1024 && row.cache.created - row.cache.destroyed === row.cache.entries),
    worldAndRootUnchanged: before?.ok === true && after?.ok === true && before.verifiedBlocks === 256 && after.verifiedBlocks === 256 && before.manifestDigest === after.manifestDigest && before.draftId === after.draftId && before.atlasId === after.atlasId && before.revision === after.revision && before.manifestDigest === scene?.audit?.manifestDigest && before.draftId === scene?.final?.draftId && equals(raw.rootBefore, raw.rootAfter) && equals(raw.rootBefore, scene?.root) && decodedRoot?.currentManifest === before.manifestDigest && decodedRoot?.draftId === before.draftId && decodedRoot?.revision === before.revision && equals(raw.identityBefore, raw.identityAfter),
    fixedTrajectoryInputs: raw.trajectory === 'ph05-ui-pan-zoom-select-v2' && raw.trajectory === report.trajectory?.id
      && zooms.length === expectedZoomKeys.length && equals(zooms.map(row => row.key), expectedZoomKeys)
      && zooms.every(row => row.deltaY === (row.key.includes('/in/') ? -320 : 320))
      && equals(picks.map(row => row.key), expectedPickKeys) && drags.length > cycles
      && cycleStarts.length === cycles && cycleStarts.every((row, index) => row.cycle === index && row.lod === 'far')
      && actions.every(row => Number.isFinite(row.atMs) && row.atMs >= 0)
      && actions.every((row, index) => index === 0 || row.atMs >= actions[index - 1].atMs),
    trustedInteractionObserved: ['pointermove', 'pointerdown', 'pointerup', 'wheel', 'click'].every(type => (observation.inputs ?? []).some(row => row.type === type && row.trusted)) && (observation.inputs ?? []).every(row => row.trusted === true),
    nativeWheelCalibrationVerified: validateWheelCalibration(report),
    nativeCssWheelTrajectoryWithinRepresentationBound: wheelEvents.length === cycles * 12 && wheelEvents.length === zooms.length && invalidWheelRows.length === 0,
    screenshotRecorded: typeof raw.screenshot === 'string',
  };
  const thresholds = { frameP95: raf.valid && raf.p95 <= 16.7, frameMax: raf.valid && raf.max <= 100, slowFrameRatio: raf.valid && raf.over33_3Ratio <= .01, completeDrawCpuP95: drawCpu.valid && drawCpu.p95 <= 8 };
  return { label: raw.label, scene: raw.scene, repetition: raw.repetition, temperature: raw.temperature, webgl: raw.webgl, observedDurationMs: observation.endedAt - observation.startedAt, frameIntervals: raf, completedDrawCpuMs: drawCpu, completedDrawSequence: { first: startSequence + 1, last: endSequence, count: bySequence.size }, cachePeakPixels, geometryLedger, lodAndLabelMetrics: { checkedRawRows: lodRows.length, invalidRows: invalidLodRows, invalidDomLabelRows, coverage: lodCoverage }, nativeWheelTrajectory, interactions: { zooms: zooms.length, drags: drags.length, selections: picks.length }, checks, thresholds, valid: Object.values(checks).every(Boolean) };
}
const result = { format: 'lieguoji-ph05-render-evaluation', version: 1, evaluatedAt: new Date().toISOString(), configurations: {}, checks: {}, limitations: ['Only headless DPR1 is the ADR0008 standard hard timing gate.', 'DPR2 pressure and headed-window figures remain separate; no cross-configuration or cold/warm averages.', 'No conversion from rAF intervals to physical FPS, no GPU completion or human visual approval claim.', 'Managed terrain geometry is counted as logical quads/entries, not total browser, CPU or GPU memory.', 'Geography-only worlds do not validate later full society simulation, city markers, or real mobile devices.', 'This evaluator does not mark PH05 complete or write task/project documents.'] };
const loaded = [], recipes = [];
for (const configuration of configurations) {
  if (!args[configuration]) { result.configurations[configuration] = { supplied: false }; continue; }
  const path = resolve(args[configuration]), reportBytes = await readFile(path), report = JSON.parse(reportBytes.toString('utf8'));
  if (report.format !== 'lieguoji-ph05-render-measurement' || report.version !== 1 || `${report.presentation}-dpr${report.dpr}` !== configuration) throw new Error(`Wrong report configuration: ${configuration}`);
  const entry = { supplied: true, path, sha256: sha(reportBytes), mode: report.mode, source: report.source?.sha256, dist: report.dist?.sha256, browserVersion: report.browserVersion, host: report.host, systemInfo: report.systemInfo, samples: [], checks: {} }; result.configurations[configuration] = entry; loaded.push(report);
  for (const reference of report.samples ?? []) {
    const rawPath = resolve(dirname(path), reference.path); if (!rawPath.startsWith(`${dirname(path)}${process.platform === 'win32' ? '\\' : '/'}`)) throw new Error('Raw evidence path escapes its report directory');
    const bytes = await readFile(rawPath); if (bytes.length !== reference.bytes || sha(bytes) !== reference.sha256) throw new Error(`Raw evidence changed: ${rawPath}`);
    const raw = JSON.parse(bytes.toString('utf8')), sample = validateSample(raw, report, report.scenes?.find(row => row.name === raw.scene));
    sample.checks.exactRawReference = reference.label === raw.label && reference.scene === raw.scene && reference.repetition === raw.repetition
      && reference.temperature === raw.temperature && reference.completed === raw.completed;
    if (!sample.checks.exactRawReference) sample.valid = false;
    if (raw.screenshot) { const screenshot = resolve(dirname(path), raw.screenshot); if (!screenshot.startsWith(`${dirname(path)}${process.platform === 'win32' ? '\\' : '/'}`)) throw new Error('Screenshot path escapes report directory'); const bytes = await readFile(screenshot); sample.screenshotBytes = bytes.length; if (!sample.screenshotBytes || sha(bytes) !== raw.screenshotSha256) sample.valid = sample.checks.screenshotRecorded = false; }
    entry.samples.push({ ...sample, rawPath, rawSha256: reference.sha256 });
  }
  const commandsValid = (report.scenes ?? []).every(scene => {
    const commands = scene.commands ?? [];
    return validateSelectionPlan(scene, expectedSceneHeights(scene)) && commands.length === ({ continental: 40, archipelago: 36, mountains: 60 })[scene.name] && new Set(commands.map(row => row.height)).size >= 4 && commands.some(row => row.height > 0) && commands.every((row, index) => row.before.revision === index && row.after.revision === index + 1 && row.before.manifestDigest !== row.after.manifestDigest && row.previewCells === row.range ** 2 && row.selectedHeight === `${row.height} 米`) && scene.audit?.verifiedBlocks === 256 && scene.audit?.ok === true;
  });
  recipes.push(JSON.stringify((report.scenes ?? []).map(scene => ({ name: scene.name, recipe: scene.recipe, selectionPlan: scene.selectionPlan, commands: scene.commands?.map(({ cellId, column, row, range, height }) => ({ cellId, column, row, range, height })) }))));
  entry.checks = {
    completeFingerprintManifests: ['source', 'sourceAfter', 'dist', 'distAfter'].every(key => validFingerprint(report[key])),
    cleanVersionLockedRun: report.status === 'measured' && report.calibrationOnly === false && report.sourceUnchanged === true && report.distUnchanged === true && report.source?.sha256 === report.sourceAfter?.sha256 && report.dist?.sha256 === report.distAfter?.sha256 && report.servedIndexVerified === true && ['errors', 'consoleErrors', 'pageErrors', 'requestFailures'].every(key => Array.isArray(report[key]) && report[key].length === 0),
    isolatedNativeWheelCalibration: validateWheelCalibration(report),
    realLaunchMode: report.launch?.headless === (report.presentation === 'headless') && report.launch?.channel === 'chromium' && typeof report.browserVersion === 'string' && !!report.systemInfo?.gpu,
    legalNonuniformThreeScenes: report.scenes?.length === 3 && scenes.every(name => report.scenes.some(scene => scene.name === name)) && commandsValid,
    fixedV2Trajectory: report.trajectory?.id === 'ph05-ui-pan-zoom-select-v2' && report.trajectory?.inputCadenceMs === 40
      && report.trajectory.wheelDelta === 320 && report.trajectory.wheelUnits === 'trusted-dom-css-pixels' && report.trajectory.inwardSteps === 6 && report.trajectory.outwardSteps === 6
      && report.trajectory.cycleMs === (report.mode === 'formal' ? 12000 : 5000) && report.trajectory.cycles === (report.mode === 'formal' ? 5 : 1)
      && equals(report.trajectory.phaseSeconds, { zoomIn: [0, 1.5], drag: [1.5, 8.5], select: [8.5, 10.5], zoomOut: [10.5, 12] })
      && equals(report.trajectory.dragAmplitude, { width: .16, height: .11 }),
    formalCoverage: report.mode === 'formal' && report.durationMs === 60000 && report.repetitions >= 3 && entry.samples.length === report.repetitions * 6 && scenes.every(scene => ['cold', 'warm'].every(temperature => {
      const rows = entry.samples.filter(row => row.scene === scene && row.temperature === temperature); return rows.length === report.repetitions && new Set(rows.map(row => row.repetition)).size === report.repetitions;
    })),
    everyRawSampleValid: entry.samples.length > 0 && entry.samples.every(row => row.valid),
    consistentActualBackend: entry.samples.length > 0 && new Set(entry.samples.map(row => JSON.stringify({ version: row.webgl?.version, vendor: row.webgl?.unmaskedVendor, renderer: row.webgl?.unmaskedRenderer ?? row.webgl?.renderer }))).size === 1,
  };
  entry.everySampleWithinOriginalTimingTargets = entry.samples.length > 0 && entry.samples.every(row => Object.values(row.thresholds).every(Boolean));
  // Deliberately no aggregate across repetitions, scenes, temperatures or DPRs:
  // every individual raw run must satisfy the standard timing targets.
}
result.checks = {
  fourSeparateConfigurations: configurations.every(key => result.configurations[key].supplied),
  exactSameSourceAndDist: loaded.length === 4 && new Set(loaded.map(row => row.source?.sha256)).size === 1 && new Set(loaded.map(row => row.dist?.sha256)).size === 1,
  matchingLegitimateSceneRecipes: recipes.length === 4 && new Set(recipes).size === 1,
  completeFormalEvidence: configurations.every(key => { const entry = result.configurations[key]; return entry.supplied && Object.values(entry.checks).every(Boolean); }),
  headlessDpr1OriginalThresholds: result.configurations['headless-dpr1'].everySampleWithinOriginalTimingTargets === true,
};
result.status = Object.values(result.checks).every(Boolean) ? 'render-measurement-gates-passed' : 'render-measurement-gates-not-passed';
await writeFile(args.out, `${JSON.stringify(result, null, 2)}\n`); console.log(JSON.stringify({ status: result.status, checks: result.checks, configurations: Object.fromEntries(configurations.map(key => [key, { checks: result.configurations[key].checks, everySampleWithinOriginalTimingTargets: result.configurations[key].everySampleWithinOriginalTimingTargets }])) }, null, 2));
if (result.status !== 'render-measurement-gates-passed') process.exitCode = 1;
