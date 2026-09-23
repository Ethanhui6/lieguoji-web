import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
let commit = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || 'uncommitted';
try { if(commit === 'uncommitted') commit = execFileSync('git', ['rev-parse','HEAD'], {stdio:['ignore','pipe','ignore']}).toString().trim(); } catch { /* First local build has no commit. */ }
const headers=Object.fromEntries(readFileSync('public/_headers','utf8').split('\n').filter(line=>line.startsWith('  ')).map(line=>{const colon=line.indexOf(':');return [line.slice(0,colon).trim(),line.slice(colon+1).trim()];}));
const engineHash=createHash('sha256');
const engineFiles=['src/sim/core.ts','src/sim/statecraft.ts','src/sim/types.ts','src/history/core.ts','src/history/types.ts'];
for(const file of engineFiles)engineHash.update(`${file}\n${readFileSync(file,'utf8').replace(/\r\n/g,'\n')}\n`);
const engineFingerprint=engineHash.digest('hex');
const version=JSON.parse(readFileSync('package.json','utf8')).version as string;
export default defineConfig({ plugins:[react(),{name:'game-build-metadata',configureServer(server){server.watcher.on('change',file=>{if(engineFiles.some(source=>file.replace(/\\/g,'/').endsWith(`/${source}`)))void server.restart();});},generateBundle(){this.emitFile({type:'asset',fileName:'build.json',source:JSON.stringify({version,commit,engineFingerprint,rules:'0.2.0',supportedRules:['0.1.0','0.2.0'],entry:'world-studio',scenarios:['custom-world','test-continent']})});}}], define:{__BUILD_SHA__:JSON.stringify(commit),__SIM_ENGINE__:JSON.stringify(engineFingerprint)}, test:{include:['src/**/*.test.ts']}, build:{sourcemap:false}, server:{host:'127.0.0.1'},preview:{headers} });
