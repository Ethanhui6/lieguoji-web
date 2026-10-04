import { describe, expect, it, vi } from 'vitest';
import { displayFmsDocument } from './display-document';
import { FmsClimateError } from './climate';
import type { FmsDocument } from './model';

describe('optional climate cannot desynchronize document display',()=>{
  it.each(['undo','redo','cancel','candidate'])('renders the requested %s target after climate rejection',()=>{
    const target={} as FmsDocument,prior={} as FmsDocument,calls:string[]=[];
    let visible=prior,mode='biome';const notify=vi.fn();
    const view={setDocument(doc:FmsDocument){calls.push('document');if(mode==='biome')throw new FmsClimateError();visible=doc;},setTerrainDisplay(next:string){calls.push(next);mode=next;}};
    displayFmsDocument(view,target,undefined,notify);
    expect(visible).toBe(target);expect(calls).toEqual(['document','height','document']);
    expect(notify).toHaveBeenCalledOnce();
  });
  it('does not hide unrelated rendering errors or announce a failed fallback',()=>{
    const target={} as FmsDocument,notify=vi.fn(),setTerrainDisplay=vi.fn();
    expect(()=>displayFmsDocument({setTerrainDisplay,setDocument(){throw Error('GPU');}},target,undefined,notify)).toThrow('GPU');
    expect(setTerrainDisplay).not.toHaveBeenCalled();expect(notify).not.toHaveBeenCalled();
    let count=0;
    expect(()=>displayFmsDocument({setTerrainDisplay,setDocument(){if(count++===0)throw new FmsClimateError();throw Error('GPU');}},target,undefined,notify)).toThrow('GPU');
    expect(notify).not.toHaveBeenCalled();
  });
});
