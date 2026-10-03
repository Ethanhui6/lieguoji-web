import type { AtlasDocument } from '../atlas-format';
import type { AtlasControl } from '../model';
import { countryClaimCells, countryGeographySource, countryLandAt } from './geography';
import { selectCountryPolygon } from './country-selection';
import { institutionFieldLabels } from './institution';
import { COUNTRY_LIMITS, countryGeometry, countryId, encodeCountryDocument, validateCountryCommand, validateCountryDocument, type CountryCommand, type CountryDocument, type CountryPoint } from './model';

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
  const geometry = countryGeometry(base);
  assertGeographySource(base, geography); control?.signal?.throwIfAborted();
  const cells = base.territories.map(t => t.cellId), maximum = geography.manifest.spec.columns * geography.manifest.spec.rows;
  if (cells.some(cell => cell >= maximum)) throw new Error('国家领土引用超出实际地理范围。');
  for (let offset = 0; offset < cells.length; offset += COUNTRY_LIMITS.commandCells) {
    const batch = cells.slice(offset, offset + COUNTRY_LIMITS.commandCells), land = await countryClaimCells(geography, batch, control, geometry);
    if (land.length !== batch.length || land.some((cell, i) => cell !== batch[i])) throw new Error('国家领土包含没有真实陆地的地块。');
    control?.signal?.throwIfAborted();
  }
  const territories = new Map(base.territories.map(t => [t.cellId, t]));
  for (const city of base.cities) {
    const surface = await countryLandAt(geography, city.positionQ.xQ, city.positionQ.yQ, control, geometry), territory = territories.get(surface.cellId);
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
  if (base.version === 1 && (raw.type === 'create-nation-shape' || raw.type === 'claim-territory-shape' || raw.type === 'release-territory-shape')) throw new Error('自由圈地需要先明确建立 v2 独立副本；旧档保持原规则。');
  if (raw.type === 'set-institution' && base.version !== 4) throw new Error('制度编辑需要先明确创建 v4 制度副本；旧世界和原历史保持不变。');
  if (raw.type === 'reassign-territory-shape' && base.version !== 4) throw new Error('归属编辑需要先明确创建 v4 制度副本；旧世界和原历史保持不变。');
  assertGeographySource(base, geography);
  control?.signal?.throwIfAborted();
  const command = structuredClone(raw), next = structuredClone(base);
  const geometry = countryGeometry(next);
  if (command.type === 'undo') throw new Error('撤销必须由已验证的持久历史执行。');
  if (base.revision === Number.MAX_SAFE_INTEGER) throw new Error('国家世界修订已到上限。');
  next.revision++;
  const nation = 'nationId' in command ? next.nations.find(n => n.id === command.nationId) : undefined;
  if ('nationId' in command && !nation) throw new Error('目标国家不存在。');
  let description: string;
  if (command.type === 'create-nation' || command.type === 'claim-territory' || command.type === 'create-nation-shape' || command.type === 'claim-territory-shape') {
    const cells = 'outlineQ' in command ? (await selectCountryPolygon(geography, { source: next.source, pointsQ: command.outlineQ, geometry }, control)).cellIds : await countryClaimCells(geography, command.cellIds, control, geometry); control?.signal?.throwIfAborted();
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
      const regime = { id: ids.regimeId, nationId, name: `${command.name.slice(0, 76)}政权` };
      if (next.version === 4) next.regimes.push({ ...regime, institution: null }); else next.regimes.push(regime);
      description = `建立「${command.name}」，划入 ${added.length} 个地块内的实际陆地；海域保持不变。`;
    } else description = `为「${nation!.name}」增加 ${added.length} 个地块内的实际陆地。`;
    for (const cellId of added) territories.set(cellId, { cellId, legalNationId: nationId, controllingNationId: nationId });
    next.territories = [...territories.values()].sort((a, b) => a.cellId - b.cellId);
  } else if (command.type === 'release-territory-shape') {
    const cells = (await selectCountryPolygon(geography, { source: next.source, pointsQ: command.outlineQ, geometry }, control)).cellIds;
    control?.signal?.throwIfAborted();
    const territories = new Map(next.territories.map(t => [t.cellId, t])), removed = new Set<number>();
    for (const cellId of cells) {
      const existing = territories.get(cellId);
      if (!existing) continue;
      if (existing.legalNationId !== command.nationId || existing.controllingNationId !== command.nationId) throw new Error(`圈选范围涉及其他国家的地块 #${cellId}；本次不会移除任何领土。`);
      removed.add(cellId);
    }
    if (!removed.size) throw new Error('圈选范围没有可移除的本国领土，没有需要提交的变化。');
    // A shape chooses whole authoritative political cells, not only the drawn
    // pixels. Protect cities even when their point lies outside the outline
    // but their owning cell's center/seed lies inside it.
    for (const city of next.cities) if (city.nationId === command.nationId) {
      const surface = await countryLandAt(geography, city.positionQ.xQ, city.positionQ.yQ, control, geometry);
      control?.signal?.throwIfAborted();
      const owner = territories.get(surface.cellId);
      if (!surface.land || owner?.legalNationId !== command.nationId || owner.controllingNationId !== command.nationId) throw new Error('保存的城市不在所属国家实际陆地内，本次未移除领土。');
      if (removed.has(surface.cellId)) throw new Error(`圈选地块内有${nation!.capitalCityId === city.id ? '首都' : '城市'}「${city.name}」；请避开该地块，本次未移除领土。`);
    }
    if (!next.territories.some(t => t.legalNationId === command.nationId && !removed.has(t.cellId))) throw new Error('不能移除该国全部领土；至少保留一个实际陆地地块。');
    next.territories = next.territories.filter(t => !removed.has(t.cellId));
    description = `从「${nation!.name}」移除 ${removed.size} 个地块内的实际陆地，恢复为未分配；城市、首都与海域保持不变。`;
  } else if (command.type === 'reassign-territory-shape') {
    const target = next.nations.find(row => row.id === command.targetNationId);
    if (!target || target.id === nation!.id) throw new Error('接收国家必须是另一个已有国家。');
    const field = command.field === 'legal' ? 'legalNationId' : 'controllingNationId', fieldName = command.field === 'legal' ? '法理归属' : '实际控制';
    const cells = (await selectCountryPolygon(geography, { source: next.source, pointsQ: command.outlineQ, geometry }, control)).cellIds;
    control?.signal?.throwIfAborted();
    const territories = new Map(next.territories.map(row => [row.cellId, row])), selected = new Set<number>();
    for (const cellId of cells) {
      const existing = territories.get(cellId);
      if (!existing) continue;
      if (existing[field] !== command.nationId) throw new Error(`圈选地块 #${cellId} 的${fieldName}不属于「${nation!.name}」；本次不会移交任何领土。`);
      selected.add(cellId);
    }
    if (!selected.size) throw new Error(`圈选范围没有可移交的本国${fieldName}，没有需要提交的变化。`);
    // The authoritative selection owns whole political cells. Check every city,
    // including points outside the trace but inside a selected cell, and keep
    // the existing invariant that city land is both owned and controlled by it.
    for (const city of next.cities) {
      const surface = await countryLandAt(geography, city.positionQ.xQ, city.positionQ.yQ, control, geometry);
      control?.signal?.throwIfAborted();
      const owner = territories.get(surface.cellId);
      if (!surface.land || owner?.legalNationId !== city.nationId || owner.controllingNationId !== city.nationId) throw new Error('保存的城市不在所属国家实际陆地内，本次未移交领土。');
      if (selected.has(surface.cellId)) {
        const cityNation = next.nations.find(row => row.id === city.nationId)!;
        throw new Error(`圈选地块内有${cityNation.capitalCityId === city.id ? '首都' : '城市'}「${city.name}」；城市所在整个地块受到保护，请避开该地块，本次未移交领土。`);
      }
    }
    if (command.field === 'legal' && !next.territories.some(row => row.legalNationId === command.nationId && !selected.has(row.cellId))) throw new Error('不能移交该国最后的法理领土；至少保留一个实际陆地地块。');
    next.territories = next.territories.map(row => selected.has(row.cellId) ? { ...row, [field]: target.id } : row);
    description = `手动世界编辑：将 ${selected.size} 个地块内实际陆地的${fieldName}从「${nation!.name}」移交给「${target.name}」；${command.field === 'legal' ? '实际控制' : '法理归属'}保持不变。城市和首都所在整个地块受到保护；本次不产生战争、人口或财政结算。`;
  } else if (command.type === 'set-institution') {
    if (next.version !== 4) throw new Error('制度编辑不能写入旧版国家世界。');
    const regime = next.regimes.find(row => row.id === nation!.regimeId && row.nationId === nation!.id);
    if (!regime) throw new Error('当前国家没有有效的政权引用。');
    const before = institutionFieldLabels(regime.institution), after = institutionFieldLabels(command.institution), differences: string[] = [];
    if (regime.name !== command.regimeName) differences.push(`政权名称「${regime.name}」→「${command.regimeName}」`);
    const fields = [...new Set([...before, ...after].map(row => row.field))];
    for (const field of fields) {
      const oldValue = before.find(row => row.field === field)?.value ?? '未设置', newValue = after.find(row => row.field === field)?.value ?? '未设置';
      if (oldValue !== newValue) differences.push(`${field}：${oldValue}→${newValue}`);
    }
    if (!differences.length) throw new Error('政权名称与制度设定没有变化，没有需要提交的内容。');
    regime.name = command.regimeName; regime.institution = structuredClone(command.institution);
    description = `为「${nation!.name}」更新制度设定：${differences.join('；')}。国家、政权、城市与领土身份保持不变；制度参数尚未参与继任、财政或征募结算。`;
  } else if (command.type === 'create-city') {
    if (next.cities.length >= COUNTRY_LIMITS.cities || !countryId(ids.cityId, 'city')) throw new Error('城市数量已达上限或城市身份无效。');
    const surface = await countryLandAt(geography, command.positionQ.xQ, command.positionQ.yQ, control, geometry); control?.signal?.throwIfAborted();
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
