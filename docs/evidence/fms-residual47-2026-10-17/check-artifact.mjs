import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const source=fs.readFileSync('scripts/check-dist.mjs','utf8');
const anchor="const root = path.resolve('dist');";
if(!source.includes(anchor))throw Error('Audit entry changed; inspect before rebinding');
const script='.autopilot/fms-residual47-check-dist.mjs';
fs.writeFileSync(script,source.replace(anchor,"const root = path.resolve('.autopilot/fms-residual47-checked');"));
process.stdout.write(execFileSync(process.execPath,[script],{encoding:'utf8'}));
