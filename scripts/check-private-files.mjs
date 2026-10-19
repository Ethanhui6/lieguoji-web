#!/usr/bin/env node
// Push gate for private files only. Release readiness, PH gates, single-ref
// fast-forward, and HEAD binding are not checked here.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewedEvidenceFile, reviewedProjectConfig, unsafeCandidatePath } from './check-release.mjs';
import { reviewedHistoricalPath } from './reviewed-history.mjs';

export const PROCESSED_ASSET_DIR = 'public/original-ui';
export const LOCALIZATION_EXTRACTS = Object.freeze([
  `${PROCESSED_ASSET_DIR}/localization-zh-Hans.txt`,
  `${PROCESSED_ASSET_DIR}/localization-zh-Hant.txt`,
]);
const LOCALIZATION_EXTRACT_SET = new Set(LOCALIZATION_EXTRACTS);
const ZERO_OID = '0000000000000000000000000000000000000000';
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const PROCESSED_EXTENSIONS = new Set(['.png', '.woff2', '.json', '.txt', '.md']);
const README_NAMES = new Set(['readme', 'readme.md']);
// Culture naming CSVs reviewed in src/fms/play/native-culture/data/*.json.
// The UI localization.csv header line is not recorded in this repo.
export const ORIGINAL_LOCALIZATION_HEADER = Object.freeze([
  'Key', 'Chinese', 'English', 'TraditionalChinese', 'Russian', 'SpanishSpain',
  'PortugueseBrazil', 'German', 'Japanese', 'French', 'Polish', 'SpanishLatinAmerica',
  'PortuguesePortugal', 'Korean', 'Turkish',
]);
const GENERIC_CSV_LINE_LIMIT = 8;

function normalizePath(relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\0') || relative.includes('\\')) return null;
  const name = relative.replace(/^\.\//, '');
  if (name.startsWith('/') || /^[a-z]:/i.test(name)) return null;
  const parts = name.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) return null;
  return name;
}

function baseName(name) {
  return name.slice(name.lastIndexOf('/') + 1);
}

export function isProcessedAsset(relative) {
  const name = normalizePath(relative);
  if (!name || name === PROCESSED_ASSET_DIR || !name.startsWith(`${PROCESSED_ASSET_DIR}/`)) return false;
  const file = baseName(name);
  if (README_NAMES.has(file.toLowerCase())) return true;
  return PROCESSED_EXTENSIONS.has(path.posix.extname(file).toLowerCase());
}

export function localizationSourceNoted(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  return /(?:来源|source)\s*[:：][^\n]{0,240}localization\.csv/i.test(text.slice(0, 4096));
}

function csvCells(line) {
  return line.replace(/^\uFEFF/, '').trim().split(',').map(cell => cell.trim().replace(/^"|"$/g, ''));
}

/** True when text matches the reviewed Key+14 language header, or has more than 8 comma rows of at least 3 columns. */
export function localizationTableContent(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const header = csvCells(lines[0] ?? '');
  if (header.length === ORIGINAL_LOCALIZATION_HEADER.length && header.every((cell, index) => cell === ORIGINAL_LOCALIZATION_HEADER[index])) return true;
  let wide = 0;
  for (const line of lines) {
    if (/[(){};]/.test(line)) continue;
    if (csvCells(line).length >= 3) wide += 1;
    if (wide > GENERIC_CSV_LINE_LIMIT) return true;
  }
  return false;
}

function hardReason(name) {
  const lower = name.toLowerCase();
  const base = baseName(lower);
  const parts = lower.split('/');
  const ext = path.posix.extname(base);
  if (base === 'gameassembly.dll') return 'GameAssembly.dll';
  if (base === 'global-metadata.dat') return 'global-metadata.dat';
  if (base === 'dump.cs' || base === 'dump-filtered.cs' || parts.includes('dummydll')) return 'Il2CppDumper output';
  if (ext === '.vdf' || /^steam_api.*\.ini$/.test(base)) return 'Steam account config';
  if (/^localization.*\.csv$/.test(base)) return 'full localization.csv';
  if (base === 'envs.log') return 'envs.log';
  if (base === 'gameconfigdyv2.json') return 'gameConfigDyV2.json';
  if (ext === '.assets' || ext === '.ress' || ext === '.bundle') return 'original asset package';
  if (base === 'level0' || base.startsWith('level0.')) return 'level0 scene';
  if (ext === '.ttf' || ext === '.otf') return 'untrimmed font';
  if (ext === '.save') return 'save';
  if (ext === '.snk' || ext === '.keystore' || /decrypt[^/]*\.(?:bin|dat|json|txt)$/.test(lower)) return 'decryption key';
  if (ext === '.raw' || ext === '.dump' || parts.some(part => part === 'raw' || part === 'dump' || part === 'dumps')) return 'raw or dump file';
  if (LOCALIZATION_EXTRACT_SET.has(name) === false && (base === 'localization-zh-hans.txt' || base === 'localization-zh-hant.txt')) return 'localization extract outside public/original-ui';
  return null;
}

/** @returns {string | null} block reason, or null when the path may be pushed */
export function blockingReason(relative, options = {}) {
  const name = normalizePath(relative);
  if (!name) return 'unsafe path';
  const hard = hardReason(name);
  if (hard) return hard;
  if (localizationTableContent(options.text)) return 'localization table content';
  if (LOCALIZATION_EXTRACT_SET.has(name)) {
    if (!localizationSourceNoted(options.text)) return 'localization extract must name localization.csv as its source';
    return null;
  }
  if (name.startsWith(`${PROCESSED_ASSET_DIR}/`) && !isProcessedAsset(name)) return 'not an original-ui allowlisted file';
  if (unsafeCandidatePath(name) && options.reviewed !== true) return 'private path';
  return null;
}

export function pathsFromNameStatus(output) {
  const paths = new Set();
  for (const line of String(output).split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (!/^[ACDMRT]\d*$/.test(parts[0] ?? '')) continue;
    const code = parts[0][0];
    if (code === 'D') continue;
    if (code === 'R' || code === 'C') {
      if (parts[1]) paths.add(parts[1]);
      if (parts[2]) paths.add(parts[2]);
    } else if (parts[1]) paths.add(parts[1]);
  }
  return [...paths].sort();
}

function git(root, args, options = {}) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...options });
}

export function pathsChangedBetween(root, from, to) {
  const paths = new Set(pathsFromNameStatus(git(root, ['diff', '--name-status', '--find-renames', '--diff-filter=ACMRT', from, to])));
  if (from !== EMPTY_TREE) {
    try {
      for (const file of pathsFromNameStatus(git(root, ['log', `${from}..${to}`, '--pretty=format:', '--name-status', '--find-renames', '--diff-filter=ACMRT', '-m']))) paths.add(file);
    } catch { /* A shallow CI checkout may be unable to walk the range; the tip diff still applies. */ }
  }
  return [...paths].sort();
}

function readBlob(root, oid, relative) {
  try {
    return execFileSync('git', ['cat-file', 'blob', `${oid}:${relative}`], { cwd: root, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return null;
  }
}

function legacyReviewed(root, oid, relative) {
  const bytes = readBlob(root, oid, relative);
  if (!bytes) return false;
  return reviewedProjectConfig(root, relative, bytes) || reviewedEvidenceFile(root, relative, bytes) || reviewedHistoricalPath(root, relative, bytes);
}

export function violationsInRange(root, from, to) {
  const violations = [];
  for (const relative of pathsChangedBetween(root, from, to)) {
    const normalized = normalizePath(relative) ?? '';
    const extract = LOCALIZATION_EXTRACT_SET.has(normalized);
    const bytes = readBlob(root, to, relative);
    const text = bytes ? bytes.subarray(0, 262144).toString('utf8') : extract ? '' : undefined;
    const reviewed = !extract && unsafeCandidatePath(relative) ? legacyReviewed(root, to, relative) : false;
    const reason = blockingReason(relative, { text, reviewed });
    if (reason) violations.push({ path: relative, reason });
  }
  return violations;
}

function ancestorBase(root, localOid) {
  let listed = '';
  try { listed = git(root, ['rev-parse', '--remotes']); } catch { /* no remotes */ }
  const tips = listed.split('\n').map(line => line.trim()).filter(line => /^[0-9a-f]{40}$/i.test(line));
  let best = null;
  let bestCount = Infinity;
  for (const tip of tips) {
    try { git(root, ['merge-base', '--is-ancestor', tip, localOid]); } catch { continue; }
    const count = Number(git(root, ['rev-list', '--count', `${tip}..${localOid}`]).trim());
    if (count < bestCount) { best = tip; bestCount = count; }
  }
  if (best) return best;
  execFileSync('git', ['hash-object', '-t', 'tree', '--stdin'], { cwd: root, input: '', stdio: ['pipe', 'pipe', 'pipe'] });
  return EMPTY_TREE;
}

function checkRange(root, from, to) {
  let violations;
  try { violations = violationsInRange(root, from, to); }
  catch (error) { throw new Error(`Private-file check failed closed: ${error.message}`, { cause: error }); }
  if (!violations.length) return;
  const lines = violations.map(item => `Private file blocked: ${item.path} (${item.reason})`);
  throw new Error(lines.join('\n'));
}

function parsePrePush(input) {
  const updates = [];
  for (const line of input.split('\n')) {
    if (!line.trim()) continue;
    const [localRef, localOid, remoteRef, remoteOid] = line.trim().split(/\s+/);
    if (!localRef || !localOid || !remoteRef || !remoteOid) throw new Error('Invalid pre-push update');
    updates.push({ localRef, localOid, remoteRef, remoteOid });
  }
  return updates;
}

function main() {
  const args = process.argv.slice(2);
  const root = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
  if (args.includes('--pre-push')) {
    const updates = parsePrePush(readStdin());
    for (const update of updates) {
      if (!/^[0-9a-f]{40}$/i.test(update.localOid) || !/^[0-9a-f]{40}$/i.test(update.remoteOid)) throw new Error('Invalid push oid');
      if (update.localOid === ZERO_OID) continue;
      const from = update.remoteOid === ZERO_OID ? ancestorBase(root, update.localOid) : update.remoteOid;
      checkRange(root, from, update.localOid);
    }
    return;
  }
  let from;
  let to;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--from') from = args[++index];
    else if (args[index] === '--to') to = args[++index];
    else throw new Error('Usage: node scripts/check-private-files.mjs --pre-push | --from <oid> --to <oid> | --to <oid>');
  }
  if (!to) throw new Error('Usage: node scripts/check-private-files.mjs --pre-push | --from <oid> --to <oid> | --to <oid>');
  const base = from ?? ancestorBase(root, to);
  checkRange(root, base, to);
}

function readStdin() {
  return fs.readFileSync(0, 'utf8');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
