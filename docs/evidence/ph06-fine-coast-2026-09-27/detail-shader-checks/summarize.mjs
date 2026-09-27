import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const base='.autopilot/ph06/detail-shader-checks',read=name=>JSON.parse(readFileSync(`${base}/${name}`,'utf8'));
const first=read('gpu-first.json'),extra=read('gpu-supplement.json'),cpu=read('cpu-first.json'),run=read('cpu-first.result.json'),lint=read('lint-first.result.json');
const files=first.after.slice(0,4).map(item=>({...item,sha256:createHash('sha256').update(readFileSync(item.path)).digest('hex')}));
const verification={date:new Date().toISOString(),scope:'v4 bounded backend correctness; no renderer integration, hardware/device acceptance or performance claim',
  promotion:read('promoted.json'),cpu:{tests:cpu.numTotalTests,passed:cpu.numPassedTests,failed:cpu.numFailedTests,elapsedMs:run.elapsedMs,exitCode:run.exitCode,raw:['cpu-first.log','cpu-first.json','cpu-first.result.json']},
  lint:{...lint,raw:'lint-first.log'},
  gpu:{first:{passed:first.passed,patterns:first.patterns.length,probes:first.probes,exactLand:first.exactLand,maxHeightError:first.maxHeightError,elapsedMs:first.elapsedMs,sourceStable:first.sourceStable,raw:'gpu-first.json'},
    supplement:{passed:extra.passed,probes:extra.probes,exactLand:extra.exactLand,maxHeightError:extra.maxHeightError,elapsedMs:extra.elapsedMs,sourceStable:extra.sourceStable,raw:'gpu-supplement.json'},
    toleranceMeters:first.toleranceMeters,browserVersion:first.browserVersion,gpu:first.gpu,capabilities:first.capabilities,
    notes:['Raw WebGL2 uses the production vertex and fragment source, actual texture uploads, drawArrays and readPixels; CPU expected data uses pickDetailCoastSurface and buildDetailCoastSurface.',
      'Supplement adds internal half rounding 1.5Q to 2Q, both sides of that crossing, 4 identical world points at 4 drawing origins, actual WebGL1 rejection, and a position-only Pixi Geometry draw.',
      'First Pixi smoke used MeshGeometry and reported an unused aUV warning. Supplement uses Geometry with only aPosition and no such warning. Both actual factory draws/readbacks pass.',
      'ReadPixels GPU-stall driver warnings are retained. This is synchronous correctness readback, not a performance benchmark.',
      '81 Pixi probes occur in both runs with different geometry setup; total probe executions are not a unique-probe count.'],
    sourcePixels:first.pixi.sourcePixels,sourceBytes:first.pixi.sourceBytes,borrowedSourcesSurviveShaderDestroy:extra.pixi.borrowedSourcesSurviveShaderDestroy},
  sourceFiles:files,sourceFrozenSinceCpu:JSON.stringify(files.map(i=>i.sha256))===JSON.stringify(first.before.slice(0,4).map(i=>i.sha256)),
  pending:['Renderer/cache/Worker transfer and cooperative whole-source construction','Unified 32Mi pixel budget integration and target/geometry accounting','Context loss/restoration, cancellation and snapshot coherence in real renderer','Real-game mapping/playability and visual acceptance','Hardware/mobile device support and all performance gates','Palette rendering (diagnostic mode was used for measured GPU parity)','Root unified typecheck/build; not run by this bounded task'],
  productionFilesModifiedOnly:files.map(i=>i.path),distModifiedByThisTask:false};
writeFileSync(`${base}/verification.json`,JSON.stringify(verification,null,2));
console.log(JSON.stringify({cpu:verification.cpu,shaderSHA:files[2].sha256,sourceFrozenSinceCpu:verification.sourceFrozenSinceCpu,firstPassed:first.passed,supplementPassed:extra.passed},null,2));
