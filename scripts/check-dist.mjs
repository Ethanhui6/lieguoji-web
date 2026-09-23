import fs from 'node:fs';
import path from 'node:path';
const files=[];
function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,item.name);if(item.isDirectory())walk(p);else files.push(p.replaceAll('\\','/'));}}
walk('dist');
if(!files.includes('dist/index.html')||!files.some(f=>/sim\.worker.*\.js$/.test(f))) throw new Error('Missing game entry/Worker');
for(const file of files){if(/(^|\/)(docs|plan|references|saves|\.env|\.git|\.wrangler)(\/|\.|$)/i.test(file)||/\.(md|zip|pem|key|map)$/i.test(file))throw new Error(`Non-game artifact: ${file}`);}
console.log(`Publish audit: ${files.length} game artifacts only; no docs/references/saves/source maps.`);
