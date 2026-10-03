import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root=process.cwd(),out='docs/evidence/country-world-2026-10-03';
if(fs.existsSync(out))throw Error('Never overwrite a prior evidence archive');
const sha=b=>createHash('sha256').update(b).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const check=read('.autopilot/country-world/checks/repair-1/verification.json');
const desktop=read('.autopilot/country-world/browser/desktop-first/report-resolution.json');
const mobile=read('.autopilot/country-world/browser/mobile-first/verification.json');
const tablet=read('.autopilot/country-world/browser/tablet-first/verification.json');
if(![check,desktop,mobile,tablet].every(v=>v.passed)||![desktop,mobile,tablet].every(v=>v.buildSha256===check.buildSha256))throw Error('Checks incomplete');
const mappings=[
 ['.autopilot/country-world/checks','integrated'],['.autopilot/country-world/browser','browser'],
 ['.autopilot/politics/geography-checks','geography'],['.autopilot/politics/backend-checks','backend'],
 ...['check.mjs','browser.mjs','playwright.config.ts','resolve-desktop-report.mjs','archive.mjs','preview24-build.json'].map(name=>[`.autopilot/country-world/${name}`,`harness/${name}`]),
 ...['package.json','package-lock.json','src/RootApp.tsx','src/editor/AtlasStudio.tsx','src/editor/CountryStudio.tsx','src/editor/country-studio.css','src/editor/country-entry.ts','src/editor/country-entry.test.ts','src/world/politics','tests/country-world.spec.ts'].map(name=>[name,`sources/${name}`])
];
const inventory=[],omitted=[];
function copy(source,target){
 const resolved=fs.realpathSync(source);if(!resolved.startsWith(root+path.sep)||fs.lstatSync(source).isSymbolicLink())throw Error('Evidence must stay inside project');
 if(fs.statSync(source).isDirectory()){for(const entry of fs.readdirSync(source))copy(`${source}/${entry}`,`${target}/${entry}`);return;}
 const bytes=fs.readFileSync(source),row={source,path:target,bytes:bytes.length,sha256:sha(bytes)};
 if(!/\.(json|log|png|md|ts|tsx|mjs|css)$/.test(source)||source.includes('/.playwright-artifacts-')){omitted.push(row);return;}
 const dest=`${out}/${target}`;fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);inventory.push(row);
}
for(const [source,target]of mappings)copy(source,target);
fs.writeFileSync(`${out}/inventory.json`,JSON.stringify(inventory,null,2)+'\n');
const verification={at:new Date().toISOString(),version:check.version,buildSha256:check.buildSha256,sourceStable:check.sourceStable,unit:check.unit,
 browser:{desktop:desktop.stats,mobile:mobile.cases,tablet:tablet.cases,allPassed:true,retries:0,desktopCollectorFailurePreserved:true},
 geographyAndEngineUnchanged:check.identity,archivedFiles:inventory.length,archivedBytes:inventory.reduce((n,r)=>n+r.bytes,0),inventorySha256:sha(fs.readFileSync(`${out}/inventory.json`)),
 omitted,notes:['Desktop native browser test passed first time; initial JSON report path was nested. Collector failure retained, original report copied without browser rerun.','Political domain unit fixture uses a declared terrain adapter; geography suite and all browser flows use actual v4 land.','This is a manual country/city foundation, not whole PH acceptance.'],physicalDevice:false,userVisualAccepted:false,cloudWrites:false,wholePhaseAccepted:false};
fs.writeFileSync(`${out}/verification.json`,JSON.stringify(verification,null,2)+'\n');console.log(JSON.stringify(verification));
