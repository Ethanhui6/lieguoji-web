import { createMilitaryCore } from './military-core';
import { applyMilitaryAction,previewMilitaryAction } from './military-actions';
import { createMilitaryCore as previewCore } from './compat/preview1/fms/play/military-core';
import { applyMilitaryAction as previewApply,previewMilitaryAction as previewAction } from './compat/preview1/fms/play/military-actions';
import manifest from './compat/preview1/manifest.json';
import { createMilitaryCore as military1Core } from './compat/military1/fms/play/military-core';
import { applyMilitaryAction as military1Apply,previewMilitaryAction as military1Preview } from './compat/military1/fms/play/military-actions';
import military1 from './compat/military1/manifest.json';
import { createMilitaryCore as mobilizationCore } from './compat/mobilization1/fms/play/military-core';
import { applyMilitaryAction as mobilizationApply,previewMilitaryAction as mobilizationPreview } from './compat/mobilization1/fms/play/military-actions';
import mobilization1 from './compat/mobilization1/manifest.json';
import type { UnitAssignments } from './military-profile';
import {createMilitaryCore as navalCore} from './compat/naval1/fms/play/military-core';
import {applyMilitaryAction as navalApply,previewMilitaryAction as navalPreview} from './compat/naval1/fms/play/military-actions';
import naval1 from './compat/naval1/manifest.json';
import {createMilitaryCore as realtimeCore} from './compat/realtime1/fms/play/military-core';
import {applyMilitaryAction as realtimeApply,previewMilitaryAction as realtimePreview} from './compat/realtime1/fms/play/military-actions';
import realtime1 from './compat/realtime1/manifest.json';
import {createMilitaryCore as battleCore} from './compat/battle1/fms/play/military-core';
import {applyMilitaryAction as battleApply,previewMilitaryAction as battlePreview} from './compat/battle1/fms/play/military-actions';
import battle1 from './compat/battle1/manifest.json';
import creation1 from './compat/creation1/manifest.json';
export const creationFingerprint=creation1.fingerprint;
import occupation1 from './compat/occupation1/manifest.json';
export const occupationInitialFingerprint=occupation1.fingerprint;
export const supportedOccupationEngine=(engine:unknown)=>engine===__FMS_PLAY_ENGINE__||engine===occupationInitialFingerprint||engine===creationFingerprint;
export const battleFingerprint=battle1.fingerprint;
export const realtimeFingerprint=realtime1.fingerprint;

export const previousMilitaryFingerprint=manifest.fingerprint;
export const military1Fingerprint=military1.fingerprint;
export const mobilizationFingerprint=mobilization1.fingerprint;
export const navalFingerprint=naval1.fingerprint;
export const supportedMilitaryEngine=(engine:unknown)=>engine===mobilizationFingerprint||engine===previousMilitaryFingerprint||engine===military1Fingerprint;
/** Explicit immutable rule catalog, not an unknown-fingerprint fallback. */
export function militaryRules(engine:string,units:UnitAssignments){
  if(engine===battleFingerprint)return {...battleCore(units,true,true),previewMilitaryAction:battlePreview,applyMilitaryAction:battleApply};
  if(engine===realtimeFingerprint)return {...realtimeCore(units,true),previewMilitaryAction:realtimePreview,applyMilitaryAction:realtimeApply};
  if(engine===navalFingerprint)return {...navalCore(units),previewMilitaryAction:navalPreview,applyMilitaryAction:navalApply};
  if(engine===mobilizationFingerprint)return {...mobilizationCore(units),previewMilitaryAction:mobilizationPreview,applyMilitaryAction:mobilizationApply};
  if(engine===military1Fingerprint)return {...military1Core(units),previewMilitaryAction:military1Preview,applyMilitaryAction:military1Apply};
  if(supportedOccupationEngine(engine))return {...createMilitaryCore(units,true,true),previewMilitaryAction,applyMilitaryAction};
  if(engine===previousMilitaryFingerprint)return {...previewCore(units),previewMilitaryAction:previewAction,applyMilitaryAction:previewApply};
  throw new Error('推演规则版本不同，已锁定读写。');
}
