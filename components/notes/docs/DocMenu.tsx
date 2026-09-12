'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '@/components/Icon';
import { useOverlayBack } from '@/lib/nav';

export type MenuItem = {
  label: string;
  icon?: IconName;
  shortcut?: string;
  run?: () => void;
  items?: MenuEntry[];
  checked?: boolean;
  disabled?: boolean;
  swatch?: string;
  /** Rendered in the item's own font, for the style and font menus. */
  style?: React.CSSProperties;
};
export type MenuEntry = MenuItem | 'separator';

const isItem = (entry: MenuEntry): entry is MenuItem => entry !== 'separator';

/**
 * A menu panel with submenus that open beside it on hover or with the arrow
 * keys, the way a desktop word processor's menus behave. Portalled to the body
 * so it is never clipped by the page it belongs to.
 */
export function MenuPanel({ entries, x, y, onClose, closeAll, parent, level = 0, label }: {
  entries: MenuEntry[];
  x: number;
  y: number;
  onClose: () => void;
  /** Closes every open panel, for when a command is chosen in a submenu. */
  closeAll?: () => void;
  /** The item this panel is a submenu of, so it can open beside it. */
  parent?: DOMRect;
  level?: number;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [open, setOpen] = useState<{ index: number; rect: DOMRect } | null>(null);
  const hover = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useOverlayBack(level === 0, onClose);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = x, top = y;
    if (parent) {
      left = parent.right - 2;
      if (left + r.width > innerWidth - 8) left = parent.left - r.width + 2;
      top = parent.top - 6;
    }
    setPos({ left: Math.max(8, Math.min(left, innerWidth - r.width - 8)), top: Math.max(8, Math.min(top, innerHeight - r.height - 8)) });
  }, [x, y, parent]);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (level > 0) return;
    ref.current?.querySelector<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('.doc-menu-panel') && !target?.closest('[data-menu-anchor]')) closeRef.current();
    };
    document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('pointerdown', outside); clearTimeout(hover.current); };
  }, [level]);

  const buttons = () => Array.from(ref.current?.querySelectorAll<HTMLButtonElement>(':scope > [role^="menuitem"]:not(:disabled)') ?? []);
  const openSub = (index: number, button: HTMLElement) => setOpen({ index, rect: button.getBoundingClientRect() });
  const choose = (item: MenuItem, index: number, button: HTMLElement) => {
    if (item.disabled) return;
    if (item.items) { openSub(index, button); return; }
    (closeAll ?? onClose)();
    item.run?.();
  };

  return createPortal(
    <div ref={ref} className="doc-menu-panel" role="menu" aria-label={label} style={{ left: pos.left, top: pos.top, zIndex: 1000 + level }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(event) => {
        const list = buttons();
        const index = list.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); event.stopPropagation();
          const step = event.key === 'ArrowDown' ? 1 : -1;
          list[(index + step + list.length) % list.length]?.focus();
        } else if (event.key === 'ArrowRight') {
          const button = list[index];
          const item = button && entries.filter(isItem)[Number(button.dataset.index)];
          if (item?.items) { event.preventDefault(); event.stopPropagation(); openSub(Number(button.dataset.index), button); }
        } else if (event.key === 'ArrowLeft' && level > 0) {
          event.preventDefault(); event.stopPropagation(); onClose();
        } else if (event.key === 'Escape') {
          event.preventDefault(); event.stopPropagation(); (closeAll ?? onClose)();
        }
      }}>
      {entries.map((entry, i) => {
        if (!isItem(entry)) return <div key={i} className="doc-menu-separator" role="separator" />;
        const index = entries.slice(0, i).filter(isItem).length;
        return (
          <button key={i} type="button" data-index={index} disabled={entry.disabled}
            role={entry.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'} aria-checked={entry.checked}
            aria-haspopup={entry.items ? 'menu' : undefined} aria-expanded={entry.items ? open?.index === index : undefined}
            className={'doc-menu-item' + (open?.index === index ? ' is-open' : '')}
            onPointerEnter={(e) => {
              clearTimeout(hover.current);
              const button = e.currentTarget;
              hover.current = setTimeout(() => { if (entry.items && !entry.disabled) openSub(index, button); else setOpen(null); }, entry.items ? 120 : 200);
            }}
            onClick={(e) => choose(entry, index, e.currentTarget)}>
            <span className="doc-menu-icon" aria-hidden>
              {entry.swatch ? <span className="doc-menu-swatch" style={{ background: entry.swatch }} />
                : entry.checked ? <Icon name="check" size={16} />
                : entry.icon ? <Icon name={entry.icon} size={17} /> : null}
            </span>
            <span className="doc-menu-label" style={entry.style}>{entry.label}</span>
            {entry.items ? <Icon name="chevronRight" size={14} /> : entry.shortcut ? <kbd>{entry.shortcut}</kbd> : null}
          </button>
        );
      })}
      {open && (() => {
        const item = entries.filter(isItem)[open.index];
        return item?.items ? (
          <MenuPanel entries={item.items} x={0} y={0} parent={open.rect} level={level + 1} label={item.label} closeAll={closeAll ?? onClose}
            onClose={() => {
              setOpen(null);
              ref.current?.querySelector<HTMLButtonElement>(`[data-index="${open.index}"]`)?.focus();
            }} />
        ) : null;
      })()}
    </div>,
    document.body,
  );
}

/** Every command in a menu tree, with the path to it, for searching the menus. */
export function flattenMenus(menus: { label: string; entries: MenuEntry[] }[]) {
  const out: { path: string; item: MenuItem }[] = [];
  const walk = (entries: MenuEntry[], trail: string[]) => {
    for (const entry of entries) {
      if (!isItem(entry)) continue;
      if (entry.items) walk(entry.items, [...trail, entry.label]);
      else if (entry.run && !entry.disabled) out.push({ path: [...trail, entry.label].join(' › '), item: entry });
    }
  };
  for (const menu of menus) walk(menu.entries, [menu.label]);
  return out;
}

/** File, Edit, View and the rest, across the top of the document. */
export type MenuTree = { label: string; entries: MenuEntry[] }[];

export function MenuBar({ getMenus, onOpenChange }: { getMenus: () => MenuTree; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState<{ index: number; rect: DOMRect } | null>(null);
  const menus = getMenus();
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => { onOpenChange?.(!!open); }, [open, onOpenChange]);
  const show = (index: number, button: HTMLElement) => setOpen({ index, rect: button.getBoundingClientRect() });
  return (
    <div className="doc-menubar" role="menubar" ref={bar}>
      {menus.map((menu, index) => (
        <button key={menu.label} type="button" role="menuitem" data-menu-anchor aria-haspopup="menu" aria-expanded={open?.index === index}
          className={'doc-menubar-item' + (open?.index === index ? ' is-open' : '')}
          onClick={(e) => (open?.index === index ? setOpen(null) : show(index, e.currentTarget))}
          onPointerEnter={(e) => { if (open && open.index !== index) show(index, e.currentTarget); }}
          onKeyDown={(e) => {
            const items = Array.from(bar.current?.querySelectorAll<HTMLButtonElement>('.doc-menubar-item') ?? []);
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault();
              const next = items[(index + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length];
              next?.focus();
              if (open) show(items.indexOf(next), next);
            }
            if (e.key === 'ArrowDown') { e.preventDefault(); show(index, e.currentTarget); }
          }}>
          {menu.label}
        </button>
      ))}
      {open && (
        <MenuPanel entries={menus[open.index].entries} x={open.rect.left} y={open.rect.bottom + 2} label={menus[open.index].label}
          onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

/** The "Search the menus" box at the start of the toolbar (Alt+/). */
export function MenuSearch({ getMenus, compact }: { getMenus: () => MenuTree; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  // Read when the box opens, so a command that is unavailable right now is not offered.
  const all = useMemo(() => (open ? flattenMenus(getMenus()) : []), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? all.filter((r) => r.path.toLowerCase().includes(q)) : all).slice(0, 12);
  }, [all, query]);
  useOverlayBack(open, () => setOpen(false));

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.altKey && event.key === '/') { event.preventDefault(); setOpen(true); requestAnimationFrame(() => input.current?.focus()); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const run = (index: number) => {
    const result = results[index];
    if (!result) return;
    setOpen(false); setQuery('');
    result.item.run?.();
  };

  return (
    <div className={'doc-menu-search' + (open ? ' is-open' : '') + (compact ? ' is-compact' : '')} ref={box}>
      {open ? (
        <>
          <Icon name="search" size={16} />
          <input ref={input} autoFocus aria-label="Search the menus" placeholder="Search the menus (Alt+/)" value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              if (e.key === 'Enter') { e.preventDefault(); run(active); }
              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
            }} />
          <div className="doc-menu-results" role="listbox">
            {results.map((result, i) => (
              <button key={result.path} type="button" role="option" aria-selected={i === active} className={'doc-menu-item' + (i === active ? ' is-open' : '')}
                onPointerEnter={() => setActive(i)} onClick={() => run(i)}>
                <span className="doc-menu-icon" aria-hidden>{result.item.icon && <Icon name={result.item.icon} size={16} />}</span>
                <span className="doc-menu-label">{result.path}</span>
                {result.item.shortcut && <kbd>{result.item.shortcut}</kbd>}
              </button>
            ))}
            {!results.length && <p className="doc-menu-empty">No menu item matches “{query}”.</p>}
          </div>
        </>
      ) : (
        <button type="button" className="doc-tool doc-menu-search-button" data-doc-tip="Search the menus (Alt+/)" aria-label="Search the menus"
          onClick={() => { setOpen(true); requestAnimationFrame(() => input.current?.focus()); }}>
          <Icon name="search" size={16} />{!compact && <span>Menus</span>}
        </button>
      )}
    </div>
  );
}
