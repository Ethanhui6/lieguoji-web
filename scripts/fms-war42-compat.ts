import {readFileSync} from 'node:fs';
import {normalized,sha256} from './engine-fingerprint.ts';
import {war41Files,fingerprintWar41} from './fms-war41-fingerprint.ts';
export const FROZEN_WAR41_ENGINE='0ccebb5bb5216215be275b2e83af5a83ac937a3ccde7de60865a8d0ca4ce7d64';
export function verifyWar41Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/war41',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!==FROZEN_WAR41_ENGINE||m.files.length!==war41Files.length)throw Error('Frozen war41 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==war41Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen war41 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v41 execution changed: '+f.path);});
 const fingerprint=fingerprintWar41();
 if(fingerprint!==FROZEN_WAR41_ENGINE)throw Error('Playable v41 fingerprint changed');
 return fingerprint;
}
