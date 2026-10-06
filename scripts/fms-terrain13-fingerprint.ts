import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import ts from 'typescript';
import {normalized,sha256} from './engine-fingerprint.ts';
import {chronicle2Files,fingerprintChronicle2} from './fms-chronicle2-fingerprint.ts';
import {chronicleFiles} from './fms-chronicle-fingerprint.ts';
import {campaignFiles} from './fms-campaign-fingerprint.ts';
import {tacticsFiles} from './fms-tactics-fingerprint.ts';
import {fmsPlayFiles} from './fms-play-fingerprint.ts';
export const terrain13Files=[...['native','context','rules','core','battle','occupation','runtime','model','session','storage','stores','client'].map(n=>'src/fms/play/terrain13-'+n+'.ts'),'src/fms/play/terrain13/play.worker.ts',...['biome-surface','climate','climate-rivers','river-shape','river-geometry','height-palette','alea'].map(n=>'src/fms/play/terrain13-climate/'+n+'.ts')];
export function verifyChronicle2Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/chronicle2',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!=='4f3d955e7a3e3626d2392fd46dce89e221b0935d89aac5a998f22771a67595ea'||m.files.length!==chronicle2Files.length)throw Error('Frozen chronicle2 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==chronicle2Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen chronicle2 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Published v12 execution changed: '+f.path);});
}
export function fingerprintTerrain13(){
 verifyChronicle2Compatibility();const old=fingerprintChronicle2();if(old!=='4f3d955e7a3e3626d2392fd46dce89e221b0935d89aac5a998f22771a67595ea')throw Error('Published v12 fingerprint changed');
 const hash=createHash('sha256').update('fms-terrain-13\0'+old),covered=new Set([...terrain13Files,...chronicle2Files,...chronicleFiles,...campaignFiles,...tacticsFiles,...fmsPlayFiles,'src/fms/model.ts']);
 for(const file of terrain13Files){const source=normalized(readFileSync(file,'utf8')),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  function visit(n:ts.Node){if((ts.isImportDeclaration(n)&&!n.importClause?.isTypeOnly||ts.isExportDeclaration(n)&&!n.isTypeOnly)&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier)){const spec=n.moduleSpecifier.text,resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),spec.endsWith('.json')?spec:spec+'.ts'));if(!spec.startsWith('.')||!covered.has(resolved))throw Error(`Unbound terrain13 dependency ${file} -> ${spec}`);}if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&['eval','require'].includes(n.expression.text)))throw Error('Dynamic terrain13 dependency forbidden');ts.forEachChild(n,visit);}visit(ast);hash.update('\n'+file+'\n'+source);
 }return hash.digest('hex');
}
