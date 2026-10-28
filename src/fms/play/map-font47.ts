import kaiUrl from './assets/tw-kai-subset.woff2';

/** The original's map-name font: LabelName prefab → "TW-Kai-98_1 SDF" (全字库正楷体 TW-Kai,
 * © 2018 National Development Council, Taiwan, Open Government Data License v1.0,
 * https://data.gov.tw/license). The web ships a subset holding every character of its name
 * catalogues; anything outside it falls back to the system's Kai fonts. */
export const MAP_FONT47='"LieguojiKai", KaiTi, STKaiti, "Kaiti SC", "Kaiti TC", serif';
let loading:Promise<boolean>|null=null,epoch=0,asked=0,settled=false;
/** Changes once the font is ready, so cached name textures are re-created with it. */
export const mapFontEpoch47=()=>epoch;
/** Names wait for the font (at most FONT_WAIT_MS) instead of being rendered twice — once in
 * the fallback font and again in TW-Kai — which doubled the texture uploads at world open. */
export const FONT_WAIT_MS47=2500;
export const mapFontSettled47=()=>settled||(asked>0&&performance.now()-asked>=FONT_WAIT_MS47);
/** Resolves when names should be drawn: the font is ready, failed, or the wait ran out. */
export function mapFontReady47():Promise<void>{
  if(!asked)asked=performance.now();
  return Promise.race([loadMapFont47().then(()=>undefined),new Promise<void>(r=>setTimeout(r,Math.max(0,FONT_WAIT_MS47-(performance.now()-asked))))]);
}
export function loadMapFont47():Promise<boolean>{
  if(!asked)asked=performance.now();
  loading??=(async()=>{
    if(typeof FontFace==='undefined'||typeof document==='undefined')return false;
    // Binary FontFace avoids the font URL loader's implicit anonymous CORS mode
    // on WKWebView custom schemes. Keep the request explicitly same-origin.
    const response=await fetch(new URL(kaiUrl,document.baseURI),{mode:'same-origin'});
    if(!response.ok)throw new Error(`地图字体加载失败：${response.status}`);
    const face=new FontFace('LieguojiKai',await response.arrayBuffer(),{display:'swap'});
    await face.load();document.fonts.add(face);epoch++;return true;
  })().catch(()=>false).then(ok=>{settled=true;return ok;});
  return loading;
}
