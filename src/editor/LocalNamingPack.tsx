import { useEffect, useRef, useState } from 'react';
import { nextLocalName, readLocalNamingPack, type LocalNamingPack, type NamingKind, type NamingLanguage } from './local-naming-pack';

export function useLocalNamingPack(disabled: boolean) {
  const [pack, setPack] = useState<LocalNamingPack | null>(null), [cultureId, setCultureId] = useState('');
  const [language, setLanguage] = useState<NamingLanguage>('zh'), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const live = useRef(true), request = useRef(0), locked = useRef(disabled), reading = useRef(false); locked.current = disabled;
  useEffect(() => { live.current = true; return () => { live.current = false; request.current++; }; }, []);
  async function load(file: File) {
    if (locked.current || reading.current) return;
    const ticket = ++request.current; reading.current = true; setLoading(true); setError('');
    try {
      const candidate = await readLocalNamingPack(file);
      if (!live.current || ticket !== request.current) return;
      if (locked.current) { setError('当前正在查看预览或处理世界，本次未替换命名包，请稍后重试。'); return; }
      setPack(candidate); setCultureId(candidate.cultures[0].id); setLanguage('zh');
    } catch (failure) {
      if (live.current && ticket === request.current) setError((failure instanceof Error ? failure.message : '读取命名包失败。') + ' 已有命名包与手填名称保留。');
    } finally {
      if (live.current && ticket === request.current) { reading.current = false; setLoading(false); }
    }
  }
  function unload() {
    if (locked.current || reading.current) return;
    request.current++; setPack(null); setCultureId(''); setLanguage('zh'); setError('');
  }
  return { pack, cultureId, language, loading, error, disabled: disabled || loading, load, unload,
    chooseCulture: (id: string) => { if (!locked.current && !reading.current && pack?.cultures.some(culture => culture.id === id)) setCultureId(id); },
    chooseLanguage: (value: NamingLanguage) => { if (!locked.current && !reading.current && (value === 'zh' || value === 'en')) setLanguage(value); } };
}
type NamingSession = ReturnType<typeof useLocalNamingPack>;

export function LocalNamingPackManager({ naming }: { naming: NamingSession }) {
  const file = useRef<HTMLInputElement>(null);
  return <section className="country-naming-manager" aria-label="本地命名包">
    <h3>给列国起名字</h3>
    <p className="country-help">选择本地命名包，在新建国家和城市时获取名字建议。文化仅用于命名，不改变国家制度或世界规则。</p>
    <input ref={file} type="file" accept=".json,application/json" aria-label="本地命名包文件" hidden disabled={naming.disabled}
      onChange={event => { const selected = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (selected) void naming.load(selected); }} />
    <div className="country-naming-actions"><button disabled={naming.disabled} onClick={() => file.current?.click()}>{naming.loading ? '正在读取命名包…' : naming.pack ? '更换本地命名包' : '导入本地命名包'}</button>
      {naming.pack && <button disabled={naming.disabled} onClick={naming.unload}>卸载命名包</button>}</div>
    <p className="country-help" data-testid="local-naming-pack-status">{naming.pack ? `已载入 ${naming.pack.cultures.length} 种命名文化 · ${naming.pack.source.label}` : '尚未载入命名包，仍可自由输入名字。'}</p>
    <p className="country-help">包只在本次页面中使用，刷新或离开后清除。确认建国、建城后，所选名字随世界保存；原包不会上传或写入存档。文件上限 2 MiB。</p>
    {naming.error && <p className="country-naming-error" role="alert">{naming.error}</p>}
  </section>;
}

export function LocalNamePicker({ naming, kind, current, usedNames, onName, onManage }: {
  naming: NamingSession; kind: NamingKind; current: string; usedNames: readonly string[]; onName: (name: string) => void; onManage: () => void;
}) {
  if (!naming.pack) return <button className="country-naming-link" disabled={naming.disabled} onClick={onManage}>使用本地命名包</button>;
  const nation = kind === 'countries', prefix = nation ? '国家' : '城市';
  const suggestion = nextLocalName(naming.pack, naming.cultureId, naming.language, kind, current, usedNames);
  return <div className="country-name-picker" role="group" aria-label={`${prefix}命名建议`}>
    <div className="country-naming-selects"><label>命名文化<select aria-label={`${prefix}命名文化`} disabled={naming.disabled} value={naming.cultureId} onChange={event => naming.chooseCulture(event.target.value)}>
      {naming.pack.cultures.map(culture => <option key={culture.id} value={culture.id}>{culture.displayName[naming.language]}</option>)}</select></label>
    <label>名称语言<select aria-label={`${prefix}名称语言`} disabled={naming.disabled} value={naming.language} onChange={event => naming.chooseLanguage(event.target.value as NamingLanguage)}><option value="zh">中文</option><option value="en">English</option></select></label></div>
    <button disabled={naming.disabled || !suggestion.name} onClick={() => { if (!naming.disabled && suggestion.name) onName(suggestion.name); }}>{nation ? '换个国名' : '换个城名'}</button>
    <p className="country-help">{suggestion.name ? '点击换名才会替换输入框，可继续手动修改。' : '本文化没有其他可用名称，已跳过世界中的同名；可以手动输入或选择其他文化。'}{suggestion.skippedLong > 0 && ` 已跳过 ${suggestion.skippedLong} 条超过 60 字符的名称，没有截断原名。`}</p>
  </div>;
}
