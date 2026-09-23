import { useId, useRef, useState } from 'react';
import { MAX_HISTORY_BYTES, MAX_HISTORY_ENTRIES } from '../history/core';
import type { HistoryEntry, HistoryLog } from '../history/types';
import type { World } from '../sim/types';
import { ModalDialog } from './ModalDialog';
import './history.css';

type Replay = { world: World; seq: number; playing: boolean };
type Position = { runId: string; seq: number };
type Props = {
  world: World;
  history: HistoryLog | null;
  historyBytes: number;
  archive: boolean;
  compatible: boolean;
  replay: Replay | null;
  busy: boolean;
  saveStatus: string;
  onPause: () => void;
  onRecord?: () => Promise<void>;
  onEnterReplay: () => Promise<void>;
  onSeek: (seq: number) => Promise<void>;
  onPlaying: (playing: boolean) => void;
  onExitReplay: () => void;
  onBranch?: (position: Position) => Promise<void>;
  onExport: () => Promise<void>;
  onImport?: (file: File) => Promise<void>;
};

function entryLabel(entry: HistoryEntry, world: World) {
  const input = entry.input;
  if (input.type === 'step') return '推进一日';
  if (input.type === 'order') return `${world.armies.find(item => item.id === input.order.armyId)?.name ?? '军队'} · ${input.order.kind === 'retreat' ? '撤退' : '行军'} → ${world.provinces.find(item => item.id === input.order.targetId)?.name ?? '地区'}`;
  const action = input.action, nation = world.nations.find(item => item.id === action.nationId)?.name ?? '国家';
  if (action.type === 'policy') return `${nation} · ${action.priority === 'civilian' ? '民生优先' : action.priority === 'military' ? '军事优先' : '均衡调配'}`;
  return `${nation} · ${action.type === 'declare-war' ? '向' : '与'}${world.nations.find(item => item.id === action.targetNationId)?.name ?? '邻国'}${action.type === 'declare-war' ? '宣战' : '停战'}`;
}

export function HistoryPanel({ world, history, historyBytes, archive, compatible, replay, busy, saveStatus, onPause, onRecord, onEnterReplay, onSeek, onPlaying, onExitReplay, onBranch, onExport, onImport }: Props) {
  const [confirmation, setConfirmation] = useState<{ type: 'record' } | { type: 'branch'; position: Position; day: number } | { type: 'import'; file: File } | null>(null);
  const [operating, setOperating] = useState(false), [error, setError] = useState('');
  const [sequenceInput, setSequenceInput] = useState<string | null>(null), [dayInput, setDayInput] = useState('');
  const operation = useRef(false), fileRef = useRef<HTMLInputElement>(null);
  const sequenceId = useId(), dayId = useId(), dialogTitleId = useId(), rangeId = useId();
  const lastSeq = history?.entries.at(-1)?.seq ?? 0;
  const seq = replay?.seq ?? lastSeq;
  const lastDay = history?.entries.at(-1)?.after.day ?? history?.startDay ?? world.day;
  const currentDay = replay?.world.day ?? lastDay;
  const locked = busy || operating;
  const full = !!history && (history.entries.length >= MAX_HISTORY_ENTRIES || historyBytes >= MAX_HISTORY_BYTES);
  const branchStale = confirmation?.type === 'branch' && (!replay || replay.seq !== confirmation.position.seq || history?.runId !== confirmation.position.runId);
  const nearby = history?.entries.slice(Math.max(0, seq - 20), Math.min(history.entries.length, seq + 20)) ?? [];

  async function perform(action: () => Promise<void>) {
    if (operation.current || busy) return;
    operation.current = true; setOperating(true); setError('');
    try { await action(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '历史操作未完成，原记录已保留。'); }
    finally { operation.current = false; setOperating(false); }
  }
  async function seek(value: number) {
    if (!replay || !compatible) return;
    onPlaying(false);
    await perform(async () => {
      if (!Number.isSafeInteger(value) || value < 0 || value > lastSeq) throw new Error(`请输入 0 至 ${lastSeq} 之间的记录序号。`);
      await onSeek(value); setSequenceInput(null);
    });
  }
  function seekDay() {
    const day = Number(dayInput);
    if (!history || dayInput.trim() === '' || !Number.isSafeInteger(day) || day < history.startDay || day > lastDay) { setError(`请输入第 ${history?.startDay ?? 0} 至 ${lastDay} 日。`); return; }
    const entry = [...history.entries].reverse().find(item => item.after.day <= day);
    void seek(entry?.seq ?? 0);
  }
  async function confirm() {
    if (!confirmation || branchStale) return;
    await perform(async () => {
      if (confirmation.type === 'record') { if (!onRecord) throw new Error('当前世界不能创建记录副本。'); await onRecord(); }
      else if (confirmation.type === 'import') { if (!onImport) throw new Error('当前无法导入历史记录。'); await onImport(confirmation.file); }
      else { if (!onBranch) throw new Error('当前无法创建分支。'); await onBranch(confirmation.position); }
      setConfirmation(null);
    });
  }

  return <div className="history-panel" data-testid="history-panel">
    <input ref={fileRef} className="visually-hidden" type="file" accept=".json,application/json" aria-label="选择历史记录文件" disabled={locked || (!!history && !compatible)} onChange={event => { const file = event.target.files?.[0]; if (file) { onPause(); setError(''); setConfirmation({ type: 'import', file }); } event.target.value = ''; }} />
    <div className="history-overview"><div><span className={`history-dot ${history && !archive && !replay && compatible ? 'is-recording' : ''}`} /><strong>{!history ? '尚未开始历史记录' : !compatible ? '记录保留 · 引擎不兼容' : archive ? '只读历史归档' : replay ? '只读历史回放' : '历史记录中'}</strong>{history && <small>从第 {history.startDay} 日开始 · {history.entries.length} / {MAX_HISTORY_ENTRIES} 条</small>}</div><div className="history-file-actions">{history && <button disabled={locked} onClick={() => void perform(onExport)}>导出历史</button>}{onImport && <button disabled={locked || (!!history && !compatible)} onClick={() => fileRef.current?.click()}>导入历史</button>}</div></div>
    {!history ? <div className="history-empty"><p>真实记录从当前快照开始，逐日推演与每次成功命令各留一条。同一天可有多条记录；不会补造此前历史。</p>{world.scenario === 'custom-world' && onRecord ? <button className="history-primary" disabled={locked} onClick={() => { onPause(); setError(''); setConfirmation({ type: 'record' }); }}>开始记录副本</button> : <p>从世界工坊创建自建世界后，可开始记录；已有历史文件也可在此导入。</p>}</div> : <>
      <div className="history-storage"><span>{(historyBytes / 1024 / 1024).toFixed(2)} / {MAX_HISTORY_BYTES / 1024 / 1024} MiB · 单份记录</span><span role="status">{saveStatus}</span>{history.parent && <span>分支起点：原史记录 #{history.parent.seq}</span>}</div>
      {!compatible ? <p className="history-warning" role="status">此历史由不同引擎记录。原记录完整保留，当前只可导出；不能回放或创建分支。请返回工坊继续其他推演。</p> : <>
        {full && <p className="history-warning">本段记录已达条数或容量上限。历史保留，继续前请导出，并从所选记录创建独立分支。</p>}
        {!replay ? <div className="history-start"><p>{archive ? '这是导入的只读归档。查看历史后，可从任一记录创建新分支继续推演。' : '进入回放会暂停当前推演。查看旧日地图与账册，不会修改当前世界。'}</p><button className="history-primary" disabled={locked} onClick={() => void perform(onEnterReplay)}>进入历史回放</button></div> : <div className="history-replay" data-testid="history-replay-controls">
          <div className="history-position"><strong>第 <b data-testid="history-day">{currentDay}</b> 日</strong><span>记录 <b data-testid="history-seq">{seq}</b> / {lastSeq}</span><div className="history-playback"><button aria-label="上一条记录" disabled={locked || seq <= 0} onClick={() => void seek(seq - 1)}>‹</button><button disabled={operating || (!replay.playing && (busy || seq >= lastSeq))} onClick={() => { setError(''); onPlaying(!replay.playing); }} aria-label={replay.playing ? '暂停回放' : '播放回放'}>{replay.playing ? 'Ⅱ 暂停回放' : '▶ 播放回放'}</button><button aria-label="下一条记录" disabled={locked || seq >= lastSeq} onClick={() => void seek(seq + 1)}>›</button></div></div>
          <label className="visually-hidden" htmlFor={rangeId}>历史时间轴</label><input id={rangeId} className="history-range" type="range" min={0} max={lastSeq} step={1} value={sequenceInput ?? seq} disabled={locked || lastSeq === 0} onChange={event => { onPlaying(false); setSequenceInput(event.target.value); }} onPointerUp={event => void seek(Number(event.currentTarget.value))} onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) void seek(Number(event.currentTarget.value)); }} />
          <div className="history-seek-fields"><div><label htmlFor={sequenceId}>记录序号</label><input id={sequenceId} type="number" min={0} max={lastSeq} step={1} value={sequenceInput ?? seq} disabled={locked} onChange={event => setSequenceInput(event.target.value)} /><button disabled={locked || sequenceInput === ''} onClick={() => void seek(Number(sequenceInput ?? seq))}>定位记录</button></div><div><label htmlFor={dayId}>按日期定位</label><input id={dayId} type="number" min={history.startDay} max={lastDay} step={1} value={dayInput} placeholder={String(currentDay)} disabled={locked} onChange={event => setDayInput(event.target.value)} /><button disabled={locked || !dayInput.trim()} onClick={seekDay}>定位当日末条</button></div></div>
          <div className="history-replay-actions"><small>日期定位到当日最后一条；序号可区分同日命令。</small>{!archive && <button disabled={locked} onClick={() => { onPlaying(false); onExitReplay(); setSequenceInput(null); setError(''); }}>退出回放</button>}{onBranch && <button className="history-primary" disabled={locked} onClick={() => { onPlaying(false); setError(''); setConfirmation({ type: 'branch', position: { runId: history.runId, seq }, day: currentDay }); }}>从此处创建分支</button>}</div>
        </div>}
        <details className="history-record-list"><summary>逐条记录 <span>{history.entries.length} 次已记录操作</span></summary><button disabled={locked || !replay} onClick={() => void seek(0)} aria-pressed={seq === 0}><span>#0 · 第 {history.startDay} 日</span><strong>开始记录时的世界</strong></button>{nearby.map(entry => <button key={entry.seq} disabled={locked || !replay} onClick={() => void seek(entry.seq)} aria-pressed={seq === entry.seq}><span>#{entry.seq} · 第 {entry.after.day} 日</span><strong>{entryLabel(entry, history.initial.world)}</strong></button>)}{history.entries.length > nearby.length && <p>显示当前序号附近的 {nearby.length} 条，可通过序号定位其余记录。</p>}</details>
      </>}
    </>}
    {error && <p className="history-error" role="alert">{error}</p>}
    {confirmation && <ModalDialog titleId={dialogTitleId} className="history-confirm" locked={operating} onDismiss={() => setConfirmation(null)}><small>独立历史 · 原世界保留</small><h2 id={dialogTitleId}>{confirmation.type === 'record' ? '开始记录副本？' : confirmation.type === 'branch' ? '从此处创建分支？' : '导入只读历史归档？'}</h2><p>{confirmation.type === 'record' ? `将暂停当前推演，从当前第 ${world.day} 日的权威快照创建独立记录副本。此前未记录的过程不会补造，原世界与原存档保留。` : confirmation.type === 'branch' ? `从第 ${confirmation.day} 日、记录 #${confirmation.position.seq} 创建新的推演与记录。该位置之后的原历史不会被覆盖，也不会被带入新分支。` : `将完整校验「${confirmation.file.name}」，作为独立的只读归档打开。当前世界与历史不会被覆盖；若要继续推演，请从归档创建分支。`}</p>{branchStale && <p role="alert">所选记录已变化，请取消后重新选择分支起点。</p>}{error && <p role="alert">{error}</p>}<div className="confirm-actions"><button autoFocus disabled={operating} onClick={() => setConfirmation(null)}>取消</button><button className="primary-button" disabled={locked || branchStale} onClick={() => void confirm()}>{confirmation.type === 'record' ? '确认开始记录' : confirmation.type === 'branch' ? '确认创建分支' : '确认导入历史'}</button></div></ModalDialog>}
  </div>;
}
