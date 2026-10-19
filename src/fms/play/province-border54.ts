import type {FmsDocument} from '../model';
import type {World} from '../../sim/types';
import {stateBorderView55} from './state-border55';
type Input={terrain:FmsDocument;world:World;scale:number};
/** Geometry is content-checked once per reader; ownership is read on EVERY
 * call so captures within one occupation phase cannot retain old modifiers.
 * The derived cache is never serialized; old journals use their frozen engine. */
export function provinceBorderReader54(r:Input,world:World=r.world):(id:string)=>boolean{
 return stateBorderView55(r,world).protruding;
}
