/** Phone display budget. Touch-first devices draw the map at most 1.5 device pixels per CSS
 * pixel (desktops keep 2): a 3× phone screen otherwise fills 4/9 more pixels every frame for
 * detail the eye cannot resolve at arm's length. While the world plays, such devices also
 * repaint moving units at most 30 times a second; camera gestures still repaint at once. */
export const coarsePointer=()=>{try{return window.matchMedia('(pointer: coarse)').matches;}catch{return false;}};
export const displayResolution=()=>Math.min(window.devicePixelRatio||1,coarsePointer()?1.5:2);
export const PLAYBACK_FRAME_MS47=1000/30;
