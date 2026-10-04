import { FmsClimateError } from './climate';
import type { FmsDocument } from './model';
import type { FmsDrainage } from './hydrology';
import type { FmsTerrainDisplay } from './height-palette';

interface DocumentView {
  setDocument(doc:FmsDocument,drainage?:FmsDrainage):void;
  setTerrainDisplay(display:FmsTerrainDisplay):void;
}
/** History/cancel already chose the target document. Optional climate must not
 * leave that target out of sync with the visible mesh when its budget fails. */
export function displayFmsDocument(view:DocumentView,doc:FmsDocument,drainage:FmsDrainage|undefined,onFallback:(reason:string)=>void):void {
  try{view.setDocument(doc,drainage);}
  catch(error){
    if(!(error instanceof FmsClimateError))throw error;
    view.setTerrainDisplay('height');
    view.setDocument(doc,drainage);
    onFallback('这张地图暂不能显示气候地貌，已切回高度配色；绘图、撤销和保存仍可继续。');
  }
}
