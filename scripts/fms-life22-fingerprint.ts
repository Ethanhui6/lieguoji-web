import {muster21Files,fingerprintMuster21} from './fms-muster21-fingerprint.ts';
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
export const life22Files=[...['state','people','create','model','session','storage','stores','client'].map(n=>'src/fms/play/life22-'+n+'.ts'),'src/fms/play/life22/play.worker.ts',...['character-calendar','iso-calendar','leader-birth'].map(n=>'src/fms/play/native-economy/'+n+'.ts')];
export function verifyMuster21Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/muster21',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!=='b462edef9aeb3393bb019f8d43567f6c3a439f5193668a53450af06fe69072c9'||m.files.length!==muster21Files.length)throw Error('Frozen muster21 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==muster21Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen muster21 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v21 execution changed: '+f.path);});
}
export function fingerprintLife22(){
 verifyMuster21Compatibility();const old=fingerprintMuster21();if(old!=='b462edef9aeb3393bb019f8d43567f6c3a439f5193668a53450af06fe69072c9')throw Error('Playable v21 fingerprint changed');
 const hash=createHash('sha256').update('fms-life-22\0'+old),covered=new Set([...life22Files,...muster21Files,...destiny20Files,...restoration19Files,...naming18Files,...culture17Files,...court16Files,...fiscal15Files,...upper14Files,...terrain13Files,...chronicle2Files,...chronicleFiles,...campaignFiles,...tacticsFiles,...fmsPlayFiles,'src/fms/model.ts']);
 for(const file of life22Files){const source=normalized(readFileSync(file,'utf8')),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  function visit(n:ts.Node){if((ts.isImportDeclaration(n)&&!n.importClause?.isTypeOnly||ts.isExportDeclaration(n)&&!n.isTypeOnly)&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier)){const spec=n.moduleSpecifier.text,resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),spec.endsWith('.json')?spec:spec+'.ts'));if(!spec.startsWith('.')||!covered.has(resolved))throw Error(`Unbound life22 dependency ${file} -> ${spec}`);}if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&['eval','require'].includes(n.expression.text)))throw Error('Dynamic life22 dependency forbidden');ts.forEachChild(n,visit);}visit(ast);hash.update('\n'+file+'\n'+source);
 }return hash.digest('hex');
}
