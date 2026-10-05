/** Recovered from ColorUtils.c12 (.cctor RVA 0x842040), consumed by
 * GetStatePaletteColors 0x840B40. Order below separates adjacent hues for up to
 * eight states; adjacency optimization and opacity are web adaptations. */
export const originalStatePalette=['#dababf','#fb8072','#80b1d3','#fdb462','#b3de69','#fccde5','#c6b9c1','#bc80bd','#ccebc5','#ffed6f','#8dd3c7','#eb8de7'] as const;
export const statePalette=[2,1,4,7,9,10,3,11].map(i=>originalStatePalette[i]);
const oldPalette=['#537f95','#b86155','#659274','#8a7f9d','#b3984f','#7f9451','#8b9aab','#ac7294'];
/** Preserve custom colors. Only replace the exact previous generated palette in
 * this view; an old run's saved identity remains untouched. */
export function nationColor(nation:{id:string;color:string}):string{
  const index=/^n-[0-7]$/.test(nation.id)?Number(nation.id.slice(2)):-1;
  return index>=0&&nation.color===oldPalette[index]?statePalette[index]:nation.color;
}
export type PoliticalView='political'|'terrain';
export const politicalStyle=(mode:PoliticalView)=>({fill:mode==='political'?.82:.12,province:mode==='political'?.2:.09,border:mode==='political'?2.2:1.3});
