export type LabelBox={x:number;y:number;width:number;height:number};
export type CityCandidate={id:string;name:string;x:number;y:number;selected:boolean};
const overlaps=(a:LabelBox,b:LabelBox)=>Math.abs(a.x-b.x)<(a.width+b.width)/2+4&&Math.abs(a.y-b.y)<(a.height+b.height)/2+4;
/** Screen-space labels only; every real city retains its own smaller map dot. */
export function cityLabels(cities:CityCandidate[],obstacles:LabelBox[],viewport:{width:number;height:number},overview:boolean){
  const boxes=[...obstacles],result:(CityCandidate&{labelY:number})[]=[];
  for(const c of [...cities].sort((a,b)=>Number(b.selected)-Number(a.selected)||a.id.localeCompare(b.id))){
    if(c.x<0||c.y<0||c.x>viewport.width||c.y>viewport.height||overview&&!c.selected)continue;
    for(const offset of [-14,15,-28,29]){
      const box={x:c.x,y:c.y+offset,width:c.name.length*10+4,height:12};
      if(box.x-box.width/2<2||box.x+box.width/2>viewport.width-2||box.y<8||box.y>viewport.height-8)continue;
      if(boxes.some(b=>overlaps(box,b)))continue;
      result.push({...c,labelY:box.y+5});boxes.push(box);break;
    }
  }
  return result;
}
