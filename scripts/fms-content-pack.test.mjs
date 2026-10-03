import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { CONTENT_LIMITS, buildContentPack, extractContentPack, parseContentArguments, parseContentCsv } from './fms-content-pack.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), temporaryParent = path.join(project, '.autopilot');
const CULTURE = 'FantasyMapSimulator_Data/StreamingAssets/Base/Culture';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture(callback) {
  fs.mkdirSync(temporaryParent, { recursive: true });
  const root = fs.mkdtempSync(path.join(temporaryParent, 'fms-content-test-')), source = path.join(root, 'game'), out = path.join(root, 'pack');
  function write(relative, value) { const file = path.join(source, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); }
  function culture(id = 'Bay', metadata = true) {
    if (metadata) write(`${CULTURE}/${id}/CultureData.json`, JSON.stringify({ CultureName: 'ignored source-only field', CultureColorHex: '#447788', NameOrder: 'LastNameFirst', MapCultureTranslations: ['海湾文化', 'Bay Culture'], PoliticalSystemProbabilities: { unused: 500 }, unsupportedAlgorithm: 'not included' }));
    write(`${CULTURE}/${id}/StateNames.csv`, '\uFEFFEnglish,Key,Chinese\r\n"The ""Bay"", North",bay-state,北湾\r\n');
    write(`${CULTURE}/${id}/CityNames.csv`, 'Key,Chinese,TraditionalChinese,English\nport,港城,港城,Port City\nriver,河城,河城,River City\n');
  }
  culture();
  try { return callback({ root, source, out, write, culture }); }
  finally {
    const parent = fs.realpathSync(temporaryParent), target = fs.realpathSync(root);
    assert(target.startsWith(parent + path.sep + 'fms-content-test-'));
    assert.equal(path.dirname(target), parent);
    fs.rmSync(target, { recursive: true, force: false });
  }
}

test('CLI requires both explicit directories and rejects repeated or unknown arguments', () => {
  assert.equal(parseContentArguments(['--help']), null);
  assert.deepEqual(parseContentArguments(['--out', 'selected-output', '--source', 'selected-source']), { source: 'selected-source', out: 'selected-output' });
  for (const args of [[], ['--source', 'a'], ['--out', 'b'], ['--source', 'a', '--out', 'b', '--force', 'yes'], ['--source', 'a', '--out', 'b', '--source', 'c'], ['--source', '--out', 'b']]) assert.throws(() => parseContentArguments(args));
  assert.throws(() => buildContentPack('relative-source'), /absolute/);
});

test('CSV quotes, embedded commas, BOM, CRLF, multiline cells and header order are parsed explicitly', () => {
  const value = parseContentCsv('\uFEFFEnglish,Key,Chinese\r\n"The ""Bay"", North",bay,北湾\r\n"River\r\nCity",river,河城\r\n');
  assert.deepEqual(value.header, ['English', 'Key', 'Chinese']);
  assert.deepEqual(value.rows, [['The "Bay", North', 'bay', '北湾'], ['River\r\nCity', 'river', '河城']]);
  for (const bad of ['Key,Chinese,English\n"x,b,c', 'Key,Chinese,English\n"a"oops,b,c', 'Key,Chinese,English\na"b,c,d',
    'Key,Chinese,English\nx,一', 'Key,Key,Chinese,English\nx,x,一,One', 'Key,Chinese\nx,一', 'Key,Chinese,English\n']) assert.throws(() => parseContentCsv(bad));
});

test('extracts only whitelisted bilingual names and known metadata, with exact source hashes and no host paths', () => fixture(({ source, out, write, culture }) => {
  culture('WorldII', false);
  // Deliberately invalid excluded files demonstrate they are not parsed or run.
  write(`${CULTURE}/Bay/CharacterFirstNames_Male.csv`, 'malformed');
  write('FantasyMapSimulator_Data/StreamingAssets/gameConfigDyV2.json', 'not JSON');
  write('FantasyMapSimulator_Data/StreamingAssets/JS/execute.js', 'throw new Error("MUST NOT EXECUTE")');
  const manifest = extractContentPack({ source, out }), bytes = fs.readFileSync(path.join(out, 'culture-content-pack.json')), pack = JSON.parse(bytes);
  assert.deepEqual(Object.keys(pack), ['format', 'version', 'source', 'cultures']);
  assert.equal(pack.format, 'world-culture-content-pack'); assert.equal(pack.version, 1);
  assert.equal(pack.cultures.length, 2); assert.equal(pack.source.files.length, 5);
  const bay = pack.cultures[0];
  assert.equal(bay.id, 'Bay'); assert.deepEqual(bay.displayName, { zh: '海湾文化', en: 'Bay Culture' }); assert.equal(bay.color, '#447788'); assert.equal(bay.nameOrder, 'family-first');
  assert.deepEqual(bay.names.zh.countries, [{ key: 'bay-state', name: '北湾' }]);
  assert.deepEqual(bay.names.en.countries, [{ key: 'bay-state', name: 'The "Bay", North' }]);
  assert.deepEqual(bay.names.en.cities, [{ key: 'port', name: 'Port City' }, { key: 'river', name: 'River City' }]);
  assert.deepEqual(pack.cultures[1].displayName, { zh: 'WorldII', en: 'WorldII' }); assert.equal(pack.cultures[1].color, null); assert.equal(pack.cultures[1].nameOrder, null);
  assert.equal(manifest.counts.totalNames, 12); assert.equal(manifest.pack.sha256, hash(bytes)); assert.equal(manifest.pack.bytes, bytes.length);
  assert(!bytes.toString('utf8').includes(source)); assert(!bytes.toString('utf8').includes('PoliticalSystemProbabilities')); assert(!bytes.toString('utf8').includes('unsupportedAlgorithm'));
  for (const file of pack.source.files) {
    assert.match(file.path, /^Base\/Culture\/(Bay|WorldII)\/(CultureData\.json|CityNames\.csv|StateNames\.csv)$/);
    const original = fs.readFileSync(path.join(source, 'FantasyMapSimulator_Data/StreamingAssets', file.path));
    assert.equal(file.sha256, hash(original)); assert.equal(file.bytes, original.length);
  }
  assert.deepEqual(bay.sourceFiles, ['Base/Culture/Bay/CityNames.csv', 'Base/Culture/Bay/CultureData.json', 'Base/Culture/Bay/StateNames.csv']);
}));

test('repeated extraction is byte reproducible and does not rewrite files; differing output remains intact', () => fixture(({ source, out, write }) => {
  const first = extractContentPack({ source, out }), files = ['culture-content-pack.json', 'manifest.json'];
  const before = files.map(name => ({ name, bytes: fs.readFileSync(path.join(out, name)), mtime: fs.statSync(path.join(out, name)).mtimeMs }));
  assert.deepEqual(extractContentPack({ source, out }), first);
  for (const file of before) { assert.deepEqual(fs.readFileSync(path.join(out, file.name)), file.bytes); assert.equal(fs.statSync(path.join(out, file.name)).mtimeMs, file.mtime); }
  write(`${CULTURE}/Bay/CityNames.csv`, 'Key,Chinese,English\nport,新港城,New Port\n');
  assert.throws(() => extractContentPack({ source, out }), /preserved/);
  for (const file of before) assert.deepEqual(fs.readFileSync(path.join(out, file.name)), file.bytes);
}));

test('rejects duplicate keys, empty translations, control characters, overlong names and excessive pools before writing', () => {
  for (const csv of ['Key,Chinese,English\nx,甲,One\nx,乙,Two\n', 'Key,Chinese,English\nx,,One\n', 'Key,Chinese,English\n,甲,One\n',
    'Key,Chinese,English\nx,甲,"Line\nBreak"\n', `Key,Chinese,English\nx,甲,${'a'.repeat(CONTENT_LIMITS.nameLength + 1)}\n`,
    'Key,Chinese,English\n' + Array.from({ length: CONTENT_LIMITS.poolNames + 1 }, (_, index) => `k${index},甲,One`).join('\n')]) {
    fixture(({ source, out, write }) => { write(`${CULTURE}/Bay/CityNames.csv`, csv); assert.throws(() => extractContentPack({ source, out })); assert.equal(fs.existsSync(out), false); });
  }
});

test('retains distinct source keys with the same display name and reports homonyms without discarding data', () => fixture(({ source, write }) => {
  write(`${CULTURE}/Bay/CityNames.csv`, 'Key,Chinese,English\nport,同名,Same Name\nriver,同名,Same Name\n');
  const { pack, manifest } = buildContentPack(source);
  assert.deepEqual(pack.cultures[0].names.zh.cities.map(row => row.key), ['port', 'river']);
  assert.equal(manifest.counts.byCulture[0].duplicateDisplayNames.zh.cities, 1); assert.equal(manifest.counts.byCulture[0].duplicateDisplayNames.en.cities, 1);
}));

test('records only bounded display-name trimming and ignored trailing unnamed language columns', () => fixture(({ source, out, write }) => {
  const csv = 'Key,Chinese,English,\noriginal-key, 港城 , Port City ,unselected language\n';
  write(`${CULTURE}/Bay/CityNames.csv`, csv);
  const manifest = extractContentPack({ source, out }), pack = JSON.parse(fs.readFileSync(path.join(out, 'culture-content-pack.json')));
  assert.deepEqual(pack.cultures[0].names.zh.cities, [{ key: 'original-key', name: '港城' }]);
  assert.deepEqual(pack.cultures[0].names.en.cities, [{ key: 'original-key', name: 'Port City' }]);
  assert.deepEqual(manifest.normalization, { trimmedDisplayNames: [
    { path: 'Base/Culture/Bay/CityNames.csv', row: 2, language: 'zh', key: 'original-key' },
    { path: 'Base/Culture/Bay/CityNames.csv', row: 2, language: 'en', key: 'original-key' },
  ], ignoredUnnamedHeaderColumns: [{ path: 'Base/Culture/Bay/CityNames.csv', column: 4 }] });
  const original = fs.readFileSync(path.join(source, CULTURE, 'Bay', 'CityNames.csv'));
  assert.equal(original.toString('utf8'), csv);
  assert.equal(pack.source.files.find(file => file.path.endsWith('CityNames.csv')).sha256, hash(original));
  for (const invalid of ['Key,,Chinese,English\nx,ignored,甲,One\n', 'Key,Chinese,English,,\nx,甲,One,ignored,ignored\n', 'Key,Chinese,English,\n x ,甲,One,ignored\n']) {
    write(`${CULTURE}/Bay/CityNames.csv`, invalid); assert.throws(() => buildContentPack(source));
  }
}));

test('rejects malformed metadata and byte budgets without producing partial output', () => {
  for (const metadata of ['{bad json', JSON.stringify({ MapCultureTranslations: ['One', 'Two'], CultureColorHex: 'red', NameOrder: 'LastNameFirst' }),
    JSON.stringify({ MapCultureTranslations: ['One', 'Two'], CultureColorHex: '#123456', NameOrder: 'Unknown' }), ' '.repeat(CONTENT_LIMITS.fileBytes + 1)]) {
    fixture(({ source, out, write }) => { write(`${CULTURE}/Bay/CultureData.json`, metadata); assert.throws(() => extractContentPack({ source, out })); assert.equal(fs.existsSync(out), false); });
  }
});

test('output cannot overlap the installation and symlinked content or output directories are rejected', () => fixture(({ root, source, out, write }) => {
  assert.throws(() => extractContentPack({ source, out: source }), /overlap/);
  assert.throws(() => extractContentPack({ source, out: path.join(source, 'new-output') }), /overlap/);
  assert.throws(() => extractContentPack({ source, out: root }), /overlap/);
  const outside = path.join(root, 'outside'); fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'sentinel.txt'), 'untouched');
  fs.symlinkSync(outside, out, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => extractContentPack({ source, out }), /links|junctions/); assert.equal(fs.readFileSync(path.join(outside, 'sentinel.txt'), 'utf8'), 'untouched');
  const cultureLink = path.join(source, CULTURE, 'Linked'); fs.symlinkSync(outside, cultureLink, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => buildContentPack(source), /links/);
  fs.unlinkSync(cultureLink);
  const metadata = path.join(source, CULTURE, 'Bay', 'CultureData.json'), moved = path.join(outside, 'metadata.json'); fs.copyFileSync(metadata, moved); fs.unlinkSync(metadata);
  // Windows permits a junction without granting process-wide symlink privilege.
  // Both exercise the same lstat link guard at the whitelisted JSON pathname.
  fs.symlinkSync(process.platform === 'win32' ? outside : moved, metadata, process.platform === 'win32' ? 'junction' : 'file');
  assert.throws(() => buildContentPack(source), /links|junctions/);
  write('FantasyMapSimulator_Data/StreamingAssets/unused.txt', 'still not read');
}));

test('linked existing output files cannot alias and overwrite original content', () => fixture(({ source, out }) => {
  fs.mkdirSync(out); const sourceFile = path.join(source, CULTURE, 'Bay', 'StateNames.csv'), before = fs.readFileSync(sourceFile);
  fs.linkSync(sourceFile, path.join(out, 'culture-content-pack.json'));
  assert.throws(() => extractContentPack({ source, out }), /linked|preserved/);
  assert.deepEqual(fs.readFileSync(sourceFile), before); assert.equal(fs.existsSync(path.join(out, 'manifest.json')), false);
}));
