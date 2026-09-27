import fs from 'node:fs';
import {createHash} from 'node:crypto';
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const base='.autopilot/ph06/branching-relief-checks',before='.autopilot/ph06/v4-natural-visual-repair-staging/checks/coast-scale-first',after='.autopilot/ph06/v4-natural-visual-repair-staging/checks/branching-numeric-scale-type-fix';
const a=read(`${before}/actual-256-height-field.json`),b=read(`${after}/actual-256-height-field.json`),v=read(`${base}/numeric-scale-type-fix/verification.json`);
if(!v.passed||v.unit.total!==113||hash('dist/build.json')!==v.buildJsonSha256)throw Error('Actual17 result unbound');
const same=(x,y)=>JSON.stringify(x)===JSON.stringify(y);
const comparison={recordedAt:new Date().toISOString(),sameRecipe:same(a.recipe,b.recipe),sameTargetCoast:same(a.targetCoast,b.targetCoast),sameLandArea:a.summary.landAreaTwiceQ2===b.summary.landAreaTwiceQ2,sameSeaArea:a.summary.seaAreaTwiceQ2===b.summary.seaAreaTwiceQ2,before:{path:`${before}/actual-256-height-field.json`,sha256:hash(`${before}/actual-256-height-field.json`),relief:a.summary.natural.relief},after:{path:`${after}/actual-256-height-field.json`,sha256:hash(`${after}/actual-256-height-field.json`),relief:b.summary.natural.relief},scope:'Same one actual unit-produced fixture; not browser or all seeds acceptance',naturalVisualAccepted:false};
if(!comparison.sameRecipe||!comparison.sameTargetCoast||!comparison.sameLandArea||!comparison.sameSeaArea)throw Error('Expected unchanged actual coast not proven');
fs.writeFileSync(`${base}/numeric-comparison.json`,JSON.stringify(comparison,null,2)+'\n',{flag:'wx'});
fs.writeFileSync(`${base}/visual-review.json`,JSON.stringify({recordedAt:new Date().toISOString(),buildJsonSha256:v.buildJsonSha256,scope:'Root actually viewed the current and prior numerical height-field PNG via view_image; these are actual generated coarse/fine-data diagnostics, NOT browser screenshots. No preview17 product browser was executed.',observations:[
 'Current actual image replaces broad round hill groups with a thin continuous main band and three isolated bright high points. Two weaker branches are visible, but remain slender and weak at this persisted-data scale.',
 'The result is still too schematic and sparse to meet the requested natural mountain systems; the actual image remains visually rejected despite all113 technical assertions passing.',
 'The original recipe,3382 target coast segments and all land/sea areas match the preview16 numerical fixture exactly. This narrow comparison isolates the changed terrain field from a different coastline or seed.',
 'No product UI screenshots, real camera/DPR/cache-density observations, phone/device results, rivers, nations, cities or warfare are newly established by this diagnostic.',
 ],screenshots:[{path:`${after}/actual-256-height-field.png`,sha256:hash(`${after}/actual-256-height-field.png`),kind:'actual-numerical-diagnostic-not-product-screenshot'}],accepted:false,naturalVisualAccepted:false,visualAccepted:false,userAccepted:false,phaseAccepted:false,physicalDeviceAccepted:false,performanceAccepted:false,browserExecuted:false},null,2)+'\n',{flag:'wx'});
const source='src/world/generation/detail-orography.ts',candidate='.autopilot/ph06/v4-branching-relief-staging/'+source;
const expected=fs.readFileSync(candidate,'utf8').replace('let scale = OROGRAPHY_UNION.epsilonQ;','let scale: number = OROGRAPHY_UNION.epsilonQ;');
if(fs.readFileSync(source,'utf8')!==expected)throw Error('Root correction has unexpected changes');
fs.writeFileSync(`${base}/root-correction.json`,JSON.stringify({recordedAt:new Date().toISOString(),source,beforeSha256:hash(candidate),afterSha256:hash(source),failure:`${base}/first/types.log`,reason:'TS2322: as-const epsilon inferred a numeric literal; root added explicit number annotation only. Runtime algorithm and all acceptance assertions unchanged.',testedIn:`${base}/numeric-scale-type-fix/verification.json`},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({sameCoast:true,naturalVisualAccepted:false,browserExecuted:false,build:v.buildJsonSha256}));
