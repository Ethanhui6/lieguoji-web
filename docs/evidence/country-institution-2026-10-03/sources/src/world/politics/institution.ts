/** Persisted sandbox settings. Later government, economy and recruitment
 * phases will consume these values; this editor does not settle their effects. */
export interface CountryInstitution {
  version: 1;
  template: 'central-office' | 'landed-obligation' | 'member-autonomy' | 'custom';
  succession: 'hereditary' | 'election' | 'appointment';
  localAppointment: 'central' | 'local';
  localRevenueBps: number;
  recruitment: 'standing' | 'levy' | 'mixed';
}
export type CountryInstitutionTemplateId = Exclude<CountryInstitution['template'], 'custom'>;
export interface CountryInstitutionTemplate { readonly id: CountryInstitutionTemplateId; readonly name: string; readonly description: string; readonly institution: Readonly<CountryInstitution> }
export const COUNTRY_INSTITUTION_TEMPLATES: readonly CountryInstitutionTemplate[] = Object.freeze([
  Object.freeze({ id: 'central-office' as const, name: '中央官署', description: '任命继任、中央任命地方、地方留收 15%、常备征募；保存为制度设定，尚未参与结算。',
    institution: Object.freeze({ version: 1 as const, template: 'central-office' as const, succession: 'appointment' as const, localAppointment: 'central' as const, localRevenueBps: 1500, recruitment: 'standing' as const }) }),
  Object.freeze({ id: 'landed-obligation' as const, name: '领地义务', description: '世袭继任、地方任命、地方留收 60%、征召征募；保存为制度设定，尚未参与结算。',
    institution: Object.freeze({ version: 1 as const, template: 'landed-obligation' as const, succession: 'hereditary' as const, localAppointment: 'local' as const, localRevenueBps: 6000, recruitment: 'levy' as const }) }),
  Object.freeze({ id: 'member-autonomy' as const, name: '成员自治', description: '选举继任、地方任命、地方留收 80%、混合征募；保存为制度设定，尚未参与结算。',
    institution: Object.freeze({ version: 1 as const, template: 'member-autonomy' as const, succession: 'election' as const, localAppointment: 'local' as const, localRevenueBps: 8000, recruitment: 'mixed' as const }) }),
]);
export function institutionTemplateName(template: CountryInstitution['template']): string {
  return template === 'custom' ? '自定制度' : COUNTRY_INSTITUTION_TEMPLATES.find(row => row.id === template)!.name;
}
export const institutionSuccessionName = (value: CountryInstitution['succession']): string => ({ hereditary: '世袭', election: '选举', appointment: '任命' })[value];
export const institutionLocalAppointmentName = (value: CountryInstitution['localAppointment']): string => ({ central: '中央任命', local: '地方任命' })[value];
export const institutionRecruitmentName = (value: CountryInstitution['recruitment']): string => ({ standing: '常备', levy: '征召', mixed: '混合' })[value];
export function institutionFieldLabels(value: CountryInstitution | null): { field: string; value: string }[] {
  return value === null ? [{ field: '制度', value: '尚未制定' }] : [
    { field: '模板', value: institutionTemplateName(value.template) }, { field: '继任方式', value: institutionSuccessionName(value.succession) },
    { field: '地方任命', value: institutionLocalAppointmentName(value.localAppointment) }, { field: '地方留收', value: `${value.localRevenueBps / 100}%` },
    { field: '征募方式', value: institutionRecruitmentName(value.recruitment) },
  ];
}
export function validateCountryInstitution(raw: unknown): raw is CountryInstitution {
  if (!raw || typeof raw !== 'object' || Object.getPrototypeOf(raw) !== Object.prototype) return false;
  const keys = ['version', 'template', 'succession', 'localAppointment', 'localRevenueBps', 'recruitment'], own = Reflect.ownKeys(raw);
  if (own.length !== keys.length || !own.every(key => typeof key === 'string' && keys.includes(key) && !!Object.getOwnPropertyDescriptor(raw, key)?.enumerable && 'value' in Object.getOwnPropertyDescriptor(raw, key)!)) return false;
  const value = raw as CountryInstitution;
  if (value.version !== 1 || !['central-office', 'landed-obligation', 'member-autonomy', 'custom'].includes(value.template)
    || !['hereditary', 'election', 'appointment'].includes(value.succession) || !['central', 'local'].includes(value.localAppointment)
    || !Number.isSafeInteger(value.localRevenueBps) || value.localRevenueBps < 0 || value.localRevenueBps > 10000 || !['standing', 'levy', 'mixed'].includes(value.recruitment)) return false;
  if (value.template === 'custom') return true;
  const preset = COUNTRY_INSTITUTION_TEMPLATES.find(row => row.id === value.template)!.institution;
  return value.succession === preset.succession && value.localAppointment === preset.localAppointment && value.localRevenueBps === preset.localRevenueBps && value.recruitment === preset.recruitment;
}
