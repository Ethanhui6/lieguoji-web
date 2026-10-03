import type { CountrySource } from '../world/politics/geography';

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const worldId = new RegExp(`^country-${uuid}$`), atlasId = new RegExp(`^atlas-${uuid}$`), hash = /^[0-9a-f]{64}$/;
export function countryEntry(search: string): { id: string; source?: CountrySource; error?: string } {
  const q = new URLSearchParams(search), id = q.get('country');
  if (id && worldId.test(id)) return { id };
  if (id === 'new') {
    const draftId = q.get('country-source') ?? '', revisionText = q.get('country-revision') ?? '';
    const revision = Number(revisionText), rootDigest = q.get('country-root') ?? '', manifestDigest = q.get('country-manifest') ?? '';
    if (atlasId.test(draftId) && /^(0|[1-9][0-9]*)$/.test(revisionText) && Number.isSafeInteger(revision) && hash.test(rootDigest) && hash.test(manifestDigest)) return { id: '', source: { draftId, revision, rootDigest, manifestDigest, atlasFormat: 4 } };
    return { id: '', error: '地形来源链接不完整。请回到已保存的地理草稿，重新选择建国。' };
  }
  return { id: '', ...(id && id !== 'list' ? { error: '建国世界地址无效，现有存档保持原样。' } : {}) };
}
export function countryEntryUrl(source?: CountrySource): string {
  if (!source) return '/?country=list';
  return '/?' + new URLSearchParams({ country: 'new', 'country-source': source.draftId, 'country-revision': String(source.revision), 'country-root': source.rootDigest, 'country-manifest': source.manifestDigest });
}
