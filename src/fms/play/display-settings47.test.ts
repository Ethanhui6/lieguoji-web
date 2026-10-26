import {describe,it,expect} from 'vitest';
import {DISPLAY_DEFAULTS47,normalizeDisplaySettings47} from './display-settings47';

describe('per-viewer map appearance',()=>{
  it('migrates older preferences without changing existing choices or the default terrain preset',()=>{
    expect(normalizeDisplaySettings47({stateNameScale:1.5,fullName:false})).toEqual({...DISPLAY_DEFAULTS47,stateNameScale:1.5,fullName:false});
  });
  it('keeps hidden layers and fully transparent political fill when explicitly chosen',()=>{
    expect(normalizeDisplaySettings47({provinceBorders:false,cityNames:false,biomeIcons:false,stateOpacity:0,provinceBorderColor:'#aB1234'})).toMatchObject({provinceBorders:false,cityNames:false,biomeIcons:false,stateOpacity:0,provinceBorderColor:'#aB1234'});
  });
  it('rejects corrupt preferences and bounds numeric input before reaching the renderer',()=>{
    expect(normalizeDisplaySettings47(null)).toEqual(DISPLAY_DEFAULTS47);
    expect(normalizeDisplaySettings47({stateNameColor:'red',provinceBorderColor:'#fff',stateOpacity:Infinity,cityScale:NaN})).toEqual(DISPLAY_DEFAULTS47);
    expect(normalizeDisplaySettings47({stateOpacity:4,armyScale:-3})).toMatchObject({stateOpacity:1,armyScale:.5});
  });
});
