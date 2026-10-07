import {readFileSync} from 'node:fs';
import {normalized,sha256} from './engine-fingerprint.ts';
import {war31Files,fingerprintWar31} from './fms-war31-fingerprint.ts';
export const FROZEN_WAR31_ENGINE='afe29c1e7d1e370467970caa087887c5db2c3ad43d7581516bea249c062cb170';
export function verifyWar31Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/war31',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!==FROZEN_WAR31_ENGINE||m.files.length!==war31Files.length)throw Error('Frozen war31 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==war31Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen war31 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v31 execution changed: '+f.path);});
 const fingerprint=fingerprintWar31();
 if(fingerprint!==FROZEN_WAR31_ENGINE)throw Error('Playable v31 fingerprint changed');
 return fingerprint;
}
