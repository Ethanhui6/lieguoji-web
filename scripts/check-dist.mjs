import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('dist');
const requiredFiles = new Set(['index.html', 'build.json', 'favicon.svg', '_headers', '_redirects', 'terrain-licenses.txt']);
const assetName = /^[A-Za-z0-9][A-Za-z0-9._-]*-[A-Za-z0-9_-]{8}\.(?:js|css)$/;
const files = [];

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
    const allowed = relative === '' ? requiredFiles.has(name) : relative === 'assets' && assetName.test(entry);
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
if (!files.some(file => /^assets\/index-[A-Za-z0-9_-]{8}\.js$/.test(file))) {
  reject('assets/index-<hash>.js', 'required application entry is missing');
}
console.log(`Publish audit: ${files.length} approved game artifacts; only required root files and hashed JS/CSS assets.`);
