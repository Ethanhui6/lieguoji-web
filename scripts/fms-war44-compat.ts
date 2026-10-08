import {readFileSync} from 'node:fs';
import {normalized,sha256} from './engine-fingerprint.ts';
import {war43Files,fingerprintWar43} from './fms-war43-fingerprint.ts';
export const FROZEN_WAR43_ENGINE='68838b9ee0cf1f825be28be670c58238460f6c69ec3bb2800f9e9842f9706035';
export function verifyWar43Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/war43',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!==FROZEN_WAR43_ENGINE||m.files.length!==war43Files.length)throw Error('Frozen war43 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==war43Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen war43 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v43 execution changed: '+f.path);});
 const fingerprint=fingerprintWar43();
 if(fingerprint!==FROZEN_WAR43_ENGINE)throw Error('Playable v43 fingerprint changed');
 return fingerprint;
}
