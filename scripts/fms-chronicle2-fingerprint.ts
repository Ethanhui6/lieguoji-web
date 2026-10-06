import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import ts from 'typescript';
import {normalized,sha256} from './engine-fingerprint.ts';
import {chronicleFiles,fingerprintChronicle} from './fms-chronicle-fingerprint.ts';
import {campaignFiles} from './fms-campaign-fingerprint.ts';
import {tacticsFiles} from './fms-tactics-fingerprint.ts';
import {fmsPlayFiles} from './fms-play-fingerprint.ts';
export const chronicle2Files=['chronicle2-battle.ts','chronicle2-runtime.ts','chronicle2-model.ts','chronicle2-session.ts','chronicle2-storage.ts','chronicle2-stores.ts','chronicle2-client.ts','chronicle2/play.worker.ts'].map(n=>'src/fms/play/'+n);
export function verifyChronicleCompatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
  const root='src/fms/play/compat/chronicle1',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
  if(m.version!==1||m.fingerprint!=='f22268ac708380330dac94247a24c46a8fef2c2d716972049f9af9f124fd5884'||m.files.length!==chronicleFiles.length)throw Error('Frozen chronicle1 manifest changed');
  m.files.forEach((f,i)=>{if(f.path!==chronicleFiles[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen chronicle1 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Published v11 execution changed: '+f.path);});
}
export function fingerprintChronicle2(){
  verifyChronicleCompatibility();const old=fingerprintChronicle();if(old!=='f22268ac708380330dac94247a24c46a8fef2c2d716972049f9af9f124fd5884')throw Error('Published v11 fingerprint changed');
  const hash=createHash('sha256').update('fms-chronicle-2\0'+old),covered=new Set([...chronicle2Files,...chronicleFiles,...campaignFiles,...tacticsFiles,...fmsPlayFiles,'src/fms/model.ts']);
  for(const file of chronicle2Files){const source=normalized(readFileSync(file,'utf8'));if(file.endsWith('.ts')){
    const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
    function visit(n:ts.Node){if(ts.isImportDeclaration(n)&&ts.isStringLiteral(n.moduleSpecifier)&&!n.importClause?.isTypeOnly){const spec=n.moduleSpecifier.text,resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),spec.endsWith('.json')?spec:spec+'.ts'));if(!spec.startsWith('.')||!covered.has(resolved))throw Error(`Unbound chronicle dependency ${file} -> ${spec}`);}if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&['eval','require'].includes(n.expression.text)))throw Error('Dynamic chronicle dependency forbidden');ts.forEachChild(n,visit);}visit(ast);
  }hash.update('\n'+file+'\n'+source);}return hash.digest('hex');
}
