import {regnalLabel,type Ruler} from './chronicle-records';
import type {CultureId47} from './civilization47-catalog';
import type {NativePolity} from './native-combat/upper-efficiency';

type Office47={cultureId:CultureId47;polity:NativePolity};
type ReignName47=Pick<Ruler,'name'|'regnalName'|'regnalOrdinal'>&{given:string};

// This is an explicit presentation policy for the web adaptation, not a claim
// that every historical ruler in a culture used the same naming convention.
// Ordinals belong to a repeated regnal name, never the nation's office order.
const numberedMonarchies47=new Set<CultureId47>(['english','french','german','slavic','norse','greek','persian']);
export function usesRegnalOrdinal47({cultureId,polity}:Office47):boolean {
  return (polity==='Kingdom'||polity==='Empire')&&numberedMonarchies47.has(cultureId);
}

/** One label for the live office and newly recorded successions. The original
 * personal identity and numerical ledger stay intact. No era, temple name or
 * posthumous title is inferred from a person's given name. */
export function rulerDisplayName47(office:Office47,ruler:ReignName47,title:string):string {
  const hereditary=['Kingdom','Empire','Tribal'].includes(office.polity);
  const name=usesRegnalOrdinal47(office)?regnalLabel(ruler):hereditary&&ruler.regnalName!==ruler.given?ruler.regnalName:ruler.name;
  return name+title;
}
