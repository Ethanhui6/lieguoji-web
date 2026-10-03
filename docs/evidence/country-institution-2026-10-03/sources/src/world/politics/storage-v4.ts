import { COUNTRY_V4_DATABASE } from './chunk-codec';
import { createCountryChunkStore } from './chunk-store';
export type { CountryBlob } from './chunk-store';
const store = createCountryChunkStore(COUNTRY_V4_DATABASE, 4);
export const { openCountryWorld, listCountryWorlds, readCountryGeography, createCountryWorld, countryUndoDocument, commitCountryWorld } = store;
export const hasCountryWorldV4 = store.hasCountryWorld;
export const readCountryGeographyRecordV4 = store.readCountryGeographyRecord;
