/** Pure time-advance batches in live play skip the whole-world integrity
 * validators (they do not change state; the strict-vs-fast test proves the
 * results are identical). Player commands, loading and tests stay strict. */
let fast=0;
export function withFastChecks47<T>(action:()=>T):T{fast++;try{return action();}finally{fast--;}}
export const fastChecks47=()=>fast>0;
