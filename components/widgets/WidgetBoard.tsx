'use client';
/**
 * The widgets as a board: drag one by its grip to move it (arrow keys on the grip do the same),
 * remove one with ×, and add more from the + menu. Home lays them out as a grid that wraps into
 * rows (axis x); the right panel as one column (axis y). Order lives in prefs.panel.widgets, so both show the same set.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, Reorder, motion, useDragControls, type DragControls } from 'motion/react';
import { Icon, type IconName } from '../Icon';
import { usePrefs } from '@/lib/prefs';
import { moveTo } from '@/lib/widgetOrder';
import { WIDGETS, DEFAULT_WIDGETS, useWidgetOrder, type WidgetId } from './Widgets';
import './widget-board.css';

export const WIDGET_INFO: Record<WidgetId, { icon: IconName; blurb: string }> = {
  agenda: { icon: 'cal', blurb: 'What is left on today’s calendar' },
  due: { icon: 'task', blurb: 'Tasks due today and overdue, tick them off here' },
  focus: { icon: 'focus', blurb: 'A 25 or 50 minute focus timer' },
  month: { icon: 'month', blurb: 'The month, shaded by how full each day is' },
  pinned: { icon: 'pin', blurb: 'Your first pinned note' },
  news: { icon: 'news', blurb: 'Today’s stories with their pictures, one at a time' },
  weather: { icon: 'sun', blurb: 'Weather for your city' },
  capture: { icon: 'plus', blurb: 'Add a task in one line' },
};

const SPRING = { type: 'spring', stiffness: 520, damping: 40, mass: .8 } as const;
const ENTER = { initial: { opacity: 0, scale: .96 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: .94, transition: { duration: .16 } }, transition: SPRING,
  whileDrag: { scale: 1.02, boxShadow: '0 14px 30px rgb(0 0 0 / .16)', zIndex: 5 } };

type ItemProps = { id: WidgetId; index: number; count: number; onMove(by: number): void; onRemove(): void };

function Tools({ id, index, count, onMove, onRemove, controls, keys }: ItemProps & { controls: DragControls; keys: [back: string[], fwd: string[]] }) {
  const name = WIDGETS[id].name;
  return <div className="wb-tools">
    <button type="button" className="wb-grip" aria-label={`Move ${name}. Drag, or use the arrow keys.`} title="Drag to move"
      onPointerDown={e => { e.preventDefault(); controls.start(e); }}
      onKeyDown={e => { if (keys[0].includes(e.key) && index > 0) { e.preventDefault(); onMove(-1); } if (keys[1].includes(e.key) && index < count - 1) { e.preventDefault(); onMove(1); } }}>
      <Icon name="dots" size={14} />
    </button>
    <button type="button" className="wb-remove" aria-label={`Remove ${name}`} title="Remove" onClick={onRemove}><Icon name="close" size={12} /></button>
  </div>;
}

/** One column (the right panel): motion's Reorder shuffles the list live while you drag. */
function ColumnItem(p: ItemProps & { onDrop(): void }) {
  const controls = useDragControls();
  const W = WIDGETS[p.id].Component;
  return <Reorder.Item value={p.id} as="div" className="wb-item" dragListener={false} dragControls={controls} onDragEnd={p.onDrop} {...ENTER}>
    <Tools {...p} controls={controls} keys={[['ArrowUp'], ['ArrowDown']]} />
    <W />
  </Reorder.Item>;
}

const widgetAt = (e: MouseEvent | TouchEvent | PointerEvent, self: WidgetId): WidgetId | null => {
  const p = 'clientX' in e ? e : e.changedTouches[0];
  if (!p) return null;
  for (const el of document.elementsFromPoint(p.clientX, p.clientY)) {
    const id = (el as HTMLElement).closest<HTMLElement>('.wb-item')?.dataset.id as WidgetId | undefined;
    if (id && id !== self) return id;
  }
  return null;
};

/** Home's grid packs by height: rows are 2px tall and each widget spans as many as its own height needs. */
const ROW = 2, GAP = 10;

/**
 * The packed grid (Home): Reorder only knows one axis, so here a widget is dropped onto the one whose place it takes.
 * Each widget keeps its natural height, measured from its content, so a short one leaves room for another beneath it
 * beside a tall one.
 */
function GridItem(p: ItemProps & { over: boolean; onLift(): void; onOver(id: WidgetId | null): void; onDropOn(id: WidgetId | null): void }) {
  const controls = useDragControls();
  const W = WIDGETS[p.id].Component;
  const fit = useRef<HTMLDivElement>(null);
  const [span, setSpan] = useState(60);
  useEffect(() => {
    const el = fit.current;
    if (!el) return;
    // offsetHeight is the laid-out height: a drag's scale does not change it.
    const measure = () => setSpan(Math.max(1, Math.ceil((el.offsetHeight + GAP) / ROW)));
    measure();
    const seen = new ResizeObserver(measure);
    seen.observe(el);
    return () => seen.disconnect();
  }, []);
  return <motion.div layout className="wb-item" data-id={p.id} data-over={p.over} style={{ gridRowEnd: `span ${span}` }} drag dragListener={false} dragControls={controls} dragSnapToOrigin dragElastic={.12}
    onDragStart={p.onLift} onDrag={e => p.onOver(widgetAt(e, p.id))} onDragEnd={e => p.onDropOn(widgetAt(e, p.id))} {...ENTER} whileDrag={{ scale: 1.02, zIndex: 5 }}>
    <div className="wb-fit" ref={fit}>
      <Tools {...p} controls={controls} keys={[['ArrowLeft', 'ArrowUp'], ['ArrowRight', 'ArrowDown']]} />
      <W />
    </div>
  </motion.div>;
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
    <motion.button type="button" className="wb-add" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(o => !o)} whileTap={{ scale: .96 }}>
      <motion.span className="wb-add-ico" aria-hidden="true" animate={{ rotate: open ? 45 : 0 }} transition={SPRING}><Icon name="plus" size={15} /></motion.span>Add widget
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
  const [over, setOver] = useState<WidgetId | null>(null);
  const [lifted, setLifted] = useState(false);
  const key = order.join();
  useEffect(() => { if (!dragging.current) setItems(order); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (widgets: WidgetId[]) => { setItems(widgets); if (widgets.join() !== key) void update({ panel: { ...prefs.panel, widgets } }); };
  // A widget mid-exit is no longer in items: its grip must not bring it back.
  const move = (id: WidgetId, by: number) => { const i = items.indexOf(id), j = i + by; if (i < 0 || j < 0 || j >= items.length) return; const next = [...items]; [next[i], next[j]] = [next[j], next[i]]; save(next); };
  const each = (id: WidgetId, i: number): ItemProps & { key: string } => ({ key: id, id, index: i, count: items.length, onMove: by => move(id, by), onRemove: () => save(items.filter(w => w !== id)) });
  const none = !items.length && <p className="wg-empty wb-none">No widgets yet. Add some with +.</p>;

  return <MotionConfig reducedMotion={prefs.motion === false ? 'always' : 'user'}>
    <div className={`wb ${className}`} data-axis={axis} data-part={part} data-dragging={lifted}>
      {axis === 'y' ? <Reorder.Group as="div" axis="y" values={items} onReorder={v => { dragging.current = true; setItems(v); }} className="wb-list">
        <AnimatePresence initial={false}>
          {items.map((id, i) => { const { key: k, ...p } = each(id, i); return <ColumnItem key={k} {...p} onDrop={() => { dragging.current = false; save(items); }} />; })}
        </AnimatePresence>
        {none}
      </Reorder.Group> : <div className="wb-list">
        <AnimatePresence initial={false}>
          {items.map((id, i) => { const { key: k, ...p } = each(id, i); return <GridItem key={k} {...p} over={over === id} onLift={() => setLifted(true)} onOver={setOver}
            onDropOn={onto => { setOver(null); setLifted(false); if (onto) save(moveTo(items, id, onto)); }} />; })}
        </AnimatePresence>
        {none}
      </div>}
      <AddMenu order={items} align="start" onAdd={id => save([...items, id])} onReset={() => save(DEFAULT_WIDGETS)} />
    </div>
  </MotionConfig>;
}
