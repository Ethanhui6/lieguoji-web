import {readFileSync} from 'node:fs';
import {normalized,sha256} from './engine-fingerprint.ts';
import {war32Files,fingerprintWar32} from './fms-war32-fingerprint.ts';
export const FROZEN_WAR32_ENGINE='2fc396372878585809ef2dc7c343d1bf7e50e56a69b7a817d2c951f99103074e';
export function verifyWar32Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/war32',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!==FROZEN_WAR32_ENGINE||m.files.length!==war32Files.length)throw Error('Frozen war32 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==war32Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen war32 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v32 execution changed: '+f.path);});
 const fingerprint=fingerprintWar32();
 if(fingerprint!==FROZEN_WAR32_ENGINE)throw Error('Playable v32 fingerprint changed');
 return fingerprint;
}
