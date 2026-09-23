import type {Point,Terrain} from '../sim/types';
export type DraftCell={id:string;polygon:Point[];center:Point;neighbors:string[];land:boolean;elevation:number;moisture:number;terrain:Terrain;ownerId:string|null};
export type DraftNation={id:string;name:string;color:string};
export type DraftCity={id:string;name:string;cellId:string;capital:boolean};
export type EditorDraft={schemaVersion:1;id:string;name:string;seed:string;width:1000;height:700;cells:DraftCell[];nations:DraftNation[];cities:DraftCity[];rivers:Point[][]};
export type BrushTool='land'|'sea'|'plain'|'forest'|'mountain'|'claim'|'unclaim';
