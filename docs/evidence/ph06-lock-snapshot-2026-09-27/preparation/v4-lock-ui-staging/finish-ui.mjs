import { readFileSync, writeFileSync } from 'node:fs';
const path = new URL('./src/editor/AtlasStudio.tsx', import.meta.url);
let source = readFileSync(path, 'utf8');
function replace(before, after) {
  if (source.split(before).length !== 2) throw new Error('Expected exactly one replacement: ' + before);
  source = source.replace(before, after);
}
replace('{localSelecting && !busy && <button', '{(localSelecting || protectionSelecting) && !busy && <button');
replace("data-atlas-tool={drawing ? 'outline' : localSelecting ? 'region' : 'browse'}", "data-atlas-tool={drawing ? 'outline' : localSelecting || protectionSelecting ? 'region' : 'browse'}");
replace('onClick={beginLocalRelief}>仅重生成山地</button>', 'onClick={beginLocalRelief}>仅重生成山地</button><button disabled={locked} onClick={beginProtection}>保护区域</button>');
replace("section === 'generate' ? '大陆与地貌' : '大世界草稿'", "section === 'generate' ? fine && fineOperation === 'protect' ? '保护区域' : '大陆与地貌' : '大世界草稿'");
writeFileSync(path, source);
