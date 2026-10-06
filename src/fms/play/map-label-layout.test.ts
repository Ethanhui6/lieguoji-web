import {expect,it} from 'vitest';
import {countryLabelBox,capitalNameLabels} from './map-label-layout';
it('keeps a country component label within verified interior clearance while avoiding a capital',()=>{
  const anchor={x:100,y:100,width:90,height:20},box=countryLabelBox(anchor,70,[{x:100,y:100,width:22,height:22}]);
  expect(Math.hypot(box.x-anchor.x,box.y-anchor.y)).toBeLessThanOrEqual(56);expect(Math.abs(box.y-100)).toBeGreaterThanOrEqual(24);expect(anchor).toEqual({x:100,y:100,width:90,height:20});
});
it('never drops a tiny fragmented country label or moves it outside its safe circle',()=>{
  const anchor={x:100,y:100,width:80,height:14},box=countryLabelBox(anchor,2,[{x:100,y:100,width:800,height:800}]);expect(Math.hypot(box.x-100,box.y-100)).toBeLessThanOrEqual(1.6);expect(box.width).toBe(80);
});
it('capital names avoid country names and controls without moving the city input',()=>{
  const city={id:'capital',name:'埃利克奥斯',x:180,y:200,selected:false},obstacles=[{x:180,y:171,width:120,height:24},{x:180,y:200,width:22,height:22}];
  const result=capitalNameLabels([city],13,obstacles,{width:428,height:926});expect(result).toHaveLength(1);expect(result[0].y).toBeGreaterThan(200);expect(city.y).toBe(200);
});
it('does not truncate or overlay crowded capital names; the marker and selected callout remain separate',()=>{
  const city={id:'c',name:'长首都名'.repeat(6),x:70,y:70,selected:false};expect(capitalNameLabels([city],15,[],{width:100,height:100})).toEqual([]);
  expect(capitalNameLabels([{...city,name:'江陵'}],13,[{x:50,y:50,width:200,height:200}],{width:100,height:100})).toEqual([]);
});
