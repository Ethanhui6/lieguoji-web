import ts from 'typescript';
import { dirname, relative, resolve, isAbsolute } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
const repo=process.cwd(),stage=resolve('.autopilot/ph06/v4-natural-integration-staging');
const candidates=[resolve(stage,'review-only-ui'),stage,resolve(stage,'dependency-source'),repo];
const {options}=ts.parseJsonConfigFileContent(ts.readConfigFile('tsconfig.json',ts.sys.readFile).config,ts.sys,repo);
const host=ts.createCompilerHost(options);
host.resolveModuleNames=(names,containingFile)=>names.map(name=>{
 if(name.startsWith('.')){
  const target=resolve(dirname(containingFile),name),base=candidates.find(root=>{const r=relative(root,target);return !isAbsolute(r)&&!r.startsWith('..');});
  if(base){const logical=relative(base,target);for(const root of candidates)for(const suffix of ['', '.ts', '.tsx']){const file=resolve(root,logical+suffix);if(existsSync(file)&&/\.tsx?$/.test(file))return {resolvedFileName:file,extension:file.endsWith('.tsx')?ts.Extension.Tsx:ts.Extension.Ts};}}
 }
 return ts.resolveModuleName(name,containingFile,options,host).resolvedModule;
});
const ready=JSON.parse(readFileSync(resolve(stage,'ready-manifest.json'),'utf8'));
const roots=[...ready.files.map(f=>resolve(stage,f.path)),...ready.incrementalFiles.map(f=>resolve(stage,'review-only-ui',f.path)),resolve(stage,'vitest.integration.config.ts')].filter(f=>/\.tsx?$/.test(f));
const program=ts.createProgram(roots,options,host),diagnostics=ts.getPreEmitDiagnostics(program);
console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:file=>file,getCurrentDirectory:()=>repo,getNewLine:()=> '\n'}));
console.log(JSON.stringify({diagnostics:diagnostics.length,rootFiles:roots.length,scope:'Natural integration mirrors, review-only incremental UI/browser application, dependencies; not global production typecheck'}));
process.exitCode=diagnostics.length?1:0;
