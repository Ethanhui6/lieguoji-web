import fs from 'node:fs';
import {createHash} from 'node:crypto';
const base='.autopilot/ph06/fine-world-relief-staging';
const files={'detail-natural-relief.ts':'4f7cf0598389b5626eacce7fb4e473f76c8151d422e1fddff1ccf6ffa29464f4','detail-orography.ts':'11703b6c7bc4949a80b7ba6439fc9bed654cb73f0ec70359e97b9d07926cd863'};
for(const [name,sha] of Object.entries(files)){
 const bytes=fs.readFileSync(`${base}/src/world/generation/${name}`);
 if(createHash('sha256').update(bytes).digest('hex')!==sha)throw Error('Frozen candidate mismatch');
 fs.writeFileSync(`src/world/generation/${name}`,bytes);
}
function replace(file,from,to){const s=fs.readFileSync(file,'utf8');if(!s.includes(from))throw Error(`Missing exact source in ${file}`);fs.writeFileSync(file,s.replace(from,to));}
replace('src/world/generation/detail-natural-relief.ts','FINE_WORLD_RELIEF_SCALE = {','FINE_WORLD_RELIEF_SCALE = Object.freeze({');
replace('src/world/generation/detail-natural-relief.ts','branchSpanWorld: 192 } as const;','branchSpanWorld: 192 } as const);');
replace('src/world/generation/detail-shape-natural.ts','reliefMeters: recipe.reliefMeters, shelfWidthWorld: recipe.shelfWidthWorld,','reliefMeters: recipe.reliefMeters, shelfWidthWorld: recipe.shelfWidthWorld, heightPlanning: \'fine-world\',');
for(const file of ['package.json','package-lock.json']){const data=JSON.parse(fs.readFileSync(file,'utf8'));if(data.version!=='0.5.0-preview.19')throw Error('Unexpected version');data.version='0.5.0-preview.20';if(data.packages)data.packages[''].version=data.version;fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');}
const file='tests/atlas-add-detail-coast.spec.ts';let s=fs.readFileSync(file,'utf8');
s=s.replace("import { test, expect, type Page }", "import { test, expect, type Page, type Locator }");
s=s.replace("// Staged for tests/atlas-add-detail-coast.spec.ts. Imports intentionally target\r\n// that final location. No app generator/geometry code runs in this observer.","// Read-only durable observation; no generator/geometry implementation runs here.");
s=s.replace("const click = (p: Page, name: string) => p.getByRole('button', { name, exact: true }).filter({ visible: true }).click();", "async function activate(locator: Locator, touch: boolean) { if (touch) await locator.tap(); else await locator.click(); }\nconst click = (p: Page, name: string, touch: boolean) => activate(p.getByRole('button', { name, exact: true }).filter({ visible: true }), touch);");
s=s.replace("const panel = (p: Page, name: '地图' | '创世' | '编辑') => p.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name, exact: true }).click();", "const panel = (p: Page, name: '地图' | '创世' | '编辑', touch: boolean) => activate(p.getByRole('navigation', { name: '大世界草稿工具' }).getByRole('button', { name, exact: true }), touch);\nasync function committed(p: Page, revision: number) {\n  await expect(studio(p)).toHaveAttribute('data-atlas-revision', String(revision), { timeout: 120000 });\n  await expect(studio(p)).toHaveAttribute('data-atlas-display', 'committed');\n  await expect(preview(p)).toHaveCount(0); await ready(p);\n}");
s=s.replace(/await (click|panel)\((p|page), ('[^']+')\)/g,'await $1($2, $3, touch)');
s=s.replace("const touch = info.project.name !== 'desktop-chromium'", "const touch = !!info.project.use.hasTouch");
s=s.replace("await draw(page, firstContour, touch); await click(page, '确认生成并保存', touch); await ready(page);","await draw(page, firstContour, touch); await click(page, '确认生成并保存', touch); await committed(page, 1);");
s=s.replace("await panel(page, '创世', touch); await click(page, '确认生成并保存', touch); await ready(page);","await panel(page, '创世', touch); await click(page, '确认生成并保存', touch); await committed(page, 2);");
s=s.replace("await click(page, '撤销大世界编辑', touch); await ready(page);","await click(page, '撤销大世界编辑', touch); await committed(page, 3);");
s=s.replace("await draw(page, secondContour, touch); await click(page, '确认生成并保存', touch); await ready(page);","await draw(page, secondContour, touch); await click(page, '确认生成并保存', touch); await committed(page, 4);");
fs.writeFileSync(file,s);
const checkpointFile='.autopilot/checkpoint.json', c=JSON.parse(fs.readFileSync(checkpointFile,'utf8'));c.updatedAt=new Date().toISOString();c.currentFocus='Preview20 explicit fine-world relief integration; actual dist remains checked19 until next build. Previous native tap/framing repair passed all3 browsers.';c.currentBatch={id:'ph06-fine-world-relief',sourceChangesUncommitted:true,status:'integrating',checkedBaseline:'ef52727aa984a2c22ac6b622475427da61cccaed',actualDistVersion:'0.5.0-preview.19',phaseAccepted:false,cloudWrites:false};fs.writeFileSync(checkpointFile,JSON.stringify(c,null,2)+'\n');
