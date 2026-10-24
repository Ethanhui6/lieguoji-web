/** System.Random(int seed) as in the .NET reference source (Knuth's
 * subtractive generator, the algorithm Mono/IL2CPP ship). Only the members the
 * original game uses are ported. */
const MBIG=2147483647,MSEED=161803398;
export class DotNetRandom{
 private seed=new Int32Array(56);private inext=0;private inextp=21;
 constructor(seed:number){
  seed|=0;
  const subtraction=seed===-2147483648?MBIG:Math.abs(seed);
  let mj=(MSEED-subtraction)|0,mk=1;
  this.seed[55]=mj;
  for(let i=1;i<55;i++){const ii=(21*i)%55;this.seed[ii]=mk;mk=(mj-mk)|0;if(mk<0)mk=(mk+MBIG)|0;mj=this.seed[ii];}
  for(let k=1;k<5;k++)for(let i=1;i<56;i++){this.seed[i]=(this.seed[i]-this.seed[1+(i+30)%55])|0;if(this.seed[i]<0)this.seed[i]=(this.seed[i]+MBIG)|0;}
 }
 private internalSample(){
  let a=this.inext+1,b=this.inextp+1;if(a>=56)a=1;if(b>=56)b=1;
  let v=(this.seed[a]-this.seed[b])|0;if(v===MBIG)v--;if(v<0)v=(v+MBIG)|0;
  this.seed[a]=v;this.inext=a;this.inextp=b;return v;
 }
 /** NextDouble(): Sample() = InternalSample() * (1.0 / int.MaxValue). */
 nextDouble(){return this.internalSample()*(1/MBIG);}
}
