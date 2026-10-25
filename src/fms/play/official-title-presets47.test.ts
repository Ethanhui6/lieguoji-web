import {describe,expect,it} from 'vitest';
import {TITLE_POLITIES47,TITLE_PRESETS47,officeTitle47,titlePreset47} from './official-title-presets47';

describe('官职称谓 (original OfficialTitlePresets)',()=>{
  it('every preset names all six offices for every polity, and cultures pick the closest preset',()=>{
    for(const preset of Object.values(TITLE_PRESETS47))for(const polity of TITLE_POLITIES47)expect(preset.titles[polity].every(t=>t.length>0)).toBe(true);
    expect(officeTitle47('chinese','Kingdom','Chancellor')).toBe('丞相');
    expect(officeTitle47('english','Kingdom','Chancellor')).toBe('宰相');
    expect(officeTitle47('arab','Empire','WarCommander')).toBe('战时统帅');
    expect(titlePreset47('persian')).toBe('NeutralFantasy');
  });
});
