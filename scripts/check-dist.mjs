import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {blockingReason, isProcessedAsset, LOCALIZATION_EXTRACTS, PROCESSED_ASSET_DIR} from './check-private-files.mjs';

const root = path.resolve('dist');
const requiredFiles = new Set(['index.html', 'build.json', 'favicon.svg', '_headers', '_redirects', 'terrain-licenses.txt']);
const assetName = /^[A-Za-z0-9][A-Za-z0-9._-]*-[A-Za-z0-9_-]{8}\.(?:js|css)$/;
const files = [];
// Exact authorized clip atlas; accepting this artifact does not allow other images or raw Unity files.
const battleAtlasName=/^battle-sword-[A-Za-z0-9_-]{8}\.png$/;
const battleAtlasHash='12b0852354a1975fa927cb9f5191665741cc87d262810a54d21f8b1d3f21b3b3';
// Exact parchment derived from the original's sharedassets0 parchmentfinal2 (2048x2048 JPEG).
const parchmentName=/^parchment-[A-Za-z0-9_-]{8}\.jpg$/;
const parchmentHash='a8bb5bed39f2ebd43a812e025b2e65b636aaaa082a2d33381463d54b4eb3633e';
// Vite copies public/original-ui/ here. Only the same processed files the push gate allows.
const processedRoot = PROCESSED_ASSET_DIR.replace(/^public\//, '');

function inProcessedAssets(name) {
  return name === processedRoot || name.startsWith(`${processedRoot}/`);
}

function processedAssetRejection(name) {
  const repoPath = `public/${name}`;
  const text = LOCALIZATION_EXTRACTS.includes(repoPath) ? fs.readFileSync(path.join(root, name), 'utf8') : undefined;
  const blocked = blockingReason(repoPath, {text});
  if (blocked) return blocked;
  if (isProcessedAsset(repoPath) || LOCALIZATION_EXTRACTS.includes(repoPath)) return null;
  return 'not an approved processed asset';
}

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
      if (name !== 'assets' && !inProcessedAssets(name)) reject(name, 'only the assets directory and original-ui are allowed');
      walk(absolute, name);
      continue;
    }
    if (!stat.isFile()) reject(name, 'only regular files are allowed');
    const battleAtlas=relative==='assets'&&battleAtlasName.test(entry);
    const parchment=relative==='assets'&&parchmentName.test(entry);
    if(parchment){const bytes=fs.readFileSync(absolute);if(bytes.length!==840709||createHash('sha256').update(bytes).digest('hex')!==parchmentHash)reject(name,'parchment texture differs from reviewed source');}
    if(battleAtlas){const bytes=fs.readFileSync(absolute);if(bytes.length!==482109||createHash('sha256').update(bytes).digest('hex')!==battleAtlasHash)reject(name,'battle animation atlas differs from reviewed source');}
    if (inProcessedAssets(name)) {
      const reason = processedAssetRejection(name);
      if (reason) reject(name, reason);
    } else {
      const allowed = relative === '' ? requiredFiles.has(name) : relative === 'assets' && (assetName.test(entry)||battleAtlas||parchment);
      if (!allowed) reject(name, 'not an approved root file or hashed JS/CSS asset');
    }
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
if (!files.some(file => /^assets\/sim\.worker-[A-Za-z0-9_-]{8}\.js$/.test(file))) {
  reject('assets/sim.worker-<hash>.js', 'required simulation Worker is missing');
}
if (!files.some(file => /^assets\/replay\.worker-[A-Za-z0-9_-]{8}\.js$/.test(file))) {
  reject('assets/replay.worker-<hash>.js', 'required isolated replay Worker is missing');
}
if (!files.some(file => /^assets\/atlas\.worker-[A-Za-z0-9_-]{8}\.js$/.test(file))) {
  reject('assets/atlas.worker-<hash>.js', 'required isolated atlas draft Worker is missing');
}
if (!files.some(file => /^assets\/biome\.worker-[A-Za-z0-9_-]{8}\.js$/.test(file))) {
  reject('assets/biome.worker-<hash>.js', 'required isolated climate and rainfall river Worker is missing');
}
if (!files.some(file => /^assets\/play\.worker-[A-Za-z0-9_-]{8}\.js$/.test(file))) {
  reject('assets/play.worker-<hash>.js', 'required FMS gameplay Worker is missing');
}
if (!files.some(file => /^assets\/index-[A-Za-z0-9_-]{8}\.js$/.test(file))) {
  reject('assets/index-<hash>.js', 'required application entry is missing');
}
if(files.filter(file=>battleAtlasName.test(file.replace(/^assets\//,''))).length!==1)reject('battle-sword','exactly one reviewed battle animation atlas required');
for(const e of JSON.parse(fs.readFileSync('src/fms/play/culture47-frozen.json','utf8'))){
  const prefix='assets/'+e.file.replace(/\.js$/,'-'),matches=files.filter(f=>f.startsWith(prefix)&&f.endsWith('.js'));
  if(matches.length!==1)reject(e.file,'exactly one registered old culture Worker required');
  const bytes=fs.readFileSync(path.join(root,matches[0]));
  if(bytes.length!==e.bytes||createHash('sha256').update(bytes).digest('hex')!==e.sha256)reject(e.file,'old culture Worker must retain original bytes');
}
console.log(`Publish audit: ${files.length} approved game artifacts; only required root files, hashed JS/CSS, the exact reviewed battle atlas and parchment, and processed files under original-ui.`);
