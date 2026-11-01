import {it} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {CULTURE_IDS47,CULTURES47} from '../fms/play/civilization47-catalog';
import {ROMAN_HOUSES_FEMALE47} from '../fms/play/civilization47-chinese-catalog';

/** The app's name catalogues for the Swift engine, from the current web catalogue:
 * Resources/World/cultures.json (state and city pools, Opening.Culture) and
 * Resources/Catalog/noble-cultures.json (personal names and houses by culture). */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports the app name catalogues',async()=>{
  const cultures=CULTURE_IDS47.map(id=>{const c=CULTURES47[id];return {id,label:c.label,suggestedReligion:c.suggestedReligion,suggestedPolity:c.suggestedPolity,
    stateRoots:c.stateRoots,stateEnds:c.stateEnds,cityRoots:c.cityRoots,cityEnds:c.cityEnds,historicalStates:c.historicalStates,historicalCities:c.historicalCities};});
  const noble=Object.fromEntries(Object.entries(CULTURES47).map(([id,c])=>[id,{givenMale:c.givenMale,givenFemale:c.givenFemale,houses:c.houses,familyFirst:c.familyFirst,join:c.join,romanFemale:id==='roman'?ROMAN_HOUSES_FEMALE47:null}]));
  await mkdir('ios-native/Resources/Catalog',{recursive:true});
  await writeFile('ios-native/Resources/World/cultures.json',JSON.stringify(cultures));
  await writeFile('ios-native/Resources/Catalog/noble-cultures.json',JSON.stringify(noble));
});
