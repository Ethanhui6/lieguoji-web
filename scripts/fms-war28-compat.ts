import {readFileSync} from 'node:fs';
import {normalized,sha256} from './engine-fingerprint.ts';
import {war27Files,fingerprintWar27} from './fms-war27-fingerprint.ts';
export const FROZEN_WAR27_ENGINE='4927a05918f8b4d4abf5787754f71367ade7e3e3cce270fe5410c772603849d9';
export function verifyWar27Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/war27',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!==FROZEN_WAR27_ENGINE||m.files.length!==war27Files.length)throw Error('Frozen war27 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==war27Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen war27 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v27 execution changed: '+f.path);});
 if(fingerprintWar27()!==FROZEN_WAR27_ENGINE)throw Error('Playable v27 fingerprint changed');
}
