/** Test-only preview18 oracle dependencies. Exact selected original declarations; see SOURCE_MANIFEST.json. */
import { FIELD_Q } from './seed';


/** C1 cap: equal to the original input through 3/4 of full relief, then
 * approaches its bound continuously. No hard max between ridges or flat cap. */
export function boundCurvedRelief(valueQ: number): number {
  if (valueQ <= FIELD_Q * .75) return Math.max(0, valueQ);
  return FIELD_Q - (FIELD_Q * .25) ** 2 / (valueQ - FIELD_Q * .5);
}
