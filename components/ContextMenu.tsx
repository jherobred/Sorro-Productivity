'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';
import { lg } from '@/lib/glass';
import { PAL } from '@/lib/pal';
import { useLayout } from '@/lib/useLayout';

/**
 * One row. `run` OR `items` — a row that opens a submenu does not also act,
 * because a control that both navigates and commits is a control people
 * trigger by accident.
 */
export type CtxItem = {
  label: string;
  icon: IconName;
  run?: () => void;
  /** Turns the row into a submenu parent. */
  items?: CtxItem[];
  /** Shown right-aligned, dimmed. Display only — the owning screen binds it. */
  shortcut?: string;
  danger?: boolean;
  /** Greyed and inert. `hint` says why, so a dead row is never a mystery. */
  disabled?: boolean;
  hint?: string;
  /** A tick on the left, for rows that report a current setting. */
  checked?: boolean;
  /** A CSS colour shown in place of the icon, for rows that pick a colour. */
  swatch?: string;
};

/** A labelled run of rows. The label is optional; the rule above it is not. */
export type CtxGroup = { label?: string; items: CtxItem[] };

/** Either shape is accepted, so existing callers keep working. */
export type CtxContent = CtxItem[] | CtxGroup[];

const isGroups = (c: CtxContent): c is CtxGroup[] =>
  c.length > 0 && Array.isArray((c[0] as CtxGroup).items);

/**
 * Context menu on the glass surface (ctxStyle, Basedly.dc.html:6478 — LG at
 * .95 strength, 228px wide, 15px radius) with the kind dot from ctxKindDot.
 */
const KIND_DOT: Record<string, string> = {
  task: PAL.indigo, project: PAL.violet, node: PAL.amber, scratch: PAL.cyan,
  event: PAL.mint, nav: 'var(--acc)', fab: 'var(--acc)', habit: PAL.coral, global: 'var(--acc)',
};

export function ContextMenu({
  x, y, kind, label, items, onClose, accent, dark,
}: {
  x: number; y: number; kind: string; label: string;
  items: CtxContent; onClose: () => void; accent: string; dark: boolean;
}) {
  const { phone } = useLayout();

  useEffect(() => {
    const close = () => onClose();
    // preventDefault so useBackGuard's Escape does not also pop the overlay stack.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    // Defer so the opening gesture's own pointerup does not close it.
    const t = setTimeout(() => window.addEventListener('pointerdown', close, { once: true }), 0);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  /**
   * Measure, then place.
   *
   * The old sums guessed the menu's height as `items.length * 38 + 60` and
   * clamped against the guess. A seven-item menu guessed 326px, so on a short
   * window the clamp pulled `top` up to 89 no matter where you clicked — the
   * menu opened a couple of hundred pixels above the pointer. Reading the real
   * box is both simpler and correct for any number of items, any font scale,
   * and any wrapped label.
   *
   * Below-right of the pointer when it fits, flipped when it does not, and
   * clamped on both axes so it can never leave the screen.
   */
  // Flat lists and grouped lists render the same way; one shape internally.
  const groups: CtxGroup[] = isGroups(items) ? items : [{ items }];
  const flat = groups.flatMap((g) => g.items);

  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const M = 8;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const wantLeft = x + w + M > vw ? x - w : x;
    const wantTop = y + h + M > vh ? y - h : y;

    setPos({
      left: Math.min(Math.max(M, wantLeft), Math.max(M, vw - w - M)),
      top: Math.min(Math.max(M, wantTop), Math.max(M, vh - h - M)),
    });
  }, [x, y, flat.length]);


/**
 * Rendered into <body>, not where it is written.
 *
 * `main` carries a `zoom` (the font-scale/density preference) and a page-entry
 * transform. Either makes it the containing block for `position: fixed`
 * descendants, so a menu asking for viewport coordinates got the main element's
 * coordinates instead and opened a long way from the pointer — the further down
 * the page, the further off. A portal puts it back on the viewport, which is
 * the only frame a pointer position is ever expressed in.
 */
  if (phone) {
    return createPortal(
      <>
        <div 
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', zIndex: 60, animation: 'fadein 0.2s ease-out' }} 
          onClick={onClose} 
        />
        <div ref={ref} className="sheet" role="menu" aria-label={label}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            ...lg({ tint: accent, strength: 0.95, radius: 24, dark }),
            borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
            position: 'fixed',
            left: 0, right: 0, bottom: 0,
            maxHeight: '85dvh', overflowY: 'auto',
            zIndex: 61, padding: '12px 12px 24px',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
          <div style={{ width: 36, height: 5, borderRadius: 3, background: 'var(--tx3)', margin: '0 auto 12px', opacity: 0.5 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 9px 12px' }}>
            <span style={{ width: 6, height: 6, borderRadius: 2, flex: 'none', background: KIND_DOT[kind] ?? 'var(--acc)' }} />
            <span style={{
              fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
              color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {label}
            </span>
          </div>

          {groups.map((g, gi) => (
            <div key={g.label ?? gi} role="group" aria-label={g.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {gi > 0 && <div aria-hidden style={{ height: 1, background: 'var(--line)', margin: '8px 6px' }} />}
              {g.label && (
                <div style={{
                  fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase',
                  color: 'var(--tx3)', padding: '4px 10px 4px',
                }}>
                  {g.label}
                </div>
              )}
              {g.items.map((it) => (
                <Row key={it.label} it={it} onClose={onClose} accent={accent} dark={dark} phone={phone} />
              ))}
            </div>
          ))}
        </div>
      </>,
      document.body,
    );
  }

  return createPortal(
    <div ref={ref} className="pop" role="menu" aria-label={label}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        ...lg({ tint: accent, strength: 0.95, radius: 15, dark }),
        position: 'fixed',
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        // Hidden until measured, so it never flashes in the wrong place.
        visibility: pos ? 'visible' : 'hidden',
        width: 228, maxHeight: 'calc(100dvh - 16px)', overflowY: 'auto',
        zIndex: 60, padding: 5,
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px 8px' }}>
        <span style={{ width: 6, height: 6, borderRadius: 2, flex: 'none', background: KIND_DOT[kind] ?? 'var(--acc)' }} />
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
          color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {label}
        </span>
      </div>

      {groups.map((g, gi) => (
        <div key={g.label ?? gi} role="group" aria-label={g.label}>
          {gi > 0 && <div aria-hidden style={{ height: 1, background: 'var(--line)', margin: '5px 6px' }} />}
          {g.label && (
            <div style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase',
              color: 'var(--tx3)', padding: '5px 10px 3px',
            }}>
              {g.label}
            </div>
          )}
          {g.items.map((it) => (
            <Row key={it.label} it={it} onClose={onClose} accent={accent} dark={dark} />
          ))}
        </div>
      ))}
    </div>,
    document.body,
  );
}

const SUB_W = 200;

/**
 * A row, and its submenu when it has one.
 *
 * **The submenu is a portal, not a child.** It used to be `position: absolute;
 * left: 100%` inside the menu — and the menu is a scroll container
 * (`overflowY: auto`, because a fifteen-item menu has to be reachable on a
 * short window). CSS makes the other axis `auto` too the moment one axis is
 * not `visible`, so the whole submenu was laid out *outside* a box that clips:
 * you hovered a row with an arrow on it and nothing appeared. Every submenu in
 * the app was invisible for that one reason.
 *
 * On the viewport it cannot be clipped by anything, and each level portals in
 * turn, so a submenu of a submenu behaves the same. It opens to the right of
 * its row and flips left near the edge.
 */
function Row({ it, onClose, accent, dark, phone }: {
  it: CtxItem; onClose: () => void; accent: string; dark: boolean; phone?: boolean;
}) {
  /** The row's own box, in viewport coordinates. Null while shut. */
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const row = useRef<HTMLDivElement>(null);
  const shut = useRef<number | undefined>(undefined);

  const has = !!it.items?.length;
  const open = !!anchor;
  const colour = it.disabled ? 'var(--tx3)' : it.danger ? PAL.coral : 'var(--tx)';

  const show = () => {
    clearTimeout(shut.current);
    if (it.disabled || !has) return;
    const r = row.current?.getBoundingClientRect();
    if (r) setAnchor(r);
  };
  // A small delay on leave, so crossing the gap to the submenu does not shut it.
  const hide = () => { shut.current = window.setTimeout(() => setAnchor(null), 120); };

  return (
    <div ref={row} style={{ position: 'relative' }} onPointerEnter={show} onPointerLeave={hide}>
      <button
        role={has ? 'menuitem' : it.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
        aria-haspopup={has || undefined}
        aria-expanded={has ? open : undefined}
        aria-checked={it.checked}
        aria-disabled={it.disabled || undefined}
        title={it.hint}
        onClick={() => {
          if (it.disabled) return;
          // Tap opens it too — the APK has no hover, so a submenu that only
          // answered the mouse was a dead row on the phone.
          if (has) { if (open) setAnchor(null); else show(); return; }
          it.run?.();
          onClose();
        }}
        className={it.disabled ? undefined : 'hov lensrow'}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: phone ? '14px 12px' : '9px 10px',
          borderRadius: phone ? 12 : 9, fontSize: phone ? 14 : 12.5, fontWeight: 600, textAlign: 'left', minHeight: phone ? 44 : 36,
          color: colour, opacity: it.disabled ? 0.45 : 1,
          cursor: it.disabled ? 'default' : 'pointer',
        }}>
        {it.swatch
          ? (
            /* A colour row says which colour with the colour itself; the name
               alone makes you guess what this file calls "Indigo". */
            <span aria-hidden style={{
              flex: 'none', width: phone ? 18 : 14, height: phone ? 18 : 14,
              background: it.swatch, border: '1px solid var(--line2)',
            }} />
          )
          : <Icon name={it.icon} size={phone ? 18 : 14} color={it.disabled ? 'var(--tx3)' : it.danger ? PAL.coral : 'var(--tx3)'} />}
        <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {it.label}
        </span>
        {it.checked && <Icon name="check" size={phone ? 16 : 13} color="var(--accTx)" />}
        {it.shortcut && (
          <span style={{ fontSize: phone ? 12 : 10, fontWeight: 700, color: 'var(--tx3)', letterSpacing: '.03em', flex: 'none' }}>
            {it.shortcut}
          </span>
        )}
        {has && <Icon name="expand" size={phone ? 14 : 12} color="var(--tx3)" />}
      </button>

      {has && anchor && (
        <SubMenu anchor={anchor} label={it.label} items={it.items!}
          onEnter={show} onLeave={hide} onClose={onClose} accent={accent} dark={dark} />
      )}
    </div>
  );
}

/**
 * The submenu itself, on the viewport.
 *
 * Measured and then placed, never guessed: a menu clamped against
 * `items.length * 38` once opened two hundred pixels away from the row that
 * owned it, because a wrapped label or a font-scale of 1.375 makes that sum a
 * fiction. It renders hidden, reads its own box, and only then takes a
 * position — the same two-step the parent menu uses.
 */
function SubMenu({
  anchor, label, items, onEnter, onLeave, onClose, accent, dark,
}: {
  anchor: DOMRect; label: string; items: CtxItem[];
  onEnter: () => void; onLeave: () => void; onClose: () => void; accent: string; dark: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const M = 8;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const want = anchor.right + w + M > window.innerWidth ? anchor.left - w - 4 : anchor.right + 4;
    setPos({
      left: Math.min(Math.max(M, want), Math.max(M, window.innerWidth - w - M)),
      top: Math.min(Math.max(M, anchor.top - 4), Math.max(M, window.innerHeight - h - M)),
    });
  }, [anchor, items.length]);

  return createPortal(
    <div ref={ref} role="menu" aria-label={label} className="pop"
      onPointerEnter={onEnter} onPointerLeave={onLeave}
      // Outside the parent menu's box now, so it needs its own guard: the
      // window pointerdown that closes the menu fires before click, and a
      // submenu that unmounts on pointerdown never receives the click that was
      // choosing one of its rows.
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        ...lg({ tint: accent, strength: 0.95, radius: 13, dark }),
        position: 'fixed', left: pos?.left ?? -9999, top: pos?.top ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
        width: SUB_W, maxHeight: 'calc(100dvh - 16px)', overflowY: 'auto', padding: 5, zIndex: 61,
      }}>
      {items.map((sub) => (
        <Row key={sub.label} it={sub} onClose={onClose} accent={accent} dark={dark} />
      ))}
    </div>,
    document.body,
  );
}
