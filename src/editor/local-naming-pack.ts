/** Optional, user-selected naming data. No pack content enters a world schema. */
export const LOCAL_NAMING_PACK_LIMIT = 2 * 1024 * 1024;
export type NamingLanguage = 'zh' | 'en';
export type NamingKind = 'countries' | 'cities';
export interface LocalNameEntry { key: string; name: string }
export interface LocalNamingCulture {
  id: string; displayName: Record<NamingLanguage, string>; color: string | null;
  nameOrder: 'family-first' | 'given-first' | null;
  names: Record<NamingLanguage, Record<NamingKind, LocalNameEntry[]>>; sourceFiles: string[];
}
export interface LocalNamingPack {
  format: 'world-culture-content-pack'; version: 1;
  source: { label: string; files: { path: string; sha256: string; bytes: number }[] };
  cultures: LocalNamingCulture[];
}
const fail = (reason: string): never => { throw new Error('命名包未导入：' + reason); };
function record(raw: unknown, fields: string[]): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Object.getPrototypeOf(raw) !== Object.prototype) return fail('需要普通 JSON 对象。');
  const keys = Object.keys(raw);
  if (keys.length !== fields.length || keys.some(key => !fields.includes(key))) return fail('字段缺失或包含不支持的字段。');
  return raw as Record<string, unknown>;
}
function list(raw: unknown, limit: number): unknown[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > limit) return fail('列表为空或超过容量。');
  return raw;
}
function label(raw: unknown, limit: number): string {
  if (typeof raw !== 'string' || !raw.length || raw.length > limit || raw.trim() !== raw
    || [...raw].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return fail('名称或标识无效。');
  return raw;
}
const sourcePath = (raw: unknown): string => {
  if (typeof raw !== 'string' || !/^Base\/Culture\/[A-Za-z0-9][A-Za-z0-9_-]{0,63}\/(CultureData\.json|CityNames\.csv|StateNames\.csv)$/.test(raw)) return fail('来源路径不受支持。');
  return raw;
};
export function parseLocalNamingPack(text: string): LocalNamingPack {
  if (new TextEncoder().encode(text).byteLength > LOCAL_NAMING_PACK_LIMIT) return fail('文件超过 2 MiB。');
  let raw: unknown; try { raw = JSON.parse(text); } catch { return fail('不是有效的 JSON 文件。'); }
  const pack = record(raw, ['format', 'version', 'source', 'cultures']);
  if (pack.format !== 'world-culture-content-pack' || pack.version !== 1) return fail('格式或版本不受支持。');
  const source = record(pack.source, ['label', 'files']), paths = new Set<string>();
  const files = list(source.files, 96).map(raw => {
    const file = record(raw, ['path', 'sha256', 'bytes']), path = sourcePath(file.path);
    if (paths.has(path) || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)
      || !Number.isSafeInteger(file.bytes) || (file.bytes as number) < 1 || (file.bytes as number) > LOCAL_NAMING_PACK_LIMIT) return fail('来源文件身份或摘要无效。');
    paths.add(path); return { path, sha256: file.sha256, bytes: file.bytes as number };
  });
  const ids = new Set<string>(); let nameCount = 0;
  const cultures = list(pack.cultures, 32).map(raw => {
    const culture = record(raw, ['id', 'displayName', 'color', 'nameOrder', 'names', 'sourceFiles']), id = label(culture.id, 64);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id) || ids.has(id)) return fail('文化标识无效或重复。');
    ids.add(id);
    const display = record(culture.displayName, ['zh', 'en']), displayName = { zh: label(display.zh, 80), en: label(display.en, 80) };
    if (culture.color !== null && (typeof culture.color !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(culture.color))) return fail('文化颜色无效。');
    if (culture.nameOrder !== null && culture.nameOrder !== 'family-first' && culture.nameOrder !== 'given-first') return fail('姓名次序无效。');
    const names = record(culture.names, ['zh', 'en']);
    function language(language: NamingLanguage): Record<NamingKind, LocalNameEntry[]> {
      const pools = record(names[language], ['countries', 'cities']);
      function pool(kind: NamingKind): LocalNameEntry[] {
        const keys = new Set<string>();
        return list(pools[kind], 4096).map(raw => {
          const entry = record(raw, ['key', 'name']), key = label(entry.key, 160), name = label(entry.name, 80);
          if (keys.has(key)) return fail('同一名称池包含重复标识。');
          if (++nameCount > 20000) return fail('双语名称总数超过 20,000 条。');
          keys.add(key); return { key, name };
        });
      }
      return { countries: pool('countries'), cities: pool('cities') };
    }
    const normalizedNames = { zh: language('zh'), en: language('en') };
    for (const kind of ['countries', 'cities'] as const) {
      const zh = new Set(normalizedNames.zh[kind].map(entry => entry.key)), en = normalizedNames.en[kind];
      if (zh.size !== en.length || en.some(entry => !zh.has(entry.key))) return fail('双语名称标识不对应。');
    }
    const references = new Set<string>();
    const sourceFiles = list(culture.sourceFiles, 96).map(raw => {
      const path = sourcePath(raw);
      if (!paths.has(path) || !path.startsWith(`Base/Culture/${id}/`) || references.has(path)) return fail('文化来源文件引用无效。');
      references.add(path); return path;
    });
    return { id, displayName, color: culture.color as string | null, nameOrder: culture.nameOrder as LocalNamingCulture['nameOrder'], names: normalizedNames, sourceFiles };
  });
  return { format: 'world-culture-content-pack', version: 1, source: { label: label(source.label, 160), files }, cultures };
}
export async function readLocalNamingPack(file: Pick<File, 'size' | 'text'>): Promise<LocalNamingPack> {
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > LOCAL_NAMING_PACK_LIMIT) return fail('请选择不超过 2 MiB 的 JSON 文件。');
  return parseLocalNamingPack(await file.text());
}
/** Stable cycling avoids repeated suggestions and never trims/truncates a name. */
export function nextLocalName(pack: LocalNamingPack, cultureId: string, language: NamingLanguage, kind: NamingKind, current: string, usedNames: readonly string[]) {
  const culture = pack.cultures.find(item => item.id === cultureId);
  if (!culture || language !== 'zh' && language !== 'en' || kind !== 'countries' && kind !== 'cities') throw new Error('命名选择无效。');
  const entries = culture.names[language][kind], used = new Set(usedNames);
  const names = [...new Set(entries.filter(entry => entry.name.length <= 60 && !used.has(entry.name)).map(entry => entry.name))];
  const start = names.indexOf(current), next = names.length ? names[(start + 1) % names.length] : null;
  return { name: next === current ? null : next, available: names.length, skippedLong: entries.filter(entry => entry.name.length > 60).length };
}
