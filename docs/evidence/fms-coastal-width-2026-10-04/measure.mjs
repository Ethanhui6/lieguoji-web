import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const previousCommit = '5f5608839132d1d52cd8dfe8a0174f192cc1c68c';
const rawBefore = execFileSync('git', ['show', `${previousCommit}:src/fms/naturalize.ts`], { cwd: root, encoding: 'utf8' });
const beforeCode = rawBefore.replace("'../world/generation/seed'", "'/src/world/generation/seed.ts'")
  .replace("'./model'", "'/src/fms/model.ts'").replace("'./coastline'", "'/src/fms/coastline.ts'");
const beforeJavaScript = ts.transpileModule(beforeCode, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const server = await createServer({ root, cacheDir: '.autopilot/fms-width-vite-cache', server: { middlewareMode: true, hmr: false },
  plugins: [{ name: 'bounded-width-before', resolveId(id) { if (id === 'width-before') return '\0width-before'; }, load(id) { if (id === '\0width-before') return beforeJavaScript; } }] });
const hash = value => createHash('sha256').update(value).digest('hex');
const heightHash = array => hash(JSON.stringify(Array.from(array)));
try {
  const { naturalizeFmsTerrain: oldNaturalize } = await server.ssrLoadModule('width-before');
  const { naturalizeFmsTerrain } = await server.ssrLoadModule('/src/fms/naturalize.ts');
  const { coastFixture, compareLinearCoasts } = await server.ssrLoadModule('/tests/helpers/fms-coast-metrics.ts');
  const { createFmsDocument, commitFmsEdit, prepareFmsLockEdit } = await server.ssrLoadModule('/src/fms/model.ts');
  const cases = [];
  for (const name of ['island', 'neck', 'asymmetric', 'actual-mesh']) {
    let doc = name === 'actual-mesh' ? await createFmsDocument({ yieldTask: async () => {} }) : coastFixture(name);
    if (name === 'actual-mesh') doc.points.forEach(([x,y],i) => {
      if (x>220&&x<1300&&y>200&&y<1300&&!(x<650&&y>600&&y<800)) doc.elevations[i]=45;
    });
    doc = commitFmsEdit(doc, prepareFmsLockEdit(doc,[name==='actual-mesh'?{x:450,y:950,radius:80}:{x:120,y:290,radius:18}],true));
    const sectionX = name==='island'?40:name==='actual-mesh'?750:200, inputHash=heightHash(doc.elevations);
    const defaults = oldNaturalize(doc,{seed:42,strength:1}), now = naturalizeFmsTerrain(doc,{seed:42,strength:1});
    if (heightHash(defaults.elevations)!==heightHash(now.elevations)) throw Error(`Default compatibility failed: ${name}`);
    const samples=[];
    for (const seed of [42,9182]) {
      let narrower;
      for (const coastalWidth of [.01,.035,.12,.2]) {
        const result=naturalizeFmsTerrain(doc,{seed,strength:1,coastalWidth}), metric=compareLinearCoasts(doc,result.elevations,sectionX);
        const lockedChanges=result.elevations.reduce((n,h,i)=>n+Number(Boolean(doc.terrainLocks?.[i])&&h!==doc.elevations[i]),0);
        let loweredFromNarrower=0,raisedFromNarrower=0;
        if(narrower)result.elevations.forEach((h,i)=>{loweredFromNarrower+=Number(h<narrower[i]);raisedFromNarrower+=Number(h>narrower[i]);});
        if(metric.maxCrossingDisplacement!==0||metric.absoluteAreaChange!==0||metric.missingCrossings!==0||metric.crossingCount!==metric.candidateCrossingCount
          ||JSON.stringify(metric.sectionBefore)!==JSON.stringify(metric.sectionAfter)||lockedChanges||raisedFromNarrower) throw Error(`Width contract failed: ${name}/${seed}/${coastalWidth}`);
        samples.push({seed,coastalWidth,effectiveWidth:result.stats.coastalWidthWorld,meanLandHeight:result.stats.meanLandHeight,
          changedCells:result.stats.changedCells,lockedChanges,loweredFromNarrower,raisedFromNarrower,heightSha256:heightHash(result.elevations),metric});
        narrower=result.elevations;
      }
    }
    if(heightHash(doc.elevations)!==inputHash)throw Error('Source changed');
    cases.push({name,points:doc.points.length,sourceHeightsSha256:inputHash,lockedCells:doc.terrainLocks?.reduce((a,b)=>a+b,0)??0,
      defaultsMatchV3:true,defaultHeightSha256:heightHash(now.elevations),samples});
  }
  const sourceFiles=['src/fms/naturalize.ts','src/fms/terrain-options.ts','src/fms/coastline.ts','src/fms/model.ts','src/fms/terrain-client.ts','src/fms/terrain-preview.ts','tests/helpers/fms-coast-metrics.ts'];
  const sourceHashes={};for(const file of sourceFiles)sourceHashes[file]=hash((await fs.readFile(path.join(root,file),'utf8')).replace(/\r\n/g,'\n'));
  await fs.writeFile(new URL('./measurements.json',import.meta.url),JSON.stringify({recordedAt:new Date().toISOString(),previousCommit,
    originalV3ModuleSha256:hash(rawBefore),method:'Independent float32 triangle h=20 contours/areas and vertical sections; old committed v3 default reference',
    sourceHashes,cases,limits:['inland elevation envelope only; not new coast geometry','all-land uses map-boundary anchors','not physical device or original equivalence']},null,2)+'\n');
  console.log(JSON.stringify(cases.map(c=>({name:c.name,points:c.points,defaultV3Equal:c.defaultsMatchV3,locked:c.lockedCells,
    seed42:c.samples.filter(s=>s.seed===42).map(s=>({width:s.coastalWidth,changed:s.changedCells,lowered:s.loweredFromNarrower,mean:s.meanLandHeight,coastMovement:s.metric.maxCrossingDisplacement}))})),null,2));
} finally { await server.close(); }
