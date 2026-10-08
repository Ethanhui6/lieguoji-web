import {readFileSync} from 'node:fs';
import {normalized,sha256} from './engine-fingerprint.ts';
import {war44Files,fingerprintWar44} from './fms-war44-fingerprint.ts';
export const FROZEN_WAR44_ENGINE='ba4301c52eeacb31808d124ffadaaf8da5daa40d77242f52d3040d0b07ada7a1';
export function verifyWar44Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/war44',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!==FROZEN_WAR44_ENGINE||m.files.length!==war44Files.length)throw Error('Frozen war44 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==war44Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen war44 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v44 execution changed: '+f.path);});
 const fingerprint=fingerprintWar44();
 if(fingerprint!==FROZEN_WAR44_ENGINE)throw Error('Playable v44 fingerprint changed');
 return fingerprint;
}
