import { COUNTRY_V3_DATABASE } from './chunk-codec';
import { createCountryChunkStore } from './chunk-store';
export type { CountryBlob } from './chunk-store';
const store = createCountryChunkStore(COUNTRY_V3_DATABASE, 3);
export const { openCountryWorld, listCountryWorlds, readCountryGeography, createCountryWorld, countryUndoDocument, commitCountryWorld } = store;
export const hasCountryWorldV3 = store.hasCountryWorld;
export const readCountryGeographyRecordV3 = store.readCountryGeographyRecord;
