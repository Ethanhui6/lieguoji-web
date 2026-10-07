import {readFileSync} from 'node:fs';
import {normalized,sha256} from './engine-fingerprint.ts';
import {war40Files,fingerprintWar40} from './fms-war40-fingerprint.ts';
export const FROZEN_WAR40_ENGINE='dfc26e3d14a493aa64ca0a137d02f7ad6e5b5799a9991f382cb4cde13e18c0c4';
export function verifyWar40Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/war40',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!==FROZEN_WAR40_ENGINE||m.files.length!==war40Files.length)throw Error('Frozen war40 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==war40Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen war40 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v40 execution changed: '+f.path);});
 const fingerprint=fingerprintWar40();
 if(fingerprint!==FROZEN_WAR40_ENGINE)throw Error('Playable v40 fingerprint changed');
 return fingerprint;
}
