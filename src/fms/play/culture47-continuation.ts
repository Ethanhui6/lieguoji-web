import {continuationJournal47,type Culture47Journal} from './culture47-session';
import {sameCulture47Value} from './culture47-equal';
import type {Culture47Snapshot} from './culture47.worker';

/** Compare the two independently replayed histories before any write. */
export function assertContinuationMatch47(source:Culture47Snapshot,candidate:Culture47Snapshot,journal:Culture47Journal){
  const fork=journal.fork;
  if(!fork||source.run.id!==source.journal.id||source.run.world.custom?.id!==source.journal.id||candidate.run.id!==journal.id||candidate.run.world.custom?.id!==journal.id||fork.id!==source.journal.id||fork.engine!==source.journal.engine||fork.sequence!==source.journal.actions.length||!sameCulture47Value(candidate.journal,journal)||!sameCulture47Value(journal.opening,source.journal.opening)||!sameCulture47Value(journal.actions,source.journal.actions))throw Error('续玩副本未对应当前已确认历史，原档保持。');
  if('previous'in fork&&!sameCulture47Value(fork.previous,source.journal.fork??null))throw Error('续玩前史身份不一致，原档保持。');
  const run=structuredClone(candidate.run);
  run.id=source.run.id;run.world.custom!.id=source.run.world.custom!.id;
  if(!sameCulture47Value(run,source.run)||!sameCulture47Value(candidate.frame,source.frame))throw Error('新旧引擎的时间、人物、军队或历史不一致，未创建副本。');
}
export {continuationJournal47};
