import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import ts from 'typescript';
import {normalized,sha256} from './engine-fingerprint.ts';
import {terrain13Files,fingerprintTerrain13} from './fms-terrain13-fingerprint.ts';
import {chronicle2Files} from './fms-chronicle2-fingerprint.ts';
import {chronicleFiles} from './fms-chronicle-fingerprint.ts';
import {campaignFiles} from './fms-campaign-fingerprint.ts';
import {tacticsFiles} from './fms-tactics-fingerprint.ts';
import {fmsPlayFiles} from './fms-play-fingerprint.ts';
export const upper14Files=[...['state','geography','rules','core','battle','occupation','runtime','model','edit','session','storage','stores','client'].map(n=>'src/fms/play/upper14-'+n+'.ts'),'src/fms/play/upper14/play.worker.ts',...['state-traits','upper-efficiency','core-distance'].map(n=>'src/fms/play/native-combat/'+n+'.ts')];
export function verifyTerrain13Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/terrain13',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!=='a20d2c88e3bbad359027bcc1d0d9e343c9a0f1955b9c6c250acfa070cdb36c77'||m.files.length!==terrain13Files.length)throw Error('Frozen terrain13 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==terrain13Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen terrain13 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v13 execution changed: '+f.path);});
}
export function fingerprintUpper14(){
 verifyTerrain13Compatibility();const old=fingerprintTerrain13();if(old!=='a20d2c88e3bbad359027bcc1d0d9e343c9a0f1955b9c6c250acfa070cdb36c77')throw Error('Playable v13 fingerprint changed');
 const hash=createHash('sha256').update('fms-upper-14\0'+old),covered=new Set([...upper14Files,...terrain13Files,...chronicle2Files,...chronicleFiles,...campaignFiles,...tacticsFiles,...fmsPlayFiles,'src/fms/model.ts']);
 for(const file of upper14Files){const source=normalized(readFileSync(file,'utf8')),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  function visit(n:ts.Node){if((ts.isImportDeclaration(n)&&!n.importClause?.isTypeOnly||ts.isExportDeclaration(n)&&!n.isTypeOnly)&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier)){const spec=n.moduleSpecifier.text,resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),spec.endsWith('.json')?spec:spec+'.ts'));if(!spec.startsWith('.')||!covered.has(resolved))throw Error(`Unbound upper14 dependency ${file} -> ${spec}`);}if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&['eval','require'].includes(n.expression.text)))throw Error('Dynamic upper14 dependency forbidden');ts.forEachChild(n,visit);}visit(ast);hash.update('\n'+file+'\n'+source);
 }return hash.digest('hex');
}
