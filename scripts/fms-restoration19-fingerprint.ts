import {naming18Files,fingerprintNaming18} from './fms-naming18-fingerprint.ts';
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
export const restoration19Files=[...['names','validation','culture','state','runtime','model','session','storage','stores','client','records','politics','create','identity','people','sovereignty','core','battle','military','customization','structure','commands'].map(n=>'src/fms/play/restoration19-'+n+'.ts'),'src/fms/play/restoration19/play.worker.ts','src/fms/play/native-culture/rebel-identity.ts','src/fms/play/native-culture/rebel-name.ts'];
export function verifyNaming18Compatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/naming18',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 if(m.version!==1||m.fingerprint!=='ad61bb35f2eb6df9480ae71f6a03c169dab7f42d200e534b4b8e9241534a2914'||m.files.length!==naming18Files.length)throw Error('Frozen naming18 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==naming18Files[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen naming18 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Playable v18 execution changed: '+f.path);});
}
export function fingerprintRestoration19(){
 verifyNaming18Compatibility();const old=fingerprintNaming18();if(old!=='ad61bb35f2eb6df9480ae71f6a03c169dab7f42d200e534b4b8e9241534a2914')throw Error('Playable v18 fingerprint changed');
 const hash=createHash('sha256').update('fms-restoration-19\0'+old),covered=new Set([...restoration19Files,...naming18Files,...culture17Files,...court16Files,...fiscal15Files,...upper14Files,...terrain13Files,...chronicle2Files,...chronicleFiles,...campaignFiles,...tacticsFiles,...fmsPlayFiles,'src/fms/model.ts']);
 for(const file of restoration19Files){const source=normalized(readFileSync(file,'utf8')),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  function visit(n:ts.Node){if((ts.isImportDeclaration(n)&&!n.importClause?.isTypeOnly||ts.isExportDeclaration(n)&&!n.isTypeOnly)&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier)){const spec=n.moduleSpecifier.text,resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),spec.endsWith('.json')?spec:spec+'.ts'));if(!spec.startsWith('.')||!covered.has(resolved))throw Error(`Unbound restoration19 dependency ${file} -> ${spec}`);}if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&['eval','require'].includes(n.expression.text)))throw Error('Dynamic restoration19 dependency forbidden');ts.forEachChild(n,visit);}visit(ast);hash.update('\n'+file+'\n'+source);
 }return hash.digest('hex');
}
