import {readFileSync} from 'node:fs';
import {normalized,sha256} from './engine-fingerprint.ts';
import {war38Files,fingerprintWar38} from './fms-war38-fingerprint.ts';
export const FROZEN_WAR38_ENGINE='438c68084a420cb4caa110a076c736de52ef8e45e1c00311a17cc41e8999146d';
export function verifyWar38Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/war38',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!==FROZEN_WAR38_ENGINE||m.files.length!==war38Files.length)throw Error('Frozen war38 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==war38Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen war38 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v38 execution changed: '+f.path);});
 const fingerprint=fingerprintWar38();
 if(fingerprint!==FROZEN_WAR38_ENGINE)throw Error('Playable v38 fingerprint changed');
 return fingerprint;
}
