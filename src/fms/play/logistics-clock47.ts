/** WEB finite-ration extension, not a recovered native food formula.
 * The previous six/eight points per day used a three-second web day. The
 * recovered default calendar has 0.1 scaled seconds per day; retaining those
 * old daily rates made armies starve before their first native two-second hit.
 * Keep the original stock capacity, charge stores, and scale consumption once.
 */
export const LOGISTICS_DAY_FACTOR47=1/30;
export const marchingRation47=6*LOGISTICS_DAY_FACTOR47;
/** Grain stays integral: round each fleet's actual daily consumption UP. */
export const fleetRation47=(crew:number)=>Math.ceil(crew*LOGISTICS_DAY_FACTOR47);
