import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fingerprintSources, normalized } from './engine-fingerprint.ts';
import { sha256 } from './engine-fingerprint.ts';
const kernelFiles=['src/fms/play/military-core.ts','src/fms/play/military-profile.ts','src/fms/play/military-actions.ts','src/compat/v0_4/sim/core.ts','src/compat/v0_4/sim/statecraft.ts','src/compat/v0_4/sim/types.ts','src/compat/v0_4/history/types.ts','src/fms/play/mobilization.ts','src/fms/play/sea-path.ts','src/fms/play/navy.ts','src/fms/play/clock.ts','src/fms/play/realtime-statecraft.ts','src/fms/play/battle.ts','src/fms/play/occupation.ts'];
// Kernel dependencies are closed and checked by fingerprintSources. These
// additional entry/initial-condition sources bind dispatch, conversion and
// starting worlds too. Terrain drawing is an input format, not the daily kernel.
const entryFiles=['src/fms/play/runtime.ts','src/fms/play/military-registry.ts','src/fms/play/session.ts','src/fms/play/world.ts','src/fms/play/names.ts','src/fms/play/politics.ts','src/fms/play/eastern-names.json','src/fms/play/naval-rules.ts','src/fms/play/customization.ts','src/fms/play/editor-session.ts','src/fms/play/transport.ts','src/fms/play/transport-runtime.ts','src/fms/play/maritime.ts','src/fms/play/maritime-session.ts'];
export const fmsPlayFiles=[...kernelFiles,...entryFiles];
/** Keep the actual v8 entry points frozen while later rules evolve in a new facade.
 * The extra input validators are guarded without rewriting the saved v8 hash. */
export function verifyMaritimeCompatibility(read=(file:string)=>normalized(readFileSync(file,'utf8'))){
  const root='src/fms/play/compat/maritime1',manifest=JSON.parse(read(root+'/manifest.json')) as {fingerprint:string;kernel:string[];entries:string[];external:string[];files:{path:string;archive:string;sha256:string}[]};
  const external=['src/fms/model.ts','src/fms/play/observation.ts'],expected=[...fmsPlayFiles,...external];
  if(manifest.fingerprint!=='0026798b10d65cfb186247b0e65148310c3e72965698dd94633a640594fee504'||JSON.stringify(manifest.kernel)!==JSON.stringify(kernelFiles)||JSON.stringify(manifest.entries)!==JSON.stringify(entryFiles)||JSON.stringify(manifest.external)!==JSON.stringify(external)||manifest.files.length!==expected.length)throw Error('Frozen maritime1 manifest changed');
  const sources=new Map<string,string>();
  for(const [i,file] of manifest.files.entries()){
    if(file.path!==expected[i]||file.archive!==file.path.slice(4)+'.source')throw Error('Frozen maritime1 path changed');
    const frozen=read(root+'/'+file.archive);if(sha256(frozen)!==file.sha256||read(file.path)!==frozen)throw Error('Maritime1 live execution changed; use a new version facade: '+file.path);sources.set(file.path,frozen);
  }
  const hash=createHash('sha256').update(fingerprintSources(kernelFiles,file=>sources.get(file)!));for(const file of entryFiles)hash.update(`\n${file}\n${sources.get(file)}\n`);
  if(hash.digest('hex')!==manifest.fingerprint)throw Error('Frozen maritime1 fingerprint changed');
}
export function fingerprintFmsPlay(){
  verifyMaritimeCompatibility();
  const tRoot='src/fms/play/compat/transport1',t=JSON.parse(readFileSync(tRoot+'/manifest.json','utf8')) as {fingerprint:string;kernel:string[];entries:string[];files:{path:string;archive:string;sha256:string}[]};
  const tSources=new Map<string,string>();for(const f of t.files){if(!/^(fms\/play|compat\/v0_4\/(sim|history))\/[a-z-]+\.(ts|json)\.source$/.test(f.archive))throw Error('Unsafe transport archive path');const s=normalized(readFileSync(tRoot+'/'+f.archive,'utf8'));if(sha256(s)!==f.sha256)throw Error('Frozen transport1 changed');tSources.set(f.path,s);}
  const tHash=createHash('sha256').update(fingerprintSources(t.kernel,f=>tSources.get(f)!));for(const f of t.entries)tHash.update('\n'+f+'\n'+tSources.get(f)+'\n');if(t.fingerprint!=='f72161fb53c2f4a3e31dea36c1ba764150ef0a35e462ce6d42a33ff5d7dae7ae'||tHash.digest('hex')!==t.fingerprint)throw Error('Frozen transport1 fingerprint changed');
  for(const f of [...t.kernel,'src/fms/play/runtime.ts','src/fms/play/session.ts','src/fms/play/naval-rules.ts','src/fms/play/editor-session.ts','src/fms/play/transport.ts','src/fms/play/transport-runtime.ts'])if(normalized(readFileSync(f,'utf8'))!==tSources.get(f))throw Error('Transport1 live execution changed; provide frozen dispatch: '+f);

  const cRoot='src/fms/play/compat/creation1',c=JSON.parse(readFileSync(cRoot+'/manifest.json','utf8')) as {fingerprint:string;kernel:string[];entries:string[];files:{path:string;archive:string;sha256:string}[]};
  const cSources=new Map<string,string>();for(const f of c.files){if(!/^(fms\/play|compat\/v0_4\/(sim|history))\/[a-z-]+\.(ts|json)\.source$/.test(f.archive))throw Error('Unsafe creation archive path');const s=normalized(readFileSync(cRoot+'/'+f.archive,'utf8'));if(sha256(s)!==f.sha256)throw Error('Frozen creation1 changed');cSources.set(f.path,s);}
  const cHash=createHash('sha256').update(fingerprintSources(c.kernel,f=>cSources.get(f)!));for(const f of c.entries)cHash.update('\n'+f+'\n'+cSources.get(f)+'\n');if(c.fingerprint!=='76107bed858daa96dc4a721865a7c9f3470e6b8340c2b6661b6b1bd0454f200e'||cHash.digest('hex')!==c.fingerprint)throw Error('Frozen creation1 fingerprint changed');
  const oRoot='src/fms/play/compat/occupation1',o=JSON.parse(readFileSync(oRoot+'/manifest.json','utf8')) as {fingerprint:string;kernel:string[];entries:string[];files:{path:string;archive:string;sha256:string}[]};
  const oSources=new Map<string,string>();
  for(const f of o.files){if(!/^(fms\/play|compat\/v0_4\/(sim|history))\/[a-z-]+\.(ts|json)\.source$/.test(f.archive))throw Error('Unsafe occupation archive path');const s=normalized(readFileSync(oRoot+'/'+f.archive,'utf8'));if(sha256(s)!==f.sha256)throw Error('Frozen occupation1 changed');oSources.set(f.path,s);}
  const oHash=createHash('sha256').update(fingerprintSources(o.kernel,f=>oSources.get(f)!));for(const f of o.entries)oHash.update('\n'+f+'\n'+oSources.get(f)+'\n');
  if(o.fingerprint!=='747f31323a5a6ee7ea3029566241863d6be5809a7fa710f7589941af76e90366'||oHash.digest('hex')!==o.fingerprint)throw Error('Frozen occupation1 fingerprint changed');
  // The new revision only changes world initialization. Shared execution of
  // saved v6 games is permitted ONLY while every kernel and dispatch is exact.
  // A future gameplay change must provide a frozen dispatch before removing this guard.
  for(const f of [...o.kernel,'src/fms/play/runtime.ts','src/fms/play/session.ts','src/fms/play/naval-rules.ts'])if(normalized(readFileSync(f,'utf8'))!==oSources.get(f))throw Error('Occupation1 live execution changed; implement frozen dispatch first: '+f);
  const bRoot='src/fms/play/compat/battle1',b=JSON.parse(readFileSync(bRoot+'/manifest.json','utf8')) as {fingerprint:string;kernel:string[];entries:string[];files:{path:string;archive:string;sha256:string}[]};
  const bSources=new Map<string,string>();
  for(const f of b.files){if(!/^(fms\/play|compat\/v0_4\/(sim|history))\/[a-z-]+\.(ts|json)(\.source)?$/.test(f.archive))throw Error('Unsafe battle archive path');const s=normalized(readFileSync(bRoot+'/'+f.archive,'utf8'));if(sha256(s)!==f.sha256)throw Error('Frozen battle1 changed');bSources.set(f.path,s);}
  const bHash=createHash('sha256').update(fingerprintSources(b.kernel,f=>bSources.get(f)!));for(const f of b.entries)bHash.update('\n'+f+'\n'+bSources.get(f)+'\n');
  if(b.fingerprint!=='f50fbe73b6980108c33cebac67edc704d3910905170a53e11a932e287410351a'||bHash.digest('hex')!==b.fingerprint)throw Error('Frozen battle1 fingerprint changed');

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
