import type {LabelBox,CityCandidate} from './city-labels';
const overlap=(a:LabelBox,b:LabelBox)=>Math.max(0,Math.min(a.x+a.width/2+3,b.x+b.width/2)-Math.max(a.x-a.width/2-3,b.x-b.width/2))*Math.max(0,Math.min(a.y+a.height/2+3,b.y+b.height/2)-Math.max(a.y-a.height/2-3,b.y-b.height/2));
const visible=(a:LabelBox,v:{width:number;height:number})=>a.x+a.width/2>=0&&a.x-a.width/2<=v.width&&a.y+a.height/2>=0&&a.y-a.height/2<=v.height;

/** Keep each country's label inside its known interior clearance circle. This
 * only moves the display anchor; it never moves a capital or stored territory.
 * Every connected component keeps a label, even if the view is fully crowded. */
export function countryLabelBox(anchor:LabelBox,clearance:number,obstacles:LabelBox[]):LabelBox{
  const radius=Math.max(0,clearance*.8),step=Math.min(radius,anchor.height+14),offsets=[[0,0]];
  for(const r of [...new Set([step,radius])])for(const [dx,dy]of [[0,1],[0,-1],[1,0],[-1,0],[.707,.707],[-.707,.707],[.707,-.707],[-.707,-.707]])offsets.push([dx*r,dy*r]);
  const score=(b:LabelBox)=>obstacles.reduce((sum,o)=>sum+overlap(b,o),0);
  let best=anchor,bestScore=score(anchor);if(!bestScore)return best;
  for(const [dx,dy]of offsets){const candidate={...anchor,x:anchor.x+dx,y:anchor.y+dy},value=score(candidate);if(value<bestScore){best=candidate;bestScore=value;if(!value)break;}}
  return best;
}

/** Lay out every capital before clipping. Camera edges and UI are not layout
 * inputs: a pan translates the same label, never chooses a different side. */
export function capitalNameLabels(cities:CityCandidate[],size:number,obstacles:LabelBox[],viewport:{width:number;height:number},clip=true){
  const boxes=[...obstacles],labels:(CityCandidate&LabelBox)[]=[];
  for(const c of [...cities].sort((a,b)=>a.id.localeCompare(b.id))){
    const width=c.labelWidth??Array.from(c.name).length*size+6,height=c.labelHeight??size+6,dx=width/2+15,dy=height/2+15;
    const offsets=[[0,-dy],[0,dy],[dx,0],[-dx,0],[dx,-dy],[-dx,-dy],[dx,dy],[-dx,dy]];
    if(width>viewport.width-8||height>viewport.height-8)continue;
    const box=offsets.map(([x,y])=>({x:c.x+x,y:c.y+y,width,height})).find(b=>!boxes.some(o=>overlap(b,o)>0));
    if(box){labels.push({...c,...box});boxes.push(box);}
  }
  return clip?labels.filter(b=>visible(b,viewport)):labels;
}
