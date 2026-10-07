import {readFileSync} from 'node:fs';
import {normalized,sha256} from './engine-fingerprint.ts';
import {war34Files,fingerprintWar34} from './fms-war34-fingerprint.ts';
export const FROZEN_WAR34_ENGINE='6a52897174d9ffd76f9ac1a46eb1d3ffb9fd7171e3b03caee601dafe07361d7d';
export function verifyWar34Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/war34',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!==FROZEN_WAR34_ENGINE||m.files.length!==war34Files.length)throw Error('Frozen war34 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==war34Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen war34 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v34 execution changed: '+f.path);});
 const fingerprint=fingerprintWar34();
 if(fingerprint!==FROZEN_WAR34_ENGINE)throw Error('Playable v34 fingerprint changed');
 return fingerprint;
}
