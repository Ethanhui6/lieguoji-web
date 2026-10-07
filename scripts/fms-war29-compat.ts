import {readFileSync} from 'node:fs';
import {normalized,sha256} from './engine-fingerprint.ts';
import {war28Files,fingerprintWar28} from './fms-war28-fingerprint.ts';
export const FROZEN_WAR28_ENGINE='2c482b2d97eff1c8978c650247767fbdda4d240542f71ae55c53ad36c464bc5f';
export function verifyWar28Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/war28',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!==FROZEN_WAR28_ENGINE||m.files.length!==war28Files.length)throw Error('Frozen war28 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==war28Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen war28 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v27 execution changed: '+f.path);});
 if(fingerprintWar28()!==FROZEN_WAR28_ENGINE)throw Error('Playable v27 fingerprint changed');
}
