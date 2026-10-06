import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {fingerprintFmsPlay,verifyMaritimeCompatibility} from '../../../scripts/fms-play-fingerprint';
const read=(file:string)=>readFileSync(file,'utf8').replace(/\r\n/g,'\n');
describe('v8 actual execution preservation',()=>{
  it('still computes the existing saved engine hash from all live sources',()=>{expect(fingerprintFmsPlay()).toBe('0026798b10d65cfb186247b0e65148310c3e72965698dd94633a640594fee504');});
  it.each(['src/fms/play/maritime.ts','src/fms/play/world.ts','src/fms/play/occupation.ts','src/fms/model.ts','src/fms/play/observation.ts'])('rejects changed old execution instead of returning a fixed hash: %s',file=>{expect(()=>verifyMaritimeCompatibility(path=>read(path)+(path===file?'\n// changed execution':''))).toThrow('live execution changed');});
  it('rejects missing manifest dependencies rather than silently shrinking the closure',()=>{expect(()=>verifyMaritimeCompatibility(path=>{const source=read(path);if(!path.endsWith('/maritime1/manifest.json'))return source;const manifest=JSON.parse(source);manifest.files.pop();return JSON.stringify(manifest);})).toThrow('manifest changed');});
});
