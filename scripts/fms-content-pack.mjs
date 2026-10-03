import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';
import { Buffer } from 'node:buffer';

/** Explicit, read-only extraction of a small content whitelist. This never
 * evaluates game code, reads saves/configuration or embeds machine paths. */
export const CONTENT_LIMITS = Object.freeze({ fileBytes: 2 * 1024 * 1024, inputBytes: 16 * 1024 * 1024, packBytes: 2 * 1024 * 1024,
  cultures: 32, files: 96, poolNames: 4096, totalNames: 20000, nameLength: 80, keyLength: 160 });
const CULTURE_ROOT = 'FantasyMapSimulator_Data/StreamingAssets/Base/Culture';
const SOURCE_PREFIX = 'Base/Culture/';
const ALLOWED_FILES = ['CultureData.json', 'CityNames.csv', 'StateNames.csv'];
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const hasControl = value => [...value].some(character => character.codePointAt(0) < 32 || character.codePointAt(0) === 127);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8');
const within = (parent, candidate) => { const relative = path.relative(parent, candidate); return relative === '' || !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative); };

function noLinks(absolute, allowMissing = false) {
  const root = path.parse(absolute).root;
  let cursor = root, missing = false;
  for (const part of path.relative(root, absolute).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    if (missing) continue;
    let stat;
    try { stat = fs.lstatSync(cursor); } catch (error) { if (allowMissing && error.code === 'ENOENT') { missing = true; continue; } throw error; }
    if (stat.isSymbolicLink()) throw new Error('Symbolic links and directory junctions are not allowed.');
  }
  return !missing;
}
function text(raw, maximum, label) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > maximum || raw.trim() !== raw || hasControl(raw)) throw new Error(`Invalid nonempty ${label}.`);
  return raw;
}

/** RFC-style quoted fields, including escaped quotes and multiline cells.
 * Callers validate display strings separately; columns are resolved by name. */
export function parseContentCsv(input) {
  input = input.replace(/^\uFEFF/, '');
  const rows = []; let row = [], value = '', quoted = false, closed = false;
  function field() { row.push(value); value = ''; closed = false; }
  function record() { field(); if (row.some(cell => cell.length)) rows.push(row); row = []; }
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted) {
      if (char === '"') { if (input[index + 1] === '"') { value += '"'; index++; } else { quoted = false; closed = true; } }
      else value += char;
    } else if (char === ',') field();
    else if (char === '\n' || char === '\r') { if (char === '\r' && input[index + 1] === '\n') index++; record(); }
    else if (char === '"') { if (value || closed) throw new Error('Unexpected quote in CSV field.'); quoted = true; }
    else { if (closed) throw new Error('Unexpected content after quoted CSV field.'); value += char; }
  }
  if (quoted) throw new Error('Unclosed CSV quote.');
  if (row.length || value || closed) record();
  if (rows.length < 2) throw new Error('A name CSV must contain a header and data.');
  const header = rows.shift();
  const ignoredUnnamedColumns = header.at(-1) === '' ? [header.length - 1] : [];
  const namedHeaders = ignoredUnnamedColumns.length ? header.slice(0, -1) : header;
  if (namedHeaders.some(value => !value || value.trim() !== value) || new Set(namedHeaders).size !== namedHeaders.length || !['Key', 'Chinese', 'English'].every(key => namedHeaders.includes(key))) throw new Error('CSV needs unique Key, Chinese and English headers.');
  if (rows.some(row => row.length !== header.length)) throw new Error('CSV row width differs from its header.');
  return { header, rows, ignoredUnnamedColumns };
}
function namesFromCsv(input, label, sourcePath, normalization) {
  const { header, rows, ignoredUnnamedColumns } = parseContentCsv(input);
  for (const column of ignoredUnnamedColumns) normalization.ignoredUnnamedHeaderColumns.push({ path: sourcePath, column: column + 1 });
  if (rows.length > CONTENT_LIMITS.poolNames) throw new Error(`${label} exceeds the name pool limit.`);
  const keyColumn = header.indexOf('Key'), zhColumn = header.indexOf('Chinese'), enColumn = header.indexOf('English'), keys = new Set();
  const zh = [], en = [];
  for (const [index, row] of rows.entries()) {
    const key = text(row[keyColumn], CONTENT_LIMITS.keyLength, label + ' source Key');
    if (keys.has(key)) throw new Error(`${label} contains a duplicate source Key.`);
    keys.add(key);
    for (const [language, column, output] of [['zh', zhColumn, zh], ['en', enColumn, en]]) {
      const raw = row[column];
      if (hasControl(raw)) throw new Error(`Invalid control character in ${label} display name.`);
      const name = text(raw.trim(), CONTENT_LIMITS.nameLength, label + ' ' + language + ' name');
      if (raw !== name) normalization.trimmedDisplayNames.push({ path: sourcePath, row: index + 2, language, key });
      output.push({ key, name });
    }
  }
  return { zh, en };
}

export function buildContentPack(source) {
  if (typeof source !== 'string' || !path.isAbsolute(source)) throw new Error('--source must be the explicit absolute game installation directory.');
  source = path.resolve(source); noLinks(source);
  if (!fs.statSync(source).isDirectory()) throw new Error('The game installation must be a directory.');
  const sourceReal = fs.realpathSync(source), cultureRoot = path.join(source, CULTURE_ROOT); noLinks(cultureRoot);
  if (!within(sourceReal, fs.realpathSync(cultureRoot))) throw new Error('Culture directory escapes the selected installation.');
  const directories = fs.readdirSync(cultureRoot, { withFileTypes: true }).sort((a, b) => compare(a.name, b.name));
  const files = [], cultures = [], normalization = { trimmedDisplayNames: [], ignoredUnnamedHeaderColumns: [] }; let inputBytes = 0, totalNames = 0;
  const decode = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  function readCultureFile(id, filename, optional = false) {
    if (!ID.test(id) || !ALLOWED_FILES.includes(filename)) throw new Error('File is outside the content whitelist.');
    const file = path.join(cultureRoot, id, filename);
    if (!within(cultureRoot, file)) throw new Error('Content path escapes the whitelist.');
    try { fs.lstatSync(file); } catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
    noLinks(file); const stat = fs.statSync(file);
    if (!stat.isFile() || !within(sourceReal, fs.realpathSync(file)) || stat.size < 1 || stat.size > CONTENT_LIMITS.fileBytes) throw new Error('Content file has an invalid location, type or size.');
    const bytes = fs.readFileSync(file); inputBytes += bytes.length;
    if (bytes.length !== stat.size || inputBytes > CONTENT_LIMITS.inputBytes || files.length >= CONTENT_LIMITS.files) throw new Error('Content input changed or exceeds its bounded budget.');
    files.push({ path: SOURCE_PREFIX + id + '/' + filename, sha256: hash(bytes), bytes: bytes.length });
    return decode(bytes);
  }
  for (const directory of directories) {
    if (directory.isSymbolicLink()) throw new Error('Culture links are not allowed.');
    if (!directory.isDirectory()) continue;
    if (!ID.test(directory.name) || cultures.length >= CONTENT_LIMITS.cultures) throw new Error('Invalid culture ID or too many cultures.');
    const id = directory.name, definition = readCultureFile(id, 'CultureData.json', true);
    let displayName = { zh: id, en: id }, color = null, nameOrder = null;
    if (definition !== null) {
      const data = JSON.parse(definition);
      if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.MapCultureTranslations) || data.MapCultureTranslations.length < 2
        || typeof data.CultureColorHex !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(data.CultureColorHex) || !['FirstNameFirst', 'LastNameFirst'].includes(data.NameOrder)) throw new Error('Culture metadata lacks its documented name, color or name order.');
      displayName = { zh: text(data.MapCultureTranslations[0], CONTENT_LIMITS.nameLength, id + ' Chinese display name'), en: text(data.MapCultureTranslations[1], CONTENT_LIMITS.nameLength, id + ' English display name') };
      color = data.CultureColorHex; nameOrder = data.NameOrder === 'LastNameFirst' ? 'family-first' : 'given-first';
    }
    const countries = namesFromCsv(readCultureFile(id, 'StateNames.csv'), id + ' countries', SOURCE_PREFIX + id + '/StateNames.csv', normalization);
    const cities = namesFromCsv(readCultureFile(id, 'CityNames.csv'), id + ' cities', SOURCE_PREFIX + id + '/CityNames.csv', normalization);
    totalNames += 2 * (countries.zh.length + cities.zh.length);
    if (totalNames > CONTENT_LIMITS.totalNames) throw new Error('The combined name count exceeds its limit.');
    cultures.push({ id, displayName, color, nameOrder,
      names: { zh: { countries: countries.zh, cities: cities.zh }, en: { countries: countries.en, cities: cities.en } },
      sourceFiles: files.filter(file => file.path.startsWith(SOURCE_PREFIX + id + '/')).map(file => file.path).sort(compare) });
  }
  if (!cultures.length) throw new Error('No culture name content was found.');
  files.sort((a, b) => compare(a.path, b.path));
  const pack = { format: 'world-culture-content-pack', version: 1, source: { label: 'Fantasy Map Simulator · Base/Culture', files }, cultures };
  const bytes = encode(pack);
  if (bytes.length > CONTENT_LIMITS.packBytes) throw new Error('The output content pack exceeds 2 MiB.');
  const manifest = { format: 'world-culture-content-manifest', version: 1, pack: { file: 'culture-content-pack.json', sha256: hash(bytes), bytes: bytes.length }, sourceFiles: files, normalization,
    counts: { cultures: cultures.length, files: files.length, totalNames, byCulture: cultures.map(culture => ({ id: culture.id,
      countriesPerLanguage: culture.names.zh.countries.length, citiesPerLanguage: culture.names.zh.cities.length,
      duplicateDisplayNames: Object.fromEntries(['zh', 'en'].map(language => [language, Object.fromEntries(['countries', 'cities'].map(kind => [kind, culture.names[language][kind].length - new Set(culture.names[language][kind].map(row => row.name)).size]))])) })) } };
  return { pack, manifest, bytes };
}

/** Existing exact bytes are a no-op. Different user output is preserved and
 * requires another explicit --out directory, never an implicit overwrite. */
export function extractContentPack({ source, out }) {
  if (typeof out !== 'string' || !out.trim()) throw new Error('--out must be an explicit output directory.');
  const destination = path.resolve(out), selectedSource = path.resolve(source);
  if (within(selectedSource, destination) || within(destination, selectedSource)) throw new Error('Output must not overlap the selected game installation.');
  noLinks(destination, true);
  const result = buildContentPack(source), outputs = [{ name: 'culture-content-pack.json', bytes: result.bytes }, { name: 'manifest.json', bytes: encode(result.manifest) }];
  if (fs.existsSync(destination) && !fs.statSync(destination).isDirectory()) throw new Error('Output must be a directory.');
  for (const output of outputs) {
    const file = path.join(destination, output.name); if (!noLinks(file, true)) continue;
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size !== output.bytes.length || !fs.readFileSync(file).equals(output.bytes)) throw new Error('Existing output differs or is linked; it has been preserved. Choose a new --out directory.');
  }
  fs.mkdirSync(destination, { recursive: true }); noLinks(destination);
  for (const output of outputs) {
    const file = path.join(destination, output.name);
    if (!fs.existsSync(file)) fs.writeFileSync(file, output.bytes, { flag: 'wx' });
  }
  return result.manifest;
}
export function parseContentArguments(args) {
  if (args.length === 1 && args[0] === '--help') return null;
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    if (!['--source', '--out'].includes(key) || typeof args[index + 1] !== 'string' || args[index + 1].startsWith('--') || key in options) throw new Error('Use --source <absolute game directory> --out <output directory>.');
    options[key] = args[index + 1];
  }
  if (!options['--source'] || !options['--out']) throw new Error('Both --source and --out are required; no default folders are scanned.');
  return { source: options['--source'], out: options['--out'] };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseContentArguments(process.argv.slice(2));
    if (!options) console.log('Usage: node scripts/fms-content-pack.mjs --source <absolute FantasyMapSimulator directory> --out <output directory>');
    else { const manifest = extractContentPack(options); console.log(JSON.stringify({ pack: manifest.pack, counts: manifest.counts }, null, 2)); }
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
