import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

// Local evidence only. No network, browser, evaluator execution, deletion or
// overwrite. Every filesystem read uses a validated project-relative path.
export const CHUNK_BYTES = 8 * 1024 * 1024;
export const LIMITS = Object.freeze({ fileBytes: 4 * 1024 ** 3, totalBytes: 32 * 1024 ** 3, archiveBytes: 40 * 1024 ** 3,
  files: 100000, objects: 200000, manifestBytes: 64 * 1024 ** 2, gzipBytes: CHUNK_BYTES + 1024 ** 2, artifactBytes: 4 * 1024 ** 2 });
export const ORIGIN = '.autopilot/ph05';
export const ARCHIVE = 'docs/evidence/ph05';
export const TOOL_PATHS = Object.freeze(['scripts/summarize-atlas-rendering.mjs', 'scripts/summarize-atlas.mjs',
  'scripts/measure-atlas-rendering.mjs', 'scripts/measure-atlas.mjs']);
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => /^[a-f0-9]{64}$/.test(value ?? '');
const integer = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !equal(Object.keys(value).sort(), [...keys].sort())) throw new Error('Unknown or incomplete archive fields');
}
export function relativePath(value) {
  if (typeof value !== 'string' || !value || value.length > 2000 || path.isAbsolute(value) || /[\\:\x00-\x1f<>"|?*]/.test(value)) throw new Error('Only safe project-relative slash paths are accepted');
  for (const segment of value.split('/')) if (!segment || segment === '.' || segment === '..' || /[ .]$/.test(segment)
    || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment)) throw new Error('Unsafe or ambiguous path segment');
  return value;
}
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
export function projectRoot() {
  const root = fs.realpathSync('.');
  const git = fs.realpathSync(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', windowsHide: true }).trim());
  if (!samePath(root, git)) throw new Error('Run from the exact current project Git root');
  const guard = makeGuard(root);
  rejectWindowsReparseTrees(['package.json']);
  const pkg = JSON.parse(guard.read('package.json', 1024 * 1024).toString('utf8'));
  if (pkg.name !== 'lieguoji-web' || pkg.private !== true) throw new Error('This is not the private lieguoji-web project');
  return guard;
}
function sameStat(a, b) {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs && a.mode === b.mode;
}
export function makeGuard(root) {
  function check(value, missing = false) {
    const relative = relativePath(value), segments = relative.split('/');
    for (let index = 0; index < segments.length; index++) {
      const prefix = segments.slice(0, index + 1).join('/');
      let info;
      try { info = fs.lstatSync(prefix); } catch (error) { if (missing && error.code === 'ENOENT') return null; throw error; }
      if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile()) || index < segments.length - 1 && !info.isDirectory()) throw new Error(`Linked/special evidence path: ${prefix}`);
      // Also reject links whose destinations happen to remain inside the repo.
      if (!samePath(fs.realpathSync(prefix), path.join(root, ...segments.slice(0, index + 1)))) throw new Error(`Reparsed evidence path: ${prefix}`);
      if (index === segments.length - 1) return info;
    }
  }
  function mkdir(relative) {
    relativePath(relative);
    for (let index = 1; index <= relative.split('/').length; index++) {
      const prefix = relative.split('/').slice(0, index).join('/'), existing = check(prefix, true);
      if (existing) { if (!existing.isDirectory()) throw new Error(`Expected directory: ${prefix}`); }
      else { fs.mkdirSync(prefix); check(prefix); }
    }
  }
  function read(relative, maximum) {
    const before = check(relative);
    if (!before.isFile() || !integer(before.size, maximum)) throw new Error(`File exceeds read bound: ${relative}`);
    const fd = fs.openSync(relative, 'r');
    try {
      if (!sameStat(before, fs.fstatSync(fd))) throw new Error(`File changed before read: ${relative}`);
      const bytes = Buffer.alloc(before.size); let offset = 0;
      while (offset < bytes.length) { const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset); if (!count) throw new Error(`Truncated file: ${relative}`); offset += count; }
      if (!sameStat(before, fs.fstatSync(fd)) || !sameStat(before, check(relative))) throw new Error(`File changed during read: ${relative}`);
      return bytes;
    } finally { fs.closeSync(fd); }
  }
  function write(relative, bytes) {
    relativePath(relative); const parent = path.posix.dirname(relative); if (parent !== '.') mkdir(parent);
    if (check(relative, true)) throw new Error(`Refusing existing output: ${relative}`);
    const fd = fs.openSync(relative, 'wx');
    try { check(relative); fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }
  function inventory(relative) {
    const result = []; let visited = 0;
    function visit(directory) {
      if (!check(directory).isDirectory()) throw new Error(`Expected evidence directory: ${directory}`);
      for (const name of fs.readdirSync(directory).sort()) {
        if (++visited > LIMITS.files * 4) throw new Error('Evidence directory entry limit exceeded');
        const current = relativePath(`${directory}/${name}`), info = check(current);
        if (info.isDirectory()) visit(current); else result.push({ path: current, stat: info });
      }
    }
    visit(relative); return result.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  }
  return { root, check, mkdir, read, write, inventory };
}
// Node lstat detects normal symlinks/junctions. Windows also has other reparse
// tags: inspect attributes without following any such entry, before recursion.
export function rejectWindowsReparseTrees(paths) {
  paths.forEach(relativePath);
  if (process.platform !== 'win32') return;
  const script = `$ErrorActionPreference='Stop'
$paths = ConvertFrom-Json -InputObject ([Console]::In.ReadToEnd())
$pending = [System.Collections.Generic.Stack[string]]::new()
foreach ($p in $paths) {
  $parts = @($p.Split('/'))
  for ($i=1; $i -le $parts.Length; $i++) {
    $prefix = [string]::Join('/', $parts[0..($i-1)])
    $attributes = [System.IO.File]::GetAttributes($prefix)
    if (($attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Reparse point forbidden' }
  }
  $pending.Push($p)
}
$seen = 0
while ($pending.Count -gt 0) {
  $p = $pending.Pop(); $seen++
  if ($seen -gt 400000) { throw 'Evidence entry bound exceeded' }
  $attributes = [System.IO.File]::GetAttributes($p)
  if (($attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Reparse point forbidden' }
  if (($attributes -band [System.IO.FileAttributes]::Directory) -ne 0) {
    foreach ($child in [System.IO.Directory]::EnumerateFileSystemEntries($p)) { $pending.Push($child) }
  }
}
`;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    { input: JSON.stringify(paths), encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 });
}
export function readChunks(guard, relative, visit) {
  const before = guard.check(relative);
  if (!before.isFile() || !integer(before.size, LIMITS.fileBytes)) throw new Error(`Unsupported source file size: ${relative}`);
  const hash = createHash('sha256'), fd = fs.openSync(relative, 'r'); let offset = 0;
  try {
    if (!sameStat(before, fs.fstatSync(fd))) throw new Error(`Source changed before streaming: ${relative}`);
    while (offset < before.size) {
      const bytes = Buffer.alloc(Math.min(CHUNK_BYTES, before.size - offset)); let received = 0;
      while (received < bytes.length) { const count = fs.readSync(fd, bytes, received, bytes.length - received, offset + received); if (!count) throw new Error(`Source truncated: ${relative}`); received += count; }
      hash.update(bytes); visit?.(bytes, offset); offset += bytes.length;
    }
    if (!sameStat(before, fs.fstatSync(fd)) || !sameStat(before, guard.check(relative))) throw new Error(`Source changed while streaming: ${relative}`);
    return { bytes: offset, sha256: hash.digest('hex') };
  } finally { fs.closeSync(fd); }
}
export const objectPath = hash => { if (!digest(hash)) throw new Error('Invalid object digest'); return `objects/sha256/${hash.slice(0, 2)}/${hash}.gz`; };
function uniquePaths(paths) {
  const seen = new Set();
  for (const value of paths) { relativePath(value); const key = value.toLowerCase(); if (seen.has(key)) throw new Error(`Case-aliased/duplicate path: ${value}`); seen.add(key); }
  for (const value of seen) { const parts = value.split('/'); for (let count = 1; count < parts.length; count++) if (seen.has(parts.slice(0, count).join('/'))) throw new Error('File/directory path collision'); }
}
export function validateManifest(manifest) {
  exactKeys(manifest, ['format', 'version', 'status', 'createdAt', 'origin', 'destination', 'chunkBytes', 'limits', 'codec', 'files', 'objects', 'artifacts', 'tools', 'totals', 'inventorySha256', 'objectsSha256', 'artifactsSha256', 'toolsSha256']);
  if (manifest.format !== 'lieguoji-ph05-local-evidence-archive' || manifest.version !== 2 || manifest.status !== 'complete'
    || manifest.origin !== ORIGIN || manifest.destination !== ARCHIVE || manifest.chunkBytes !== CHUNK_BYTES || !equal(manifest.limits, LIMITS)
    || !Number.isFinite(Date.parse(manifest.createdAt))) throw new Error('Unknown archive format/version/limits');
  exactKeys(manifest.codec, ['name', 'level', 'node', 'zlib']);
  if (manifest.codec.name !== 'gzip' || manifest.codec.level !== 6 || typeof manifest.codec.node !== 'string' || typeof manifest.codec.zlib !== 'string') throw new Error('Unknown codec');
  for (const [key, maximum] of [['files', LIMITS.files], ['objects', LIMITS.objects], ['artifacts', 32], ['tools', TOOL_PATHS.length]]) {
    if (!Array.isArray(manifest[key]) || !integer(manifest[key].length, maximum)) throw new Error(`Archive ${key} bound exceeded`);
  }
  if (!manifest.files.length) throw new Error('Empty source inventory is not a PH05 archive');
  const objects = new Map(), referenced = new Set(); let storedBytes = 0, uniqueBytes = 0, sourceBytes = 0;
  for (const object of manifest.objects) {
    exactKeys(object, ['sha256', 'bytes', 'gzipPath', 'gzipBytes', 'gzipSha256']);
    if (!digest(object.sha256) || objects.has(object.sha256) || !integer(object.bytes, CHUNK_BYTES) || !object.bytes
      || object.gzipPath !== objectPath(object.sha256) || !integer(object.gzipBytes, LIMITS.gzipBytes) || !object.gzipBytes || !digest(object.gzipSha256)) throw new Error('Invalid compressed object');
    objects.set(object.sha256, object); storedBytes += object.gzipBytes; uniqueBytes += object.bytes;
  }
  for (const file of manifest.files) {
    exactKeys(file, ['path', 'bytes', 'sha256', 'parts']); relativePath(file.path);
    if (!integer(file.bytes, LIMITS.fileBytes) || !digest(file.sha256) || !Array.isArray(file.parts) || file.parts.length !== Math.ceil(file.bytes / CHUNK_BYTES)) throw new Error('Invalid original file record');
    let length = 0;
    for (const part of file.parts) {
      exactKeys(part, ['object', 'offset', 'bytes']); const object = objects.get(part.object);
      if (!object || part.offset !== length || part.bytes !== Math.min(CHUNK_BYTES, file.bytes - length) || object.bytes !== part.bytes) throw new Error('Invalid chunk order/length/reference');
      length += part.bytes; referenced.add(part.object);
    }
    sourceBytes += length;
  }
  uniquePaths(manifest.files.map(file => file.path));
  if (!integer(sourceBytes, LIMITS.totalBytes) || !integer(storedBytes, LIMITS.archiveBytes) || referenced.size !== objects.size) throw new Error('Total size exceeded or unreferenced objects');
  for (const artifact of manifest.artifacts) {
    exactKeys(artifact, ['path', 'bytes', 'sha256']); relativePath(artifact.path);
    if (!integer(artifact.bytes, LIMITS.artifactBytes) || !digest(artifact.sha256)
      || !['README.md', 'restore-evidence-v2.mjs', 'archive-start.json'].includes(artifact.path)
        && !/^tool-sources\/[a-f0-9]{64}\/[a-z0-9.-]+\.mjs$/.test(artifact.path)) throw new Error('Unknown artifact path');
  }
  uniquePaths([...manifest.artifacts.map(file => file.path), ...manifest.objects.map(object => object.gzipPath), 'archive-manifest.json']);
  if (!['README.md', 'restore-evidence-v2.mjs', 'archive-start.json'].every(value => manifest.artifacts.some(row => row.path === value)) || manifest.artifacts.length !== TOOL_PATHS.length + 3) throw new Error('Missing archive tools/readme');
  if (manifest.tools.length !== TOOL_PATHS.length) throw new Error('Missing exact evaluator/collector sources');
  const toolSources = new Set();
  for (const tool of manifest.tools) {
    exactKeys(tool, ['source', 'path', 'bytes', 'sha256']);
    if (!TOOL_PATHS.includes(tool.source) || toolSources.has(tool.source) || !digest(tool.sha256)
      || tool.path !== `tool-sources/${tool.sha256}/${path.posix.basename(tool.source)}`
      || !manifest.artifacts.some(row => row.path === tool.path && row.bytes === tool.bytes && row.sha256 === tool.sha256)) throw new Error('Invalid exact tool source mapping');
    toolSources.add(tool.source);
  }
  exactKeys(manifest.totals, ['files', 'sourceBytes', 'objects', 'uniqueBytes', 'gzipBytes']);
  if (!equal(manifest.totals, { files: manifest.files.length, sourceBytes, objects: objects.size, uniqueBytes, gzipBytes: storedBytes })
    || manifest.inventorySha256 !== sha(JSON.stringify(manifest.files)) || manifest.objectsSha256 !== sha(JSON.stringify(manifest.objects))
    || manifest.artifactsSha256 !== sha(JSON.stringify(manifest.artifacts)) || manifest.toolsSha256 !== sha(JSON.stringify(manifest.tools))) throw new Error('Inventory digest/totals mismatch');
  return objects;
}
export function decodedObject(guard, object) {
  const compressed = guard.read(`${ARCHIVE}/${object.gzipPath}`, LIMITS.gzipBytes);
  if (compressed.length !== object.gzipBytes || sha(compressed) !== object.gzipSha256) throw new Error(`Compressed SHA/length mismatch: ${object.sha256}`);
  const bytes = gunzipSync(compressed, { maxOutputLength: object.bytes });
  if (bytes.length !== object.bytes || sha(bytes) !== object.sha256) throw new Error(`Original chunk SHA/length mismatch: ${object.sha256}`);
  return bytes;
}
export function verifyArchive(guard, manifest, includeManifest = true) {
  validateManifest(manifest); rejectWindowsReparseTrees([ARCHIVE]);
  const expected = [...manifest.artifacts.map(row => `${ARCHIVE}/${row.path}`), ...manifest.objects.map(row => `${ARCHIVE}/${row.gzipPath}`), ...(includeManifest ? [`${ARCHIVE}/archive-manifest.json`] : [])].sort();
  if (!equal(guard.inventory(ARCHIVE).map(row => row.path), expected)) throw new Error('Archive has missing/extra files (including incomplete/failure state)');
  for (const row of manifest.artifacts) { const bytes = guard.read(`${ARCHIVE}/${row.path}`, LIMITS.artifactBytes); if (bytes.length !== row.bytes || sha(bytes) !== row.sha256) throw new Error(`Artifact SHA mismatch: ${row.path}`); }
  for (const object of manifest.objects) decodedObject(guard, object);
}
function restore(output) {
  if (!/^\.autopilot\/ph05-restored-[a-z0-9-]+$/.test(output ?? '')) throw new Error('Use --out=.autopilot/ph05-restored-<new-lowercase-label>');
  const guard = projectRoot();
  if (guard.check(output, true)) throw new Error('Restore output must not exist; no overwrite or merge is supported');
  rejectWindowsReparseTrees([ARCHIVE]);
  const manifestBytes = guard.read(`${ARCHIVE}/archive-manifest.json`, LIMITS.manifestBytes), manifest = JSON.parse(manifestBytes.toString('utf8'));
  const objects = validateManifest(manifest); verifyArchive(guard, manifest);
  if (guard.check(output, true)) throw new Error('Restore output must not exist; no overwrite or merge is supported');
  guard.mkdir(output); rejectWindowsReparseTrees([output]);
  try {
    for (const file of manifest.files) {
      const target = relativePath(`${output}/${ORIGIN}/${file.path}`); guard.mkdir(path.posix.dirname(target));
      if (guard.check(target, true)) throw new Error('Unexpected existing restored file');
      const fd = fs.openSync(target, 'wx'), hash = createHash('sha256'); let written = 0;
      try {
        guard.check(target);
        for (const part of file.parts) {
          const bytes = decodedObject(guard, objects.get(part.object)); hash.update(bytes);
          let offset = 0; while (offset < bytes.length) { const count = fs.writeSync(fd, bytes, offset, bytes.length - offset, written + offset); if (!count) throw new Error('Short restored write'); offset += count; }
          written += bytes.length;
        }
        if (written !== file.bytes || hash.digest('hex') !== file.sha256) throw new Error(`Whole restored file mismatch: ${file.path}`);
        fs.fsyncSync(fd);
      } finally { fs.closeSync(fd); }
      const disk = readChunks(guard, target); if (disk.bytes !== file.bytes || disk.sha256 !== file.sha256) throw new Error(`Restored disk bytes mismatch: ${file.path}`);
    }
    const expected = manifest.files.map(row => `${output}/${ORIGIN}/${row.path}`).sort();
    if (!equal(guard.inventory(`${output}/${ORIGIN}`).map(row => row.path), expected)) throw new Error('Missing/extra restored original files');
    for (const row of manifest.artifacts) {
      const bytes = guard.read(`${ARCHIVE}/${row.path}`, LIMITS.artifactBytes);
      if (bytes.length !== row.bytes || sha(bytes) !== row.sha256) throw new Error(`Archive artifact changed before copying: ${row.path}`);
      guard.write(`${output}/.archive-tools/${row.path}`, bytes);
    }
    rejectWindowsReparseTrees([output]);
    guard.write(`${output}/restore-receipt.json`, Buffer.from(JSON.stringify({ format: 'lieguoji-ph05-evidence-restore', version: 2, status: 'byte-verified',
      restoredAt: new Date().toISOString(), archive: ARCHIVE, manifestSha256: sha(manifestBytes), inventorySha256: manifest.inventorySha256,
      output, files: manifest.files.length, bytes: manifest.totals.sourceBytes, evaluatorExecuted: false }, null, 2) + '\n'));
    console.log(JSON.stringify({ status: 'byte-verified', output, files: manifest.files.length, bytes: manifest.totals.sourceBytes, evaluatorExecuted: false }));
  } catch (error) {
    try { guard.write(`${output}/RESTORE_FAILED.json`, Buffer.from(JSON.stringify({ status: 'failed', at: new Date().toISOString(), error: String(error), partialFilesRetained: true }, null, 2) + '\n')); } catch { /* Preserve the original failure and existing bytes. */ }
    throw error;
  }
}
const invoked = process.argv[1] && samePath(path.resolve(process.argv[1]), fileURLToPath(import.meta.url));
if (invoked) {
  try {
    if (process.argv.length === 3 && process.argv[2] === '--help') console.log('Run from the exact private project root: node docs/evidence/ph05/restore-evidence-v2.mjs --out=.autopilot/ph05-restored-NEWLABEL\nReads only docs/evidence/ph05; rejects existing outputs; byte-verifies but never executes evaluators.');
    else if (process.argv.length === 3 && process.argv[2].startsWith('--out=')) restore(process.argv[2].slice(6));
    else throw new Error('One --out=.autopilot/ph05-restored-<new-label> is required');
  } catch (error) { console.error(String(error)); process.exitCode = 1; }
}
