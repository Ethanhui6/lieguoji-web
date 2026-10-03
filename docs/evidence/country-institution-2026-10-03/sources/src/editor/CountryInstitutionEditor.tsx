import { useState } from 'react';
import type { CountryRegime } from '../world/politics/model';
import { countryName } from '../world/politics/model';
import { COUNTRY_INSTITUTION_TEMPLATES, institutionTemplateName, validateCountryInstitution, type CountryInstitution } from '../world/politics/institution';

export interface InstitutionDraft { nationId: string; regimeName: string; institution: CountryInstitution | null }
interface Props {
  nationId: string; regime: CountryRegime; disabled: boolean; draft: InstitutionDraft | null;
  onChange: (draft: InstitutionDraft | null) => void; onPreview: (draft: InstitutionDraft) => void;
}
const succession = { hereditary: '世袭', election: '选举', appointment: '任命' } as const;
const appointment = { central: '中央任命', local: '地方决定' } as const;
const recruitment = { standing: '常备军', levy: '征召军', mixed: '混合军制' } as const;
const percent = (bps: number) => `${Number((bps / 100).toFixed(2))}%`;

/** Edits durable rules only. Economic and character simulation consumers are
 * explicitly absent, so this panel never computes fictitious policy effects. */
export function CountryInstitutionEditor({ nationId, regime, disabled, draft, onChange, onPreview }: Props) {
  const [revenueText, setRevenueText] = useState<string | null>(null);
  const current = regime.institution ?? null;
  const value = draft ?? { nationId, regimeName: regime.name, institution: current };
  const change = (patch: Partial<InstitutionDraft>) => onChange({ ...value, ...patch });
  const customise = (patch: Partial<CountryInstitution>) => {
    if (value.institution) change({ institution: { ...value.institution, ...patch, template: 'custom' } });
  };
  const changed = value.regimeName.trim() !== regime.name || JSON.stringify(value.institution) !== JSON.stringify(current);
  const valid = countryName(value.regimeName.trim()) && (value.institution === null || validateCountryInstitution(value.institution));
  return <section className="country-institution" aria-label="国家制度设定" data-institution-template={current?.template ?? 'unset'}>
    <div className="country-institution-heading"><h3>国家制度</h3><span>{current ? institutionTemplateName(current.template) : '尚未设定'}</span></div>
    <p className="country-institution-regime" data-testid="country-regime-name">{regime.name}</p>
    {!draft ? <>
      {current && <dl className="country-institution-summary">
        <div><dt>执政者产生</dt><dd>{succession[current.succession]}</dd></div>
        <div><dt>地方任命</dt><dd>{appointment[current.localAppointment]}</dd></div>
        <div><dt>地方留税</dt><dd>{percent(current.localRevenueBps)}</dd></div>
        <div><dt>征募规则</dt><dd>{recruitment[current.recruitment]}</dd></div>
      </dl>}
      <p className="country-help">制度作为本国规则保存；财政、继承和征募推演尚未启用。</p>
      <button disabled={disabled} onClick={() => onChange({ ...value, institution: current ? { ...current } : null })}>编辑国家制度</button>
    </> : <div className="country-institution-form">
      <label>政权名称<input aria-label="政权名称" maxLength={80} disabled={disabled} value={value.regimeName} onChange={event => change({ regimeName: event.target.value })} /></label>
      <label>制度模板<select aria-label="制度模板" disabled={disabled} value={value.institution?.template ?? ''} onChange={event => {
        setRevenueText(null);
        const preset = COUNTRY_INSTITUTION_TEMPLATES.find(item => item.id === event.target.value);
        if (preset) change({ institution: { ...preset.institution } });
        else if (event.target.value === '') change({ institution: null });
      }}><option value="">尚未设定</option>{COUNTRY_INSTITUTION_TEMPLATES.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}{value.institution?.template === 'custom' && <option value="custom">自定义制度</option>}</select></label>
      {value.institution && <>
        <label>执政者产生<select aria-label="执政者产生方式" disabled={disabled} value={value.institution.succession} onChange={event => customise({ succession: event.target.value as CountryInstitution['succession'] })}>{Object.entries(succession).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label>地方任命<select aria-label="地方任命方式" disabled={disabled} value={value.institution.localAppointment} onChange={event => customise({ localAppointment: event.target.value as CountryInstitution['localAppointment'] })}>{Object.entries(appointment).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label>地方留税比例 <span className="country-help">0—100%，最多两位小数</span><div className="country-percent-input"><input aria-label="地方留税比例" type="number" inputMode="decimal" min={0} max={100} step={0.01} disabled={disabled} aria-invalid={!Number.isFinite(value.institution.localRevenueBps)} value={revenueText ?? (Number.isFinite(value.institution.localRevenueBps) ? value.institution.localRevenueBps / 100 : '')} onChange={event => {
          const text = event.target.value, number = Number(text); setRevenueText(text);
          customise({ localRevenueBps: /^\d+(?:\.\d{1,2})?$/.test(text) && Number.isFinite(number) && number >= 0 && number <= 100 ? Math.round(number * 100) : NaN });
        }} /><span aria-hidden="true">%</span></div>{!Number.isFinite(value.institution.localRevenueBps) && <span>请输入 0—100 之间的数，最多两位小数。</span>}</label>
        <label>征募规则<select aria-label="征募规则" disabled={disabled} value={value.institution.recruitment} onChange={event => customise({ recruitment: event.target.value as CountryInstitution['recruitment'] })}>{Object.entries(recruitment).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      </>}
      <p className="country-help">调整规则会成为自定义制度。此处保存设定，尚不结算税收、继承或兵力，也不自动生成行政区。</p>
      <div className="country-institution-actions"><button disabled={disabled} onClick={() => { setRevenueText(null); onChange(null); }}>放弃制度修改</button><button className="country-primary" disabled={disabled || !valid || !changed} onClick={() => onPreview({ ...value, regimeName: value.regimeName.trim() })}>预览制度变更</button></div>
    </div>}
  </section>;
}
