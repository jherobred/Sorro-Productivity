'use client';
/**
 * S.panel: the right panel, after LodiSave Gallery's `.peek`. Widgets you choose
 * and order on top, the open tab's context in the middle (pages portal into
 * #panel-context), and Ask Sorro at the bottom, which hands off to Home.
 */
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './Icon';
import { usePrefs } from '@/lib/prefs';
import { WIDGETS, DEFAULT_WIDGETS, useWidgetOrder, type WidgetId } from './widgets/Widgets';
import './side-panel.css';

export function SidePanel({ mode, context, onClose }: { mode: 'dock' | 'overlay' | 'sheet'; context?: string; onClose?: () => void }) {
  const { prefs, update } = usePrefs();
  const order = useWidgetOrder();
  const open = mode !== 'dock' || prefs.panel?.open !== false;
  const [editing, setEditing] = useState(false);
  const [ask, setAsk] = useState('');
  const router = useRouter();
  const drag = useRef<WidgetId | null>(null);
  const setOrder = (widgets: WidgetId[]) => update({ panel: { ...prefs.panel, widgets } });
  const move = (id: WidgetId, by: number) => { const i = order.indexOf(id), j = i + by; if (j < 0 || j >= order.length) return; const next = [...order]; [next[i], next[j]] = [next[j], next[i]]; setOrder(next); };
  const toggle = (id: WidgetId) => setOrder(order.includes(id) ? order.filter(w => w !== id) : [...order, id]);
  const send = () => { const t = ask.trim(); if (!t) return; router.push(`/home/?ask=${encodeURIComponent(t)}${context ? `&ctx=${encodeURIComponent(context)}` : ''}`); setAsk(''); onClose?.(); };

  if (!open) return <aside className="sp sp-rail" data-part="S.panel" aria-label="Side panel, folded">
    <button className="sx-icon" aria-label="Open side panel" onClick={() => update({ panel: { ...prefs.panel, open: true } })}><Icon name="panelLeft" size={18} /></button>
    {order.slice(0, 5).map(id => <button key={id} className="sx-icon" title={WIDGETS[id].name} aria-label={`Open side panel at ${WIDGETS[id].name}`} onClick={() => update({ panel: { ...prefs.panel, open: true } })}><span className="sp-initial">{WIDGETS[id].name.charAt(0)}</span></button>)}
  </aside>;

  return <aside className="sp" data-mode={mode} data-part="S.panel" aria-label="Side panel">
    <div className="sp-head">
      <button className="sp-edit" aria-pressed={editing} onClick={() => setEditing(e => !e)}>{editing ? 'Done' : 'Edit widgets'}</button>
      {mode === 'dock' ? <button className="sx-icon" aria-label="Fold side panel" onClick={() => update({ panel: { ...prefs.panel, open: false } })}><Icon name="panelLeft" size={18} /></button>
        : <button className="sx-icon" aria-label="Close side panel" onClick={onClose}><Icon name="close" size={18} /></button>}
    </div>
    <div className="sp-body">
      {editing ? <ul className="sp-editor">
        {[...order, ...(Object.keys(WIDGETS) as WidgetId[]).filter(id => !order.includes(id))].map(id => {
          const on = order.includes(id);
          return <li key={id} draggable={on} data-on={on}
            onDragStart={() => { drag.current = id; }} onDragOver={e => { if (on) e.preventDefault(); }}
            onDrop={() => { const from = drag.current; drag.current = null; if (!from || from === id) return; const next = order.filter(w => w !== from); next.splice(next.indexOf(id), 0, from); setOrder(next); }}>
            <label><input type="checkbox" checked={on} onChange={() => toggle(id)} />{WIDGETS[id].name}</label>
            {on && <span className="sp-move"><button aria-label={`Move ${WIDGETS[id].name} up`} onClick={() => move(id, -1)}>↑</button><button aria-label={`Move ${WIDGETS[id].name} down`} onClick={() => move(id, 1)}>↓</button></span>}
          </li>;
        })}
        <li><button className="sp-reset" onClick={() => setOrder(DEFAULT_WIDGETS)}>Reset to the default set</button></li>
      </ul> : order.length ? order.map(id => { const W = WIDGETS[id].Component; return <W key={id} />; })
        : <p className="wg-empty">No widgets on. Choose some with Edit widgets.</p>}
      <div id="panel-context" className="sp-context" />
    </div>
    <form className="sp-ask" onSubmit={e => { e.preventDefault(); send(); }}>
      <input value={ask} onChange={e => setAsk(e.target.value)} placeholder="Ask Sorro" aria-label="Ask Sorro" />
      <button className="sx-icon" aria-label="Send to Sorro" disabled={!ask.trim()}><Icon name="send" size={16} /></button>
    </form>
  </aside>;
}
