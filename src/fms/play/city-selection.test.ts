import {expect,it} from 'vitest';
import {cityLabels,selectedCityLabel,type CityCandidate} from './city-labels';
const city:CityCandidate={id:'small',name:'云溪',x:200,y:160,selected:true};
it('keeps a complete selected name when every ordinary placement is obstructed',()=>{
  const obstacles=[{x:200,y:160,width:800,height:500}],cities=[city,{...city,id:'other',selected:false}],before=structuredClone({obstacles,cities});
  const result=cityLabels(cities,obstacles,{width:428,height:926},true);
  expect(result).toHaveLength(1);expect(result[0].id).toBe('small');expect(result[0].lines?.join('')).toBe(city.name);expect(result[0].callout).toBeDefined();expect({obstacles,cities}).toEqual(before);
});
it('uses a free sideways position rather than hiding under the country label',()=>{
  const obstacle={x:200,y:140,width:40,height:45},label=selectedCityLabel(city,[obstacle],{width:428,height:926})!,b=label.callout!;
  expect(Math.abs(b.x-obstacle.x)>=(b.width+obstacle.width)/2+4||Math.abs(b.y-obstacle.y)>=(b.height+obstacle.height)/2+4).toBe(true);
  expect(label.x).toBe(city.x);expect(label.y).toBe(city.y);
});
it.each([[0,0],[428,0],[0,926],[428,926]])('contains the callout at the viewport edge %s,%s without dropping long names',(x,y)=>{
  const name='东海长风云溪'.repeat(8),label=selectedCityLabel({...city,name,x,y},[],{width:428,height:926})!,b=label.callout!;
  expect(label.lines!.join('')).toBe(name);expect(b.x-b.width/2).toBeGreaterThanOrEqual(0);expect(b.x+b.width/2).toBeLessThanOrEqual(428);expect(b.y-b.height/2).toBeGreaterThanOrEqual(0);expect(b.y+b.height/2).toBeLessThanOrEqual(926);
});
it('does not add phantom labels for a city outside the viewport',()=>{
  expect(selectedCityLabel({...city,x:-1},[],{width:428,height:926})).toBeUndefined();
  expect(selectedCityLabel({...city,y:927},[],{width:428,height:926})).toBeUndefined();
});
it('keeps a long selected name clear of actual mobile DOM controls even when map labels fill the free space',()=>{
  const ui=[{x:102,y:202,width:180,height:44},{x:214,y:16,width:404,height:48},{x:214,y:555,width:408,height:358},{x:390,y:248,width:52,height:136}];
  const result=selectedCityLabel({...city,name:'东海长风云溪'.repeat(4),x:214,y:246},[{x:214,y:246,width:800,height:600}],{width:428,height:926},ui)!;
  const box=result.callout!;expect(result.lines!.join('')).toBe('东海长风云溪'.repeat(4));
  for(const b of ui)expect(Math.abs(box.x-b.x)>=(box.width+b.width)/2+4||Math.abs(box.y-b.y)>=(box.height+b.height)/2+4).toBe(true);
});
it('does not create an unclickable plate when DOM UI covers the entire viewport',()=>{
  expect(selectedCityLabel(city,[],{width:428,height:926},[{x:214,y:463,width:428,height:926}])).toBeUndefined();
});
it('keeps a selected capital near its real position when dense small units leave only distant empty space',()=>{
  const capital={...city,name:'沃洛科沃',x:620,y:270},ui=[{x:600,y:28,width:1180,height:48}],dense=[{x:620,y:270,width:160,height:160}];
  const label=selectedCityLabel(capital,dense,{width:1280,height:720},ui)!;
  expect(Math.hypot(label.callout!.x-capital.x,label.callout!.y-capital.y)).toBeLessThan(80);
  expect(label.lines!.join('')).toBe(capital.name);expect(label.x).toBe(capital.x);expect(label.y).toBe(capital.y);
});
