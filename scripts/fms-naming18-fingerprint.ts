import {culture17Files,fingerprintCulture17} from './fms-culture17-fingerprint.ts';
import {court16Files} from './fms-court16-fingerprint.ts';
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
export const naming18Files=[...['names','validation','culture','state','runtime','model','session','storage','stores','client','records','politics','world','create'].map(n=>'src/fms/play/naming18-'+n+'.ts'),'src/fms/play/naming18/play.worker.ts',...['character-name','default-culture','full-name','localized-name','name-pool','original-naming'].map(n=>'src/fms/play/native-culture/'+n+'.ts'),...['Ciestundu','EasternFantasy','Leffathou','Oeczea','WesternFantasy','Wristhos'].map(n=>'src/fms/play/native-culture/data/'+n+'.json')];
export function verifyCulture17Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/culture17',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!=='a06cacce3adba1ef788ea87e7d11607f7e673141aab5b8e8648da4f699fa885f'||m.files.length!==culture17Files.length)throw Error('Frozen culture17 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==culture17Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen culture17 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v17 execution changed: '+f.path);});
}
export function fingerprintNaming18(){
 verifyCulture17Compatibility();const old=fingerprintCulture17();if(old!=='a06cacce3adba1ef788ea87e7d11607f7e673141aab5b8e8648da4f699fa885f')throw Error('Playable v17 fingerprint changed');
 const hash=createHash('sha256').update('fms-naming-18\0'+old),covered=new Set([...naming18Files,...culture17Files,...court16Files,...fiscal15Files,...upper14Files,...terrain13Files,...chronicle2Files,...chronicleFiles,...campaignFiles,...tacticsFiles,...fmsPlayFiles,'src/fms/model.ts']);
 for(const file of naming18Files){const source=normalized(readFileSync(file,'utf8')),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  function visit(n:ts.Node){if((ts.isImportDeclaration(n)&&!n.importClause?.isTypeOnly||ts.isExportDeclaration(n)&&!n.isTypeOnly)&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier)){const spec=n.moduleSpecifier.text,resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),spec.endsWith('.json')?spec:spec+'.ts'));if(!spec.startsWith('.')||!covered.has(resolved))throw Error(`Unbound naming18 dependency ${file} -> ${spec}`);}if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&['eval','require'].includes(n.expression.text)))throw Error('Dynamic naming18 dependency forbidden');ts.forEachChild(n,visit);}visit(ast);hash.update('\n'+file+'\n'+source);
 }return hash.digest('hex');
}
