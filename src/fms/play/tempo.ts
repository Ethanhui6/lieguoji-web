/** One complete day per response at every speed; no seven-day visual jumps. */
export function dayInterval(speed:number){return 3000/([.5,1,2,4].includes(speed)?speed:1);}
