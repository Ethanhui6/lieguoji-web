/** 1x is the original pace: TimeManager.secondsPerDay = 0.1, i.e. 10 game
 * days per second (2x = 20, 4x = 40). This replaces the earlier web-only
 * 4x-as-1x baseline at the user's request; saved calendar seconds, army
 * speed, battle timers and journal ticks are unchanged. The UI separately
 * reports achieved days/second when compute is limiting. */
export const CULTURE47_PLAYBACK_BASE=1;
/** Original GlobalTimeScaleManager.speedSettings (7 levels, default index 2):
 * MinumSpeed 0.1, Half 0.5, Normal 1, Double 2, Triple 3, Quadruple 4, Quintuple 5. */
export const CULTURE47_SPEEDS=[.1,.5,1,2,3,4,5] as const;
export const culture47SpeedLabel=(speed:number)=>speed+'倍速';
/** Current engine accepts up to 10 days per request; higher speeds use larger
 * batches so the fixed per-request cost is spread over more days. Frozen
 * protocol-2 engines keep their original 4-day limit. */
export const CULTURE47_MAX_BATCH_TICKS=1200;
export function culture47PlaybackBudget(secondsPerDay:number,speed:number,batchProtocol:boolean,largeBatch=false){
 if(!Number.isFinite(secondsPerDay)||secondsPerDay<=0||!(CULTURE47_SPEEDS as readonly number[]).includes(speed))throw Error('推演播放速度无效。');
 const maxBatch=!batchProtocol?120:largeBatch?Math.min(CULTURE47_MAX_BATCH_TICKS,Math.max(480,240*Math.ceil(speed))):480;
 return {tickMillis:secondsPerDay*1000/120/(speed*CULTURE47_PLAYBACK_BASE),maxBatch};
}
