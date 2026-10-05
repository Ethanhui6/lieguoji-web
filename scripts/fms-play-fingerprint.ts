import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fingerprintSources, normalized } from './engine-fingerprint.ts';
import { sha256 } from './engine-fingerprint.ts';
const kernelFiles=['src/fms/play/military-core.ts','src/fms/play/military-profile.ts','src/fms/play/military-actions.ts','src/compat/v0_4/sim/core.ts','src/compat/v0_4/sim/statecraft.ts','src/compat/v0_4/sim/types.ts','src/compat/v0_4/history/types.ts'];
// Kernel dependencies are closed and checked by fingerprintSources. These
// additional entry/initial-condition sources bind dispatch, conversion and
// starting worlds too. Terrain drawing is an input format, not the daily kernel.
const entryFiles=['src/fms/play/runtime.ts','src/fms/play/military-registry.ts','src/fms/play/session.ts','src/fms/play/world.ts','src/fms/play/names.ts','src/fms/play/politics.ts','src/fms/play/eastern-names.json'];
export const fmsPlayFiles=[...kernelFiles,...entryFiles];
export function fingerprintFmsPlay(){
  const root='src/fms/play/compat/preview1';
  const manifest=JSON.parse(readFileSync(`${root}/manifest.json`,'utf8')) as {fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
  const frozen=new Map<string,string>();
  for(const file of manifest.files){
    if(!/^(fms\/play|compat\/v0_4\/(sim|history))\/[a-z-]+\.ts$/.test(file.archive))throw new Error('Unsafe military archive path');
    const source=normalized(readFileSync(`${root}/${file.archive}`,'utf8'));if(sha256(source)!==file.sha256)throw new Error('Frozen military preview changed');frozen.set(file.path,source);
  }
  if(manifest.fingerprint!=='46b5a571ed0d858eb652ebcd1772c36452482507adb774337f2b9e492965d7d6'||fingerprintSources(manifest.files.map(f=>f.path),f=>frozen.get(f)!)!==manifest.fingerprint)throw new Error('Frozen military fingerprint changed');
  const hash=createHash('sha256').update(fingerprintSources(kernelFiles));
  for(const file of entryFiles)hash.update(`\n${file}\n${normalized(readFileSync(file,'utf8'))}\n`);
  return hash.digest('hex');
}
