import {fingerprintCulture47} from './scripts/fms-culture47-fingerprint.ts';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import {readFileSync} from 'node:fs';

// Since 0.5.0 only the current engine is shipped. The older rule stamps the
// current models still carry are fixed values (scripts/rule-stamps.json),
// taken from the last build that computed them, so simulation results stay
// identical; only the current engine fingerprint is computed per build.
let commit = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || 'uncommitted';
try { if(commit === 'uncommitted') commit = execFileSync('git', ['rev-parse','HEAD'], {stdio:['ignore','pipe','ignore']}).toString().trim(); } catch { /* First local build has no commit. */ }
const headers=Object.fromEntries(readFileSync('public/_headers','utf8').split('\n').filter(line=>line.startsWith('  ')).map(line=>{const colon=line.indexOf(':');return [line.slice(0,colon).trim(),line.slice(colon+1).trim()];}));
const version=JSON.parse(readFileSync('package.json','utf8')).version as string;
const stamps=JSON.parse(readFileSync('scripts/rule-stamps.json','utf8')) as Record<string,string>;
const culture47Fingerprint=fingerprintCulture47();
const define=Object.fromEntries([...Object.entries(stamps),['__CULTURE47_ENGINE__',culture47Fingerprint],['__BUILD_SHA__',commit]].map(([k,v])=>[k,JSON.stringify(v)]));
export default defineConfig({
 plugins:[react(),{name:'game-build-metadata',generateBundle(){this.emitFile({type:'asset',fileName:'build.json',source:JSON.stringify({version,commit,culture47Fingerprint})});}}],
 define,
 test:{include:['src/**/*.test.ts'],maxWorkers:1},
 build:{sourcemap:false},
 server:{host:'127.0.0.1'},
 preview:{headers},
});
