import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const root = path.resolve('dist');
const requiredFiles = new Set(['index.html', 'build.json', 'favicon.svg', '_headers', '_redirects', 'terrain-licenses.txt', 'boot-diagnostic.js']);
const assetName = /^[A-Za-z0-9][A-Za-z0-9._-]*-[A-Za-z0-9_-]{8}\.(?:js|css)$/;
const files = [];
// Exact authorized clip atlas; accepting this artifact does not allow other images or raw Unity files.
const battleAtlasName=/^battle-sword-[A-Za-z0-9_-]{8}\.png$/;
const battleAtlasHash='12b0852354a1975fa927cb9f5191665741cc87d262810a54d21f8b1d3f21b3b3';
// Exact parchment derived from the original's sharedassets0 parchmentfinal2 (2048x2048 JPEG).
const parchmentName=/^parchment-[A-Za-z0-9_-]{8}\.jpg$/;
const parchmentHash='a8bb5bed39f2ebd43a812e025b2e65b636aaaa082a2d33381463d54b4eb3633e';
// Exact subset of the original's map-name font TW-Kai-98_1 (Open Government Data License v1.0).
const mapFontName=/^tw-kai-subset-[A-Za-z0-9_-]{8}\.woff2$/;
const mapFontHash='4d99de452741f3ca96ae6b58f9ecdee651040f03bf7452b74f2c526623de723c';
// The original's five RandomMusicPlayer tracks (sharedassets0 AudioClips), AAC 96 kb/s.
const musicTracks={
  'deplasa-pe':[4431383,'0a0cc42f96e929e4fdd25b88dfabb3cad670cbe4f8ecf0f3126f6e8917c90b66'],
  'final-stance':[1104590,'aa6c755f0fb113260ebb70b227a683189006286c48ee279f34fbe01d99bb235c'],
  'guild-of-adventurers':[2337885,'8d2148cdc80677c7613bb97bbc96d20bff1c62d97f1c2673efac528437477adb'],
  'land-of-heroes':[2183413,'220ca423421b431a8c899ce9ed9c2fa65d5ca0b85ce0ffdd8f009a99ac5ebc3c'],
  'wonders-and-mysteries-alt':[1131983,'29c00c6d1ea2f3bf11ef40f422faaec2536bf94d85d7a294943afb47b0748320'],
};
const musicName=/^([a-z-]+)-[A-Za-z0-9_-]{8}\.m4a$/;

function reject(file, reason) {
  throw new Error(`Publish audit rejected ${file}: ${reason}`);
}

function inspect(file, relative) {
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink()) reject(relative, 'symbolic links and junctions are forbidden');
  if (stat.isFile() && stat.nlink > 1) reject(relative, 'hard-linked files are forbidden');
  return stat;
}

function walk(directory, relative = '') {
  for (const entry of fs.readdirSync(directory)) {
    const hasControl = [...entry].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
    if (entry === '.' || entry === '..' || /[\\/]/.test(entry) || hasControl) {
      reject(entry, 'invalid path component');
    }
    const name = relative ? `${relative}/${entry}` : entry;
    const absolute = path.join(directory, entry);
    const resolved = path.relative(root, absolute);
    if (resolved.startsWith(`..${path.sep}`) || resolved === '..' || path.isAbsolute(resolved)) {
      reject(name, 'path escapes dist');
    }
    const stat = inspect(absolute, name);
    if (stat.isDirectory()) {
      if (name !== 'assets') reject(name, 'only the assets directory is allowed');
      walk(absolute, name);
      continue;
    }
    if (!stat.isFile()) reject(name, 'only regular files are allowed');
    const battleAtlas=relative==='assets'&&battleAtlasName.test(entry);
    const parchment=relative==='assets'&&parchmentName.test(entry);
    const mapFont=relative==='assets'&&mapFontName.test(entry);
    const musicKey=relative==='assets'?musicName.exec(entry)?.[1]:undefined,music=!!musicKey&&Object.hasOwn(musicTracks,musicKey);
    if(music){const bytes=fs.readFileSync(absolute),[size,hash]=musicTracks[musicKey];if(bytes.length!==size||createHash('sha256').update(bytes).digest('hex')!==hash)reject(name,'music track differs from reviewed source');}
    if(mapFont){const bytes=fs.readFileSync(absolute);if(bytes.length!==1224684||createHash('sha256').update(bytes).digest('hex')!==mapFontHash)reject(name,'map font subset differs from reviewed source');}
    if(parchment){const bytes=fs.readFileSync(absolute);if(bytes.length!==840709||createHash('sha256').update(bytes).digest('hex')!==parchmentHash)reject(name,'parchment texture differs from reviewed source');}
    if(battleAtlas){const bytes=fs.readFileSync(absolute);if(bytes.length!==482109||createHash('sha256').update(bytes).digest('hex')!==battleAtlasHash)reject(name,'battle animation atlas differs from reviewed source');}
    const allowed = relative === '' ? requiredFiles.has(name) : relative === 'assets' && (assetName.test(entry)||battleAtlas||parchment||mapFont||music);
    if (!allowed) reject(name, 'not an approved root file or hashed JS/CSS asset');
    files.push(name);
  }
}

if (!fs.existsSync(root)) reject('dist', 'build output is missing');
if (!inspect(root, 'dist').isDirectory()) reject('dist', 'build output must be a directory');
walk(root);
for (const required of requiredFiles) {
  if (!files.includes(required)) reject(required, 'required game artifact is missing');
}
const terrainLicenses = fs.readFileSync(path.join(root, 'terrain-licenses.txt'));
if (terrainLicenses.length > 65536 || !terrainLicenses.equals(fs.readFileSync('public/terrain-licenses.txt'))) {
  reject('terrain-licenses.txt', 'must match the reviewed bounded public license artifact');
}
// Workers of the current game (0.5.0): culture simulation, terrain, coast and climate.
for (const name of ['culture47', 'terrain', 'coast', 'biome']) {
  if (!files.some(file => new RegExp(`^assets/${name}\\.worker-[A-Za-z0-9_-]{8}\\.js$`).test(file))) {
    reject(`assets/${name}.worker-<hash>.js`, 'required game Worker is missing');
  }
}
if (!files.some(file => /^assets\/index-[A-Za-z0-9_-]{8}\.js$/.test(file))) {
  reject('assets/index-<hash>.js', 'required application entry is missing');
}
const builtHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (/\scrossorigin(?:=|\s|>)/.test(builtHtml)) reject('index.html', 'crossorigin would block module scripts on the iOS capacitor:// page');
if (!builtHtml.includes('src="/boot-diagnostic.js"')) reject('index.html', 'classic iOS boot diagnostic script is missing');
if (!builtHtml.includes('viewport-fit=cover')) reject('index.html', 'viewport-fit=cover is required for iOS safe areas');
for(const track of Object.keys(musicTracks))if(files.filter(file=>file.startsWith(`assets/${track}-`)&&file.endsWith('.m4a')).length!==1)reject(`assets/${track}.m4a`,'exactly one reviewed music track required');
if(files.filter(file=>battleAtlasName.test(file.replace(/^assets\//,''))).length!==1)reject('battle-sword','exactly one reviewed battle animation atlas required');
console.log(`Publish audit: ${files.length} approved game artifacts; only required root files, hashed JS/CSS, the exact reviewed battle atlas, parchment, map font subset and five music tracks.`);
