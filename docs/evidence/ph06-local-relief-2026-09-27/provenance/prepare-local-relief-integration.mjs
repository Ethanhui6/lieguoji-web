import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const stage='.autopilot/ph06/v4-local-relief-integration-staging';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
if(fs.existsSync(stage))throw Error('Preserve existing staging');
fs.mkdirSync(stage,{recursive:true});
const files=[];
function edit(file,fn){const source=fs.readFileSync(file);const next=fn(source.toString('utf8'));const dest=`${stage}/${file}`;fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,next,{flag:'wx'});files.push({path:file,baselineSha256:hash(source),stagedPath:dest});}
function replace(source,a,b){if(!source.includes(a))throw Error(`Missing marker ${a}`);return source.replace(a,b);}
edit('src/world/generation-contract.ts',s=>{
 s=replace(s,'import { NATURAL_DETAIL_GENERATOR_FINGERPRINT,','import { LOCAL_DETAIL_RELIEF_GENERATOR_FINGERPRINT, NATURAL_DETAIL_GENERATOR_FINGERPRINT,');
 s=replace(s,'export type GenerationRecipe =','export interface LocalDetailReliefRecipe {\n  format: \'lieguoji-atlas-recipe\'; version: 1;\n  generator: { id: \'local-detail-relief\'; version: 1; fingerprint: string };\n  seed: string; parameters: { reliefMeters: number };\n}\nexport type GenerationRecipe = LocalDetailReliefRecipe |');
 s=replace(s,"export interface LastDetailGeneration extends Omit<LastGeneration, 'recipe' | 'scope'> { recipe: DetailShapeRecipe | AddDetailRecipe | NaturalDetailRecipe | AddNaturalDetailRecipe; scope: { kind: 'world' } }", "export type LastDetailGeneration = Omit<LastGeneration, 'recipe' | 'scope'> & (\n  { recipe: DetailShapeRecipe | AddDetailRecipe | NaturalDetailRecipe | AddNaturalDetailRecipe; scope: { kind: 'world' } }\n  | { recipe: LocalDetailReliefRecipe; scope: Extract<GenerationScope, { kind: 'cell-rectangle' }> }\n);");
 s=replace(s,'|| validateAddNaturalDetailRecipe(raw, spec, mode);','|| validateAddNaturalDetailRecipe(raw, spec, mode) || validateLocalDetailReliefRecipe(raw, mode);');
 s=replace(s,'/** Closed registration:',`export function validateLocalDetailReliefRecipe(raw: unknown, mode: GenerationValidationMode = 'execute'): raw is LocalDetailReliefRecipe {\n  try {\n    return generationExact(raw, ['format', 'version', 'generator', 'seed', 'parameters']) && raw.format === 'lieguoji-atlas-recipe' && raw.version === 1\n      && typeof raw.seed === 'string' && !!raw.seed.trim() && raw.seed.length <= 120\n      && generationExact(raw.generator, ['id', 'version', 'fingerprint']) && raw.generator.id === 'local-detail-relief' && raw.generator.version === 1\n      && acceptsGeneratorFingerprint('local-detail-relief', raw.generator.fingerprint, LOCAL_DETAIL_RELIEF_GENERATOR_FINGERPRINT, mode)\n      && generationExact(raw.parameters, ['reliefMeters']) && generationInt(raw.parameters.reliefMeters, 200, 6000);\n  } catch { return false; }\n}\n/** Closed registration:`);
 s=replace(s,"&& (scope.kind === 'world' || recipe.generator.id === 'landforms' || recipe.generator.id === 'coast-smoothing');", "&& (recipe.generator.id === 'local-detail-relief'\n      ? scope.kind === 'cell-rectangle' && scope.transitionCells >= 1\n      : scope.kind === 'world' || recipe.generator.id === 'landforms' || recipe.generator.id === 'coast-smoothing');");
 return s;
});
edit('src/world/generation-format.ts',s=>replace(replace(s,'validateDetailShapeRecipe,','validateLocalDetailReliefRecipe, validateDetailShapeRecipe,'),"|| validateAddNaturalDetailRecipe(last.recipe, raw.spec, 'storage');","|| validateAddNaturalDetailRecipe(last.recipe, raw.spec, 'storage') || validateLocalDetailReliefRecipe(last.recipe, 'storage');"));
edit('src/world/generation/fingerprint.ts',s=>s+"\nexport const LOCAL_DETAIL_RELIEF_GENERATOR_FINGERPRINT = __LOCAL_DETAIL_RELIEF_GENERATOR_FINGERPRINT__;\n");
edit('src/vite-env.d.ts',s=>s+'\ndeclare const __LOCAL_DETAIL_RELIEF_GENERATOR_FINGERPRINT__: string;\n');
edit('scripts/generator-fingerprint.ts',s=>s+"\nexport function fingerprintLocalDetailReliefGenerator(read = (file: string) => readFileSync(file, 'utf8')) {\n  return fingerprintGenerator('src/world/generation/local-detail-relief-adapter.ts', 'local-detail-relief', read);\n}\n");
edit('vite.config.ts',s=>{
 s=replace(s,'fingerprintAddNaturalDetailGenerator}', 'fingerprintAddNaturalDetailGenerator,fingerprintLocalDetailReliefGenerator}');
 s=replace(s,'verifyFrozenSources();','const localDetailReliefGenerator=fingerprintLocalDetailReliefGenerator();\nverifyFrozenSources();');
 s=replace(s,'...addNaturalDetailGenerator.files]', '...addNaturalDetailGenerator.files,...localDetailReliefGenerator.files]');
 s=replace(s,"addNaturalDetailGenerator,rules:","addNaturalDetailGenerator,localDetailReliefGenerator,rules:");
 s=replace(s,'__ADD_NATURAL_DETAIL_GENERATOR_FINGERPRINT__:JSON.stringify(addNaturalDetailGenerator.sha256)', '__ADD_NATURAL_DETAIL_GENERATOR_FINGERPRINT__:JSON.stringify(addNaturalDetailGenerator.sha256),__LOCAL_DETAIL_RELIEF_GENERATOR_FINGERPRINT__:JSON.stringify(localDetailReliefGenerator.sha256)');
 return s;
});
fs.writeFileSync(`${stage}/baseline-manifest.json`,JSON.stringify({createdAt:new Date().toISOString(),files},null,2)+'\n');
console.log(JSON.stringify({stage,files:files.length}));
