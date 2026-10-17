/** 1x is the original pace: TimeManager.secondsPerDay = 0.1, i.e. 10 game
 * days per second (2x = 20, 4x = 40). This replaces the earlier web-only
 * 4x-as-1x baseline at the user's request; saved calendar seconds, army
 * speed, battle timers and journal ticks are unchanged. The UI separately
 * reports achieved days/second when compute is limiting. */
export const CULTURE47_PLAYBACK_BASE=1;
export function culture47PlaybackBudget(secondsPerDay:number,speed:number,batchProtocol:boolean){
 if(!Number.isFinite(secondsPerDay)||secondsPerDay<=0||![.5,1,2,4].includes(speed))throw Error('推演播放速度无效。');
 return {tickMillis:secondsPerDay*1000/120/(speed*CULTURE47_PLAYBACK_BASE),maxBatch:batchProtocol?480:120};
}
