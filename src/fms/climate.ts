import { createAlea } from '../world/recovered-terrain/alea';

/** Selected main.mjs 2584–2758 / 3638–3750, user-authorized installed source.
 * Azgaar family MIT + Alea notices: world/recovered-terrain/licenses.
 * Climate is sampled on a bounded web grid; river recovery is in climate-rivers.
 */
export const FMS_CLIMATE_ALGORITHM = 'recovered-climate-river-web-v2';
export const FMS_BIOMES = [
  ['海洋', '#466eab'], ['热带沙漠', '#fbe79f'], ['寒带沙漠', '#b5b887'],
  ['热带草原', '#d2d082'], ['温带草原', '#c8d68f'], ['热带季节性森林', '#b6d95d'],
  ['温带落叶林', '#29bc56'], ['热带雨林', '#7dcb35'], ['温带雨林', '#409c43'],
  ['针叶林', '#4b6b32'], ['苔原', '#96784b'], ['冰川', '#d5e7eb'], ['湿地', '#0b9131'],
] as const;
const matrix = [
  [1,1,1,1,1,1,1,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,10],
  [3,3,3,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,9,9,9,9,10,10,10],
  [5,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,9,9,9,9,9,10,10,10],
  [5,6,6,6,6,6,6,8,8,8,8,8,8,8,8,8,8,9,9,9,9,9,9,10,10,10],
  [7,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,9,9,9,9,9,9,9,10,10],
] as const;
const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
export interface FmsClimateOptions { north: number; south: number; precipitation: number; temperatureOffset: number; seed: string }
// World scene: mapSizeOutput=1, LatitudeOutput=50, PrecInput=80, TemperatureModify=0.
// Latitude is resolved from calculateMapCoordinates; seed is a WEB fixed stream,
// independent of the original global RNG consumed by terrain generation.
export const FMS_CLIMATE_DEFAULTS: Readonly<FmsClimateOptions> = Object.freeze({ north: 0.9, south: -0.9, precipitation:80, temperatureOffset:0, seed:'1337' });
export class FmsClimateError extends Error {
  constructor(message='气候试算参数无效，地图保持原样。') { super(message); this.name='FmsClimateError'; }
}

/** Original Int8 output truncates the final fractional temperature toward zero. */
export function recoveredTemperature(height: number, latitude: number, offset=0): number {
  const equator=27+offset, northPole=-20+offset, southPole=-20+offset;
  const northTropic=equator-16*.15, southTropic=equator-20*.15;
  const sea=latitude<=16&&latitude>=-20 ? equator-Math.abs(latitude)*.15
    : latitude>0 ? northTropic-(latitude-16)*(northTropic-northPole)/74
      : southTropic+(latitude+20)*(southTropic-southPole)/70;
  const drop=height<20?0:Math.round((height-18)**2/1000*6.5);
  return Math.trunc(clamp(sea-drop,-128,127));
}

/** Inputs are precipitation-derived moisture and an integer Celsius temperature.
 * Wetland id12 is intentionally absent: the installed JS disables that branch. */
export function recoveredBiome(moisture: number, temperature: number, height: number, hasRiver=false): number {
  if(!Number.isFinite(moisture)||moisture<0||!Number.isInteger(temperature)||temperature < -128||temperature>127||!Number.isFinite(height))throw new FmsClimateError();
  if(height<20)return 0;
  if(temperature < -5)return 11;
  if(temperature>=25&&!hasRiver&&moisture<8)return 1;
  return matrix[Math.min(Math.floor(moisture/5),4)][clamp(20-temperature,0,25)];
}

/** Uses actual ordered climate cells, never the irregular drawing-node order.
 * Preserves per-write Uint8 precipitation truncation/wrap from the source.
 * Explicit web repairs: unpack row-zero tuples; winds stop at their row/column
 * boundary instead of reading the next row or an undefined off-map elevation.
 */
export function generateFmsClimateGrid(heights: Uint8Array, columns: number, rows: number, options: FmsClimateOptions=FMS_CLIMATE_DEFAULTS) {
  if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<1||rows<1||columns>192||rows>192
    ||!(heights instanceof Uint8Array)||heights.length!==columns*rows||heights.some(h=>h>100)
    ||!options||!Number.isFinite(options.north)||!Number.isFinite(options.south)||options.north>90||options.south < -90||options.north<=options.south
    ||!Number.isFinite(options.precipitation)||options.precipitation<=0||options.precipitation>200
    ||!Number.isFinite(options.temperatureOffset)||Math.abs(options.temperatureOffset)>100
    ||typeof options.seed!=='string'||options.seed.length>80)throw new FmsClimateError();
  const temperature=new Int8Array(heights.length),precipitation=new Uint8Array(heights.length);
  const span=options.north-options.south;
  for(let y=0;y<rows;y++){
    const latitude=options.north-(y+.5)/rows*span;
    for(let x=0;x<columns;x++){const id=y*columns+x;temperature[id]=recoveredTemperature(heights[id],latitude,options.temperatureOffset);}
  }
  const random=createAlea(options.seed), modifier=4**.25*options.precipitation/100;
  const latitudeModifiers=[4,2,2,2,1,1,2,2,2,2,3,3,2,2,1,1,1,.5];
  const winds=[225,45,225,315,135,315], west:[number,number][]=[],east:[number,number][]=[];
  let north=0,south=0;
  const latModifier=(latitude:number)=>latitudeModifiers[clamp(Math.trunc((Math.abs(latitude)-1)/5),0,17)];
  for(let y=0;y<rows;y++){
    const latitude=options.north-y/rows*span,angle=winds[clamp(Math.trunc(Math.abs(latitude-89)/30),0,5)];
    if(angle>40&&angle<140)west.push([y*columns,latModifier(latitude)]);
    if(angle>220&&angle<320)east.push([y*columns+columns-1,latModifier(latitude)]);
    if(angle>100&&angle<260)north++;
    if(angle>280||angle<80)south++;
  }
  function pass(first:number,max:number,next:number,steps:number){
    let humidity=max-heights[first];if(humidity<=0)return;
    for(let s=0,id=first;s<steps;s++,id+=next){
      if(temperature[id] < -5)continue;
      const downstream=s+1<steps?id+next:-1;
      if(heights[id]<20){
        if(downstream>=0&&heights[downstream]>=20)precipitation[downstream]+=Math.max(humidity/(10+Math.floor(random()*11)),1);
        else{humidity=Math.min(humidity+5*modifier,max);precipitation[id]+=5*modifier;}
        continue;
      }
      // Off-map wind exits instead of depositing an invented boundary storm.
      if(downstream<0)break;
      const passable=heights[downstream]<=85;
      const loss=passable?clamp(Math.max(humidity/(10*modifier),1)+Math.max(heights[downstream]-heights[id],0)*(heights[downstream]/70)**2,1,humidity):humidity;
      precipitation[id]+=loss;
      humidity=passable?clamp(humidity-loss+(loss>1.5?1:0),0,max):0;
    }
  }
  for(const [id,lat]of west)pass(id,Math.min(120*modifier*lat,255),1,columns);
  for(const [id,lat]of east)pass(id,Math.min(120*modifier*lat,255),-1,columns);
  const total=north+south,mean=latitudeModifiers.reduce((s,x)=>s+x,0)/latitudeModifiers.length;
  if(north){const max=north/total*60*modifier*(span>60?mean:latModifier(options.north));for(let x=0;x<columns;x++)pass(x,max,columns,rows);}
  if(south){const max=south/total*60*modifier*(span>60?mean:latModifier(options.south));for(let x=0;x<columns;x++)pass((rows-1)*columns+x,max,-columns,rows);}
  return {temperature,precipitation};
}
