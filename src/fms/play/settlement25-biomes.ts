import {assertFmsDocument,type FmsDocument} from '../model';
import {sampleFmsClimateHeights} from './terrain13-climate/biome-surface';
import {FMS_CLIMATE_DEFAULTS,generateFmsClimateGrid,recoveredBiome,recoveredTemperature} from './terrain13-climate/climate';
import {recoveredRiverMoisture} from './terrain13-climate/climate-rivers';
import {settlementRiverData} from './settlement25-rivers';
/** Same temperature/rainfall/drainage/biome data as the frozen v13 surface.
 * Gameplay never needs its GPU river mesh; failures of that optional display
 * budget must not prevent creation of a valid lake or large continent. */
export function settlementBiomeData(doc:FmsDocument){
 assertFmsDocument(doc);
 const longest=Math.max(doc.width,doc.height),columns=Math.max(2,Math.round(doc.width/longest*192)),rows=Math.max(2,Math.round(doc.height/longest*192)),heights=sampleFmsClimateHeights(doc,columns,rows),climate=generateFmsClimateGrid(heights,columns,rows);
 const precipitation=Uint8Array.from(doc.points,([x,y])=>climate.precipitation[Math.min(rows-1,Math.floor(y/doc.height*rows))*columns+Math.min(columns-1,Math.floor(x/doc.width*columns))]);
 const temperatures=Int8Array.from(doc.elevations,(h,i)=>recoveredTemperature(Math.min(100,Math.max(0,h)),FMS_CLIMATE_DEFAULTS.north-doc.points[i][1]/doc.height*(FMS_CLIMATE_DEFAULTS.north-FMS_CLIMATE_DEFAULTS.south)));
 const rivers=settlementRiverData(doc,precipitation),ids=Uint8Array.from(doc.elevations,(h,i)=>recoveredBiome(recoveredRiverMoisture(i,doc.elevations,doc.neighbors,precipitation,rivers),temperatures[i],h,Boolean(rivers.riverIds[i])));
 return {ids,precipitation,temperatures,rivers};
}
