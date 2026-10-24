import type {FmsDocument} from '../model';
import {FmsTerrainClient} from '../terrain-client';
import {prepareFmsFullMapPreview} from '../full-map-terrain';
import {createFmsOriginalDocument,originalGridIdOf} from '../original/original-document';
import {SEED_TERRAIN_TEMPLATES} from '../../world/seed-terrain';

/** Original BottomPanel.GenerateMap: 生成地图 replaces the open world with a new
 * random one (World.GenerateMap with a random seed). The web keeps the current
 * map size and picks one of the original terrain templates at random. */
export async function generateWorldTerrain47(current:FmsDocument,signal?:AbortSignal):Promise<FmsDocument>{
  const grid=await originalGridIdOf(current)??'20k';
  const random=crypto.getRandomValues(new Uint32Array(2));
  const seed=String(random[0]),template=SEED_TERRAIN_TEMPLATES[random[1]%SEED_TERRAIN_TEMPLATES.length].id;
  const base=await createFmsOriginalDocument(grid);
  const client=new FmsTerrainClient();
  try{
    const options={seed,template};
    const result=await client.fullMap(base,options,{signal});
    return (await prepareFmsFullMapPreview(base,result,options)).document;
  }finally{client.close();}
}
