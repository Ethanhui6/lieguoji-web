import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import {readFileSync} from 'node:fs';
let commit = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || 'uncommitted';
try { if(commit === 'uncommitted') commit = execFileSync('git', ['rev-parse','HEAD'], {stdio:['ignore','pipe','ignore']}).toString().trim(); } catch { /* First local build has no commit. */ }
const headers=Object.fromEntries(readFileSync('public/_headers','utf8').split('\n').filter(line=>line.startsWith('  ')).map(line=>{const colon=line.indexOf(':');return [line.slice(0,colon).trim(),line.slice(colon+1).trim()];}));
export default defineConfig({ plugins:[react(),{name:'game-build-metadata',generateBundle(){this.emitFile({type:'asset',fileName:'build.json',source:JSON.stringify({version:'0.3.0',commit,rules:'0.2.0',supportedRules:['0.1.0','0.2.0'],entry:'world-studio',scenarios:['custom-world','test-continent']})});}}], define:{__BUILD_SHA__:JSON.stringify(commit)}, test:{include:['src/**/*.test.ts']}, build:{sourcemap:false}, server:{host:'127.0.0.1'},preview:{headers} });
