import {it,expect} from 'vitest';
import {initialCivilization47} from './civilization47-names';
import {CULTURE_IDS47,CULTURES47} from './civilization47-catalog';

it('real names: a 24-state, 480-city world of all cultures uses distinct historical places',()=>{
  const owners=Array.from({length:480},(_,i)=>i%24);
  const c=initialCivilization47('v3-seed',24,owners,{mode:'historical-names',enabled:[...CULTURE_IDS47]});
  const cities=Object.values(c.cities).map(v=>v.name.value),states=Object.values(c.nations).map(v=>v.name.value);
  expect(new Set(cities).size).toBe(cities.length);
  expect(new Set(states).size).toBe(states.length);
  for(const id of CULTURE_IDS47){const p=CULTURES47[id];
    expect(p.historicalCities.length).toBeGreaterThanOrEqual(75);expect(p.givenMale.length).toBeGreaterThanOrEqual(50);expect(p.givenFemale.length).toBeGreaterThanOrEqual(45);expect(p.houses.length).toBeGreaterThanOrEqual(30);}
});
