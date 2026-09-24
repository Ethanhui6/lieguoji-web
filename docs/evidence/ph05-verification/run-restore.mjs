import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const validation = '.autopilot/ph05-archive-validation';
const log = `${validation}/restore-run.log`;
const args = ['docs/evidence/ph05/restore-evidence-v2.mjs', '--out=.autopilot/ph05-restored-review'];
const fd = fs.openSync(log, 'wx'), startedAt = new Date().toISOString();
let result;
try { result = spawnSync(process.execPath, args, { windowsHide: true, stdio: ['ignore', fd, fd] }); }
finally { fs.closeSync(fd); }
const record = { command: `node ${args.join(' ')}`, startedAt, endedAt: new Date().toISOString(),
  exitCode: result.status, signal: result.signal, error: result.error ? String(result.error) : null, log };
fs.writeFileSync(`${validation}/restore-run.json`, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(record));
process.exitCode = result.status === 0 && !result.error ? 0 : 1;
