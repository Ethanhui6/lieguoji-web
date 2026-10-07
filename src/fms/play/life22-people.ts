import type {CourtPeople} from './court16-people';
import type {World} from '../../sim/types';
import type {Chronicle} from './chronicle-records';
import {nativeInitialCharacter,seededCharacterRandom} from './native-economy/character-generation';
import {nativeInitStateLeaderBirth} from './native-economy/leader-birth';
import {nativeBirthTimeFromAge} from './native-economy/character-calendar';
import {initialLife22} from './life22-state';

/** Only the ordinary founding path is known. Later web-generated rulers keep
 * unknown birthday provenance until their original family path is restored. */
export function initialPeopleAndLife22(r:{world:World;clock:{tick:number};chronicle:Chronicle}){
 if(r.world.day!==0||r.clock.tick!==0)throw Error('出生初始化只能用于全新世界。');
 const people:CourtPeople={version:1,origin:'native-skills-web-ruler-observation-v1',nextPersonId:1,nextStateId:1,revision:0,persons:{},nations:{}},life=initialLife22({...r,people});
 for(const n of r.world.nations){
  const nation=people.nations[n.id]={id:people.nextStateId++,leaderId:null as number|null,offices:{assignments:[],normalized:true as const,revision:0}},ruler=r.chronicle.leaders[n.id]?.at(-1);
  if(!ruler||ruler.endedDay!==null||Object.hasOwn(r.chronicle.ended,n.id))continue;
  const random=seededCharacterRandom(`${r.world.custom?.seed??''}/native-person/${ruler.id}`),generated=nativeInitialCharacter(random),id=people.nextPersonId++,birth={age:0,birthTime:0};
  nativeInitStateLeaderBirth(birth,random,age=>nativeBirthTimeFromAge(age,life.gameTime,life.secondsPerDay));
  people.persons[id]={id,stateId:nation.id,nationId:n.id,rulerId:ruler.id,name:ruler.name,family:ruler.family,alive:true,recordedDay:0,base:generated.base,traits:generated.traits.map(t=>t.name)};nation.leaderId=id;people.revision++;
  life.persons[id]={source:'native-founding',birthTime:birth.birthTime,age:birth.age,initialAge:birth.age,updatedMonth:12};life.revision++;
 }
 return {people,life};
}
