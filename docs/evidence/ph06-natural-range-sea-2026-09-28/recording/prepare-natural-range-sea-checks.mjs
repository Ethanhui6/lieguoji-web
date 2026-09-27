import fs from 'node:fs';
const read = p => fs.readFileSync(p,'utf8');
const checks='.autopilot/ph06/natural-range-sea-checks', browser='.autopilot/ph06/natural-range-sea-browser';
if(fs.existsSync(checks)||fs.existsSync(browser))throw Error('New check directories already exist');
fs.mkdirSync(checks); fs.mkdirSync(browser);
let runner=read('.autopilot/ph06/regional-coast-checks/run.mjs')
 .replaceAll('regional-coast-checks','natural-range-sea-checks')
 .replaceAll('regional-coast-${label}','natural-range-sea-${label}')
 .replaceAll('ph06-preview20-generator-history','ph06-preview21-generator-history')
 .replaceAll('0.5.0-preview.21','0.5.0-preview.22')
 .replaceAll('0.5.0-preview.20','0.5.0-preview.21')
 .replaceAll('71c67dd44b5b1c3a8f75ec59cbeeea4e07c96432aa9ad0bc0179403d4999e018','639ca2288c4d4ca0d3e8f21762c06be8e49678045c45c8dadfc91ec2314d7761')
 .replaceAll('preview20 baseline','preview21 baseline').replaceAll('promoted preview21','promoted preview22');
const added=[
 ['src/world/generation/natural-ranges.test.ts',10],['src/world/generation/natural-writer.test.ts',1],
 ['src/world/generation-preview21-history.test.ts',5],
 ...['terrain-material','terrain-mesh','ocean-material','ocean-material-cache','detail-terrain-shader','detail-terrain-light','detail-terrain-pages','detail-terrain-backend','renderer','renderer-detail-reuse'].map(n=>[`src/world/${n}.test.ts`,null])
];
runner=runner.replace('const unitFiles = [','const unitFiles = [\n'+added.map(([p])=>`  ${JSON.stringify(p)},`).join('\n'));
runner=runner.replace('const knownCaseCounts = {','const knownCaseCounts = {\n'+added.filter(([,c])=>c!==null).map(([p,c])=>`  ${JSON.stringify(p)}: ${c},`).join('\n'));
runner=runner.replace("const helper = 'src/world/generation/detail-orography.ts';","const helper = 'src/world/generation/fine-range-tree.ts';");
runner=runner.replace('Regional bay/cape/fractured/quiet coast fields, exact prior small/zero modes, 12-world channel and neck, persistence/cancel/add, unchanged fine-relief and local regression, actual preview20 stored history and eleven closure identities. Twenty-four selected files; visual and browser evidence are separate.',
 'Actual fine ridge tree and writer, old default/local compatibility, all-support spatial query budgets, coast/locks/additive preservation, preview21 storage-only history, muted-depth material with exact old land oracle and real renderer cache identities. Eleven full generation closures and engine recomputed. Browser/GPU and subjective visuals are separate.');
fs.writeFileSync(`${checks}/run.mjs`,runner,{flag:'wx'});
fs.copyFileSync('.autopilot/ph06/v4-preview21-history-staging/evidence/preview21/build.json',`${checks}/baseline-build.json`,fs.constants.COPYFILE_EXCL);
for(const p of ['run.mjs','playwright.config.ts'])fs.writeFileSync(`${browser}/${p}`,read(`.autopilot/ph06/regional-coast-browser/${p}`)
 .replaceAll('regional-coast-browser','natural-range-sea-browser').replaceAll('regional-coast-checks','natural-range-sea-checks').replaceAll('REGIONAL_COAST_','NATURAL_RANGE_SEA_'),{flag:'wx'});
console.log(JSON.stringify({checks,browser,addedFiles:added.length,productionModified:false,checksRun:false}));
