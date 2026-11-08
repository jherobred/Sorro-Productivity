'use client';
/**
 * The widgets as a board: drag one by its grip to reorder (arrow keys on the grip do the same),
 * remove one with ×, and add more from the + menu. Used by Home's strip (axis x) and the right panel (axis y).
 * Order lives in prefs.panel.widgets, so both places show the same set.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, Reorder, motion, useDragControls } from 'motion/react';
import { Icon, type IconName } from '../Icon';
import { usePrefs } from '@/lib/prefs';
import { WIDGETS, DEFAULT_WIDGETS, useWidgetOrder, type WidgetId } from './Widgets';
import './widget-board.css';

export const WIDGET_INFO: Record<WidgetId, { icon: IconName; blurb: string }> = {
  agenda: { icon: 'cal', blurb: 'What is left on today’s calendar' },
  due: { icon: 'task', blurb: 'Tasks due today and overdue, tick them off here' },
  focus: { icon: 'focus', blurb: 'A 25 or 50 minute focus timer' },
  month: { icon: 'month', blurb: 'This month at a glance' },
  pinned: { icon: 'pin', blurb: 'Your first pinned note' },
  news: { icon: 'news', blurb: 'Today’s digest headlines' },
  weather: { icon: 'sun', blurb: 'Weather for your city' },
  capture: { icon: 'plus', blurb: 'Add a task in one line' },
};

const SPRING = { type: 'spring', stiffness: 520, damping: 40, mass: .8 } as const;

function Item({ id, axis, index, count, onMove, onRemove, onDrop }: { id: WidgetId; axis: 'x' | 'y'; index: number; count: number; onMove(by: number): void; onRemove(): void; onDrop(): void }) {
  const controls = useDragControls();
  const W = WIDGETS[id].Component;
  const name = WIDGETS[id].name;
  const back = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
  const fwd = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
  return <Reorder.Item value={id} as="div" className="wb-item" dragListener={false} dragControls={controls} onDragEnd={onDrop}
    initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .94, transition: { duration: .16 } }}
    transition={SPRING} whileDrag={{ scale: 1.02, boxShadow: '0 14px 30px rgb(0 0 0 / .16)', zIndex: 5 }}>
    <div className="wb-tools">
      <button type="button" className="wb-grip" aria-label={`Move ${name}. Drag, or use the arrow keys.`} title="Drag to move"
        onPointerDown={e => { e.preventDefault(); controls.start(e); }}
        onKeyDown={e => { if (e.key === back && index > 0) { e.preventDefault(); onMove(-1); } if (e.key === fwd && index < count - 1) { e.preventDefault(); onMove(1); } }}>
        <Icon name="dots" size={14} />
      </button>
      <button type="button" className="wb-remove" aria-label={`Remove ${name}`} title="Remove" onClick={onRemove}><Icon name="close" size={12} /></button>
    </div>
    <W />
  </Reorder.Item>;
}

function AddMenu({ order, onAdd, onReset, align }: { order: WidgetId[]; onAdd(id: WidgetId): void; onReset(): void; align: 'start' | 'end' }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const off = (Object.keys(WIDGETS) as WidgetId[]).filter(id => !order.includes(id));
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); box.current?.querySelector<HTMLElement>('.wb-add')?.focus(); } };
    addEventListener('pointerdown', away); addEventListener('keydown', esc);
    return () => { removeEventListener('pointerdown', away); removeEventListener('keydown', esc); };
  }, [open]);
  return <div className="wb-addwrap" ref={box} data-align={align}>
    <motion.button type="button" className="wb-add" aria-label="Add a widget" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(o => !o)}
      whileTap={{ scale: .92 }} animate={{ rotate: open ? 45 : 0 }} transition={SPRING}>
      <Icon name="plus" size={18} />
    </motion.button>
    <AnimatePresence>
      {open && <motion.div className="wb-menu" role="menu" aria-label="Widgets you can add"
        initial={{ opacity: 0, y: -6, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: .98, transition: { duration: .12 } }} transition={SPRING}>
        <p className="wb-menu-h">Add a widget</p>
        {off.length ? off.map((id, i) => <motion.button key={id} type="button" role="menuitem" className="wb-opt" onClick={() => { onAdd(id); setOpen(false); }}
          initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0, transition: { ...SPRING, delay: .02 * i } }}>
          <span className="wb-opt-ico"><Icon name={WIDGET_INFO[id].icon} size={16} /></span>
          <span><strong>{WIDGETS[id].name}</strong><small>{WIDGET_INFO[id].blurb}</small></span>
        </motion.button>) : <p className="wb-menu-empty">Every widget is already on.</p>}
        <button type="button" role="menuitem" className="wb-reset" onClick={() => { onReset(); setOpen(false); }}>Reset to the default set</button>
      </motion.div>}
    </AnimatePresence>
  </div>;
}

export function WidgetBoard({ axis, className, part }: { axis: 'x' | 'y'; className: string; part: string }) {
  const { prefs, update } = usePrefs();
  const order = useWidgetOrder();
  // Local while dragging, saved when the drag ends: prefs sync to the account, so not on every frame.
  const [items, setItems] = useState(order);
  const dragging = useRef(false);
  const key = order.join();
  useEffect(() => { if (!dragging.current) setItems(order); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (widgets: WidgetId[]) => { setItems(widgets); void update({ panel: { ...prefs.panel, widgets } }); };
  // A widget mid-exit is no longer in items: its grip must not bring it back.
  const move = (id: WidgetId, by: number) => { const i = items.indexOf(id), j = i + by; if (i < 0 || j < 0 || j >= items.length) return; const next = [...items]; [next[i], next[j]] = [next[j], next[i]]; save(next); };

  return <MotionConfig reducedMotion={prefs.motion === false ? 'always' : 'user'}>
    <div className={`wb ${className}`} data-axis={axis} data-part={part}>
      <Reorder.Group as="div" axis={axis} values={items} onReorder={v => { dragging.current = true; setItems(v); }} className="wb-list">
        <AnimatePresence initial={false}>
          {items.map((id, i) => <Item key={id} id={id} axis={axis} index={i} count={items.length}
            onMove={by => move(id, by)} onRemove={() => save(items.filter(w => w !== id))}
            onDrop={() => { dragging.current = false; save(items); }} />)}
        </AnimatePresence>
        {!items.length && <p className="wg-empty wb-none">No widgets yet. Add some with +.</p>}
      </Reorder.Group>
      <AddMenu order={items} align={axis === 'x' ? 'end' : 'start'} onAdd={id => save([...items, id])} onReset={() => save(DEFAULT_WIDGETS)} />
    </div>
  </MotionConfig>;
}
