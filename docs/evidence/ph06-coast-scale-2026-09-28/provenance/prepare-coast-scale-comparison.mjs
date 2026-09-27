import fs from 'node:fs';
const original = fs.readFileSync('.autopilot/ph06/compare-asymmetric-shore.mjs','utf8');
const adapted = original.replace('checks/asymmetric-${label}', 'checks/coast-scale-${label}').replace('asymmetric-coast-checks/shape-comparison-${label}', 'coast-scale-checks/shape-comparison-${label}');
if(adapted===original || adapted.includes('checks/asymmetric-')) throw Error('Comparison adaptation failed');
fs.writeFileSync('.autopilot/ph06/compare-coast-scale-shore.mjs',adapted,{flag:'wx'});
