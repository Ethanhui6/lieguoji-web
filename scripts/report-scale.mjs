import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Read explicitly named evidence only. This script never runs a benchmark,
// changes a raw report, or converts a measured/failed/smoke run into acceptance.
const workspace = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const usage = 'node scripts/report-scale.mjs <report.json> [<report.json> ...] [--out=<workspace-relative-directory>]';
const finite = value => typeof value === 'number' && Number.isFinite(value);
const pick = (value, keys) => Object.fromEntries(keys.map(key => [key, value?.[key] ?? null]));
const unique = values => [...new Map(values.map(value => [JSON.stringify(value), value])).values()];

function checkedPath(input, output = false) {
  if (output && isAbsolute(input)) throw new Error('--out must be workspace-relative.');
  const path = resolve(workspace, input), local = relative(workspace, path);
  if (!local || local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) throw new Error('Path must stay inside this workspace.');
  let current = workspace;
  for (const part of local.split(sep)) {
    current = resolve(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error('Evidence/output paths cannot contain symbolic links or junctions.');
  }
  return path;
}
const localPath = path => relative(workspace, path).split(sep).join('/');
const ref = (path, pointer = '') => `${path}#${pointer}`;

function distribution(value, rawRef) {
  if (!value || typeof value !== 'object') return null;
  return { ...pick(value, ['count', 'min', 'p50', 'p95', 'max']), rawSamples: Array.isArray(value.raw) ? value.raw.length : null, rawRef };
}
function rawTimings(samples, rawRef) {
  if (!Array.isArray(samples)) return { count: null, samplesValid: false, rawRef };
  const valid = samples.length > 0 && samples.every(value => finite(value) && value >= 0);
  const sorted = valid ? [...samples].sort((a, b) => a - b) : [];
  return { count: samples.length, samplesValid: valid, singleSampleMs: valid && samples.length === 1 ? samples[0] : null, minMs: sorted[0] ?? null, maxMs: sorted.at(-1) ?? null, p50Ms: sorted.length > 1 ? sorted[Math.ceil(sorted.length * .5) - 1] : null, p95Ms: sorted.length > 1 ? sorted[Math.ceil(sorted.length * .95) - 1] : null, rawRef };
}
function maxima(samples, field) {
  const values = samples.map(sample => sample?.[field]).filter(finite);
  return values.length ? values.reduce((maximum, value) => Math.max(maximum, value), -Infinity) : null;
}
function workerMetrics(value) { return pick(value, ['workerMs', 'prepareMs', 'roundTripMs', 'payloadBytes', 'transport']); }
function rendererMetrics(value) {
  return pick(value, ['webglInitMs', 'lastFixtureMs', 'lastRepaintMs', 'lastRenderSubmissionMs', 'lastRepaintChunks', 'visibleChunks', 'visibleCityMarkers', 'visibleLabels', 'chunks', 'cachedTexturePixels', 'quality', 'layer', 'viewport']);
}

function summarize(report, path, digest) {
  const rawPath = localPath(path), rows = [], warnings = [], actualWebgl = [], builds = [];
  const pendingRefresh = new Map();
  let workload = null, reloadCount = 0;
  let freshDocumentIndex = -1;
  const add = (kind, step, data, pointer = '') => rows.push({ kind, step, workload, rawRef: ref(rawPath, pointer), data });
  for (const [index, entry] of report.results.entries()) {
    const value = entry.value ?? {}, pointer = `/results/${index}/value`, label = entry.label;
    if (typeof label !== 'string' || !finite(entry.elapsedMs)) throw new Error(`${rawPath}: invalid result at index ${index}.`);
    if (value.options) workload = value.options;
    // inspect() may carry an earlier lastMeasurements object. Only a direct
    // benchmarkWorker response has metrics for this actual invocation.
    if (value.metrics && value.measurements?.fixture?.options) workload = value.measurements.fixture.options;
    if (value.sourceOptions) workload = value.sourceOptions;
    if (value.actual?.options) workload = value.actual.options;
    if (value.renderer?.webgl) actualWebgl.push(value.renderer.webgl);
    if (value.actual?.renderer?.webgl) actualWebgl.push(value.actual.renderer.webgl);
    if (value.build) builds.push(value.build);
    const operation = label.includes(': ') ? label.slice(label.indexOf(': ') + 2) : label;
    add('step-response', label, { responseMs: entry.elapsedMs, ...pick(value, ['runId', 'hash', 'sequence', 'historyLength', 'readOnly', 'storageLocked', 'refused']) }, `/results/${index}`);
    if (operation === 'Load local benchmark') add('browser-initialization', label, { ...pick(value, ['userAgent', 'dpr', 'viewport']), renderer: rendererMetrics(value.renderer) }, pointer);
    if (/browser refresh/i.test(operation) || value.freshDocument === true) reloadCount++;
    if (value.freshDocument === true) freshDocumentIndex = index;
    if (operation === 'generate' || operation === 'repeat generation' || /fixture generation/i.test(operation)) {
      add('generation', label, {
        phase: operation === 'repeat generation' ? 'repeat-generation-for-workload' : 'first-generation-for-workload',
        coldProcessProven: false, priorPageReloads: reloadCount,
        note: 'First generation for this workload is not proof of a cold browser/process; no warmup or slow sample is removed.',
        counts: value.counts ?? null, worker: workerMetrics(value.worker), renderer: rendererMetrics(value.renderer),
      }, pointer);
    }
    if (Array.isArray(value.frameIntervals)) {
      const intervals = value.frameIntervals;
      const consistent = intervals.length > 0 && intervals.length === value.count && intervals.every(sample => finite(sample) && sample >= 0);
      const hashEqual = typeof value.hashBefore === 'string' && value.hashBefore === value.hashAfter;
      const fullDuration = finite(value.requestedDurationMs) && value.requestedDurationMs >= 60_000 && finite(value.elapsedMs) && value.elapsedMs >= value.requestedDurationMs;
      const valid = value.valid === true && value.hiddenDuringSample === false && value.cancelled === false && consistent && hashEqual;
      if (!consistent) warnings.push(`${label}: frame count/raw interval inconsistency.`);
      add('frames', label, {
        ...pick(value, ['requestedDurationMs', 'elapsedMs', 'count', 'quality', 'layer', 'pathVersion', 'viewport', 'hiddenDuringSample', 'cancelled', 'hashBefore', 'hashAfter']),
        p95Ms: value.p95 ?? null, maxMs: value.max ?? null, meanMs: value.mean ?? null,
        declaredValid: value.valid ?? null, rawIntervalsConsistent: consistent, reportedHashesEqual: hashEqual,
        durationAtLeast60Seconds: fullDuration, valid60SecondSample: valid && fullDuration,
        formalPerformancePass: null, smokeOnly: report.mode === 'smoke',
        rawIntervalsRef: ref(rawPath, `${pointer}/frameIntervals`), rawSubmissionRef: ref(rawPath, `${pointer}/renderSubmissionMs`),
        note: 'Validity uses recorded flags and hashes; it does not re-execute checks or retroactively strengthen the original runner.',
      }, pointer);
    }
    if (/local edit|administration edit|structure transaction|second transaction|branch mutation|^undo$/.test(operation)) {
      add('edit', label, { worker: workerMetrics(value.worker), renderer: rendererMetrics(value.renderer), selected: value.selected ?? null }, pointer);
    }
    if (/^transport (clone|transfer) \d+$/.test(operation)) add('worker-transport', label, { ...workerMetrics(value.metrics), hash: value.hash ?? null }, pointer);
    if (/^save /.test(operation) && finite(value.payloadBytes)) {
      add('storage-save', label, { ...pick(value, ['elapsedMs', 'revision', 'payloadBytes', 'pairPayloadBytes', 'runId', 'hash']), capacityKind: 'logical-payload-not-physical-disk' }, pointer);
    }
    // inspect() carries the previous storage measurement through later actions;
    // include it only on a step which actually performs a read/load.
    if (value.storage?.operation === 'restore' && /restore|recovery|return to main|verify untouched source/.test(operation)) {
      add('storage-restore', label, { ...value.storage, capacityKind: 'logical-payload-not-physical-disk' }, `${pointer}/storage`);
    }
    if (operation === 'actual controller branch save preserves entire source package') {
      add('history-controller-branch-protection', label, {
        ...pick(value, ['sourceRunId', 'branchRunId', 'before', 'after', 'unchanged']),
        distinctRunIds: typeof value.sourceRunId === 'string' && typeof value.branchRunId === 'string' && value.sourceRunId !== value.branchRunId,
        reportedPackageHashesEqual: typeof value.before?.hash === 'string' && value.before.hash === value.after?.hash,
        note: 'Actual controller branch/save observation; separate from the helper in-memory append/branch protection measurement.',
      }, pointer);
    }
    if (Object.hasOwn(value, 'refreshVerified')) {
      const expected = value.expected, actual = value.actual, pending = pendingRefresh.get(expected?.runId);
      const sameExpectation = pending && ['runId', 'expectedHash', 'expectedSequence', 'expectedRevision'].every(key => pending.expected[key] === expected?.[key]);
      const matched = value.refreshVerified === true && freshDocumentIndex > (pending?.index ?? Infinity) && sameExpectation && actual?.runId === expected?.runId && actual?.hash === expected?.expectedHash && actual?.sequence === expected?.expectedSequence && actual?.storage?.revision === expected?.expectedRevision;
      if (pending && matched) { pending.verification.freshDocumentVerified = true; pending.verification.verificationRef = ref(rawPath, pointer); }
      if (value.refreshVerified === true && !matched) warnings.push(`${label}: declared refresh verification lacks a matching earlier storage requirement, fresh document, or restored identity.`);
      add('history-browser-refresh', label, {
        expected: expected ?? null, recordedRefreshVerified: value.refreshVerified ?? null, matchedStoredExpectation: Boolean(sameExpectation),
        freshDocumentVerified: Boolean(matched), freshDocumentRef: freshDocumentIndex >= 0 ? ref(rawPath, `/results/${freshDocumentIndex}/value`) : null,
        actual: pick(actual, ['runId', 'hash', 'sequence', 'historyLength', 'readOnly']), storage: actual?.storage ?? null,
      }, pointer);
    }
    if (value.format === 'lieguoji-entity-budget-worker-measurement') {
      const core = value.measurements, corePointer = `${pointer}/measurements`;
      add('entity-budget-session', label, { ...pick(value, ['format', 'version', 'sourceOptions', 'sourceHash', 'sourceHashAfter', 'initialization', 'finalVerification', 'elapsedMs', 'timingBoundary', 'limitations']), caseCount: core?.cases?.length ?? null, transportSampleCount: value.transportSamples?.length ?? null }, pointer);
      if (core?.format === 'lieguoji-entity-budget-measurement') {
        add('entity-budget-core', label, pick(core, ['format', 'version', 'options', 'sourceCreationMs', 'sourceHashBefore', 'sourceHashAfter', 'geographyHash', 'elapsedMs', 'interpretation']), corePointer);
        for (const [caseIndex, item] of (core.cases ?? []).entries()) {
          const casePointer = `${corePointer}/cases/${caseIndex}`;
          add('entity-budget-case', label, pick(item, ['caseId', 'counts', 'changes', 'geographyHash', 'completeHash', 'logicalBytes']), casePointer);
          for (const stage of ['createMs', 'validateMs', 'indexMs', 'geographyDigestMs', 'completeDigestMs', 'logicalByteCountMs']) {
            add('entity-budget-stage', label, { caseId: item.caseId, stage, timing: rawTimings(item[stage], ref(rawPath, `${casePointer}/${stage}`)), interpretation: 'One stage sample remains a single sample; no p95 is invented from it.' }, `${casePointer}/${stage}`);
          }
          for (const [kind, query] of Object.entries(item.queries ?? {})) {
            const queryPointer = `${casePointer}/queries/${kind}`;
            add('entity-budget-query', label, { caseId: item.caseId, queryKind: kind, timing: rawTimings(query.rawMs, ref(rawPath, `${queryPointer}/rawMs`)), resultCount: query.results?.length ?? null, resultChecksum: query.checksum ?? null, resultsRef: ref(rawPath, `${queryPointer}/results`) }, queryPointer);
          }
        }
      } else warnings.push(`${label}: missing recognized entity budget core report.`);
      for (const [sampleIndex, sample] of (value.transportSamples ?? []).entries()) add('entity-budget-transport', label, { ...sample, reportedHashesEqual: typeof sample.mainHash === 'string' && sample.mainHash === sample.workerHash }, `${pointer}/transportSamples/${sampleIndex}`);
      continue;
    }
    const measured = value.measurements;
    if (!value.metrics || !measured || measured.format !== 'lieguoji-scale-worker-measurement') continue;
    add('worker-structural', label, {
      fixture: measured.fixture ?? null, elapsedMs: measured.elapsedMs ?? null, worker: workerMetrics(value.metrics),
      spatialQuery: { hitCount: measured.spatialQuery?.hitCount ?? null, ms: distribution(measured.spatialQuery?.ms, ref(rawPath, `${pointer}/measurements/spatialQuery/ms/raw`)) },
      relationIndex: { ...pick(measured.relationIndex, ['buildMs', 'cities', 'populatedCityBuckets', 'groupPeopleBuckets', 'adminParentBuckets', 'checksum']), queryMs: distribution(measured.relationIndex?.queryMs, ref(rawPath, `${pointer}/measurements/relationIndex/queryMs/raw`)) },
      structureTransactions: { count: measured.structureTransactions?.count ?? null, computeMs: distribution(measured.structureTransactions?.computeMs, ref(rawPath, `${pointer}/measurements/structureTransactions/computeMs/raw`)), computeAndHashMs: distribution(measured.structureTransactions?.computeAndHashMs, ref(rawPath, `${pointer}/measurements/structureTransactions/computeAndHashMs/raw`)) },
      memory: measured.memory ?? null, unmeasuredRules: measured.unmeasuredRules ?? null,
    }, `${pointer}/measurements`);
    for (const [historyIndex, history] of (measured.history ?? []).entries()) {
      const historyPointer = `${pointer}/measurements/history/${historyIndex}`;
      add('structural-history', label, { ...pick(history, ['length', 'checkpointCount', 'logicalPayloadBytes', 'verifyMs', 'branchMs', 'branchParent', 'sourceHistoryHashBefore', 'sourceHistoryHashAfter', 'tailHash']), appendMs: distribution(history.appendMs, ref(rawPath, `${historyPointer}/appendMs/raw`)), seekMs: distribution(history.seekMs, ref(rawPath, `${historyPointer}/seekMs/raw`)) }, historyPointer);
      for (const [seekIndex, seek] of (history.seeks ?? []).entries()) add('structural-history-seek', label, { historyLength: history.length, ...seek }, `${historyPointer}/seeks/${seekIndex}`);
      const storage = history.storage;
      if (storage?.format === 'lieguoji-scale-history-storage-measurement') {
        const storagePointer = `${historyPointer}/storage`, verification = { freshDocumentVerified: false, verificationRef: null };
        if (storage.refresh?.required === true) pendingRefresh.set(storage.refresh.runId, { expected: { ...storage.refresh }, index, verification });
        add('history-storage', label, { ...pick(storage, ['format', 'version', 'database', 'runId', 'sourceRunId', 'historyLength', 'expectedHash', 'revision', 'backupSemantics', 'verifyBeforeSaveMs', 'snapshotDigestMs', 'snapshotHash', 'sourceHistoryHashBefore', 'sourceHistoryHashAfter', 'elapsedMs', 'limitations', 'refresh']), browserRefresh: verification }, storagePointer);
        for (const [saveIndex, save] of (storage.saves ?? []).entries()) add('history-storage-save', label, { runId: storage.runId, historyLength: history.length, saveNumber: saveIndex + 1, ...save }, `${storagePointer}/saves/${saveIndex}`);
        for (const [source, read] of Object.entries(storage.reads ?? {})) add('history-storage-read', label, { runId: storage.runId, ...read }, `${storagePointer}/reads/${source}`);
        if (storage.packageProtection) add('history-storage-package-protection', label, { runId: storage.runId, historyLength: history.length, ...storage.packageProtection }, `${storagePointer}/packageProtection`);
      }
    }
    const legacy = measured.legacyRuleBaseline;
    if (!legacy) continue;
    const legacyPointer = `${pointer}/measurements/legacyRuleBaseline`;
    add('legacy-rule-baseline', label, { ...pick(legacy, ['format', 'version', 'engine', 'elapsedMs', 'timingBoundary', 'limitations']) }, legacyPointer);
    for (const section of ['campaign', 'managementHistory']) {
      const baseline = legacy[section];
      if (!baseline) continue;
      const details = { ...baseline };
      delete details.executed; delete details.seeks;
      for (const name of ['dayComputeMs', 'orderComputeMs', 'stateActionComputeMs', 'worldHashMs', 'seekMs']) {
        if (baseline[name]) details[name] = distribution(baseline[name], ref(rawPath, `${legacyPointer}/${section}/${name}/raw`));
      }
      add(`legacy-${section}`, label, details, `${legacyPointer}/${section}`);
      for (const [seekIndex, seek] of (baseline.seeks ?? []).entries()) add('legacy-history-seek', label, seek, `${legacyPointer}/${section}/seeks/${seekIndex}`);
      if (baseline.executed) add('legacy-executed-inputs', label, { count: baseline.executed.length, rawRef: ref(rawPath, `${legacyPointer}/${section}/executed`) }, `${legacyPointer}/${section}/executed`);
    }
  }
  const heaps = report.heapSamples ?? [];
  workload = null;
  add('main-page-heap', 'CDP Runtime.getHeapUsage sampled maxima', {
    sampleCount: heaps.length, usedSizeMaxBytes: maxima(heaps, 'usedSize'), totalSizeMaxBytes: maxima(heaps, 'totalSize'), embedderHeapUsedSizeMaxBytes: maxima(heaps, 'embedderHeapUsedSize'), backingStorageSizeMaxBytes: maxima(heaps, 'backingStorageSize'),
    workerPeakHeapBytes: null, gpuPeakBytes: null, wholeBrowserPeakBytes: null,
    note: 'Observed main-page sample maxima only; no interpolation, no whole-process peak claim, and these fields must not be added together.',
  }, '/heapSamples');
  if (report.build) builds.push(report.build);
  const buildList = unique(builds), glList = unique(actualWebgl);
  if (buildList.some(build => build.sourceFingerprint !== report.sourceFingerprint)) warnings.push('One or more recorded build fingerprints differ from the raw report sourceFingerprint.');
  if (buildList.length !== 1) warnings.push('No unique build identity was recorded; keep all recorded identities.');
  if (!glList.length) warnings.push('Actual WebGL renderer was not recorded; host GPU names are not a substitute.');
  return {
    rawPath, rawSha256: digest, mode: report.mode ?? null, requestedProfile: report.profile ?? null,
    sourceStatus: report.status ?? null, sourceFingerprint: report.sourceFingerprint ?? null,
    build: buildList, actualWebgl: glList, browserVersion: report.browserVersion ?? null, host: report.host ?? null,
    startedAt: report.startedAt ?? null, finishedAt: report.finishedAt ?? null,
    evidenceClass: report.status === 'failed' ? 'failed-run-retained' : report.status !== 'measured' ? 'incomplete-or-unrecognized-status' : report.mode === 'smoke' ? 'smoke-only' : 'measured-not-assessed',
    performanceAcceptance: 'not-assessed', failure: report.failure ?? null,
    errors: report.errors ?? [], pageErrors: report.pageErrors ?? [], consoleErrors: report.consoleErrors ?? [],
    limitations: report.limitations ?? [], warnings, measurements: rows,
  };
}

function csvValue(value) {
  const text = value === null || value === undefined ? 'unknown' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Protect consumers who open untrusted labels in spreadsheet applications.
  const safe = /^[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
function metricUnit(path) {
  const leaf = path.split('.').at(-1);
  if (/bytes$/i.test(leaf) || /payloadBytes$/.test(leaf)) return 'bytes';
  if (/^(count|rawSamples|length|historyLength|seq|sampleCount)$/.test(leaf)) return 'count';
  if (/Ms(?:\.|$)/.test(path) || leaf === 'ms') return 'ms';
  return '';
}
function csv(summary) {
  const columns = ['rawPath', 'rawSha256', 'mode', 'requestedProfile', 'sourceStatus', 'evidenceClass', 'sourceFingerprint', 'build', 'actualWebgl', 'workload', 'kind', 'step', 'rawRef', 'metric', 'value', 'unit'];
  const output = [columns.map(csvValue).join(',')];
  for (const group of summary.groups) for (const run of group.runs) for (const row of run.measurements) {
    const visit = (value, metric) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [key, child] of Object.entries(value)) visit(child, metric ? `${metric}.${key}` : key);
      } else {
        const record = { ...run, ...row, metric, value, unit: metricUnit(metric) };
        output.push(columns.map(key => csvValue(record[key])).join(','));
      }
    };
    visit(row.data, '');
  }
  return output.join('\r\n') + '\r\n';
}

function main() {
  const inputs = [], groups = new Map(), seen = new Set();
  let out;
  for (const arg of process.argv.slice(2)) {
    if (arg === '--help') { console.log(usage); return; }
    if (arg.startsWith('--out=')) {
      if (out !== undefined || !arg.slice(6)) throw new Error('Specify one non-empty --out directory.');
      out = arg.slice(6);
    } else if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    else inputs.push(arg);
  }
  if (!inputs.length) throw new Error(usage);
  for (const input of inputs) {
    const path = checkedPath(input);
    if (basename(path) !== 'report.json' || !lstatSync(path).isFile()) throw new Error('Explicit input must be a report.json file.');
    if (seen.has(path.toLowerCase())) throw new Error('Duplicate input report; repetitions must not be counted twice.');
    seen.add(path.toLowerCase());
    if (lstatSync(path).size > 64 * 1024 * 1024) throw new Error('Raw report exceeds the 64 MiB read bound; no truncated summary was created.');
    const bytes = readFileSync(path), report = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
    if (report?.format !== 'lieguoji-ph03-browser-measurement' || report.version !== 1 || !Array.isArray(report.results)) throw new Error('Unsupported raw report format/version.');
    const run = summarize(report, path, createHash('sha256').update(bytes).digest('hex'));
    const identity = { mode: run.mode, sourceFingerprint: run.sourceFingerprint, build: run.build, actualWebgl: run.actualWebgl };
    const key = JSON.stringify(identity);
    if (!groups.has(key)) groups.set(key, { ...identity, runs: [] });
    groups.get(key).runs.push(run);
  }
  const summary = {
    format: 'lieguoji-ph03-measurement-summary', version: 1, createdAt: new Date().toISOString(), reportCount: inputs.length,
    selection: 'All explicitly supplied reports are retained in input order; no best-run selection, averaging across runs, or threshold acceptance.',
    assessment: 'not-assessed', notes: [
      'Smoke and failed evidence remain separately classified. A measured status means collection finished, not that performance passed.',
      'Durations, logical payload bytes, sampled main-page heap and renderer submission times are different measurements.',
      'Actual WebGL identification is recorded independently of the host GPU inventory; emulation is not real-device acceptance.',
      'Raw frame/transaction arrays remain in the original reports referenced by SHA-256 and JSON pointers.',
    ], groups: [...groups.values()],
  };
  if (out !== undefined) {
    const directory = checkedPath(out, true);
    const jsonPath = resolve(directory, 'summary.json'), csvPath = resolve(directory, 'measurements.csv');
    if (existsSync(jsonPath) || existsSync(csvPath)) throw new Error('Output already exists; choose a new directory. Existing evidence is never overwritten.');
    mkdirSync(directory, { recursive: true });
    checkedPath(out, true);
    writeFileSync(jsonPath, JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
    writeFileSync(csvPath, csv(summary), { flag: 'wx' });
  }
  process.stdout.write(JSON.stringify(summary) + '\n');
}

try { main(); }
catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
