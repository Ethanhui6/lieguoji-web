/** Biomes.SpeedModifier: 13 float32 entries from the owner's metadata initializer.
 * SHA256 of the 52 initializer bytes: 4d5011c5d503660783740457ce0c690441d7ce6fab5048642d16ff97acd7026b.
 * Army.GetSpeed indexes the current cell; mountain/plateau province flags take precedence. */
export const NATIVE_BIOME_SPEED=Object.freeze([1,.7,.7,1,1,1,1,1,1,1,1,.7,1].map(Math.fround));
export function nativeBiomeSpeed(id:number){
 if(!Number.isInteger(id)||id<0||id>=NATIVE_BIOME_SPEED.length)throw Error('行军生物群系编号无效。');
 return NATIVE_BIOME_SPEED[id];
}
