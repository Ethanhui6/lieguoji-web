/** Family 84BC70 and FamilyManager 873BA0 defaults, with the recovered
 * 849890 color wrapper. Actual palette/HSV/RNG remain explicit dependencies. */
import {f,roundInt} from './numeric';
import type {NativeCreatedFamily,NativeFamilyRegistry} from './family-create';
import type {NativeVirtualFamily} from './family-virtual';
import type {NativeSuccessionFamily} from './family-succession';
export interface NativeFamilyColor {r:number;g:number;b:number;a:number}
export type NativeFamily=NativeCreatedFamily&NativeVirtualFamily&NativeSuccessionFamily&{
 memberIds:number[];collateralMemberIds:number[];matrilinealSpouses:number[];historicalClaims:Map<number,number>;
 controlledProvinces:number[];relations:Map<number,number>;historicalStateIds:Set<number>;lastRulingTime:Map<number,number>;
 rulingDuration:Map<number,number>;stateResidenceMonths:Map<number,number>;
 patriarchId:number;heirId:number;influence:number;wealth:number;extendedMembers:number;updateDay:number;
 totalProvincesConquered:number;totalEnemyDestroyed:number;rallyCooldownTime:number;
 skipNextRedistribution:boolean;isRulingFamily:boolean;isLabelPlaced:boolean;familyLabelObject:unknown|null;
 color:NativeFamilyColor;colorString:string|null;polePos:{x:number;y:number};poleCellIndex:number;
};
export function nativeFamilyDefaults():NativeFamily{
 return {
  memberIds:[],collateralMemberIds:[],matrilinealSpouses:[],historicalClaims:new Map(),controlledProvinces:[],relations:new Map(),historicalStateIds:new Set(),lastRulingTime:new Map(),rulingDuration:new Map(),stateResidenceMonths:new Map(),
  id:0,surname:null,cultureName:null,religionId:null,stateId:0,homeProvinceId:0,originalHomeProvinceId:0,foundingTime:0,founderId:0,
  patriarchId:0,heirId:0,influence:50,wealth:100,extendedMembers:50,updateDay:1,totalProvincesConquered:0,totalEnemyDestroyed:0,rallyCooldownTime:0,
  allowFemaleInheritance:false,skipNextRedistribution:false,isRulingFamily:false,isNeedNameLabelUpdate:false,isNeedBorderLineUpdate:false,isLabelPlaced:false,familyLabelObject:null,
  color:{r:0,g:0,b:0,a:0},colorString:null,polePos:{x:0,y:0},poleCellIndex:-1,
 };
}
export interface NativeFamilyManager<F> extends NativeFamilyRegistry<F>{
 historicalFamilies:Map<number,F>;nextColorIndex:number;pendingRemovePlaceholderStateFamilyIds:number[];recordFamilyCreateEvent:boolean;validFamiliesForNextMonth:F[];
}
export function nativeFamilyManagerDefaults<F=NativeFamily>():NativeFamilyManager<F>{
 return {families:new Map(),historicalFamilies:new Map(),nextId:1,nextColorIndex:0,pendingRemovePlaceholderStateFamilyIds:[],recordFamilyCreateEvent:true,validFamiliesForNextMonth:[]};
}
/** 849890 copies the color before converting to HTML. No RNG in this wrapper. */
export function nativeAssignFamilyColor(family:{color:NativeFamilyColor;colorString:string|null},ports:{getNextColor:()=>NativeFamilyColor;toHtml:(color:NativeFamilyColor)=>string|null}):void{
 const c=ports.getNextColor(),value={r:f(c.r),g:f(c.g),b:f(c.b),a:f(c.a)};
 family.color={...value};family.colorString=ports.toHtml(value);
}
/** 22F0AD0, finite channels with int32-convertible scaled values. Multiply
 * before half-even conversion (existing 37AC80 kernel), then clamp integer. */
export function nativeColorHtmlRgba(color:NativeFamilyColor):string{
 return [color.r,color.g,color.b,color.a].map(c=>Math.min(255,Math.max(0,roundInt(f(f(c)*255)))).toString(16).padStart(2,'0').toUpperCase()).join('');
}
