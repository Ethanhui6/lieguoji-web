import {characterAttributeInfo47,signedAttribute47} from './character-attribute-info47';
import type {NativeBaseSkills} from './native-economy/character-income';

export function CharacterAttributeDetails47({person}:{person:{base:NativeBaseSkills;traits:string[]|null}}){
 const info=characterAttributeInfo47({...person,traits:person.traits??[]});
 return <section className="c47-attribute-details" aria-label="人物属性明细">
  <h4>人物属性明细</h4>
  <table><thead><tr><th>属性</th><th>基础值</th><th>特质修正</th><th>当前值</th></tr></thead><tbody>{info.skills.map(s=><tr key={s.key}><th>{s.label}</th><td>{s.base.toFixed(1)}</td><td>{signedAttribute47(s.modifier)}</td><td>{s.current.toFixed(1)}</td></tr>)}</tbody></table>
  <p>当前值按基础值与特质修正相加后，限制在 0–100。官职收入按四维权重计算；统率读取实际指挥者的军事能力。</p>
  <h4>特质作用</h4>
  {info.traits.length?info.traits.map((t,i)=><p key={i}><strong>{t.name}</strong> · {t.effects.join('；')||'无四维、税收、叛乱抵抗或战斗数值修正。其他作用依对应规则生效。'}</p>):<p>无人物特质。</p>}
  <h4>担任领袖时</h4>
  <p>税收特质修正 {signedAttribute47(info.tax*100)}%；叛乱抵抗 {signedAttribute47(info.resistance*100)}%；海战修正 {signedAttribute47(info.naval*100)}%。</p>
  <p>每个敌国的陆战修正 {signedAttribute47(info.perEnemy*100)}%，采用首个非零特质，总修正限制在 −50% 至 +50%，在国家数据刷新时更新。</p>
  <p>这些是个人特质的条件效果。税收还受官员与经济影响；叛乱仍有触发门槛，不是最终概率；海战和陆战仍受国运等因素影响。</p>
 </section>;
}
