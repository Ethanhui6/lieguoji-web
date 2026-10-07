import {it,expect} from 'vitest';
import {nativeLeaveWarDisposition} from './participation-leave';
const war={primaryAttackerId:1,primaryDefenderId:2,participants:[{stateId:1,side:0 as const},{stateId:2,side:1 as const},{stateId:3,side:0 as const}]};
it('principal leaves through EndWar reason 2 rather than being silently removed',()=>{expect(nativeLeaveWarDisposition(war,1)).toBe('end');expect(nativeLeaveWarDisposition(war,2)).toBe('end');});
it('supporter leaves without ending its side',()=>{expect(nativeLeaveWarDisposition(war,3)).toBe('remove-and-continue');});
it('last living member removal ends a side whose principal was already destroyed',()=>{expect(nativeLeaveWarDisposition({...war,participants:war.participants.slice(1)},3)).toBe('remove-and-end');});
it('absent or native none-side country does not mutate a war',()=>{expect(nativeLeaveWarDisposition(war,99)).toBe('absent');expect(nativeLeaveWarDisposition({...war,participants:[{stateId:9,side:2}]},9)).toBe('absent');});
