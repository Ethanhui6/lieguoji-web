import {readFileSync} from 'node:fs';
import {normalized,sha256} from './engine-fingerprint.ts';
import {war46Files,fingerprintWar46} from './fms-war46-fingerprint.ts';
export const FROZEN_WAR46_ENGINE='e3191f1edda29829bb24cc1a1ec8ff20336344aa85b7f770769735336a4fd52d';
export function verifyWar46Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/war46',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!==FROZEN_WAR46_ENGINE||m.files.length!==war46Files.length)throw Error('Frozen war46 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==war46Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen war46 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v46 execution changed: '+f.path);});
 const fingerprint=fingerprintWar46();if(fingerprint!==FROZEN_WAR46_ENGINE)throw Error('Playable v46 fingerprint changed');return fingerprint;
}
