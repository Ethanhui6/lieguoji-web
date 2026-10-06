import table from './culture-ethnic-weights.json';
import {loadNamedEthnicWeights,type EthnicWeights} from './ethnic-generation';

/** Base-culture lookup only. A map culture name is not a base directory ID.
 * Unknown identities (including WorldII) stay unresolved, never defaulted. */
export function originalCultureWeights(baseCultureId:string):EthnicWeights|null{
  const entry=table.cultures.find(c=>c.id===baseCultureId);if(!entry)return null;
  const result:EthnicWeights=new Map();
  loadNamedEthnicWeights(result,entry.weights.map(([name,weight])=>{
    if(typeof name!=='string'||typeof weight!=='number')throw Error('Malformed reviewed culture table');
    return [name,weight] as const;
  }));return result;
}
