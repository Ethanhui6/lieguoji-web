import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { projectRoot } from './check-plan.mjs';
import { blockingReason, isProcessedAsset, localizationSourceNoted, pathsFromNameStatus, PROCESSED_ASSET_DIR, violationsInRange } from './check-private-files.mjs';

const hans = '来源：原作 localization.csv 的简体中文摘录，不是整份原文件。\n城\n';
const hant = '来源：原作 localization.csv 的繁体中文摘录，不是整份原文件。\n城\n';
const blocked = [
  'FantasyMapSimulator_Data/resources.assets',
  'FantasyMapSimulator_Data/sharedassets0.assets',
  'FantasyMapSimulator_Data/level0',
  'FantasyMapSimulator_Data/level0.resS',
  'bundles/ui.bundle',
  'fonts/source.ttf',
  'fonts/source.otf',
  'keys/decrypt.bin',
  'saves/player.save',
  'envs.log',
  'nested/envs.log',
  'Config/gameConfigDyV2.json',
  'capture/raw/frame.bin',
  'tools/dump/out.bin',
  'notes.dump',
  'mesh.raw',
  '.autopilot/state.json',
  'references/private/source.png',
  'notes.log',
  '.env',
  'archive.zip',
  'GameAssembly.dll',
  'build/GameAssembly.dll',
  'il2cpp/global-metadata.dat',
  'DummyDll/Assembly-CSharp.dll',
  'nested/DummyDll/x.dll',
  'il2cpp/dump.cs',
  'il2cpp/dump-filtered.cs',
  'steam/loginusers.vdf',
  'steam/steam_api.ini',
  'steam/steam_api64.ini',
  'localization.csv',
  'data/Localization.csv',
  `${PROCESSED_ASSET_DIR}/localization.csv`,
  `${PROCESSED_ASSET_DIR}/font.ttf`,
  `${PROCESSED_ASSET_DIR}/gameConfigDyV2.json`,
  'docs/localization-zh-Hans.txt',
];

test('private files are blocked and processed original-ui assets with a named source can pass', () => {
  for (const file of blocked) assert.ok(blockingReason(file), file);
  assert.match(blockingReason(`${PROCESSED_ASSET_DIR}/localization-zh-Hans.txt`, { text: '城' }), /source/);
  assert.equal(blockingReason(`${PROCESSED_ASSET_DIR}/localization-zh-Hans.txt`, { text: hans }), null);
  assert.equal(blockingReason(`${PROCESSED_ASSET_DIR}/localization-zh-Hant.txt`, { text: hant }), null);
  assert.equal(blockingReason(`${PROCESSED_ASSET_DIR}/atlas.png`), null);
  assert.equal(blockingReason(`${PROCESSED_ASSET_DIR}/subset.woff2`), null);
  assert.equal(blockingReason(`${PROCESSED_ASSET_DIR}/meta.webp`), null);
  assert.equal(blockingReason(`${PROCESSED_ASSET_DIR}/meta.json`), null);
  assert.equal(blockingReason(`${PROCESSED_ASSET_DIR}/README.md`), null);
  assert.equal(blockingReason(`${PROCESSED_ASSET_DIR}/SOURCES.json`), null);
  assert.equal(isProcessedAsset(`${PROCESSED_ASSET_DIR}/SOURCES.json`), true);
  const sources = fs.readFileSync(path.join(projectRoot, `${PROCESSED_ASSET_DIR}/SOURCES.json`), 'utf8');
  assert.match(sources, /来源：[\s\S]{0,240}localization\.csv/);
  assert.match(sources, /localization-zh-Hans\.txt/);
  assert.match(sources, /localization-zh-Hant\.txt/);
  assert.equal(blockingReason('src/sim/core.ts'), null);
  assert.equal(blockingReason('public/fonts/ui.woff2'), null);
  assert.equal(blockingReason('steam/notsteam_api.ini'), null);
  assert.equal(blockingReason('.npmrc', { reviewed: true }), null);
  assert.equal(isProcessedAsset(`${PROCESSED_ASSET_DIR}/atlas.png`), true);
  assert.equal(isProcessedAsset(`${PROCESSED_ASSET_DIR}/subset.woff2`), true);
  assert.equal(isProcessedAsset('src/sim/core.ts'), false);
  assert.equal(localizationSourceNoted('source: localization.csv\n'), true);
  assert.deepEqual(pathsFromNameStatus('A\tsrc/app.ts\nD\tGameAssembly.dll\nR100\told.dll\treadme.md\n'), ['old.dll', 'readme.md', 'src/app.ts']);
});

function gitRepo() {
  const parent = path.join(projectRoot, '.autopilot');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'private-files-'));
  execFileSync('git', ['init', '--quiet'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'private-files@example.invalid'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Private Files Test'], { cwd: root, stdio: 'ignore' });
  return root;
}
function write(root, relative, contents) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}
function commit(root, message) {
  execFileSync('git', ['add', '-A'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['commit', '--quiet', '-m', message], { cwd: root, stdio: 'ignore' });
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
}
function removeRepo(root) {
  const parent = path.join(projectRoot, '.autopilot');
  const target = fs.realpathSync(root);
  assert.ok(target.startsWith(`${fs.realpathSync(parent)}${path.sep}private-files-`));
  fs.rmSync(target, { recursive: true, force: false });
}
function runCheck(root, args) {
  return spawnSync(process.execPath, [path.join(projectRoot, 'scripts/check-private-files.mjs'), ...args], { cwd: root, encoding: 'utf8' });
}

test('a push range blocks private files, allows processed assets, and ignores unpushed files', () => {
  const root = gitRepo();
  try {
    write(root, 'src/app.ts', 'export const value = 1;\n');
    const base = commit(root, 'code');
    write(root, `${PROCESSED_ASSET_DIR}/atlas.png`, 'png');
    write(root, `${PROCESSED_ASSET_DIR}/subset.woff2`, 'woff2');
    write(root, `${PROCESSED_ASSET_DIR}/SOURCES.json`, '{"source":"来源：localization.csv"}\n');
    write(root, `${PROCESSED_ASSET_DIR}/localization-zh-Hans.txt`, hans);
    write(root, `${PROCESSED_ASSET_DIR}/localization-zh-Hant.txt`, hant);
    const good = commit(root, 'assets');
    assert.deepEqual(violationsInRange(root, base, good), []);
    const allowed = runCheck(root, ['--from', base, '--to', good]);
    assert.equal(allowed.status, 0, allowed.stderr);

    write(root, 'GameAssembly.dll', 'dll');
    const untracked = runCheck(root, ['--from', base, '--to', good]);
    assert.equal(untracked.status, 0, untracked.stderr);
    fs.unlinkSync(path.join(root, 'GameAssembly.dll'));

    for (const [file, contents] of [
      ['GameAssembly.dll', 'dll'],
      ['il2cpp/global-metadata.dat', 'meta'],
      ['DummyDll/Assembly-CSharp.dll', 'dummy'],
      ['il2cpp/dump.cs', 'dump'],
      ['il2cpp/dump-filtered.cs', 'filtered'],
      ['steam/loginusers.vdf', 'vdf'],
      ['steam/steam_api64.ini', 'ini'],
      ['localization.csv', 'id,zh\n'],
      [`${PROCESSED_ASSET_DIR}/localization.csv`, 'id,zh\n'],
      ['FantasyMapSimulator_Data/level0', 'scene'],
      ['fonts/source.ttf', 'ttf'],
      ['saves/player.save', 'save'],
      ['envs.log', 'log'],
      ['gameConfigDyV2.json', '{}'],
      ['references/private/source.png', 'png'],
    ]) write(root, file, contents);
    const bad = commit(root, 'private');
    const blockedPush = runCheck(root, ['--from', good, '--to', bad]);
    assert.equal(blockedPush.status, 1);
    for (const file of ['GameAssembly.dll', 'global-metadata.dat', 'DummyDll/Assembly-CSharp.dll', 'dump.cs', 'dump-filtered.cs', 'loginusers.vdf', 'steam_api64.ini', 'localization.csv', 'level0', 'source.ttf', 'player.save', 'envs.log', 'gameConfigDyV2.json', 'references/private/source.png']) {
      assert.match(blockedPush.stderr, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    write(root, `${PROCESSED_ASSET_DIR}/localization-zh-Hans.txt`, '城\n');
    const missingSource = commit(root, 'missing source');
    const source = runCheck(root, ['--from', bad, '--to', missingSource]);
    assert.equal(source.status, 1);
    assert.match(source.stderr, /localization-zh-Hans\.txt/);
  } finally { removeRepo(root); }
});

function installHook(root) {
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  for (const file of ['check-private-files.mjs', 'check-release.mjs', 'check-plan.mjs', 'release-policy.mjs', 'reviewed-history.mjs']) {
    fs.copyFileSync(path.join(projectRoot, 'scripts', file), path.join(root, 'scripts', file));
  }
  fs.mkdirSync(path.join(root, '.githooks'), { recursive: true });
  const hook = path.join(root, '.githooks/pre-push');
  fs.copyFileSync(path.join(projectRoot, '.githooks/pre-push'), hook);
  fs.chmodSync(hook, 0o755);
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root, stdio: 'ignore' });
  return hook;
}

test('pre-push blocks private files in the pushed commits and still accepts ordinary code, tags, and multiple refs', () => {
  const root = gitRepo();
  try {
    const hook = installHook(root);
    write(root, 'src/app.ts', 'export const value = 1;\n');
    const base = commit(root, 'code');
    write(root, `${PROCESSED_ASSET_DIR}/atlas.png`, 'png');
    write(root, `${PROCESSED_ASSET_DIR}/subset.woff2`, 'woff2');
    const good = commit(root, 'assets');
    const push = input => spawnSync('/bin/sh', [hook, 'origin', 'https://example.invalid/repo.git'], { cwd: root, input, encoding: 'utf8' });
    const goodLine = `refs/heads/topic ${good} refs/heads/topic ${base}\n`;
    const accepted = push(goodLine);
    assert.equal(accepted.status, 0, accepted.stderr + accepted.stdout);
    const several = push(goodLine + `refs/tags/v0 ${good} refs/tags/v0 ${'0'.repeat(40)}\n`);
    assert.equal(several.status, 0, several.stderr + several.stdout);
    assert.equal(push('').status, 0);
    write(root, 'src/app.ts', 'export const value = 2;\n');
    const code = commit(root, 'code change');
    const codePush = push(`refs/heads/topic ${code} refs/heads/topic ${good}\n`);
    assert.equal(codePush.status, 0, codePush.stderr + codePush.stdout);
    write(root, 'GameAssembly.dll', 'dll');
    const hidden = commit(root, 'add dll');
    execFileSync('git', ['rm', '--quiet', 'GameAssembly.dll'], { cwd: root, stdio: 'ignore' });
    const removed = commit(root, 'remove dll');
    const stillBlocked = push(`refs/heads/topic ${removed} refs/heads/topic ${code}\n`);
    assert.equal(stillBlocked.status, 1, stillBlocked.stdout);
    assert.match(stillBlocked.stderr, /GameAssembly\.dll/);
    assert.notEqual(hidden, removed);
  } finally { removeRepo(root); }
});

const blockedPushes = [
  ['keys/decrypt.bin', 'key'],
  ['saves/player.save', 'save'],
  ['FantasyMapSimulator_Data/resources.assets', 'assets'],
  ['FantasyMapSimulator_Data/level0', 'scene'],
  ['fonts/source.ttf', 'ttf'],
  ['envs.log', 'log'],
  ['gameConfigDyV2.json', '{}'],
  ['GameAssembly.dll', 'dll'],
  ['il2cpp/global-metadata.dat', 'meta'],
  ['il2cpp/dump.cs', 'dump'],
  ['il2cpp/dump-filtered.cs', 'filtered'],
  ['DummyDll/Assembly-CSharp.dll', 'dummy'],
  ['steam/loginusers.vdf', 'vdf'],
  ['steam/steam_api64.ini', 'ini'],
  ['localization.csv', 'id,zh\n'],
  ['FantasyMapSimulator_Data/sharedassets0.assets.resS', 'ress'],
  ['bundles/ui.bundle', 'bundle'],
  ['capture/raw/frame.bin', 'raw'],
];

test('a fake remote rejects eighteen private classes and accepts original-ui png and woff2', () => {
  assert.equal(blockedPushes.length, 18);
  const root = gitRepo();
  const remote = path.join(root, '..', `private-remote-${path.basename(root)}`);
  try {
    installHook(root);
    execFileSync('git', ['init', '--bare', '--quiet', remote], { stdio: 'ignore' });
    execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: root, stdio: 'ignore' });
    const push = () => spawnSync('git', ['push', 'origin', 'HEAD:refs/heads/topic'], { cwd: root, encoding: 'utf8' });
    write(root, 'src/app.ts', 'export const value = 1;\n');
    commit(root, 'code');
    const code = push();
    assert.equal(code.status, 0, code.stderr + code.stdout);
    write(root, `${PROCESSED_ASSET_DIR}/icon.png`, 'png');
    write(root, `${PROCESSED_ASSET_DIR}/ui.woff2`, 'woff2');
    write(root, `${PROCESSED_ASSET_DIR}/SOURCES.json`, fs.readFileSync(path.join(projectRoot, `${PROCESSED_ASSET_DIR}/SOURCES.json`)));
    const good = commit(root, 'original ui');
    const assets = push();
    assert.equal(assets.status, 0, assets.stderr + assets.stdout);
    for (const [file, contents] of blockedPushes) {
      write(root, file, contents);
      commit(root, `add ${file}`);
      const rejected = push();
      assert.equal(rejected.status, 1, file);
      assert.match(rejected.stderr, /Private file blocked:/);
      assert.match(rejected.stderr, new RegExp(path.posix.basename(file).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      execFileSync('git', ['reset', '--hard', '--quiet', good], { cwd: root, stdio: 'ignore' });
      fs.chmodSync(path.join(root, '.githooks/pre-push'), 0o755);
    }
    write(root, `${PROCESSED_ASSET_DIR}/localization.csv`, 'id,zh\n');
    commit(root, 'csv in original-ui');
    const csv = push();
    assert.equal(csv.status, 1);
    assert.match(csv.stderr, /localization\.csv/);
  } finally {
    fs.rmSync(remote, { recursive: true, force: true });
    removeRepo(root);
  }
});
