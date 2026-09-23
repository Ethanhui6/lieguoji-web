import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

export type InspectorExtent = 'half' | 'reading';
type Props = {
  panel: string;
  title: string;
  subtitle?: string;
  extent: InspectorExtent;
  onExtent: (extent: InspectorExtent) => void;
  onClose: () => void;
  closeLabel?: string;
  onBack?: () => void;
  backLabel?: string;
  actions?: ReactNode;
  children: ReactNode;
};

/** Modeless: the map remains interactive; only the body scrolls. */
export function ContextInspector({ panel, title, subtitle, extent, onExtent, onClose, closeLabel = '关闭检查器', onBack, backLabel = '返回列表', actions, children }: Props) {
  const rootRef = useRef<HTMLElement>(null), titleRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null), scrollPositions = useRef(new Map<string, number>());
  const openerRef = useRef<HTMLElement | null>(null), closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && !rootRef.current?.contains(active)) openerRef.current = active;
    if (bodyRef.current) bodyRef.current.scrollTop = scrollPositions.current.get(panel) ?? 0;
    titleRef.current?.focus({ preventScroll: true });
  }, [panel]);
  useLayoutEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || document.querySelector('dialog[open]')) return;
      event.preventDefault(); closeRef.current();
    };
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('keydown', escape);
      const opener = openerRef.current;
      if (opener?.isConnected && !opener.closest('[inert]')) opener.focus({ preventScroll: true });
    };
  }, []);
  return <section ref={rootRef} className="context-inspector" data-panel={panel} data-extent={extent} aria-label={title}>
    <header className="inspector-header">
      {onBack && <button className="inspector-back" aria-label={backLabel} onClick={onBack}><Icon name="chevron-left" /></button>}
      <div className="inspector-heading"><h2 ref={titleRef} tabIndex={-1}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
      <button className="inspector-extent" aria-label={extent === 'half' ? '展开阅读' : '收起为半高'} aria-expanded={extent === 'reading'} onClick={() => onExtent(extent === 'half' ? 'reading' : 'half')}><Icon name={extent === 'half' ? 'chevron-up' : 'chevron-down'} /></button>
      <button className="inspector-close" aria-label={closeLabel} onClick={onClose}><Icon name="close" /></button>
    </header>
    <div ref={bodyRef} className="inspector-body" onScroll={event => scrollPositions.current.set(panel, event.currentTarget.scrollTop)}>{children}</div>
    {actions && <footer className="inspector-actions">{actions}</footer>}
  </section>;
}
