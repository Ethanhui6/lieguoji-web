import { describe, expect, it } from 'vitest';
import { countryEntry, countryEntryUrl } from './country-entry';

describe('independent country route', () => {
  it('binds a new world to an exact saved geography and restores only the saved country ID', () => {
    const source = { draftId: 'atlas-12345678-1234-1234-1234-123456789abc', revision: 4, rootDigest: 'a'.repeat(64), manifestDigest: 'b'.repeat(64), atlasFormat: 4 as const };
    expect(countryEntry(countryEntryUrl(source).slice(1))).toEqual({ id: '', source });
    const id = 'country-12345678-1234-1234-1234-123456789abc';
    expect(countryEntry(`?country=${id}&country-source=untrusted`)).toEqual({ id });
  });
  it('rejects incomplete or noncanonical creation sources without falling back to a new world', () => {
    for (const search of ['?country=new', '?country=unknown', '?country=new&country-revision=-1', '?country=new&country-revision=Infinity']) {
      const entry = countryEntry(search); expect(entry.error).toBeTruthy(); expect(entry.source).toBeUndefined();
    }
    expect(countryEntry(countryEntryUrl())).toEqual({ id: '' });
  });
});
