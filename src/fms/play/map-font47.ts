import kaiUrl from './assets/tw-kai-subset.woff2';

/** The original's map-name font: LabelName prefab → "TW-Kai-98_1 SDF" (全字库正楷体 TW-Kai,
 * © 2018 National Development Council, Taiwan, Open Government Data License v1.0,
 * https://data.gov.tw/license). The web ships a subset holding every character of its name
 * catalogues; anything outside it falls back to the system's Kai fonts. */
export const MAP_FONT47='"LieguojiKai", KaiTi, STKaiti, "Kaiti SC", "Kaiti TC", serif';
let loading:Promise<boolean>|null=null,epoch=0;
/** Changes once the font is ready, so cached name textures are re-created with it. */
export const mapFontEpoch47=()=>epoch;
export function loadMapFont47():Promise<boolean>{
  loading??=(async()=>{
    if(typeof FontFace==='undefined'||typeof document==='undefined')return false;
    const face=new FontFace('LieguojiKai',`url(${kaiUrl}) format("woff2")`,{display:'swap'});
    await face.load();document.fonts.add(face);epoch++;return true;
  })().catch(()=>false);
  return loading;
}
