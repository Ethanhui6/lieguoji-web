import {readFileSync} from 'node:fs';
import {normalized,sha256} from './engine-fingerprint.ts';
import {war36Files,fingerprintWar36} from './fms-war36-fingerprint.ts';
export const FROZEN_WAR36_ENGINE='c1080ceb204012e5ca4d70ca1de5c9ebff9b27f534ff4c0d690af3604f9a4325';
export function verifyWar36Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/war36',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!==FROZEN_WAR36_ENGINE||m.files.length!==war36Files.length)throw Error('Frozen war36 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==war36Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen war36 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v36 execution changed: '+f.path);});
 const fingerprint=fingerprintWar36();
 if(fingerprint!==FROZEN_WAR36_ENGINE)throw Error('Playable v36 fingerprint changed');
 return fingerprint;
}
