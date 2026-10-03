import { describe, expect, it, vi } from 'vitest';
import { LOCAL_NAMING_PACK_LIMIT, nextLocalName, parseLocalNamingPack, readLocalNamingPack } from './local-naming-pack';

function fixture() {
  const pool = (prefix: string) => [{ key: 'a', name: `${prefix}甲` }, { key: 'b', name: `${prefix}乙` }];
  return { format: 'world-culture-content-pack', version: 1,
    source: { label: '本地合成测试包', files: [{ path: 'Base/Culture/Test/StateNames.csv', sha256: 'a'.repeat(64), bytes: 64 }] },
    cultures: [{ id: 'Test', displayName: { zh: '测试文化', en: 'Test culture' }, color: null, nameOrder: null,
      names: { zh: { countries: pool('国'), cities: pool('城') }, en: { countries: pool('Nation '), cities: pool('City ') } }, sourceFiles: ['Base/Culture/Test/StateNames.csv'] }] };
}
const decode = (raw: unknown) => parseLocalNamingPack(JSON.stringify(raw));

describe('optional local naming pack', () => {
  it('preserves bilingual data and unknown culture rules without inferring a world culture or institution', () => {
    const input = fixture(), parsed = decode(input);
    expect(parsed).toEqual(input); expect(parsed.cultures[0].color).toBeNull(); expect(parsed.cultures[0].nameOrder).toBeNull();
    input.cultures[0].names.zh.countries[0].name = '源对象后来改变';
    expect(parsed.cultures[0].names.zh.countries[0].name).toBe('国甲');
  });

  it('cycles distinct suggestions, skips existing world names and never truncates longer names', () => {
    const raw = fixture(), zh = raw.cultures[0].names.zh.countries, en = raw.cultures[0].names.en.countries;
    zh.push({ key: 'same', name: '国甲' }, { key: 'long', name: '长'.repeat(61) });
    en.push({ key: 'same', name: 'Nation 甲' }, { key: 'long', name: 'L'.repeat(61) });
    const pack = decode(raw), before = JSON.stringify(pack);
    expect(nextLocalName(pack, 'Test', 'zh', 'countries', '手填名', [])).toEqual({ name: '国甲', available: 2, skippedLong: 1 });
    expect(nextLocalName(pack, 'Test', 'zh', 'countries', '国甲', [])).toEqual({ name: '国乙', available: 2, skippedLong: 1 });
    expect(nextLocalName(pack, 'Test', 'zh', 'countries', '国乙', [])).toEqual({ name: '国甲', available: 2, skippedLong: 1 });
    expect(nextLocalName(pack, 'Test', 'zh', 'countries', '', ['国甲'])).toEqual({ name: '国乙', available: 1, skippedLong: 1 });
    expect(nextLocalName(pack, 'Test', 'zh', 'countries', '国乙', ['国甲']).name).toBeNull();
    expect(nextLocalName(pack, 'Test', 'zh', 'countries', '', ['国甲', '国乙']).name).toBeNull();
    expect(nextLocalName(pack, 'Test', 'en', 'cities', '', []).name).toBe('City 甲');
    expect(JSON.stringify(pack)).toBe(before);
  });

  it('rejects future versions, foreign fields and invalid JSON', () => {
    expect(() => parseLocalNamingPack('{')).toThrow('JSON');
    expect(() => decode({ ...fixture(), version: 2 })).toThrow('版本');
    expect(() => decode({ ...fixture(), world: {} })).toThrow('字段');
    const raw = fixture(); Object.assign(raw.cultures[0], { religion: '不写入世界' });
    expect(() => decode(raw)).toThrow('字段');
  });

  it('rejects duplicate IDs/keys, missing language keys and missing source references', () => {
    const duplicates = fixture(); duplicates.cultures.push(structuredClone(duplicates.cultures[0])); expect(() => decode(duplicates)).toThrow('重复');
    const keys = fixture(); keys.cultures[0].names.zh.countries[1].key = 'a'; expect(() => decode(keys)).toThrow('重复标识');
    const mismatch = fixture(); mismatch.cultures[0].names.en.countries[0].key = 'elsewhere'; expect(() => decode(mismatch)).toThrow('不对应');
    const source = fixture(); source.cultures[0].sourceFiles = ['Base/Culture/Test/CityNames.csv']; expect(() => decode(source)).toThrow('引用');
    const path = fixture(); path.source.files[0].path = '../credentials.json'; expect(() => decode(path)).toThrow('路径');
    const crossCulture = fixture(); crossCulture.cultures[0].id = 'Other'; expect(() => decode(crossCulture)).toThrow('引用');
  });

  it('checks source metadata, name fields and non-empty culture pools', () => {
    for (const name of ['', ' space ', 'line\nbreak', 'x'.repeat(81)]) {
      const raw = fixture(); raw.cultures[0].names.zh.cities[0].name = name; expect(() => decode(raw)).toThrow('名称');
    }
    const source = fixture(); source.source.files[0].sha256 = 'not-a-hash'; expect(() => decode(source)).toThrow('摘要');
    const empty = fixture(); empty.cultures[0].names.zh.cities = []; expect(() => decode(empty)).toThrow('列表');
  });

  it('enforces per-pool and total bilingual capacity independently', () => {
    const pool = fixture(); pool.cultures[0].names.zh.countries = Array.from({ length: 4097 }, (_, i) => ({ key: String(i), name: '测试' }));
    expect(() => decode(pool)).toThrow('容量');
    const total = fixture();
    total.cultures[0].names.zh.countries = Array.from({ length: 2501 }, (_, i) => ({ key: String(i), name: '测试' }));
    total.cultures[0].names.zh.cities = structuredClone(total.cultures[0].names.zh.countries);
    total.cultures[0].names.en = structuredClone(total.cultures[0].names.zh);
    total.cultures.push({ ...structuredClone(total.cultures[0]), id: 'Other' });
    expect(() => decode(total)).toThrow('20,000');
  });

  it('rejects oversized byte inputs before file reading and does not mistake UTF-16 length for UTF-8 bytes', async () => {
    const text = vi.fn(async () => JSON.stringify(fixture()));
    await expect(readLocalNamingPack({ size: LOCAL_NAMING_PACK_LIMIT + 1, text })).rejects.toThrow('2 MiB'); expect(text).not.toHaveBeenCalled();
    await expect(readLocalNamingPack({ size: 0, text })).rejects.toThrow('2 MiB'); expect(text).not.toHaveBeenCalled();
    expect(() => parseLocalNamingPack('中'.repeat(LOCAL_NAMING_PACK_LIMIT / 2))).toThrow('2 MiB');
    await expect(readLocalNamingPack({ size: 500, text })).resolves.toEqual(fixture());
    await expect(readLocalNamingPack({ size: 500, text: async () => { throw new Error('文件无法读取'); } })).rejects.toThrow('文件无法读取');
  });
});
