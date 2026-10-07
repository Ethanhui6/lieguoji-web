/** Original System.Math.Round ToEven path: 18373C0 -> 005FD0.
 * 1837940 supplies this exact double table and abs limit. This is intentionally
 * not modern .NET Round: preserve the original double +/- .5 intermediate. */
const powers=[1,10,100,1000,10000,100000,1000000,10000000,100000000,1000000000,10000000000,100000000000,1000000000000,10000000000000,100000000000000,1000000000000000] as const;
/** Fixed ToEven mode only; no claim about the separate AwayFromZero path. */
export function nativeRoundToEven(value:number,digits:number):number{
 if(!Number.isInteger(digits)||digits<0||digits>15)throw new RangeError('digits');
 if(!(Math.abs(value)<1e16))return value;
 const scale=powers[digits],scaled=value*scale,integral=Math.trunc(scaled),fraction=scaled-integral;
 let rounded:number;
 if(scaled<0)rounded=fraction===-.5?(integral%2===0?integral:integral-1):Math.ceil(scaled-.5);
 else rounded=fraction===.5?(integral%2===0?integral:integral+1):Math.floor(scaled+.5);
 return rounded/scale;
}
