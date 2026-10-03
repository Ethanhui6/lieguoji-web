export const FMS_DEFAULT_COASTAL_WIDTH = 0.035;
export const FMS_MIN_COASTAL_WIDTH = 0.01;
export const FMS_MAX_COASTAL_WIDTH = 0.2;
export interface FmsNaturalizationOptions {
  seed: number; strength: number;
  /** Fraction of the shorter map side. This controls inland relief only;
   * the rendered coastline stays fixed. Omitted means the original 3.5%. */
  coastalWidth?: number;
}

export function validFmsNaturalizationOptions(raw: unknown): raw is FmsNaturalizationOptions {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const value = raw as Record<string, unknown>, keys = Object.keys(value);
  return keys.length === (Object.hasOwn(value, 'coastalWidth') ? 3 : 2)
    && keys.every(key => ['seed', 'strength', 'coastalWidth'].includes(key))
    && Object.hasOwn(value, 'seed') && Object.hasOwn(value, 'strength')
    && typeof value.seed === 'number' && Number.isInteger(value.seed) && value.seed >= 0 && value.seed <= 0xffffffff
    && typeof value.strength === 'number' && Number.isFinite(value.strength) && value.strength >= 0 && value.strength <= 1
    && (!Object.hasOwn(value, 'coastalWidth') || (typeof value.coastalWidth === 'number' && Number.isFinite(value.coastalWidth)
      && value.coastalWidth >= FMS_MIN_COASTAL_WIDTH && value.coastalWidth <= FMS_MAX_COASTAL_WIDTH));
}

export function fmsCoastalWidthWorld(width: number, height: number, pointCount: number, fraction: number): number {
  return Math.max(Math.sqrt(width * height / pointCount) * 1.8, Math.min(width, height) * fraction);
}
