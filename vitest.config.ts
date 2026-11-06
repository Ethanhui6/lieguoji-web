import {fingerprintCulture47} from './scripts/fms-culture47-fingerprint.ts';
import {defineConfig} from 'vitest/config';
import {readFileSync} from 'node:fs';
import {availableParallelism} from 'node:os';

// Engine unit tests. The rule stamps and engine fingerprint are the same defines the bridge
// bundle (vite.bridge.config.ts) is built with, so tests run the engine as the app ships it.
const stamps=JSON.parse(readFileSync('scripts/rule-stamps.json','utf8')) as Record<string,string>;
const define=Object.fromEntries([['__CULTURE47_ENGINE__',fingerprintCulture47()],...Object.entries(stamps),['__BUILD_SHA__','test']].map(([k,v])=>[k,JSON.stringify(v)]));
export default defineConfig({
 define,
 // Up to 6 cores; set VITEST_MAX_WORKERS=1 on small machines.
 test:{include:['src/**/*.test.ts'],maxWorkers:Number(process.env.VITEST_MAX_WORKERS??Math.max(1,Math.min(6,Math.floor(availableParallelism()/2))))},
});
