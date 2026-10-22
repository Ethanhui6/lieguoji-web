import type {World} from '../../sim/types';
import type {Chronicle} from './chronicle-records';
import type {Civilization47,PersonName47} from './civilization47-names';
import type {CultureId47} from './civilization47-catalog';
import type {CourtPeople} from './court16-people';
import type {LifePerson,LifeState} from './life22-state';
import type {Sovereignty} from './restoration19-sovereignty';
import type {NativeRegisteredCharacter} from './native-economy/character-registry';
import type {NativeSpouseRole} from './native-economy/family-members';
import type {NativeLeaderRole} from './native-economy/leader-appointment';
import type {NativePastRole} from './native-economy/role-history';
import type {NativeMonthlyDeathStats} from './native-economy/natural-death';
import type {Origins47} from './civilization47-origins';
import type {Houses47} from './civilization47-houses';
import type {HouseGovernance47} from './civilization47-house-governance';
import type {Generations47} from './civilization47-generations-ledger';

export type PersonRole47=({nativeKind:'spouse'}&NativeSpouseRole)|({nativeKind:'leader'}&NativeLeaderRole);
export type FamilyPerson47=NativeRegisteredCharacter<string,PersonRole47,NativePastRole>&{
  source:'founding'|'initial-family'|'newborn'|'collateral';initialAge:number|null;identity:PersonName47;
};
export type Family47={id:number;surname:string;cultureName:CultureId47;nationId:string;stateId:number;headId:number;heirId:number;allowFemaleInheritance:boolean;memberIds:number[];collateralMemberIds:number[]};
export type Lifecycle47={version:1;rule:'native-month-death-known-emergency-v1';revision:number;lastMonth:number;random:{state:number;draws:number};stats:NativeMonthlyDeathStats;deaths:{personId:number;day:number;tick:number;age:number;wasLeaderOf:string|null;deathHistoryId:number|null}[];vacancies:Record<string,{sinceDay:number;previousPersonId:number;reason:'no-known-candidate'|'restoration-no-known-candidate'}>};
export type Kin47={version:1;origin:'native-family-real-culture-v1';revision:number;ageTime:number;lastAgeMonth:number;persons:Record<string,FamilyPerson47>;families:Record<string,Family47>;lifecycle:Lifecycle47};
/** Birthdays of relatives are real recorded inputs, never an unknown birthday
 * assigned when that relative first becomes a ruler. This is a new47 type. */
export type FamilyLife47={source:'native-family'|'web-newborn';birthTime:number;age:number;initialAge:null;updatedMonth:number};
export type Life47=Omit<LifeState,'persons'>&{persons:Record<string,LifePerson|FamilyLife47>};
export type PopulationBase47={id:string;world:World;clock:{version:1;tick:number};chronicle:Chronicle;civilization:Civilization47;people:CourtPeople;life:Life47};
export type Population47=PopulationBase47&{kin:Kin47;sovereignty:Sovereignty;origins?:Origins47;houses?:Houses47;houseGovernance?:HouseGovernance47;generations?:Generations47};
export const populationStamp47=(r:Population47)=>({id:r.id,day:r.world.day,tick:r.clock.tick,nextEventId:r.world.nextEventId,civilization:r.civilization.revision,kin:r.kin.revision,people:r.people.revision,sovereignty:r.sovereignty.revision,nextEntryId:r.chronicle.nextEntryId});
export type PopulationStamp47=ReturnType<typeof populationStamp47>;
