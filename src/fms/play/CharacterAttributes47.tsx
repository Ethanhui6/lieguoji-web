import {nativeCharacterSkills,type NativeBaseSkills} from './native-economy/character-income';
import {combatTraits47} from './civilization47-combat-state';
import labels from './native-economy/character-trait-labels.json';

const skills=[['charisma','魅力'],['military','军事'],['diplomatic','外交'],['administrative','行政']] as const;
/** Uses the exact skill projection consumed by the simulation, including trait bonuses and caps. */
export function CharacterAttributes47({person}:{person:{base:NativeBaseSkills;traits:string[]}}){
 const traits=combatTraits47(person.traits),values=nativeCharacterSkills(person.base,traits);
 return <span className="c47-person-attributes" aria-label="人物属性">
  <span>{skills.map(([key,label])=><span key={key} title={`基础 ${person.base[key].toFixed(1)}；特质修正后限制在 0–100`}>{label} <b>{values[key].toFixed(1)}</b>{' '}</span>)}</span>
  {!!traits.length&&<small>{traits.map(t=><span key={t.name} title={skills.filter(([key])=>t[`${key}Modifier`]!==0).map(([key,label])=>`${label} ${t[`${key}Modifier`]>0?'+':''}${t[`${key}Modifier`]}`).join('；')}>{labels[t.name as keyof typeof labels]??t.name}{' '}</span>)}</small>}
 </span>;
}
