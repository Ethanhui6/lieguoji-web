/** Per-phase timing of the live Worker batch, shown by the ?perf=1 panel. */
const totals:Record<string,number>={};
export function time47<T>(name:string,action:()=>T):T{const t=performance.now();try{return action();}finally{totals[name]=(totals[name]??0)+performance.now()-t;}}
/** Phase totals since the last call (ms), then reset. */
export function takePhases47():Record<string,number>{const out:Record<string,number>={};for(const k of Object.keys(totals)){out[k]=Math.round(totals[k]*10)/10;delete totals[k];}return out;}
