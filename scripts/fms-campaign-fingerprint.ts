import{readFileSync}from'node:fs';import{createHash}from'node:crypto';import path from'node:path';import ts from'typescript';
import{normalized,sha256}from'./engine-fingerprint.ts';
import{tacticsFiles,fingerprintTactics}from'./fms-tactics-fingerprint.ts';import{fmsPlayFiles}from'./fms-play-fingerprint.ts';
export const campaignFiles=['campaign-model','reorganization','campaign-runtime','campaign-session','campaign-storage','campaign-stores','client','campaign/play.worker'].map(n=>`src/fms/play/${n}.ts`);
export function verifyTacticsCompatibility(read=(f:string)=>normalized(readFileSync(f,'utf8'))){
 const root='src/fms/play/compat/tactics1',m=JSON.parse(read(root+'/manifest.json')) as {version:number;fingerprint:string;files:{path:string;archive:string;sha256:string}[]};
 const expected=[...new Set([...tacticsFiles,...fmsPlayFiles,'src/fms/model.ts'])];
 if(m.version!==1||m.fingerprint!=='eade9f19e7b2bfecef9b59b688bd53c29ee95c13af1eb5e3f440b20fc5ed4dad'||m.files.length!==expected.length)throw Error('Frozen tactics1 manifest changed');
 m.files.forEach((f,i)=>{if(f.path!==expected[i]||f.archive!==f.path.slice(4)+'.source')throw Error('Frozen tactics1 path changed');const s=read(root+'/'+f.archive);if(sha256(s)!==f.sha256||read(f.path)!==s)throw Error('Published v9 execution changed: '+f.path);});
}
export function fingerprintCampaign(){
 verifyTacticsCompatibility();const old=fingerprintTactics();if(old!=='eade9f19e7b2bfecef9b59b688bd53c29ee95c13af1eb5e3f440b20fc5ed4dad')throw Error('Published v9 fingerprint changed');
 const hash=createHash('sha256').update('fms-campaign-1\0'+old),covered=new Set([...campaignFiles,...tacticsFiles,...fmsPlayFiles]);
 for(const file of campaignFiles){const source=normalized(readFileSync(file,'utf8')),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  function visit(n:ts.Node){if(ts.isImportDeclaration(n)&&ts.isStringLiteral(n.moduleSpecifier)&&!n.importClause?.isTypeOnly){const spec=n.moduleSpecifier.text,resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),spec+'.ts'));if(!spec.startsWith('.')||!covered.has(resolved))throw Error(`Unbound campaign dependency ${file} -> ${spec}`);}if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&['eval','require'].includes(n.expression.text)))throw Error('Dynamic campaign dependency forbidden');ts.forEachChild(n,visit);}visit(ast);hash.update('\n'+file+'\n'+source);
 }return hash.digest('hex');
}
