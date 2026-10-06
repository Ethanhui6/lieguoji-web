import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import ts from 'typescript';
import {normalized,sha256} from './engine-fingerprint.ts';
import {upper14Files,fingerprintUpper14} from './fms-upper14-fingerprint.ts';
import {terrain13Files} from './fms-terrain13-fingerprint.ts';
import {chronicle2Files} from './fms-chronicle2-fingerprint.ts';
import {chronicleFiles} from './fms-chronicle-fingerprint.ts';
import {campaignFiles} from './fms-campaign-fingerprint.ts';
import {tacticsFiles} from './fms-tactics-fingerprint.ts';
import {fmsPlayFiles} from './fms-play-fingerprint.ts';
export const fiscal15Files=[...['state','geography','food','rules','core','battle','occupation','runtime','model','session','storage','stores','client'].map(n=>'src/fms/play/fiscal15-'+n+'.ts'),'src/fms/play/fiscal15/play.worker.ts',...['numeric.ts','settlement.ts','population.ts','resources.ts','biome-resources.json'].map(n=>'src/fms/play/native-economy/'+n)];
export function verifyUpper14Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/upper14',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!=='3482083ac4b38cb0201ddb7517fd40c007fc99285680361b74313858e4dc0f12'||m.files.length!==upper14Files.length)throw Error('Frozen upper14 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==upper14Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen upper14 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v14 execution changed: '+f.path);});
}
export function fingerprintFiscal15(){
 verifyUpper14Compatibility();const old=fingerprintUpper14();if(old!=='3482083ac4b38cb0201ddb7517fd40c007fc99285680361b74313858e4dc0f12')throw Error('Playable v14 fingerprint changed');
 const hash=createHash('sha256').update('fms-fiscal-15\0'+old),covered=new Set([...fiscal15Files,...upper14Files,...terrain13Files,...chronicle2Files,...chronicleFiles,...campaignFiles,...tacticsFiles,...fmsPlayFiles,'src/fms/model.ts']);
 for(const file of fiscal15Files){const source=normalized(readFileSync(file,'utf8')),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  function visit(n:ts.Node){if((ts.isImportDeclaration(n)&&!n.importClause?.isTypeOnly||ts.isExportDeclaration(n)&&!n.isTypeOnly)&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier)){const spec=n.moduleSpecifier.text,resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),spec.endsWith('.json')?spec:spec+'.ts'));if(!spec.startsWith('.')||!covered.has(resolved))throw Error(`Unbound fiscal15 dependency ${file} -> ${spec}`);}if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&['eval','require'].includes(n.expression.text)))throw Error('Dynamic fiscal15 dependency forbidden');ts.forEachChild(n,visit);}visit(ast);hash.update('\n'+file+'\n'+source);
 }return hash.digest('hex');
}
