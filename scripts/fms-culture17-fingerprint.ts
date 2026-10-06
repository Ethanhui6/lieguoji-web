import {court16Files,fingerprintCourt16} from './fms-court16-fingerprint.ts';
import {fiscal15Files} from './fms-fiscal15-fingerprint.ts';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import ts from 'typescript';
import {normalized,sha256} from './engine-fingerprint.ts';
import {upper14Files} from './fms-upper14-fingerprint.ts';
import {terrain13Files} from './fms-terrain13-fingerprint.ts';
import {chronicle2Files} from './fms-chronicle2-fingerprint.ts';
import {chronicleFiles} from './fms-chronicle-fingerprint.ts';
import {campaignFiles} from './fms-campaign-fingerprint.ts';
import {tacticsFiles} from './fms-tactics-fingerprint.ts';
import {fmsPlayFiles} from './fms-play-fingerprint.ts';
export const culture17Files=[...['culture','state','runtime','model','session','storage','stores','client'].map(n=>'src/fms/play/culture17-'+n+'.ts'),'src/fms/play/culture17/play.worker.ts',...['ethnic-generation.ts','original-cultures.ts','culture-ethnic-weights.json'].map(n=>'src/fms/play/native-economy/'+n)];
export function verifyCourt16Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/court16',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!=='fb6616f64e22d5aed61436eacc135f820a37829a9b1e1c01f0537b4391098a0e'||m.files.length!==court16Files.length)throw Error('Frozen court16 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==court16Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen court16 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v16 execution changed: '+f.path);});
}
export function fingerprintCulture17(){
 verifyCourt16Compatibility();const old=fingerprintCourt16();if(old!=='fb6616f64e22d5aed61436eacc135f820a37829a9b1e1c01f0537b4391098a0e')throw Error('Playable v16 fingerprint changed');
 const hash=createHash('sha256').update('fms-culture-17\0'+old),covered=new Set([...culture17Files,...court16Files,...fiscal15Files,...upper14Files,...terrain13Files,...chronicle2Files,...chronicleFiles,...campaignFiles,...tacticsFiles,...fmsPlayFiles,'src/fms/model.ts']);
 for(const file of culture17Files){const source=normalized(readFileSync(file,'utf8')),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  function visit(n:ts.Node){if((ts.isImportDeclaration(n)&&!n.importClause?.isTypeOnly||ts.isExportDeclaration(n)&&!n.isTypeOnly)&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier)){const spec=n.moduleSpecifier.text,resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),spec.endsWith('.json')?spec:spec+'.ts'));if(!spec.startsWith('.')||!covered.has(resolved))throw Error(`Unbound culture17 dependency ${file} -> ${spec}`);}if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&['eval','require'].includes(n.expression.text)))throw Error('Dynamic culture17 dependency forbidden');ts.forEachChild(n,visit);}visit(ast);hash.update('\n'+file+'\n'+source);
 }return hash.digest('hex');
}
