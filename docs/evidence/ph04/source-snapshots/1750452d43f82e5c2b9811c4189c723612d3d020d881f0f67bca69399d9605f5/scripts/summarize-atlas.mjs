import { readFile, writeFile } from 'node:fs/promises';

// This is an evidence evaluator. It neither runs the game nor changes task status.
const args = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')));
const modes = ['edits', 'loads', 'transport', 'cancel'];
const reports = Object.fromEntries(await Promise.all(modes.map(async mode => {
  if (!args[mode]) throw new Error(`Missing --${mode}=path/to/report.json`);
  const report = JSON.parse(await readFile(args[mode], 'utf8'));
  if (report.format !== 'lieguoji-ph04-production-measurement' || report.mode !== mode) throw new Error(`Invalid ${mode} evidence`);
  return [mode, report];
})));
function stats(values) {
  if (!values.length || values.some(value => !Number.isFinite(value))) return { valid: false, count: values.length };
  const sorted = values.toSorted((a, b) => a - b);
  return { valid: true, count: values.length, min: sorted[0], p95: sorted[Math.ceil(sorted.length * .95) - 1], max: sorted.at(-1) };
}
const edits = reports.edits.results.filter(row => /-edit-\d+$/.test(row.label));
const initial = reports.loads.results.filter(row => row.label.startsWith('standard-initial-save-'));
const restored = reports.loads.results.filter(row => row.label.startsWith('standard-fresh-document-restore-'));
const transport = reports.transport.results.filter(row => /-edit-\d+$/.test(row.label));
const cancelled = reports.cancel.results.filter(row => row.label.startsWith('cancel-extended-'));
const completed = Object.values(reports).flatMap(report => report.results).filter(row => row.value.totals);
const metrics = {
  computeMs: stats(edits.map(row => row.value.totals.computation?.observedComputeMs)),
  localCommitMs: stats(edits.map(row => Number(row.value.attributes['data-atlas-commit-ms']))),
  feedbackMs: stats(edits.map(row => row.value.totals.feedbackMs)),
  initialSaveMs: stats(initial.map(row => Number(row.value.attributes['data-atlas-commit-ms']))),
  restoreMs: stats(restored.map(row => Number(row.value.attributes['data-atlas-commit-ms']))),
  wireBytes: stats([...edits, ...transport].map(row => row.value.totals.trafficBytes)),
  transportWireBytes: stats(transport.map(row => row.value.totals.trafficBytes)),
  packetBytes: stats(completed.map(row => row.value.totals.largestPacketBytes)),
  workerProgressGapMs: stats(completed.map(row => row.value.totals.maxProgressGapMs)),
  visibleProgressGapMs: stats(completed.map(row => row.value.totals.maxVisibleProgressGapMs)),
  cancellationMs: stats(cancelled.map(row => row.value.cancelToInteractiveMs)),
};
const checks = {};
checks.sameSourceAndDist = new Set(Object.values(reports).map(row => row.source.sha256)).size === 1 && new Set(Object.values(reports).map(row => row.dist.sha256)).size === 1;
checks.cleanMeasurementRuns = Object.values(reports).every(row => row.status === 'measured' && row.sourceUnchanged && row.distUnchanged && row.errors.length === 0 && row.consoleErrors.length === 0 && row.pageErrors.length === 0);
checks.complete100EditCoverage = edits.length >= 100 && edits.every(row => row.value.totals.computation?.coverage === 'complete' && row.value.totals.metrics.localBudgetEligible && row.value.totals.metrics.affectedCells === 1024 && row.value.totals.metrics.writeBlocks === 4);
checks.workerCompute25ms = metrics.computeMs.valid && metrics.computeMs.p95 <= 25;
checks.durableCorrectFrame250ms = metrics.localCommitMs.valid && metrics.localCommitMs.p95 <= 250 && metrics.localCommitMs.max <= 1000;
checks.feedback50ms = metrics.feedbackMs.valid && metrics.feedbackMs.max <= 50;
checks.logicalWire128KiB = metrics.wireBytes.valid && metrics.wireBytes.max <= 128 * 1024;
const variationPercent = metrics.transportWireBytes.valid ? (metrics.transportWireBytes.max / metrics.transportWireBytes.min - 1) * 100 : null;
checks.transportThreeSizes10Percent = transport.length === 9 && [128, 256, 512].every(size => transport.filter(row => row.label.startsWith(`${size}-edit-`)).length === 3) && variationPercent !== null && variationPercent <= 10;
checks.singlePacket512KiB = metrics.packetBytes.valid && metrics.packetBytes.max <= 512 * 1024;
checks.realProgress250ms = metrics.workerProgressGapMs.valid && metrics.workerProgressGapMs.max <= 250 && metrics.visibleProgressGapMs.valid && metrics.visibleProgressGapMs.max <= 250 && completed.every(row => row.value.totals.visibleCompletionObserved);
checks.tenInitialSaves5s = initial.length >= 10 && metrics.initialSaveMs.valid && metrics.initialSaveMs.max <= 5000;
checks.tenFreshDocumentRestores5s = restored.length >= 10 && metrics.restoreMs.valid && metrics.restoreMs.max <= 5000 && restored.every(row => row.value.identityAndHashUnchanged);
checks.tenPrecommitCancels500ms = cancelled.length >= 10 && metrics.cancellationMs.valid && metrics.cancellationMs.max <= 500 && cancelled.every(row => row.value.rootBytesUnchanged);
const result = {
  format: 'lieguoji-ph04-measurement-evaluation', version: 1, evaluatedAt: new Date().toISOString(),
  status: Object.values(checks).every(Boolean) ? 'measurement-gates-passed' : 'measurement-gates-not-passed',
  sources: Object.fromEntries(modes.map(mode => [mode, { path: args[mode], source: reports[mode].source.sha256, dist: reports[mode].dist.sha256 }])),
  metrics, variationPercent, checks,
  limitations: [
    'This evaluator does not accept the entire PH04 phase or modify plan/tasks.json.',
    'Correct-frame timing is CPU drawing submission and a frame opportunity, not physical display completion.',
    'Computation is nonoverlapping observed elapsed work including WebCrypto waits, not exact CPU time; diagnostic reporting overhead is excluded.',
    'Restore means new document, app, Worker and decoded cache; browser and OS disk caches are not cleared.',
    'Real devices, user visual acceptance, future full simulation and PH05 rendering budgets are separate.',
  ],
};
if (!args.out) throw new Error('Missing --out=path/to/evaluation.json');
await writeFile(args.out, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ status: result.status, checks, metrics, variationPercent }, null, 2));
if (result.status !== 'measurement-gates-passed') process.exitCode = 1;
