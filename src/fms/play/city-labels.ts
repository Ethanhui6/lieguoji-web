export type LabelBox={x:number;y:number;width:number;height:number};
export type CityCandidate={id:string;name:string;x:number;y:number;selected:boolean};
export type CityLabel=CityCandidate&{labelX:number;labelY:number;callout?:LabelBox;lines?:string[]};
const overlaps=(a:LabelBox,b:LabelBox)=>Math.abs(a.x-b.x)<(a.width+b.width)/2+4&&Math.abs(a.y-b.y)<(a.height+b.height)/2+4;
/** A selected city keeps its complete name even when ordinary labels are culled.
 * Placement avoids obstacles when possible; in a fully crowded view the opaque
 * callout takes priority, with a leader to the unchanged real city position. */
export function selectedCityLabel(c:CityCandidate,obstacles:LabelBox[],viewport:{width:number;height:number},ui:LabelBox[]=[]):CityLabel|undefined{
  if(c.x<0||c.y<0||c.x>viewport.width||c.y>viewport.height||viewport.width<40||viewport.height<40)return;
  const chars=Array.from(c.name),columns=Math.max(1,Math.min(14,Math.floor((viewport.width-32)/12))),lines:string[]=[];
  for(let i=0;i<chars.length;i+=columns)lines.push(chars.slice(i,i+columns).join(''));
  const width=Math.max(32,Math.min(columns,chars.length)*12+16),height=Math.max(28,lines.length*16+12);
  if(width>viewport.width-8||height>viewport.height-8)return;
  const gap=12,dx=width/2+gap,dy=height/2+gap;
  const offsets=[[0,-dy],[dx,0],[-dx,0],[0,dy],[dx,-dy],[-dx,-dy],[dx,dy],[-dx,dy],...ui.flatMap(b=>[[0,b.y+b.height/2+height/2+8-c.y],[0,b.y-b.height/2-height/2-8-c.y],[b.x+b.width/2+width/2+8-c.x,0],[b.x-b.width/2-width/2-8-c.x,0]])];
  const candidates=offsets.map(([x,y])=>({x:Math.max(width/2+4,Math.min(viewport.width-width/2-4,c.x+x)),y:Math.max(height/2+4,Math.min(viewport.height-height/2-4,c.y+y)),width,height})).filter(box=>!ui.some(b=>overlaps(box,b)));
  // Canvas labels cannot be painted above DOM controls. Keep the UI exclusion
  // strict even when all remaining map-label positions are crowded.
  if(!candidates.length)return;
  const overlap=(box:LabelBox)=>obstacles.reduce((sum,b)=>sum+Math.max(0,Math.min(box.x+width/2+4,b.x+b.width/2)-Math.max(box.x-width/2-4,b.x-b.width/2))*Math.max(0,Math.min(box.y+height/2+4,b.y+b.height/2)-Math.max(box.y-height/2-4,b.y-b.height/2)),0);
  const box=candidates.find(box=>!obstacles.some(b=>overlaps(box,b)))??candidates.reduce((best,box)=>overlap(box)<overlap(best)?box:best);
  return {...c,labelX:box.x,labelY:box.y,callout:box,lines};
}
/** Screen-space labels only; every real city retains its own smaller map dot. */
export function cityLabels(cities:CityCandidate[],obstacles:LabelBox[],viewport:{width:number;height:number},overview:boolean){
  const boxes=[...obstacles],result:CityLabel[]=[];
  for(const c of [...cities].sort((a,b)=>Number(b.selected)-Number(a.selected)||a.id.localeCompare(b.id))){
    if(c.x<0||c.y<0||c.x>viewport.width||c.y>viewport.height||overview&&!c.selected)continue;
    if(c.selected){const label=selectedCityLabel(c,boxes,viewport);if(label){result.push(label);boxes.push(label.callout!);}continue;}
    for(const offset of [-14,15,-28,29]){
      const box={x:c.x,y:c.y+offset,width:c.name.length*10+4,height:12};
      if(box.x-box.width/2<2||box.x+box.width/2>viewport.width-2||box.y<8||box.y>viewport.height-8)continue;
      if(boxes.some(b=>overlaps(box,b)))continue;
      result.push({...c,labelX:box.x,labelY:box.y+5});boxes.push(box);break;
    }
  }
  return result;
}
