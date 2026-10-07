import {readFileSync} from 'node:fs';
import {normalized,sha256} from './engine-fingerprint.ts';
import {war35Files,fingerprintWar35} from './fms-war35-fingerprint.ts';
export const FROZEN_WAR35_ENGINE='b1e9266cbe2301dec766f771aff9b2541cad1d5288e667bf470bda49de5508db';
export function verifyWar35Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/war35',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!==FROZEN_WAR35_ENGINE||m.files.length!==war35Files.length)throw Error('Frozen war35 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==war35Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen war35 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v35 execution changed: '+f.path);});
 const fingerprint=fingerprintWar35();
 if(fingerprint!==FROZEN_WAR35_ENGINE)throw Error('Playable v35 fingerprint changed');
 return fingerprint;
}
