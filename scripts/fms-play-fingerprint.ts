import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fingerprintSources, normalized } from './engine-fingerprint.ts';
import { sha256 } from './engine-fingerprint.ts';
const kernelFiles=['src/fms/play/military-core.ts','src/fms/play/military-profile.ts','src/fms/play/military-actions.ts','src/compat/v0_4/sim/core.ts','src/compat/v0_4/sim/statecraft.ts','src/compat/v0_4/sim/types.ts','src/compat/v0_4/history/types.ts','src/fms/play/mobilization.ts','src/fms/play/sea-path.ts','src/fms/play/navy.ts','src/fms/play/clock.ts','src/fms/play/realtime-statecraft.ts','src/fms/play/battle.ts'];
// Kernel dependencies are closed and checked by fingerprintSources. These
// additional entry/initial-condition sources bind dispatch, conversion and
// starting worlds too. Terrain drawing is an input format, not the daily kernel.
const entryFiles=['src/fms/play/runtime.ts','src/fms/play/military-registry.ts','src/fms/play/session.ts','src/fms/play/world.ts','src/fms/play/names.ts','src/fms/play/politics.ts','src/fms/play/eastern-names.json','src/fms/play/naval-rules.ts'];
export const fmsPlayFiles=[...kernelFiles,...entryFiles];
export function fingerprintFmsPlay(){
  const rtRoot='src/fms/play/compat/realtime1',rt=JSON.parse(readFileSync(`${rtRoot}/manifest.json`,'utf8')) as {fingerprint:string;kernel:string[];entries:string[];files:{path:string;archive:string;sha256:string}[]};
  const rtSources=new Map<string,string>();
  for(const f of rt.files){if(!/^(fms\/play|compat\/v0_4\/(sim|history))\/[a-z-]+\.(ts|json)(\.source)?$/.test(f.archive))throw Error('Unsafe realtime archive path');const s=normalized(readFileSync(`${rtRoot}/${f.archive}`,'utf8'));if(sha256(s)!==f.sha256)throw Error('Frozen realtime1 changed');rtSources.set(f.path,s);}
  const rtHash=createHash('sha256').update(fingerprintSources(rt.kernel,f=>rtSources.get(f)!));for(const f of rt.entries)rtHash.update(`\n${f}\n${rtSources.get(f)}\n`);
  if(rt.fingerprint!=='9b83e494682517f778c795e9676bc1fc2d53698710747b69a95be5900c45576d'||rtHash.digest('hex')!==rt.fingerprint)throw Error('Frozen realtime1 fingerprint changed');
  const navalRoot='src/fms/play/compat/naval1';
  const naval=JSON.parse(readFileSync(`${navalRoot}/manifest.json`,'utf8')) as {fingerprint:string;kernel:string[];entries:string[];files:{path:string;archive:string;sha256:string}[]};
  const navalSources=new Map<string,string>();
  for(const f of naval.files){
    if(!/^(fms\/play|compat\/v0_4\/(sim|history))\/[a-z-]+\.(ts|json)(\.source)?$/.test(f.archive))throw Error('Unsafe naval archive path');
    const source=normalized(readFileSync(`${navalRoot}/${f.archive}`,'utf8'));if(sha256(source)!==f.sha256)throw Error('Frozen naval1 source changed');navalSources.set(f.path,source);
  }
  const navalHash=createHash('sha256').update(fingerprintSources(naval.kernel,f=>navalSources.get(f)!));
  for(const f of naval.entries)navalHash.update(`\n${f}\n${navalSources.get(f)}\n`);
  if(naval.fingerprint!=='532842498fac9067d87ca2dfffd53188ccfd3bf1ca2b1277e08740fa02c63f79'||navalHash.digest('hex')!==naval.fingerprint)throw Error('Frozen naval1 fingerprint changed');
  const mobilizationRoot='src/fms/play/compat/mobilization1';
  const mobilization=JSON.parse(readFileSync(`${mobilizationRoot}/manifest.json`,'utf8')) as {fingerprint:string;kernel:string[];entries:string[];files:{path:string;archive:string;sha256:string}[]};
  const mobilizationSources=new Map<string,string>();
  for(const f of mobilization.files){
    if(!/^(fms\/play|compat\/v0_4\/(sim|history))\/[a-z-]+\.(ts|json)(\.source)?$/.test(f.archive))throw Error('Unsafe mobilization archive path');
    const source=normalized(readFileSync(`${mobilizationRoot}/${f.archive}`,'utf8'));if(sha256(source)!==f.sha256)throw Error('Frozen mobilization1 source changed');mobilizationSources.set(f.path,source);
  }
  const mobilizationHash=createHash('sha256').update(fingerprintSources(mobilization.kernel,f=>mobilizationSources.get(f)!));
  for(const f of mobilization.entries)mobilizationHash.update(`\n${f}\n${mobilizationSources.get(f)}\n`);
  if(mobilization.fingerprint!=='52f49f7ff95ea717d0f9f19c2f2efb3a86861f0fe7f49e62b41212a357ee50ef'||mobilizationHash.digest('hex')!==mobilization.fingerprint)throw Error('Frozen mobilization1 fingerprint changed');
  const oldRoot='src/fms/play/compat/military1';
  const old=JSON.parse(readFileSync(`${oldRoot}/manifest.json`,'utf8')) as {fingerprint:string;kernel:string[];entries:string[];files:{path:string;archive:string;sha256:string}[]};
  const sources=new Map<string,string>();
  for(const f of old.files){
    if(!/^(fms\/play|compat\/v0_4\/(sim|history))\/[a-z-]+\.(ts|json)(\.source)?$/.test(f.archive))throw Error('Unsafe military archive path');
    const source=normalized(readFileSync(`${oldRoot}/${f.archive}`,'utf8'));
    if(sha256(source)!==f.sha256)throw Error('Frozen military1 source changed');sources.set(f.path,source);
  }
  const oldHash=createHash('sha256').update(fingerprintSources(old.kernel,f=>sources.get(f)!));
  for(const f of old.entries)oldHash.update(`\n${f}\n${sources.get(f)}\n`);
  if(old.fingerprint!=='a3d9d4019fa04b21e9096e2a15aef442f36553d967cbed7fb486c5624077537f'||oldHash.digest('hex')!==old.fingerprint)throw Error('Frozen military1 fingerprint changed');
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
