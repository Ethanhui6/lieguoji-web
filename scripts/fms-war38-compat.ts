import {readFileSync} from 'node:fs';
import {normalized,sha256} from './engine-fingerprint.ts';
import {war37Files,fingerprintWar37} from './fms-war37-fingerprint.ts';
export const FROZEN_WAR37_ENGINE='77da6e217ee79a875e95ec87de2f2ed7e14bf50b5b671bbfb4cd3a2059cf5461';
export function verifyWar37Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/war37',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!==FROZEN_WAR37_ENGINE||m.files.length!==war37Files.length)throw Error('Frozen war37 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==war37Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen war37 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v37 execution changed: '+f.path);});
 const fingerprint=fingerprintWar37();
 if(fingerprint!==FROZEN_WAR37_ENGINE)throw Error('Playable v37 fingerprint changed');
 return fingerprint;
}
