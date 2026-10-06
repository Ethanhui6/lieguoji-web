import {fiscal15Files,fingerprintFiscal15} from './fms-fiscal15-fingerprint.ts';
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
export const court16Files=[...['people','state','runtime','model','session','storage','stores','client'].map(n=>'src/fms/play/court16-'+n+'.ts'),'src/fms/play/court16/play.worker.ts',...['character-income.ts','character-generation.ts','office-income.ts','office-assignment.ts','character-traits.json'].map(n=>'src/fms/play/native-economy/'+n)];
export function verifyFiscal15Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/fiscal15',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!=='eb95d5fcb6affb4f1ca405300adbefc69029adaa1e91f293871bfb47966389e4'||m.files.length!==fiscal15Files.length)throw Error('Frozen fiscal15 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==fiscal15Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen fiscal15 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v15 execution changed: '+f.path);});
}
export function fingerprintCourt16(){
 verifyFiscal15Compatibility();const old=fingerprintFiscal15();if(old!=='eb95d5fcb6affb4f1ca405300adbefc69029adaa1e91f293871bfb47966389e4')throw Error('Playable v15 fingerprint changed');
 const hash=createHash('sha256').update('fms-court-16\0'+old),covered=new Set([...court16Files,...fiscal15Files,...upper14Files,...terrain13Files,...chronicle2Files,...chronicleFiles,...campaignFiles,...tacticsFiles,...fmsPlayFiles,'src/fms/model.ts']);
 for(const file of court16Files){const source=normalized(readFileSync(file,'utf8')),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  function visit(n:ts.Node){if((ts.isImportDeclaration(n)&&!n.importClause?.isTypeOnly||ts.isExportDeclaration(n)&&!n.isTypeOnly)&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier)){const spec=n.moduleSpecifier.text,resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),spec.endsWith('.json')?spec:spec+'.ts'));if(!spec.startsWith('.')||!covered.has(resolved))throw Error(`Unbound court16 dependency ${file} -> ${spec}`);}if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&['eval','require'].includes(n.expression.text)))throw Error('Dynamic court16 dependency forbidden');ts.forEachChild(n,visit);}visit(ast);hash.update('\n'+file+'\n'+source);
 }return hash.digest('hex');
}
