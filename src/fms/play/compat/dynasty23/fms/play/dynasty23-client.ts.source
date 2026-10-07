import type {KinState} from './dynasty23-state';
import type {LifeState} from './life22-state';
import type {DestinyState} from './destiny20-state';
import type {Sovereignty} from './restoration19-sovereignty';
import type {NamingState} from './restoration19-names';
import type {CultureState as OldCultureState} from './culture17-culture';
import type {CultureState} from './restoration19-culture';
import type {FiscalState} from './fiscal15-state';
import type {CourtPeople} from './court16-people';
import type {UpperCombat} from './upper14-state';
import type {GameRun} from './dynasty23-model';
import type {Reorganization} from './campaign-model';
import type {Chronicle} from './chronicle-records';
import type {TacticsState} from './tactics-model';
import type { GameEvent, World } from '../../sim/types';
import type {BattleState} from './battle';
import type { FmsRun } from './world';
import type { GameCommand as EditorCommand } from './dynasty23-session';
type Result = { world: World; run?: GameRun; halted?: GameEvent };
type TickUpdate=Pick<Extract<GameRun,{version:4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23}>,'id'|'world'|'clock'|'navy'|'units'> & {battles?:BattleState;occupation?:Extract<FmsRun,{version:6}>['occupation'];transports?:Extract<FmsRun,{version:7}>['transports'];maritime?:Extract<FmsRun,{version:8}>['maritime'];tactics?:TacticsState;reorganization?:Reorganization;chronicle?:Chronicle;upperCombat?:UpperCombat;finance?:FiscalState;people?:CourtPeople;culture?:CultureState|OldCultureState;naming?:NamingState;sovereignty?:Sovereignty;kin?:KinState;life?:LifeState;destiny?:DestinyState};
export class PlayClient {
  private worker = new Worker(new URL('./dynasty23/play.worker.ts', import.meta.url), { type: 'module' });
  private id = 0;
  private pending = new Map<number, { resolve: (r: Result) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private closed = false;
  private snapshot?:GameRun;
  constructor() {
    this.worker.onmessage = (e: MessageEvent<Result & { id: number; error?: string;update?:TickUpdate }>) => {
      const p=this.pending.get(e.data.id);if(!p)return;this.pending.delete(e.data.id);clearTimeout(p.timer);
      if(e.data.error){p.reject(new Error(e.data.error));return;}
      if(e.data.update){if(this.snapshot?.version===23&&!e.data.update.kin){p.reject(new Error('家族快照缺失，已暂停。'));return;}if((this.snapshot?.version===22||this.snapshot?.version===23)&&!e.data.update.life){p.reject(new Error('人物日历快照缺失，已暂停。'));return;}if((this.snapshot?.version===20||this.snapshot?.version===21||(this.snapshot?.version===22||this.snapshot?.version===23))&&(!e.data.update.destiny||!e.data.update.sovereignty||!e.data.update.naming||!e.data.update.culture||!e.data.update.people||!e.data.update.finance||!e.data.update.upperCombat||!e.data.update.chronicle||!e.data.update.reorganization)){p.reject(new Error('国运快照缺失，已暂停。'));return;}if(this.snapshot?.version===19&&(!e.data.update.sovereignty||!e.data.update.naming||!e.data.update.culture||!e.data.update.people||!e.data.update.finance||!e.data.update.upperCombat||!e.data.update.chronicle||!e.data.update.reorganization)){p.reject(new Error("新版复国快照缺失，已暂停。"));return;}if(this.snapshot?.version===18&&(!e.data.update.naming||!e.data.update.culture||e.data.update.culture.initialization!=='multiculture-naming-v1'||!e.data.update.people||!e.data.update.finance||!e.data.update.upperCombat||!e.data.update.chronicle||!e.data.update.reorganization)){p.reject(new Error('新版命名快照缺失，已暂停。'));return;}if(this.snapshot?.version===17&&(!e.data.update.culture||e.data.update.culture.initialization!=='explicit-eastern-naming-v1'||!e.data.update.people||!e.data.update.finance||!e.data.update.upperCombat||!e.data.update.chronicle||!e.data.update.reorganization)){p.reject(new Error("新版文化快照缺失，已暂停。"));return;}if(this.snapshot?.version===16&&(!e.data.update.people||!e.data.update.finance||!e.data.update.upperCombat||!e.data.update.chronicle||!e.data.update.reorganization)){p.reject(new Error("新版人物快照缺失，已暂停。"));return;}if(this.snapshot?.version===15&&(!e.data.update.finance||!e.data.update.upperCombat)){p.reject(new Error("新版财政快照缺失，已暂停。"));return;}if(this.snapshot?.version===14&&!e.data.update.upperCombat){p.reject(new Error('新版战力快照缺失，已暂停。'));return;}if(!this.snapshot||!('clock'in this.snapshot)||this.snapshot.id!==e.data.update.id||('tactics'in this.snapshot&&!e.data.update.tactics)||((this.snapshot.version===10||this.snapshot.version===11||this.snapshot.version===12||this.snapshot.version===13||this.snapshot.version===14||this.snapshot.version===15)&&!e.data.update.reorganization)||((this.snapshot.version===11||this.snapshot.version===12||this.snapshot.version===13||this.snapshot.version===14||this.snapshot.version===15)&&!e.data.update.chronicle)){p.reject(new Error('日内快照不匹配，已暂停。'));return;}e.data.run={...this.snapshot,...e.data.update} as GameRun;}
      if(e.data.run)this.snapshot=e.data.run;p.resolve(e.data);
    };
    this.worker.onerror = () => this.close('模拟线程无法继续，已暂停。');
  }
  send(command: EditorCommand): Promise<Result> {
    if (this.closed) return Promise.reject(new Error('模拟线程已关闭，请退出后重新进入。'));
    return new Promise((resolve, reject) => { const id = ++this.id, timer = setTimeout(() => this.close('模拟线程超时，已停止，未继续推进。'), 30000); this.pending.set(id, { resolve, reject, timer }); this.worker.postMessage({ id, command }); });
  }
  close(message = '已退出当前推演。') { this.closed = true; this.worker.terminate(); for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error(message)); } this.pending.clear(); }
}
