'use client';
/**
 * S.panel: the right panel, after LodiSave Gallery's `.peek`. Widgets you choose
 * and order on top, the open tab's context in the middle (pages portal into
 * #panel-context), and Ask Sorro at the bottom, which hands off to Home.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './Icon';
import { usePrefs } from '@/lib/prefs';
import { WIDGETS, useWidgetOrder } from './widgets/Widgets';
import { WidgetBoard } from './widgets/WidgetBoard';
import './side-panel.css';

export function SidePanel({ mode, context, onClose }: { mode: 'dock' | 'overlay' | 'sheet'; context?: string; onClose?: () => void }) {
  const { prefs, update } = usePrefs();
  const order = useWidgetOrder();
  const open = mode !== 'dock' || prefs.panel?.open !== false;
  const [ask, setAsk] = useState('');
  const router = useRouter();
  const send = () => { const t = ask.trim(); if (!t) return; router.push(`/home/?ask=${encodeURIComponent(t)}${context ? `&ctx=${encodeURIComponent(context)}` : ''}`); setAsk(''); onClose?.(); };

  if (!open) return <aside className="sp sp-rail" data-part="S.panel" aria-label="Side panel, folded">
    <button className="sx-icon" aria-label="Open side panel" onClick={() => update({ panel: { ...prefs.panel, open: true } })}><Icon name="panelLeft" size={18} /></button>
    {order.slice(0, 5).map(id => <button key={id} className="sx-icon" title={WIDGETS[id].name} aria-label={`Open side panel at ${WIDGETS[id].name}`} onClick={() => update({ panel: { ...prefs.panel, open: true } })}><span className="sp-initial">{WIDGETS[id].name.charAt(0)}</span></button>)}
  </aside>;

  return <aside className="sp" data-mode={mode} data-part="S.panel" aria-label="Side panel">
    <div className="sp-head">
      <span className="sp-title">Widgets</span>
      {mode === 'dock' ? <button className="sx-icon" aria-label="Fold side panel" onClick={() => update({ panel: { ...prefs.panel, open: false } })}><Icon name="panelLeft" size={18} /></button>
        : <button className="sx-icon" aria-label="Close side panel" onClick={onClose}><Icon name="close" size={18} /></button>}
    </div>
    <div className="sp-body">
      <WidgetBoard axis="y" className="sp-board" part="S.widgets" />
      <div id="panel-context" className="sp-context" />
    </div>
    <form className="sp-ask" onSubmit={e => { e.preventDefault(); send(); }}>
      <input value={ask} onChange={e => setAsk(e.target.value)} placeholder="Ask Sorro" aria-label="Ask Sorro" />
      <button className="sx-icon" aria-label="Send to Sorro" disabled={!ask.trim()}><Icon name="send" size={16} /></button>
    </form>
  </aside>;
}
