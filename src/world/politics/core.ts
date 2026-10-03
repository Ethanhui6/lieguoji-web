import type { AtlasDocument } from '../atlas-format';
import type { AtlasControl } from '../model';
import { countryClaimCells, countryGeographySource, countryLandAt } from './geography';
import { selectCountryPolygon } from './country-selection';
import { COUNTRY_LIMITS, countryId, encodeCountryDocument, validateCountryCommand, validateCountryDocument, type CountryCommand, type CountryDocument, type CountryPoint } from './model';

export interface CountryCreationIds { nationId?: string; regimeId?: string; cityId?: string }
function assertGeographySource(base: CountryDocument, geography: AtlasDocument) {
  const actual = countryGeographySource(geography), expected = base.source;
  if (actual.draftId !== expected.draftId || actual.revision !== expected.revision || actual.rootDigest !== expected.rootDigest || actual.manifestDigest !== expected.manifestDigest || actual.atlasFormat !== expected.atlasFormat)
    throw new Error('国家实体与已验证地理来源身份不一致。');
}
/** Once at create/open, not on each rename. The field/query adapter retains
 * its own authority; this never treats model-shaped cell IDs as real land. */
export async function validateCountryWorldGeography(base: CountryDocument, geography: AtlasDocument, control?: AtlasControl): Promise<void> {
  if (!validateCountryDocument(base)) throw new Error('国家实体格式无效。');
  base = structuredClone(base);
  assertGeographySource(base, geography); control?.signal?.throwIfAborted();
  const cells = base.territories.map(t => t.cellId), maximum = geography.manifest.spec.columns * geography.manifest.spec.rows;
  if (cells.some(cell => cell >= maximum)) throw new Error('国家领土引用超出实际地理范围。');
  for (let offset = 0; offset < cells.length; offset += COUNTRY_LIMITS.commandCells) {
    const batch = cells.slice(offset, offset + COUNTRY_LIMITS.commandCells), land = await countryClaimCells(geography, batch, control);
    if (land.length !== batch.length || land.some((cell, i) => cell !== batch[i])) throw new Error('国家领土包含没有真实陆地的地块。');
    control?.signal?.throwIfAborted();
  }
  const territories = new Map(base.territories.map(t => [t.cellId, t]));
  for (const city of base.cities) {
    const surface = await countryLandAt(geography, city.positionQ.xQ, city.positionQ.yQ, control), territory = territories.get(surface.cellId);
    if (!surface.land || territory?.legalNationId !== city.nationId || territory.controllingNationId !== city.nationId) throw new Error('保存的城市不在所属国家实际陆地内。');
    control?.signal?.throwIfAborted();
  }
}
export function makeCountryCreationIds(command: CountryCommand): CountryCreationIds {
  return command.type === 'create-nation' || command.type === 'create-nation-shape' ? { nationId: `nation-${crypto.randomUUID()}`, regimeId: `regime-${crypto.randomUUID()}` }
    : command.type === 'create-city' ? { cityId: `city-${crypto.randomUUID()}` } : {};
}
export async function applyCountryCommand(base: CountryDocument, raw: CountryCommand, geography: AtlasDocument, ids: CountryCreationIds = makeCountryCreationIds(raw), control?: AtlasControl): Promise<{ document: CountryDocument; description: string }> {
  ids = { ...ids };
  if (!validateCountryDocument(base) || !validateCountryCommand(raw)) throw new Error('国家命令或当前实体状态无效。');
  if (base.version === 1 && (raw.type === 'create-nation-shape' || raw.type === 'claim-territory-shape')) throw new Error('自由圈地需要先明确建立 v2 独立副本；旧档保持原规则。');
  assertGeographySource(base, geography);
  control?.signal?.throwIfAborted();
  const command = structuredClone(raw), next = structuredClone(base);
  if (command.type === 'undo') throw new Error('撤销必须由已验证的持久历史执行。');
  if (base.revision === Number.MAX_SAFE_INTEGER) throw new Error('国家世界修订已到上限。');
  next.revision++;
  const nation = 'nationId' in command ? next.nations.find(n => n.id === command.nationId) : undefined;
  if ('nationId' in command && !nation) throw new Error('目标国家不存在。');
  let description: string;
  if (command.type === 'create-nation' || command.type === 'claim-territory' || command.type === 'create-nation-shape' || command.type === 'claim-territory-shape') {
    const cells = 'outlineQ' in command ? (await selectCountryPolygon(geography, { source: base.source, pointsQ: command.outlineQ }, control)).cellIds : await countryClaimCells(geography, command.cellIds, control); control?.signal?.throwIfAborted();
    if (!cells.length) throw new Error('所选范围没有可划入国家的真实陆地。');
    const nationId = command.type === 'create-nation' || command.type === 'create-nation-shape' ? ids.nationId : command.nationId;
    if (!countryId(nationId, 'nation')) throw new Error('新国家身份无效。');
    const territories = new Map(next.territories.map(t => [t.cellId, t]));
    for (const cellId of cells) { const existing = territories.get(cellId); if (existing && (existing.legalNationId !== nationId || existing.controllingNationId !== nationId)) throw new Error(`地块 #${cellId} 已属于其他国家；本次不会覆盖。`); }
    const added = cells.filter(cellId => !territories.has(cellId));
    if (!added.length) throw new Error('这些陆地已经属于该国，没有需要提交的变化。');
    if (territories.size + added.length > COUNTRY_LIMITS.territories) throw new Error('国家领土超过本世界容量上限。');
    if (command.type === 'create-nation' || command.type === 'create-nation-shape') {
      if (next.nations.length >= COUNTRY_LIMITS.nations || !countryId(ids.regimeId, 'regime')) throw new Error('国家数量已达上限或政权身份无效。');
      const cell = cells[0], spec = geography.manifest.spec, labelAnchorQ: CountryPoint = { xQ: Math.round((cell % spec.columns + .5) * 4096 * 256 / spec.columns), yQ: Math.round((Math.floor(cell / spec.columns) + .5) * 4096 * 256 / spec.rows) };
      next.nations.push({ id: nationId, name: command.name, color: command.color.toLowerCase(), regimeId: ids.regimeId, capitalCityId: null, labelAnchorQ });
      next.regimes.push({ id: ids.regimeId, nationId, name: `${command.name.slice(0, 76)}政权` });
      description = `建立「${command.name}」，划入 ${added.length} 个地块内的实际陆地；海域保持不变。`;
    } else description = `为「${nation!.name}」增加 ${added.length} 个地块内的实际陆地。`;
    for (const cellId of added) territories.set(cellId, { cellId, legalNationId: nationId, controllingNationId: nationId });
    next.territories = [...territories.values()].sort((a, b) => a.cellId - b.cellId);
  } else if (command.type === 'create-city') {
    if (next.cities.length >= COUNTRY_LIMITS.cities || !countryId(ids.cityId, 'city')) throw new Error('城市数量已达上限或城市身份无效。');
    const surface = await countryLandAt(geography, command.positionQ.xQ, command.positionQ.yQ, control); control?.signal?.throwIfAborted();
    const owner = next.territories.find(t => t.cellId === surface.cellId);
    if (!surface.land || owner?.legalNationId !== command.nationId || owner.controllingNationId !== command.nationId) throw new Error('城市必须落在该国实际拥有的陆地上。');
    if (next.cities.some(c => c.positionQ.xQ === command.positionQ.xQ && c.positionQ.yQ === command.positionQ.yQ)) throw new Error('这个位置已有城市。');
    next.cities.push({ id: ids.cityId, nationId: command.nationId, name: command.name, positionQ: { ...command.positionQ }, labelAnchorQ: { ...command.positionQ } });
    description = `在「${nation!.name}」创建城市「${command.name}」；当前仅建立聚落实体，不生成虚构人口。`;
  } else if (command.type === 'set-capital') {
    const city = next.cities.find(c => c.id === command.cityId);
    if (!city || city.nationId !== nation!.id) throw new Error('首都必须引用本国已有城市。');
    if (nation!.capitalCityId === city.id) throw new Error('这座城市已经是首都。');
    nation!.capitalCityId = city.id; description = `将「${city.name}」设为「${nation!.name}」首都，原城市保持不变。`;
  } else if (command.type === 'rename-nation') {
    if (nation!.name === command.name) throw new Error('国家名称没有变化。');
    description = `将「${nation!.name}」更名为「${command.name}」，身份和领土保持不变。`; nation!.name = command.name;
  } else {
    const city = next.cities.find(c => c.id === command.cityId); if (!city) throw new Error('目标城市不存在。');
    if (city.name === command.name) throw new Error('城市名称没有变化。');
    description = `将「${city.name}」更名为「${command.name}」，位置和城市身份保持不变。`; city.name = command.name;
  }
  if (next.version === 1) encodeCountryDocument(next);
  else if (!validateCountryDocument(next)) throw new Error('国家实体字段、引用或容量无效。');
  return { document: next, description };
}
