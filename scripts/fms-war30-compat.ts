import {readFileSync} from 'node:fs';
import {normalized,sha256} from './engine-fingerprint.ts';
import {war29Files,fingerprintWar29} from './fms-war29-fingerprint.ts';
export const FROZEN_WAR29_ENGINE='15f4a928d78be59d3fe27325c0908ecba9cbaf71a13927b7a3c03b1878e35db0';
export function verifyWar29Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/war29',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!==FROZEN_WAR29_ENGINE||m.files.length!==war29Files.length)throw Error('Frozen war29 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==war29Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen war29 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v29 execution changed: '+f.path);});
 const fingerprint=fingerprintWar29();
 if(fingerprint!==FROZEN_WAR29_ENGINE)throw Error('Playable v29 fingerprint changed');
 return fingerprint;
}
