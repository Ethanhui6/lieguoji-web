import type {Point} from '../../../sim/types';
const f=Math.fround,FLOAT_MAX=3.4028234663852886e38;
export type RegularTarget47={id:string;center:Point;feature:string;protruding:boolean;port:boolean};
/** Army.FindRegularTargetProvince3482B0 and distance339D30. Eligibility and
 * HashSet enumeration come from the caller; no invented military-strength score. */
export function nativeRegularScore47(current:Point,home:Point,currentFeature:string,p:RegularTarget47){
  const x=f(f(current.x)-f(p.center.x)),y=f(f(current.y)-f(p.center.y)),d=f(Math.sqrt(f(f(x*x)+f(y*y))));
  let weighted=p.protruding?f(d+d):f(d*3);if(currentFeature!==p.feature)weighted=f(weighted*10);
  const hx=f(f(home.x)-f(p.center.x)),hy=f(f(home.y)-f(p.center.y)),back=f(Math.sqrt(f(f(hy*hy)+f(hx*hx))));
  return f(back+weighted);
}
export function nativeRegularTarget47<T extends RegularTarget47>(current:Point,home:Point,currentFeature:string,candidates:readonly T[]):T|null{
  let same:T|null=null,port:T|null=null,cross:T|null=null,sameScore=FLOAT_MAX,portScore=FLOAT_MAX,crossScore=FLOAT_MAX;
  for(const p of candidates){const score=nativeRegularScore47(current,home,currentFeature,p);
    if(currentFeature===p.feature){if(score<sameScore){sameScore=score;same=p;}}
    else{if(p.port&&score<portScore){portScore=score;port=p;}if(score<crossScore){crossScore=score;cross=p;}}
  }return same??port??cross;
}
