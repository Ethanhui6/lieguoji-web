import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const out = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function snapshot(dir = 'src') { const entries = []; for (const entry of fs.readdirSync(dir,{withFileTypes:true})) { const file = path.join(dir,entry.name); if(entry.isDirectory()) entries.push(...snapshot(file)); else entries.push({path:file.replaceAll('\\','/'),sha256:digest(file)}); } return entries; }
fs.mkdirSync(out,{recursive:true});
const mode=process.argv[2]??'first';
const checks = [
 ['types',['node_modules/typescript/bin/tsc','--noEmit']],
 ['lint',['node_modules/eslint/bin/eslint.js','src','tests','scripts']],
 ['unit',['node_modules/vitest/vitest.mjs','run',
 'src/world/detail-coast-format.test.ts','src/world/detail-coast-transport.test.ts',
 'src/world/generation-history.test.ts','src/world/generation-history-preview2.test.ts','src/world/generation-history-preview4.test.ts','src/world/generation-history-preview5.test.ts','src/world/generation-history-preview6.test.ts',
 'src/world/generation-format.test.ts','src/world/generation-contract.test.ts','src/world/generation-undo.test.ts','src/world/generation-locks.test.ts',
 'src/world/constraints-session.test.ts','src/world/constraints-receiver.test.ts','src/world/replacement-cooperation.test.ts','src/world/surface-format-storage.test.ts',
 '--reporter=json',`--outputFile=${path.join(out,mode+'-unit.json')}`]],
];
const before=snapshot(); fs.writeFileSync(path.join(out,mode+'-before.json'),JSON.stringify(before,null,2));
const results=[];
for(const [name,args] of checks) {
 const start=performance.now(), run=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',maxBuffer:30*1024*1024});
 fs.writeFileSync(path.join(out,`${mode}-${name}.log`),(run.stdout??'')+(run.stderr??''));
 const result={name,exitCode:run.status,signal:run.signal,error:run.error?.message,durationMs:performance.now()-start};
 results.push(result); console.log(JSON.stringify(result));
}
const after=snapshot(); fs.writeFileSync(path.join(out,mode+'-after.json'),JSON.stringify(after,null,2));
fs.writeFileSync(path.join(out,mode+'-verification.json'),JSON.stringify({checks:results,sourceStable:JSON.stringify(before)===JSON.stringify(after)},null,2));
process.exitCode=results.some(x=>x.exitCode!==0)?1:0;
