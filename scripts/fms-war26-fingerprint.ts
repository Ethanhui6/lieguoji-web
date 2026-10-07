import {voyage24Files} from './fms-voyage24-fingerprint.ts';
import {settlement25Files,fingerprintSettlement25} from './fms-settlement25-fingerprint.ts';
import {dynasty23Files} from './fms-dynasty23-fingerprint.ts';
import {life22Files} from './fms-life22-fingerprint.ts';
import {muster21Files} from './fms-muster21-fingerprint.ts';
import {destiny20Files} from './fms-destiny20-fingerprint.ts';
import {restoration19Files} from './fms-restoration19-fingerprint.ts';
import {naming18Files} from './fms-naming18-fingerprint.ts';
import {culture17Files} from './fms-culture17-fingerprint.ts';
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
export const war26Files=[...['native','state','strength','validation','model','core','runtime','sea','voyages','session','storage','stores','client'].map(n=>'src/fms/play/war26-'+n+'.ts'),'src/fms/play/war26/play.worker.ts','src/fms/play/native-economy/native-round.ts'];
export function verifySettlement25Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/settlement25',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!=='b99a0f06ff02be797aec8f86e82700646ebb4da5a88eb2ded1d61e477a131a79'||m.files.length!==settlement25Files.length)throw Error('Frozen settlement25 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==settlement25Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen settlement25 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v25 execution changed: '+f.path);});
}
export function fingerprintWar26(){
 verifySettlement25Compatibility();const old=fingerprintSettlement25();if(old!=='b99a0f06ff02be797aec8f86e82700646ebb4da5a88eb2ded1d61e477a131a79')throw Error('Playable v25 fingerprint changed');
 const hash=createHash('sha256').update('fms-war-26\0'+old),covered=new Set([...war26Files,...settlement25Files,...voyage24Files,...dynasty23Files,...life22Files,...muster21Files,...destiny20Files,...restoration19Files,...naming18Files,...culture17Files,...court16Files,...fiscal15Files,...upper14Files,...terrain13Files,...chronicle2Files,...chronicleFiles,...campaignFiles,...tacticsFiles,...fmsPlayFiles,'src/fms/model.ts']);
 for(const file of war26Files){const source=normalized(readFileSync(file,'utf8')),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  function visit(n:ts.Node){if((ts.isImportDeclaration(n)&&!n.importClause?.isTypeOnly||ts.isExportDeclaration(n)&&!n.isTypeOnly)&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier)){const spec=n.moduleSpecifier.text,resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),spec.endsWith('.json')?spec:spec+'.ts'));if(!spec.startsWith('.')||!covered.has(resolved))throw Error(`Unbound war26 dependency ${file} -> ${spec}`);}if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&['eval','require'].includes(n.expression.text)))throw Error('Dynamic war26 dependency forbidden');ts.forEachChild(n,visit);}visit(ast);hash.update('\n'+file+'\n'+source);
 }return hash.digest('hex');
}
