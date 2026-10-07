import {readFileSync} from 'node:fs';
import {normalized,sha256} from './engine-fingerprint.ts';
import {war33Files,fingerprintWar33} from './fms-war33-fingerprint.ts';
export const FROZEN_WAR33_ENGINE='d438cd78271cd0e8683ddfb106b514e025bdf13cac9607e7c712d59e264150b4';
export function verifyWar33Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/war33',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!==FROZEN_WAR33_ENGINE||m.files.length!==war33Files.length)throw Error('Frozen war33 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==war33Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen war33 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v33 execution changed: '+f.path);});
 const fingerprint=fingerprintWar33();
 if(fingerprint!==FROZEN_WAR33_ENGINE)throw Error('Playable v33 fingerprint changed');
 return fingerprint;
}
