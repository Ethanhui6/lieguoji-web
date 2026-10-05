import { createMilitaryCore } from './military-core';
import { applyMilitaryAction,previewMilitaryAction } from './military-actions';
import { createMilitaryCore as previewCore } from './compat/preview1/fms/play/military-core';
import { applyMilitaryAction as previewApply,previewMilitaryAction as previewAction } from './compat/preview1/fms/play/military-actions';
import manifest from './compat/preview1/manifest.json';
import { createMilitaryCore as military1Core } from './compat/military1/fms/play/military-core';
import { applyMilitaryAction as military1Apply,previewMilitaryAction as military1Preview } from './compat/military1/fms/play/military-actions';
import military1 from './compat/military1/manifest.json';
import type { UnitAssignments } from './military-profile';

export const previousMilitaryFingerprint=manifest.fingerprint;
export const military1Fingerprint=military1.fingerprint;
export const supportedMilitaryEngine=(engine:unknown)=>engine===__FMS_PLAY_ENGINE__||engine===previousMilitaryFingerprint||engine===military1Fingerprint;
/** Explicit immutable rule catalog, not an unknown-fingerprint fallback. */
export function militaryRules(engine:string,units:UnitAssignments){
  if(engine===military1Fingerprint)return {...military1Core(units),previewMilitaryAction:military1Preview,applyMilitaryAction:military1Apply};
  if(engine===__FMS_PLAY_ENGINE__)return {...createMilitaryCore(units),previewMilitaryAction,applyMilitaryAction};
  if(engine===previousMilitaryFingerprint)return {...previewCore(units),previewMilitaryAction:previewAction,applyMilitaryAction:previewApply};
  throw new Error('推演规则版本不同，已锁定读写。');
}
