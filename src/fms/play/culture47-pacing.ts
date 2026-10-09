/** User-selected faster viewing baseline: the former 4x target is now 1x.
 * This is wall-clock scheduling only, NOT a change to the native 0.1-second
 * game day, army speed, battle timers, journal ticks or calendar settlement.
 * The UI separately reports achieved days/second when compute is limiting. */
export const CULTURE47_PLAYBACK_BASE=4;
export function culture47PlaybackBudget(secondsPerDay:number,speed:number,batchProtocol:boolean){
 if(!Number.isFinite(secondsPerDay)||secondsPerDay<=0||![.5,1,2,4].includes(speed))throw Error('推演播放速度无效。');
 return {tickMillis:secondsPerDay*1000/120/(speed*CULTURE47_PLAYBACK_BASE),maxBatch:batchProtocol?480:120};
}
