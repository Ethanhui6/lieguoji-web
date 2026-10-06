import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {normalized} from './engine-fingerprint.ts';
import {fingerprintFmsPlay,fmsPlayFiles} from './fms-play-fingerprint.ts';
import ts from 'typescript';
import path from 'node:path';
export const tacticsFiles=['tactics-model','tactics-rules','tactics-core','tactics-statecraft','tactics-battle','tactics-occupation','tactics-muster','tactics-runtime','tactics-sea','tactics-session','tactics-storage','game-storage','storage','play.worker','observation'].map(name=>`src/fms/play/${name}.ts`);
/** Bind new execution, validation, creation and dispatch to the verified, closed
 * v8 dependency graph. The v8 fingerprint/guards are never rewritten. */
export function fingerprintTactics(){
  const hash=createHash('sha256').update('fms-tactics-1\0'+fingerprintFmsPlay()),covered=new Set([...tacticsFiles,...fmsPlayFiles]);
  for(const file of tacticsFiles){const source=normalized(readFileSync(file,'utf8')),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
    function visit(node:ts.Node){
      if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)&&!node.importClause?.isTypeOnly){const specifier=node.moduleSpecifier.text,resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),specifier+'.ts'));if(!specifier.startsWith('.')||!covered.has(resolved))throw Error(`Unbound tactics dependency ${file} -> ${specifier}`);}
      if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(node.expression)&&['eval','require'].includes(node.expression.text)))throw Error('Dynamic tactics dependency forbidden: '+file);
      ts.forEachChild(node,visit);
    }visit(ast);hash.update('\n'+file+'\n'+source);
  }return hash.digest('hex');
}
