/** Reserved V4 wire contracts. This descriptor does not claim an implemented simulation. */
export const V4_VERSIONS = Object.freeze({
  world: 3, rules: '0.3.0', geography: 1, administration: 1, population: 1,
  characters: 1, families: 1, faiths: 1, commands: 1, history: 2, storage: 2,
} as const);
export type V4Versions = typeof V4_VERSIONS;
export type EntityKind = 'geo' | 'country' | 'regime' | 'administration' | 'settlement' |
  'culture' | 'person' | 'family' | 'faith' | 'organization' | 'army';
export type EntityId<K extends EntityKind> = `${K}:${string}`;
export type RevisionSet = Readonly<{ world: number; geography: number; administration: number; society: number }>;
export type WorldDescriptor = Readonly<{
  format: 'lieguoji-world'; versions: V4Versions; id: string; name: string;
  engineFingerprint: string; seed: string; revision: RevisionSet;
}>;
export type AdministrativeLevel = Readonly<{
  id: string; name: string; order: number; functions: readonly ('tax' | 'justice' | 'recruitment' | 'transport')[];
}>;
export type AdministrativeScheme = Readonly<{
  version: 1; id: string; countryId: EntityId<'country'>; levels: readonly AdministrativeLevel[];
  enclaves: 'allow' | 'forbid'; islands: 'separate' | 'maritime-group';
}>;
export type PersonIdentity = Readonly<{
  version: 1; id: EntityId<'person'>; familyId: EntityId<'family'> | null;
  cultureId: EntityId<'culture'>; faithId: EntityId<'faith'> | null;
}>;
export type FaithIdentity = Readonly<{
  version: 1; id: EntityId<'faith'>; name: string; parentId: EntityId<'faith'> | null;
}>;
export type CommandDomain = 'geography' | 'administration' | 'society' | 'simulation';
export type CommandEnvelope = Readonly<{
  format: 'lieguoji-command'; version: 1; worldId: string; commandId: string;
  engineFingerprint: string; expected: RevisionSet; domain: CommandDomain;
  type: string; payload: Readonly<Record<string, unknown>>;
}>;

const record = (raw: unknown): raw is Record<string, unknown> => raw !== null && typeof raw === 'object' && !Array.isArray(raw);
const exact = (raw: Record<string, unknown>, keys: readonly string[]) => Object.keys(raw).length === keys.length && keys.every(key => Object.hasOwn(raw, key));
const id = (raw: unknown): raw is string => typeof raw === 'string' && /^[a-z][a-z0-9-]{0,95}$/.test(raw);
const fingerprint = (raw: unknown) => typeof raw === 'string' && /^[a-f0-9]{64}$/.test(raw);
export function validateV4Versions(raw: unknown): raw is V4Versions {
  return record(raw) && exact(raw, Object.keys(V4_VERSIONS)) && Object.entries(V4_VERSIONS).every(([key, value]) => raw[key] === value);
}
export function validateRevisions(raw: unknown): raw is RevisionSet {
  return record(raw) && exact(raw, ['world', 'geography', 'administration', 'society']) && Object.values(raw).every(value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER);
}
/** Only envelope validation. Each registered command must separately validate its payload and authority. */
export function validateCommandEnvelope(raw: unknown): raw is CommandEnvelope {
  return record(raw) && exact(raw, ['format', 'version', 'worldId', 'commandId', 'engineFingerprint', 'expected', 'domain', 'type', 'payload']) &&
    raw.format === 'lieguoji-command' && raw.version === 1 && id(raw.worldId) && id(raw.commandId) && fingerprint(raw.engineFingerprint) &&
    validateRevisions(raw.expected) && typeof raw.domain === 'string' && ['geography', 'administration', 'society', 'simulation'].includes(raw.domain) && id(raw.type) && record(raw.payload);
}
export function requireCommandContext(command: unknown, context: { worldId: string; engineFingerprint: string; revision: RevisionSet }): asserts command is CommandEnvelope {
  if (!validateCommandEnvelope(command)) throw new Error('命令封装或版本无效，尚未执行。');
  if (command.worldId !== context.worldId || command.engineFingerprint !== context.engineFingerprint) throw new Error('命令与世界身份或规则指纹不符，尚未执行。');
  if (!validateRevisions(context.revision) || Object.keys(context.revision).some(key => command.expected[key as keyof RevisionSet] !== context.revision[key as keyof RevisionSet])) throw new Error('命令预览已过期，请重新预览后确认。');
}
