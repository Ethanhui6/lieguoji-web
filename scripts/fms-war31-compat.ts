import {readFileSync} from 'node:fs';
import {normalized,sha256} from './engine-fingerprint.ts';
import {war30Files,fingerprintWar30} from './fms-war30-fingerprint.ts';
export const FROZEN_WAR30_ENGINE='b6e9971fb79450beb69438eceeca23c292c968eb92003fd8a0724dae84431cde';
export function verifyWar30Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/war30',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!==FROZEN_WAR30_ENGINE||m.files.length!==war30Files.length)throw Error('Frozen war30 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==war30Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen war30 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v30 execution changed: '+f.path);});
 const fingerprint=fingerprintWar30();
 if(fingerprint!==FROZEN_WAR30_ENGINE)throw Error('Playable v30 fingerprint changed');
 return fingerprint;
}
