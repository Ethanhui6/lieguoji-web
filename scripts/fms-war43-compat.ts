import {readFileSync} from 'node:fs';
import {normalized,sha256} from './engine-fingerprint.ts';
import {war42Files,fingerprintWar42} from './fms-war42-fingerprint.ts';
export const FROZEN_WAR42_ENGINE='adc39de810e018bc361afbc009be83330c0cc8d2e250ad00ef18164d873d333d';
export function verifyWar42Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/war42',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!==FROZEN_WAR42_ENGINE||m.files.length!==war42Files.length)throw Error('Frozen war42 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==war42Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen war42 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v42 execution changed: '+f.path);});
 const fingerprint=fingerprintWar42();
 if(fingerprint!==FROZEN_WAR42_ENGINE)throw Error('Playable v42 fingerprint changed');
 return fingerprint;
}
