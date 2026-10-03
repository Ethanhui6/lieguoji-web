import { COUNTRY_V2_DATABASE } from './chunk-codec';
import { createCountryChunkStore } from './chunk-store';
export type { CountryBlob } from './chunk-store';
const store = createCountryChunkStore(COUNTRY_V2_DATABASE, 2);
export const { openCountryWorld, listCountryWorlds, readCountryGeography, createCountryWorld, countryUndoDocument, commitCountryWorld } = store;
export const hasCountryWorldV2 = store.hasCountryWorld;
export const readCountryGeographyRecordV2 = store.readCountryGeographyRecord;
