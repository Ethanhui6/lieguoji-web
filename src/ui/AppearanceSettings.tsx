import { useId } from 'react';
import { useAppearance, type Appearance } from './appearance';

export function AppearanceSettings() {
  const { preferences, update, feedback } = useAppearance();
  const themeId = useId();
  return <fieldset className="appearance-settings">
    <legend>外观与阅读</legend>
    <label className="appearance-select-label" htmlFor={themeId}>界面外观</label>
    <select id={themeId} value={preferences.theme} onChange={event => update({ theme: event.target.value as Appearance['theme'] })}>
      <option value="light">浅色</option><option value="dark">深色</option><option value="system">跟随系统</option>
    </select>
    <label className="appearance-option"><input type="checkbox" checked={preferences.reduceTransparency} onChange={event => update({ reduceTransparency: event.target.checked })} /><span>减少透明效果</span></label>
    <label className="appearance-option"><input type="checkbox" checked={preferences.largeText} onChange={event => update({ largeText: event.target.checked })} /><span>较大文字</span></label>
    <p className="appearance-description">主题与阅读设置会保留在此设备。</p>
    {feedback && <p className="appearance-feedback" role="status">{feedback}</p>}
  </fieldset>;
}
