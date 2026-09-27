import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';

const stage = '.autopilot/ph07/hydrology-kernel-staging';
const review = '.autopilot/ph07/hydrology-kernel-review';
const destination = 'docs/evidence/ph07-hydrology-kernel-2026-09-28';
const articlePath = 'docs/evidence/2026-09-28-ph07-hydrology-kernel.md';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const digest = async file => sha(await readFile(file));
async function writeOnce(file, bytes) {
  try { const prior = await readFile(file); if (!prior.equals(Buffer.from(bytes))) throw new Error(`Different existing target: ${file}`); return; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(dirname(file), { recursive: true }); await writeFile(file, bytes, { flag: 'wx' });
}
async function walk(folder) {
  const result = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink in evidence ${entry.name}`);
    const file = `${folder}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await walk(file)); else if (entry.isFile()) result.push(file);
  }
  return result.sort();
}
const ready = await json(`${stage}/ready-manifest.json`);
const expectedKernel = 'e7f12a9fb46c6f6a456e0f46ab073c6cffe0d62541056bd97bc3ed4e30cb1742';
const expectedReady = 'd6e742cf8b07f556b1a0f72b3627942711902a86e86925b2542bf77d253b78bd';
if (await digest(`${stage}/ready-manifest.json`) !== expectedReady || await digest(`${stage}/src/hydrology-kernel.ts`) !== expectedKernel) throw new Error('Final candidate drift');
for (const item of [...ready.files, ...ready.stableProductionImports]) if (await digest(item.path) !== item.sha256) throw new Error(`Ready SHA mismatch ${item.path}`);
const firstFolder = `${stage}/checks/fine-drainage-first`, fixFolder = `${stage}/checks/intrinsic-private-copy-fix`;
const first = await json(`${firstFolder}/verification.json`), fix = await json(`${fixFolder}/verification.json`);
const firstUnit = await json(`${firstFolder}/unit.json`), fixUnit = await json(`${fixFolder}/unit.json`);
const rounds = [];
for (const [folder, report, unit, expected] of [[firstFolder, first, firstUnit, 14], [fixFolder, fix, fixUnit, 16]]) {
  const before = await json(`${folder}/source-before.json`), after = await json(`${folder}/source-after.json`);
  if (!report.passed || report.unit.total !== expected || report.unit.passed !== expected || unit.numTotalTests !== expected || unit.numPassedTests !== expected
    || unit.numFailedTests !== 0 || unit.numPendingTests !== 0 || report.executions.some(e => e.code !== 0) || JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`Raw checks not consistent ${folder}`);
  for (const item of before.filter(item => item.path.startsWith(stage + '/'))) {
    const snapshot = `${folder}/candidate-snapshot/${item.path.slice(stage.length + 1)}`;
    if (await digest(snapshot) !== item.sha256) throw new Error(`Frozen snapshot mismatch ${snapshot}`);
  }
  rounds.push({ name: folder.split('/').at(-1), unitPassed: expected, unitTotal: expected, typeExitCode: report.executions.find(e => e.name === 'types').code,
    sourceUnchanged: true, retries: report.retries, originalVerificationSha256: await digest(`${folder}/verification.json`) });
}
const addedNames = ['never aliases caller arrays through overwritten slice during the first capture callback', 'copies a typed-array subclass without consulting overridden iterator or species'];
const results = fixUnit.testResults.flatMap(file => file.assertionResults);
if (!addedNames.every(name => results.some(test => test.title === name && test.status === 'passed'))) throw new Error('Actual new ownership regression missing');
const originalProbe = await json(`${review}/private-copy-probe.json`);
if (!originalProbe.privateCaptureBroken || !originalProbe.sourceUnchanged || originalProbe.normal.landNodes !== 9 || originalProbe.overriddenInstanceSlice.landNodes !== 0) throw new Error('Original failure proof missing');

const mapping = [];
for (const file of ['src/hydrology-kernel.ts', 'src/hydrology-kernel.test.ts', 'DESIGN.md', 'README.md', 'PRIVATE_COPY_CORRECTION.md', 'ready-manifest.json', 'run.mjs', 'vitest.config.ts', 'tsconfig.json']) mapping.push({ source: `${stage}/${file}`, path: `source/${file}` });
for (const file of await walk(`${stage}/checks`)) mapping.push({ source: file, path: file.slice(stage.length + 1) });
for (const file of ['REVIEW.md', 'private-copy-probe.mjs', 'private-copy-probe.json']) mapping.push({ source: `${review}/${file}`, path: `review/original/${file}` });
for (const file of [...ready.stableProductionImports.map(row => row.path), 'package-lock.json']) mapping.push({ source: file, path: `dependencies/${file}` });
mapping.push({ source: `${review}/archive.mjs`, path: 'provenance/archive.mjs' });
const records = [];
for (const item of mapping) {
  const bytes = await readFile(item.source), hash = sha(bytes);
  await writeOnce(`${destination}/${item.path}`, bytes);
  if (await digest(item.source) !== hash || await digest(`${destination}/${item.path}`) !== hash) throw new Error(`Copy mismatch ${item.source}`);
  records.push({ ...item, bytes: bytes.length, sha256: hash });
}
const closure = `# Private-copy finding closure — narrow independent review\n\nOriginal kernel 4be70639685b22e53f3d4b95d8785e75d59122501a377397cfa5f8839e2d1671 passed its original 14 tests, but the preserved independent nine-node probe demonstrated an actual private-copy defect. Both source arrays could override slice to return themselves, allowing the first capture callback to turn 9 land nodes into 0 and return caller buffers. That failure is retained here, not rewritten.\n\nFinal reviewed kernel ${expectedKernel} captures both source references once, keeps the existing range/type/memory checks, allocates fixed-length ordinary Int16Array destinations, and copies using module-captured Int16Array.prototype.set. The intrinsic typed-array copy does not call the source slice, iterator or species. No drainage algorithm or budget change appears in the original-to-final source diff.\n\nThe raw final unit report has 16/16 passing assertions, including the two actual new override/subclass regressions. They mutate source arrays at the first capture callback, require unchanged baseline drainage and independent output buffers, and require zero calls to slice, iterator and species. The type process exits 0; final source-before/source-after and frozen source copies match. These actual code changes and evidence close the originally reported slice/species alias defect for this candidate. This is not a fresh execution of the original probe after repair or a comprehensive security audit.\n\nThis archive preserves both original and repaired source snapshots, both complete check rounds, original and superseded ready records, and the original independent failure probe/report. The original probe script retains its original live staging import path; replaying it as historical evidence requires deliberately pointing a new run at the preserved original source, not overwriting the original report. Archived runner/config paths likewise preserve actual historical commands unchanged.\n\nNo test, build, benchmark or browser was rerun during this closure/archive. Production connection, full-world/cross-patch hydrology, real lake volume, Worker/UI/save integration and PH07 acceptance remain false or unimplemented.\n`;
await writeOnce(`${destination}/review/PRIVATE_COPY_CLOSURE.md`, closure);
records.push({ source: null, path: 'review/PRIVATE_COPY_CLOSURE.md', bytes: Buffer.byteLength(closure), sha256: sha(closure) });
records.sort((a,b) => a.path.localeCompare(b.path));
const copiedBytes = records.filter(r => r.source).reduce((n,r) => n+r.bytes,0);
const ledger = { version: 1, root: destination, files: records, copiedFiles: mapping.length, copiedBytes, excludedSelfDescribingFiles: ['files.sha256.json', 'verification.json'] };
const ledgerText = JSON.stringify(ledger,null,2)+'\n'; await writeOnce(`${destination}/files.sha256.json`,ledgerText);
const verification = { version: 1, scope: 'PH07 bounded pure kernel first slice; original defect retained and repaired',
  kernelTests: { status:'passed', passed:16, total:16, typesPassed:true, actualNewPrivateCopyRegressionsPassed:2, repeatedOriginalTestsNotAddedToUniqueTotal:true },
  rounds, originalReview: { privateCopyBugReproduced:true, nodes:9, originalKernelSha256:originalProbe.sourceSha256, sourceUnchanged:true, originalEvidenceRetained:true },
  privateCopyFinding: { status:'closed-in-reviewed-candidate', basis:'read-only intrinsic-copy diff plus actual 16/16 raw assertions and matching source hashes', originalProbeRerunAfterFix:false },
  finalKernelSha256:expectedKernel, finalTestSha256:ready.files.find(f=>f.path.endsWith('hydrology-kernel.test.ts')).sha256, finalReadySha256:expectedReady,
  archiveIntegrity: { copiedFiles:mapping.length, copiedBytes, payloadFiles:records.length, ledgerSha256:sha(ledgerText), everyCopyHashVerified:true, everyRunSnapshotHashVerified:true, existingDifferentTargetsOverwritten:false },
  plainTextLogs:records.filter(r=>r.path.endsWith('.log')).map(r=>({path:r.path,sha256:r.sha256,bytes:r.bytes,contentReview:'empty type output or synthetic test names/counts; original bytes retained'})),
  productionConnected:false, phaseAccepted:false, ph07T1Complete:false, fullProjectChecked:false, browserChecked:false, realDeviceChecked:false, performanceAccepted:false,
  archiveOperationRanTests:false, limitations:['No production extraction adapter or Worker command','No persistence or UI','No full-world/cross-patch flow','Sample counts are not runoff, discharge, area or water volume','Spill candidates are not actual lake water','No complete playable rivers claim'] };
await writeOnce(`${destination}/verification.json`,JSON.stringify(verification,null,2)+'\n');
const article = `# PH07 水文纯内核第一切片证据（2026-09-28）\n\n当前结论：有界纯内核最终 **16/16 单元测试通过，局部类型检查通过**；未接入生产，未完成 PH07-T1，也不是完整河流玩法。此次只读复核关闭了原输入私有复制缺陷，并归档完整失败与修复过程。\n\n| 证据轮次 | 实际结果 | 意义 |\n|---|---|---|\n| fine-drainage-first | 类型退出 0；14/14 通过 | 原候选通过当时测试，但随后独立审查发现其 slice 可被覆写，不能据此认定私有复制正确。 |\n| 独立 9 节点复现 | 原缺陷成功复现 | 普通输入 9 个陆地节点；覆写 slice 并在 capture 回调改源后变为 0，结果数组与源别名。 |\n| intrinsic-private-copy-fix | 类型退出 0；16/16 通过 | 保留原 14 项，新增覆写 slice 与子类 iterator/species 两项回归；不是累计 30 个独立测试。 |\n\n修复实际使用一次捕获的两个源数组引用，先校验原范围/内存合同，再创建普通固定长度 Int16Array，以捕获的 intrinsic set 复制。新增回归要求首次 capture 改源不改变计算结果、输出 buffer 独立，且不调用源 slice/iterator/species。只读复核核对了实际源差异、原始断言报告与前后来源 SHA，没有再次运行测试。\n\n内核范围是既有 2-world 细节点的 2..512 × 2..512 矩形，最多 262144 节点；支持确定性下降和平坡无环流向、按样本数汇集、裁剪不确定传播、真实海岸终点与局部鞍口候选。内存上界保持 48 字节/节点，操作门保持 64N+1024。测试中的中等规模检查不等于整世界性能验收。\n\n实际湖水体积、湖盆合并、跨片汇流、流量驱动河线、生产快照适配、Worker/UI/存档均未接入；NO_WATER 不是湖面，sample counts 不是降雨或流量。原 PH06 与后续阶段门未改变。\n\n归档复制 **${mapping.length} 个原文件、${copiedBytes} 字节**，保留两轮源快照、首轮旧 ready/README、两轮原日志/报告/来源 hash、最终源与配置，以及独立原缺陷证据。全部副本逐字节核对 SHA。额外生成独立关闭说明、文件清单和汇总 verification；不覆盖既有不同内容。原日志按原名保留，未修改 Git 忽略或提交白名单。\n\n- [汇总 verification](ph07-hydrology-kernel-2026-09-28/verification.json)\n- [逐文件 SHA 清单](ph07-hydrology-kernel-2026-09-28/files.sha256.json)\n- [最终源与 ready](ph07-hydrology-kernel-2026-09-28/source/ready-manifest.json)\n- [首轮 14 项原记录](ph07-hydrology-kernel-2026-09-28/checks/fine-drainage-first/verification.json)\n- [原 9 节点失败事实](ph07-hydrology-kernel-2026-09-28/review/original/private-copy-probe.json)\n- [修复后 16 项原记录](ph07-hydrology-kernel-2026-09-28/checks/intrinsic-private-copy-fix/verification.json)\n- [独立缺陷关闭说明](ph07-hydrology-kernel-2026-09-28/review/PRIVATE_COPY_CLOSURE.md)\n\n| 对象 | SHA-256 |\n|---|---|\n| 原内核 | ${originalProbe.sourceSha256} |\n| 修复内核 | ${expectedKernel} |\n| 最终测试 | ${verification.finalTestSha256} |\n| 最终 ready | ${expectedReady} |\n| 文件清单 | ${sha(ledgerText)} |\n\n归档操作只写本证据目录、本文及忽略的归档脚本，没有修改生产 src/tests、plan、handoff、dist，也未运行构建、浏览器或宽测试。\n`;
await writeOnce(articlePath,article);
for(const row of records) if(await digest(`${destination}/${row.path}`)!==row.sha256)throw new Error(`Final archive drift ${row.path}`);
for(const row of records.filter(r=>r.source)) if(await digest(row.source)!==row.sha256)throw new Error(`Source changed during archive ${row.source}`);
const totalDirectoryFiles=(await walk(destination)).length;
console.log(JSON.stringify({copiedFiles:mapping.length,copiedBytes,totalDirectoryFiles,articlePath,finalKernelSha256:expectedKernel,readySha256:expectedReady,
  ledgerSha256:sha(ledgerText),verificationSha256:await digest(`${destination}/verification.json`),articleSha256:await digest(articlePath),sourceUnchanged:true,productionConnected:false,phaseAccepted:false},null,2));
