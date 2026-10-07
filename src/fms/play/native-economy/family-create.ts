/** CreateFamily 85BD30 and its 85BD00 overload. The original transaction can
 * mutate a province before registry insertion and can fail after insertion.
 * Callers must use private state. Constructor, color, control side effects,
 * religion selection and history preparation are explicit recovered boundaries. */
import {f,iadd,int32} from './numeric';
export interface NativeCreatedFamily {
 id:number;surname:string|null;cultureName:string|null;religionId:string|null;
 stateId:number;homeProvinceId:number;originalHomeProvinceId:number;foundingTime:number;founderId:number;
 isNeedNameLabelUpdate:boolean;isNeedBorderLineUpdate:boolean;
}
export interface NativeFamilyCreationState {isBlankState:boolean;isConquerable:boolean;stateReligionId:string|null}
export interface NativeFamilyProvince {i:number;familyId:number}
export interface NativeFamilyRegistry<F> {nextId:number;families:Map<number,F>}
export interface NativeFamilyCreationPorts<F extends NativeCreatedFamily,S extends NativeFamilyCreationState,P extends NativeFamilyProvince,Religion,Event> {
 containsState:(id:number)=>boolean;getState:(id:number)=>S|null;
 constructFamily:()=>F;generateRandomColor:(family:F)=>void;gameTime:()=>number;
 getProvince:(id:number)=>P|null;mainReligion:(province:P)=>string|null;randomReligion:(filter:null)=>string|null;
 removeControlledProvince:(family:F,id:number)=>void;addControlledProvince:(family:F,id:number)=>void;updateMaterial:(province:P)=>void;
 getReligion:(id:string|null)=>Religion|null;logCreated:(family:F,state:S|null,religion:Religion|null)=>void;
 warn:(reason:'invalid-state-id'|'missing-state'|'ineligible-state')=>void;
 recordFamilyCreateEvent:boolean;
 prepareHistory:(family:F,state:S|null,requestedHomeId:number)=>void;
 createFoundedEvent:(familyId:number,founderId:number,reason:'noble_appointment',time:number)=>Event;
 recordGlobal:(event:Event)=>void;recordState:(state:S,event:Event)=>void;
}
const blank=(s:string|null)=>s===null||s==='';
export function nativeCreateFamily<F extends NativeCreatedFamily,S extends NativeFamilyCreationState,P extends NativeFamilyProvince,Religion,Event>(
 name:string|null,culture:string|null,religion:string|null,stateId:number,homeId:number,
 registry:NativeFamilyRegistry<F>,ports:NativeFamilyCreationPorts<F,S,P,Religion,Event>,
):F|null{
 int32(stateId);int32(homeId);
 if(stateId<=0){ports.warn('invalid-state-id');return null;}
 if(!ports.containsState(stateId)){ports.warn('missing-state');return null;}
 const state=ports.getState(stateId);
 if(state&&(state.isBlankState||!state.isConquerable)){ports.warn('ineligible-state');return null;}
 const family=ports.constructFamily();ports.generateRandomColor(family);
 family.id=int32(registry.nextId);registry.nextId=iadd(family.id,1);
 family.surname=name;family.cultureName=culture;family.homeProvinceId=homeId;family.originalHomeProvinceId=homeId;family.stateId=stateId;family.foundingTime=f(ports.gameTime());
 if(blank(religion)){
  if(homeId>0){const province=ports.getProvince(homeId);if(province!==null)family.religionId=ports.mainReligion(province);}
  if(blank(family.religionId)){const currentState=ports.getState(stateId);if(currentState!==null)family.religionId=currentState.stateReligionId;}
  if(blank(family.religionId))family.religionId=ports.randomReligion(null);
 }else family.religionId=religion;
 if(homeId>0){
  const province=ports.getProvince(homeId);
  if(province!==null){
   if(province.familyId>0&&province.familyId!==family.id){
    const previous=registry.families.get(province.familyId);
    if(previous){ports.removeControlledProvince(previous,province.i);previous.isNeedNameLabelUpdate=true;previous.isNeedBorderLineUpdate=true;}
   }
   province.familyId=family.id;ports.addControlledProvince(family,province.i);
   family.homeProvinceId=province.i;family.originalHomeProvinceId=province.i;ports.updateMaterial(province);
  }
 }
 registry.families.set(family.id,family);
 const religionInfo=ports.getReligion(family.religionId);ports.logCreated(family,state,religionInfo);
 if(ports.recordFamilyCreateEvent){
  ports.prepareHistory(family,state,homeId);
  const event=ports.createFoundedEvent(family.id,family.founderId,'noble_appointment',f(ports.gameTime()));
  ports.recordGlobal(event);if(state!==null)ports.recordState(state,event);
 }
 return family;
}
/** 85BD00 forwards null religion without any additional work. */
export function nativeCreateFamilyWithoutReligion<F extends NativeCreatedFamily,S extends NativeFamilyCreationState,P extends NativeFamilyProvince,Religion,Event>(
 name:string|null,culture:string|null,stateId:number,homeId:number,
 registry:NativeFamilyRegistry<F>,ports:NativeFamilyCreationPorts<F,S,P,Religion,Event>,
):F|null{return nativeCreateFamily(name,culture,null,stateId,homeId,registry,ports);}
