import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {verifyTacticsCompatibility,fingerprintCampaign} from '../../../scripts/fms-campaign-fingerprint';
import {fingerprintTactics} from '../../../scripts/fms-tactics-fingerprint';
it('keeps all 44 published v9 sources and the exact v9 fingerprint immutable',()=>{expect(()=>verifyTacticsCompatibility()).not.toThrow();expect(fingerprintTactics()).toBe('eade9f19e7b2bfecef9b59b688bd53c29ee95c13af1eb5e3f440b20fc5ed4dad');expect(fingerprintCampaign()).toBe(__FMS_CAMPAIGN_ENGINE__);});
it.each(['src/fms/play/tactics-runtime.ts','src/fms/play/compat/tactics1/fms/play/tactics-runtime.ts.source'])('rejects a changed live or archived runtime: %s',target=>{expect(()=>verifyTacticsCompatibility(f=>readFileSync(f,'utf8').replaceAll('\r\n','\n')+(f===target?'\n// changed':''))).toThrow('Published v9 execution changed');});
