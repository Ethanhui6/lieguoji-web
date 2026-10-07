import {voyage24Files} from './fms-voyage24-fingerprint.ts';
import {war26Files,fingerprintWar26} from './fms-war26-fingerprint.ts';
import {settlement25Files} from './fms-settlement25-fingerprint.ts';
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
export const war27Files=[...['losses','model','core','battle','runtime','sea','session','storage','stores','client'].map(n=>'src/fms/play/war27-'+n+'.ts'),'src/fms/play/war27/play.worker.ts'];
export function verifyWar26Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/war26',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!=='6fa529b834cea33ecbaf53ebdeb4e1bb3f0b5e87d2e7b6707e26934f77ab3cc1'||m.files.length!==war26Files.length)throw Error('Frozen war26 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==war26Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen war26 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v26 execution changed: '+f.path);});
}
export function fingerprintWar27(){
 verifyWar26Compatibility();const old=fingerprintWar26();if(old!=='6fa529b834cea33ecbaf53ebdeb4e1bb3f0b5e87d2e7b6707e26934f77ab3cc1')throw Error('Playable v26 fingerprint changed');
 const hash=createHash('sha256').update('fms-war-27\0'+old),covered=new Set([...war27Files,...war26Files,...settlement25Files,...voyage24Files,...dynasty23Files,...life22Files,...muster21Files,...destiny20Files,...restoration19Files,...naming18Files,...culture17Files,...court16Files,...fiscal15Files,...upper14Files,...terrain13Files,...chronicle2Files,...chronicleFiles,...campaignFiles,...tacticsFiles,...fmsPlayFiles,'src/fms/model.ts']);
 for(const file of war27Files){const source=normalized(readFileSync(file,'utf8')),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  function visit(n:ts.Node){if((ts.isImportDeclaration(n)&&!n.importClause?.isTypeOnly||ts.isExportDeclaration(n)&&!n.isTypeOnly)&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier)){const spec=n.moduleSpecifier.text,resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),spec.endsWith('.json')?spec:spec+'.ts'));if(!spec.startsWith('.')||!covered.has(resolved))throw Error(`Unbound war27 dependency ${file} -> ${spec}`);}if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&['eval','require'].includes(n.expression.text)))throw Error('Dynamic war27 dependency forbidden');ts.forEachChild(n,visit);}visit(ast);hash.update('\n'+file+'\n'+source);
 }return hash.digest('hex');
}
