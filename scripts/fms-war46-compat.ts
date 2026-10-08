import {readFileSync} from 'node:fs';
import {normalized,sha256} from './engine-fingerprint.ts';
import {war45Files,fingerprintWar45} from './fms-war45-fingerprint.ts';
export const FROZEN_WAR45_ENGINE='3db316ba4f672dac0a0a64eb0fb4602f2074eaceed1833e36318f4c465ee1ab4';
export function verifyWar45Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/war45',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!==FROZEN_WAR45_ENGINE||m.files.length!==war45Files.length)throw Error('Frozen war45 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==war45Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen war45 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v45 execution changed: '+f.path);});
 const fingerprint=fingerprintWar45();
 if(fingerprint!==FROZEN_WAR45_ENGINE)throw Error('Playable v45 fingerprint changed');
 return fingerprint;
}
