/** Cap backing pixels, not animation cadence. A 1.5x canvas uses 25% of the
 * pixels of a 3x canvas; idle worlds retain on-demand rendering. */
export const coarsePointer=()=>{try{return window.matchMedia('(pointer: coarse)').matches;}catch{return false;}};
export const displayResolution=()=>Math.min(window.devicePixelRatio||1,coarsePointer()?1.5:2);
