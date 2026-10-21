/** Live display batch only (session-advance47): repeated per-frame checks of
 * contact records and already-proven travel progress are deferred inside the
 * batch, which then validates its final run in full (actualContactFrame47)
 * before the candidate can be accepted. Replay, load and every public path
 * keep the per-step checks as the independent oracle. */
let deferred=0;
export function withDeferredLiveChecks47<T>(action:()=>T):T{deferred++;try{return action();}finally{deferred--;}}
export const liveChecksDeferred47=()=>deferred>0;
