import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import ts from 'typescript';
import {normalized,sha256} from './engine-fingerprint.ts';
import {campaignFiles,fingerprintCampaign} from './fms-campaign-fingerprint.ts';
import {tacticsFiles} from './fms-tactics-fingerprint.ts';
import {fmsPlayFiles} from './fms-play-fingerprint.ts';
export const chronicleFiles=['chronicle-occupation.ts','chronicle-runtime.ts','chronicle-battle.ts','chronicle-model.ts','chronicle-records.ts','chronicle-politics.ts','chronicle-session.ts','chronicle-storage.ts','chronicle-stores.ts','chronicle-client.ts','chronicle/play.worker.ts','district-world.ts','leader-names.json'].map(n=>'src/fms/play/'+n);
export function verifyCampaignCompatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
  const root='src/fms/play/compat/campaign1',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
  if(m.version!==1||m.fingerprint!=='5394c3c20077989a2eb2c243c7a686399e86c8dbfad8102bfbb3951d01019db0'||m.files.length!==campaignFiles.length)throw Error('Frozen campaign1 manifest changed');
  m.files.forEach((f,i)=>{if(f.path!==campaignFiles[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen campaign1 path changed');const source=read(root+'/'+f.archive);if(sha256(source)!==f.sha256||read(f.path)!==source)throw Error('Published v10 execution changed: '+f.path);});
}
export function fingerprintChronicle(){
  verifyCampaignCompatibility();const old=fingerprintCampaign();if(old!=='5394c3c20077989a2eb2c243c7a686399e86c8dbfad8102bfbb3951d01019db0')throw Error('Published v10 fingerprint changed');
  const hash=createHash('sha256').update('fms-chronicle-1\0'+old),covered=new Set([...chronicleFiles,...campaignFiles,...tacticsFiles,...fmsPlayFiles,'src/fms/model.ts']);
  for(const file of chronicleFiles){const source=normalized(readFileSync(file,'utf8'));if(file.endsWith('.ts')){
    const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
    function visit(n:ts.Node){if(ts.isImportDeclaration(n)&&ts.isStringLiteral(n.moduleSpecifier)&&!n.importClause?.isTypeOnly){const spec=n.moduleSpecifier.text,resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),spec.endsWith('.json')?spec:spec+'.ts'));if(!spec.startsWith('.')||!covered.has(resolved))throw Error(`Unbound chronicle dependency ${file} -> ${spec}`);}if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&['eval','require'].includes(n.expression.text)))throw Error('Dynamic chronicle dependency forbidden');ts.forEachChild(n,visit);}visit(ast);
  }hash.update('\n'+file+'\n'+source);}return hash.digest('hex');
}
