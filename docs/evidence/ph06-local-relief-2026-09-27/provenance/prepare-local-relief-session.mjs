import fs from 'node:fs';
import crypto from 'node:crypto';
const stage='.autopilot/ph06/v4-local-relief-integration-staging';
const file='src/world/generation-session.ts';
const source=fs.readFileSync(file);let s=source.toString('utf8');
function replace(a,b){if(!s.includes(a))throw Error(`Missing ${a}`);s=s.replace(a,b);}
replace('validateMacroRecipe,','validateLocalDetailReliefRecipe, validateMacroRecipe,');
replace("import { inspectCoastalGeneration }", "import { generateLocalDetailReliefAtlas, type LocalDetailReliefAdapterOutput } from './generation/local-detail-relief-adapter';\nimport { inspectCoastalGeneration }");
replace("detailNaturalAdd?: AddNaturalDetailAdapterOutput['summary']['detailNaturalAdd']", "detailNaturalAdd?: AddNaturalDetailAdapterOutput['summary']['detailNaturalAdd']; detailLocalRelief?: LocalDetailReliefAdapterOutput['summary']['detailLocalRelief']");
replace('|| validateAddNaturalDetailRecipe(recipe, base.manifest.spec)))', '|| validateAddNaturalDetailRecipe(recipe, base.manifest.spec) || validateLocalDetailReliefRecipe(recipe)))');
replace('第四版只支持独立细大陆配方；旧版本不能执行细海岸生成，旧生成器不能修改第四版。', '第四版只支持细大陆与局部细地形配方；旧版本不能执行细海岸生成，旧生成器不能修改第四版。');
replace("'detailNatural' | 'detailNaturalAdd'>", "'detailNatural' | 'detailNaturalAdd' | 'detailLocalRelief'>");
replace('if (validateAddNaturalDetailRecipe(recipe, base.manifest.spec)) {',"if (validateLocalDetailReliefRecipe(recipe)) {\n      const result = await generateLocalDetailReliefAtlas({ base, recipe, scope }, control);\n      output = { blocks: result.data.blocks, summary: result.summary }; next = result.data;\n      details = { detailLocalRelief: structuredClone(result.summary.detailLocalRelief) }; reason = '保留海岸与锁区，重生成选区内的真实山地';\n    } else if (validateAddNaturalDetailRecipe(recipe, base.manifest.spec)) {");
replace("if ((!validateDetailShapeRecipe(recipe, next.manifest.spec) && !validateAddDetailRecipe(recipe, next.manifest.spec) && !validateNaturalDetailRecipe(recipe, next.manifest.spec) && !validateAddNaturalDetailRecipe(recipe, next.manifest.spec)) || scope.kind !== 'world') throw new Error('细大陆来源记录与第四版候选不一致。');\n      next.manifest.generation.lastApplied = { recipe, scope, ...provenance };", "if (validateLocalDetailReliefRecipe(recipe)) {\n        if (scope.kind !== 'cell-rectangle' || !validateGenerationOperation(recipe, scope, next.manifest.spec)) throw new Error('局部细地形来源范围不一致。');\n        next.manifest.generation.lastApplied = { recipe, scope, ...provenance };\n      } else {\n        if ((!validateDetailShapeRecipe(recipe, next.manifest.spec) && !validateAddDetailRecipe(recipe, next.manifest.spec) && !validateNaturalDetailRecipe(recipe, next.manifest.spec) && !validateAddNaturalDetailRecipe(recipe, next.manifest.spec)) || scope.kind !== 'world') throw new Error('细大陆来源记录与第四版候选不一致。');\n        next.manifest.generation.lastApplied = { recipe, scope, ...provenance };\n      }");
const dest=`${stage}/${file}`;fs.writeFileSync(dest,s,{flag:'wx'});
const manifest=JSON.parse(fs.readFileSync(`${stage}/baseline-manifest.json`,'utf8'));
manifest.files.push({path:file,baselineSha256:crypto.createHash('sha256').update(source).digest('hex'),stagedPath:dest});
fs.writeFileSync(`${stage}/baseline-manifest.json`,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({path:dest}));
