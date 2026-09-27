import fs from 'node:fs';
const base='.autopilot/ph06/natural-range-sea-checks';
const source='.autopilot/ph06/v4-continuous-light-staging';
let harness=fs.readFileSync(`${source}/gpu-harness.ts`,'utf8')
 .replace("from './src/world/detail-terrain-shader'","from '../../../src/world/detail-terrain-shader'")
 .replace('actual candidate GLSL','actual production GLSL');
if(harness.includes("from './src/"))throw Error('Staged shader import remains');
fs.writeFileSync(`${base}/gpu-harness.ts`,harness,{flag:'wx'});
fs.copyFileSync(`${source}/gpu-harness.html`,`${base}/gpu-harness.html`,fs.constants.COPYFILE_EXCL);
console.log('Prepared actual-production GPU diagnostic; not executed.');
