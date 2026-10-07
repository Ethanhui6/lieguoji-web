import {readFileSync} from 'node:fs';
import {normalized,sha256} from './engine-fingerprint.ts';
import {war39Files,fingerprintWar39} from './fms-war39-fingerprint.ts';
export const FROZEN_WAR39_ENGINE='2e99729db51b4ea8bf23b8b1e80c45b364ecba2fe8bbd3bd8079f63ea0f7bb53';
export function verifyWar39Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/war39',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!==FROZEN_WAR39_ENGINE||m.files.length!==war39Files.length)throw Error('Frozen war39 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==war39Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen war39 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v39 execution changed: '+f.path);});
 const fingerprint=fingerprintWar39();
 if(fingerprint!==FROZEN_WAR39_ENGINE)throw Error('Playable v39 fingerprint changed');
 return fingerprint;
}
