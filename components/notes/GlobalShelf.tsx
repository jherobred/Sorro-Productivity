'use client';

import { useEffect, useState } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { Icon, type IconName } from '../Icon';
import { ProgBlur } from '../core/ProgBlur';
import { useLayout } from '@/lib/useLayout';
import { usePrefs } from '@/lib/prefs';
import { ask } from '@/lib/ask';
import { ContextMenu, type CtxGroup } from '../ContextMenu';
import {
  addWallpaper, currentWallpaper, cycleWallpaper, framed, pickImage,
  removeCurrentWallpaper, setBookPrefs, setHideRecent, setWallpaperFrame, useShelfPrefs,
} from '@/lib/shelfPrefs';
import { whenLabel, type Note, type Notebook } from '@/lib/notes';
import { coverArt } from './NotebookCover';
import type { Framing } from '@/lib/shelfPrefs';
import type { Board } from '@/lib/canvas';

/** Recolour options, matching the notebook menus elsewhere in Notes. */
const COLOURS = [
  { n: 'Violet', v: '#B07CFF' }, { n: 'Indigo', v: '#7C6CFF' }, { n: 'Cyan', v: '#38D6F2' },
  { n: 'Mint', v: '#34D9A0' }, { n: 'Amber', v: '#FFC24B' }, { n: 'Coral', v: '#FF6B6B' },
];

interface GlobalShelfProps {
  notebooks: Notebook[];
  notes: Note[];
  boards: Board[];
  onOpenNotebook: (id: string) => void;
  onOpenNote: (notebookId: string, noteId: string) => void;
  onOpenBoard: (board: Board) => void;
  onJumpTab: (tab: 'notebooks' | 'canvas' | 'graph' | 'journal' | 'code') => void;
  onNewNotebook: () => void;
  onRenameNotebook?: (b: Notebook, name: string) => void;
  onRecolourNotebook?: (b: Notebook, color: string) => void;
  onRenameBoard?: (b: Board) => void;
  onRecolourBoard?: (b: Board, color: string) => void;
}

/**
 * The library — the landing screen of Notebooks.
 *
 * A hero band opens the tab, then three four-up grids of square cards:
 * notebooks reading their own note titles, the canvases and graphs wearing
 * cover art, and the notes you touched last. Counts live on the hero as
 * tappable stat chips; there is no filter row and no search field here —
 * the global search palette owns search, and each inner tab owns its tools.
 */
export function GlobalShelf({
  notebooks,
  notes,
  boards,
  onOpenNotebook,
  onOpenNote,
  onOpenBoard,
  onJumpTab,
  onNewNotebook,
  onRenameNotebook,
  onRecolourNotebook,
  onRenameBoard,
  onRecolourBoard,
}: GlobalShelfProps) {
  const { phone } = useLayout();
  const { prefs } = usePrefs();
  const shelf = useShelfPrefs();
  const [menu, setMenu] = useState<{ x: number; y: number; label: string; items: CtxGroup[] } | null>(null);

  /** Insert / adjust / remove, shared by notebook bands and board faces. */
  const imageGroup = (id: string, noun: string): CtxGroup => {
    const cur = shelf.books[id];
    return {
      label: noun,
      items: [
        {
          label: cur?.image ? 'Replace image' : 'Insert an image', icon: 'photo',
          run: () => void pickImage('band').then((d) => { if (d) setBookPrefs(id, { image: d }); }),
        },
        ...(cur?.image ? [
          {
            label: 'Adjust the image', icon: 'focus' as const,
            items: [
              { label: 'Fill the frame', icon: 'expand' as const, checked: (cur.fit ?? 'cover') === 'cover', run: () => setBookPrefs(id, { fit: 'cover' }) },
              { label: 'Fit the whole picture', icon: 'collapse' as const, checked: cur.fit === 'contain', run: () => setBookPrefs(id, { fit: 'contain' }) },
              { label: 'Anchor top', icon: 'sort' as const, checked: cur.pos === 'top', run: () => setBookPrefs(id, { pos: 'top' }) },
              { label: 'Anchor middle', icon: 'sort' as const, checked: (cur.pos ?? 'center') === 'center', run: () => setBookPrefs(id, { pos: 'center' }) },
              { label: 'Anchor bottom', icon: 'sort' as const, checked: cur.pos === 'bottom', run: () => setBookPrefs(id, { pos: 'bottom' }) },
            ],
          },
          { label: 'Remove image', icon: 'trash' as const, danger: true, run: () => setBookPrefs(id, { image: undefined }) },
        ] : []),
      ],
    };
  };

  /** Everything a notebook card can be customised with, in one menu. */
  const bookMenu = (b: Notebook): CtxGroup[] => [
    { items: [{ label: 'Open notebook', icon: 'book', run: () => onOpenNotebook(b.id) }] },
    {
      label: 'Notebook',
      items: [
        ...(onRenameNotebook ? [{
          label: 'Rename', icon: 'edit' as const, shortcut: 'F2',
          run: () => void ask('Rename notebook', { initial: b.name, placeholder: 'Notebook name' })
            .then((n) => { if (n && n !== b.name) onRenameNotebook(b, n); }),
        }] : []),
        ...(onRecolourNotebook ? [{
          label: 'Colour', icon: 'palette' as const,
          items: COLOURS.map((c) => ({
            label: c.n, icon: 'palette' as const, swatch: c.v, checked: b.color === c.v,
            run: () => onRecolourNotebook(b, c.v),
          })),
        }] : []),
        {
          label: shelf.books[b.id]?.tag ? 'Edit tag' : 'Add tag', icon: 'tag',
          run: () => void ask('Tag this notebook', {
            initial: shelf.books[b.id]?.tag ?? '', placeholder: 'e.g. school, work',
          }).then((t) => setBookPrefs(b.id, { tag: t?.trim().slice(0, 24) || undefined })),
        },
      ],
    },
    imageGroup(b.id, 'Header image'),
  ];

  const boardMenu = (b: Board): CtxGroup[] => [
    { items: [{ label: 'Open', icon: (b.kind === 'graph' ? 'link' : 'grid') as IconName, run: () => onOpenBoard(b) }] },
    {
      label: b.kind === 'graph' ? 'Graph' : 'Canvas',
      items: [
        ...(onRenameBoard ? [{ label: 'Rename', icon: 'edit' as const, run: () => onRenameBoard(b) }] : []),
        ...(onRecolourBoard ? [{
          label: 'Colour', icon: 'palette' as const,
          items: COLOURS.map((c) => ({
            label: c.n, icon: 'palette' as const, swatch: c.v, checked: b.color === c.v,
            run: () => onRecolourBoard(b, c.v),
          })),
        }] : []),
      ],
    },
    imageGroup(b.id, 'Face image'),
  ].filter((g) => g.items.length > 0);

  const canvases = boards.filter((b) => b.kind !== 'graph');
  const graphs = boards.filter((b) => b.kind === 'graph');

  const recentNotes = [...notes]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 10);

  const lastTouched = (list: Note[]) =>
    list.reduce<string | null>((a, n) => (!a || n.updated_at > a ? n.updated_at : a), null);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }} className="navsb">
      <ShelfHero
        notebooks={notebooks.length}
        notes={notes.length}
        canvases={canvases.length}
        graphs={graphs.length}
        phone={phone}
        wallpaper={currentWallpaper(shelf)}
        frame={shelf.wallpaperFrame}
        count={shelf.wallpapers.length}
        at={shelf.wallpaperAt}
        onJump={onJumpTab}
        onNew={onNewNotebook}
      />

      {/* Notebooks — the notebook's own first notes, read off the card. Cover
          art said which notebook this was; the titles say what is in it, which
          is the question you actually arrive with. Clicking peeks rather than
          navigating: only Open notebook leaves the shelf. */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SectionHead title="Notebooks" count={notebooks.length} />
        {notebooks.length === 0 ? (
          <EmptyShelf onNew={onNewNotebook} />
        ) : (
          <div className="k-stagger" style={{
            display: 'grid',
            gridTemplateColumns: phone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
            gap: 12,
            alignItems: 'start',
          }}>
            {notebooks.map((b, i) => {
              const list = [...notes.filter((n) => n.notebook_id === b.id)]
                .sort((x, y) => y.updated_at.localeCompare(x.updated_at));
              const last = lastTouched(list);
              return (
                <div
                  key={b.id}
                  role="button" tabIndex={0}
                  aria-label={`Open ${b.name}`}
                  onClick={() => onOpenNotebook(b.id)}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault(); onOpenNotebook(b.id);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, label: b.name, items: bookMenu(b) });
                  }}
                  className="clay k-squish"
                  style={{
                    ['--i' as string]: i, position: 'relative', overflow: 'hidden', borderRadius: 0,
                    textAlign: 'left', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column',
                    minHeight: phone ? 212 : 292, width: '100%',
                  }}
                >
                  {/* The header band — an eighth of the card, and the only
                      place a picture belongs on it. The blur under the image
                      hands off to the card surface instead of stopping at a
                      hard line. */}
                  <span aria-hidden style={{
                    position: 'relative', flex: 'none', height: phone ? 62 : 84, overflow: 'hidden',
                    background: framed(shelf.books[b.id]?.image, shelf.books[b.id])
                      ?? `linear-gradient(120deg, color-mix(in srgb, ${b.color} 42%, var(--card2)), color-mix(in srgb, ${b.color} 12%, var(--card2)))`,
                  }}>
                    <ProgBlur edge="bottom" size={phone ? 30 : 40} strength={14} />
                  </span>

                  <span aria-hidden style={{
                    position: 'absolute', top: 0, bottom: 0, left: 0, width: 4, zIndex: 1,
                    background: b.color,
                  }} />

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenu({ x: e.clientX, y: e.clientY, label: b.name, items: bookMenu(b) });
                    }}
                    className="hov" aria-label={`Customise ${b.name}`} aria-haspopup="menu"
                    style={{
                      position: 'absolute', top: 7, left: 11, zIndex: 2, width: 26, height: 26,
                      display: 'grid', placeItems: 'center', cursor: 'pointer',
                      background: 'color-mix(in srgb, var(--card) 68%, transparent)',
                      border: '1px solid var(--line2)',
                      backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                    }}
                  >
                    <Icon name="dots" size={14} color="var(--tx2)" />
                  </button>

                  <span style={{
                    flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4,
                    padding: phone ? '11px 14px 14px' : '13px 18px 17px',
                  }}>
                    <span style={{
                      fontSize: phone ? 14 : 15.5, fontWeight: 800, letterSpacing: '-.015em', color: 'var(--tx)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {b.name}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--tx3)' }}>
                        {list.length} note{list.length === 1 ? '' : 's'}{last ? ` · ${whenLabel(last)}` : ''}
                      </span>
                      {shelf.books[b.id]?.tag && (
                        <span style={{
                          flex: 'none', padding: '2px 7px', fontSize: 10.5, fontWeight: 800,
                          letterSpacing: '.02em', maxWidth: 110,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          color: b.color, background: `color-mix(in srgb, ${b.color} 16%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${b.color} 38%, transparent)`,
                        }}>
                          {shelf.books[b.id]!.tag}
                        </span>
                      )}
                    </span>
                    <span style={{
                      marginTop: 5, paddingTop: 7, borderTop: '1px solid var(--line)',
                      display: 'flex', flexDirection: 'column', minWidth: 0,
                    }}>
                      {list.slice(0, phone ? 3 : 4).map((n) => (
                        <span key={n.id} style={{
                          fontSize: 12.5, lineHeight: 1.85, color: 'var(--tx2)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {n.title || 'Untitled'}
                        </span>
                      ))}
                      {list.length === 0 && (
                        <span style={{ fontSize: 12.5, lineHeight: 1.85, color: 'var(--tx3)' }}>Nothing written yet.</span>
                      )}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Canvases & graphs — the cover language, on the same four-up grid. */}
      {boards.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SectionHead title="Canvas & graphs" count={boards.length} />
          <div style={{
            display: 'grid', gap: 12, alignItems: 'start',
            gridTemplateColumns: phone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
          }}>
            {[...canvases, ...graphs].map((b) => (
              <button
                key={b.id}
                onClick={() => onOpenBoard(b)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, label: b.name, items: boardMenu(b) });
                }}
                className="clay k-squish"
                style={{
                  position: 'relative', overflow: 'hidden', borderRadius: 0, width: '100%', height: phone ? 124 : 158,
                  textAlign: 'left', padding: 0,
                  display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                }}
              >
                <span aria-hidden style={{
                  position: 'absolute', inset: 0,
                  background: framed(shelf.books[b.id]?.image, shelf.books[b.id])
                    ?? `linear-gradient(140deg, color-mix(in srgb, ${b.color} 46%, var(--card2)), color-mix(in srgb, ${b.color} 14%, var(--card2)))`,
                }} />
                <span style={{
                  position: 'absolute', top: 8, left: 8, width: 26, height: 26,
                  display: 'grid', placeItems: 'center',
                  background: 'color-mix(in srgb, var(--card) 62%, transparent)',
                  border: '1px solid var(--line2)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                }}>
                  <Icon name={b.kind === 'graph' ? 'link' : 'grid'} size={12} color="var(--tx2)" />
                </span>
                <ProgBlur edge="bottom" size={44} strength={11} />
                <span style={{
                  position: 'relative', padding: '10px 13px 11px', fontSize: 12.5, fontWeight: 800,
                  color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block',
                }}>
                  {b.name}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Recently touched notes — the "carry on where I left" grid. */}
      {recentNotes.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SectionHead
            title="Picked up lately"
            count={undefined}
            collapsed={!!shelf.hideRecent}
            onToggle={() => setHideRecent(!shelf.hideRecent)}
          />
          <div hidden={shelf.hideRecent} style={{
            display: 'grid', gap: 12, alignItems: 'start',
            gridTemplateColumns: phone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
          }}>
            {recentNotes.map((n) => {
              const book = notebooks.find((b) => b.id === n.notebook_id);
              return (
                <button
                  key={n.id}
                  onClick={() => onOpenNote(n.notebook_id, n.id)}
                  className="clay k-squish"
                  style={{
                    position: 'relative', width: '100%', borderRadius: 0, minHeight: phone ? 116 : 138,
                    textAlign: 'left', padding: phone ? '13px 14px 12px' : '15px 17px 14px', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 4,
                  }}
                >
                  <span aria-hidden style={{
                    position: 'absolute', top: 0, bottom: 0, left: 0, width: 4,
                    background: book?.color ?? 'var(--acc)',
                  }} />
                  <span style={{
                    fontSize: 13.5, fontWeight: 800, color: 'var(--tx)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {n.title || 'Untitled'}
                  </span>
                  <span style={{
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    fontSize: 12, lineHeight: 1.5, color: 'var(--tx3)', minHeight: 36,
                  }}>
                    {n.body ? n.body.replace(/[#*`>\[\]]/g, '').slice(0, 110) : 'Empty note'}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
                    {book?.name ?? 'Notebook'} · {whenLabel(n.updated_at)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {menu && (
        <ContextMenu
          x={menu.x} y={menu.y} kind="project" label={menu.label} items={menu.items}
          onClose={() => setMenu(null)} accent={prefs.accent} dark={prefs.theme === 'dark'}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function SectionHead({
  title, count, collapsed, onToggle,
}: {
  title: string;
  count: number | undefined;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.015em', color: 'var(--tx)' }}>{title}</h2>
      {count !== undefined && (
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      )}
      {onToggle && (
        <button
          onClick={onToggle}
          className="hov"
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Show ${title}` : `Hide ${title}`}
          style={{
            flex: 'none', width: 24, height: 24, display: 'grid', placeItems: 'center',
            border: '1px solid var(--line2)', background: 'var(--card)', cursor: 'pointer',
          }}
        >
          <Icon
            name="chev" size={13} color="var(--tx2)"
            style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform .18s' }}
          />
        </button>
      )}
      {/* The rule carries the eye from the control across the empty run. */}
      {onToggle && <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--line)' }} />}
    </div>
  );
}

/** A number that counts up on arrival. Instant under reduced motion. */
function Stat({ to }: { to: number }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => Math.round(v).toLocaleString());
  useEffect(() => {
    if (reduce) { mv.set(to); return; }
    const c = animate(mv, to, { duration: 0.9, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [to, reduce, mv]);
  return <motion.span style={{ fontSize: 15, fontWeight: 900, color: 'var(--tx)', lineHeight: 1 }}>{text}</motion.span>;
}

function ShelfHero({
  notebooks, notes, canvases, graphs, phone, wallpaper, frame, count, at, onJump, onNew,
}: {
  notebooks: number; notes: number; canvases: number; graphs: number; phone: boolean;
  /** The wallpaper on screen, standing in for the generated gradient. */
  wallpaper: string | undefined;
  frame: Framing;
  /** How many wallpapers are loaded, and which one this is. */
  count: number;
  at: number;
  onJump: GlobalShelfProps['onJumpTab'];
  onNew: () => void;
}) {
  const [today, setToday] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const { prefs } = usePrefs();

  const wallMenu: CtxGroup[] = [
    {
      items: [{
        label: 'Insert a wallpaper', icon: 'photo',
        run: () => void pickImage('wide').then((d) => { if (d) addWallpaper(d); }),
      }],
    },
    ...(wallpaper ? [{
      label: 'Wallpaper',
      items: [
        {
          label: 'Adjust the wallpaper', icon: 'focus' as const,
          items: [
            { label: 'Fill the frame', icon: 'expand' as const, checked: (frame.fit ?? 'cover') === 'cover', run: () => setWallpaperFrame({ fit: 'cover' }) },
            { label: 'Fit the whole picture', icon: 'collapse' as const, checked: frame.fit === 'contain', run: () => setWallpaperFrame({ fit: 'contain' }) },
            { label: 'Anchor top', icon: 'sort' as const, checked: frame.pos === 'top', run: () => setWallpaperFrame({ pos: 'top' }) },
            { label: 'Anchor middle', icon: 'sort' as const, checked: (frame.pos ?? 'center') === 'center', run: () => setWallpaperFrame({ pos: 'center' }) },
            { label: 'Anchor bottom', icon: 'sort' as const, checked: frame.pos === 'bottom', run: () => setWallpaperFrame({ pos: 'bottom' }) },
          ],
        },
        {
          label: count > 1 ? `Next of ${count} wallpapers` : 'Cycle wallpapers', icon: 'redo' as const,
          disabled: count < 2,
          hint: count < 2 ? 'Insert another wallpaper to cycle between them' : undefined,
          run: () => cycleWallpaper(1),
        },
      ],
    }] : []),
  ];
  useEffect(() => {
    const h = new Date().getHours();
    setToday(
      new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + ' · ' +
      (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'),
    );
  }, []);

  const chip = (label: string, count: number, icon: 'book' | 'pen' | 'grid' | 'link', jump: 'notebooks' | 'canvas' | 'graph') => (
    <button
      onClick={() => onJump(jump === 'graph' ? 'graph' : jump)}
      className="k-chip"
      style={{
        display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 0,
        background: 'color-mix(in srgb, var(--card) 55%, transparent)',
        border: '1px solid var(--line2)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <Icon name={icon} size={13} color="var(--tx2)" />
      <Stat to={count} />
      <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--tx3)' }}>{label}</span>
    </button>
  );

  return (
    <div className="clay" style={{
      position: 'relative', overflow: 'hidden', minHeight: phone ? 210 : 268,
      display: 'flex', alignItems: 'flex-end', padding: phone ? 16 : 22, borderRadius: 0,
    }}>
      {/* No veil here, on purpose — the wallpaper is the point of the band.
          The caption below carries its own scrim instead. */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0,
        background: framed(wallpaper, frame) ?? coverArt('basedly-shelf-hero'),
      }} />

      {/* Remove sits on the wallpaper it removes, so cycling to a picture you
          are done with puts its own delete under your cursor. */}
      {wallpaper && (
        <button
          onClick={removeCurrentWallpaper}
          className="hov" title="Remove this wallpaper" aria-label="Remove this wallpaper"
          style={{
            position: 'absolute', top: 10, left: 10, zIndex: 2,
            display: 'grid', placeItems: 'center', width: 30, height: 30, cursor: 'pointer',
            background: 'color-mix(in srgb, var(--card) 68%, transparent)',
            border: '1px solid var(--line2)',
            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <Icon name="close" size={13} color="var(--tx2)" />
        </button>
      )}

      <button
        onClick={(e) => setMenu({ x: e.clientX, y: e.clientY })}
        className="hov" title="Wallpaper options" aria-label="Wallpaper options" aria-haspopup="menu"
        style={{
          position: 'absolute', top: 10, right: 10, zIndex: 2,
          display: 'grid', placeItems: 'center', width: 30, height: 30, cursor: 'pointer',
          background: 'color-mix(in srgb, var(--card) 68%, transparent)',
          border: '1px solid var(--line2)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        <Icon name="dots" size={15} color="var(--tx2)" style={{ transform: 'rotate(90deg)' }} />
      </button>

      {count > 1 && (
        <span aria-hidden style={{
          position: 'absolute', top: 16, left: 0, right: 0, zIndex: 1,
          display: 'flex', justifyContent: 'center', gap: 5,
        }}>
          {Array.from({ length: count }, (_, i) => (
            <span key={i} style={{
              width: i === at ? 16 : 6, height: 4,
              background: i === at ? 'var(--tx)' : 'color-mix(in srgb, var(--tx) 38%, transparent)',
              transition: 'width .18s',
            }} />
          ))}
        </span>
      )}

      {menu && (
        <ContextMenu
          x={menu.x} y={menu.y} kind="global" label="Wallpaper" items={wallMenu}
          onClose={() => setMenu(null)} accent={prefs.accent} dark={prefs.theme === 'dark'}
        />
      )}

      <div style={{
        position: 'relative', width: '100%', display: 'flex', alignItems: 'flex-end',
        justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        padding: wallpaper ? (phone ? '10px 12px' : '12px 14px') : 0,
        margin: wallpaper ? (phone ? '-10px -12px' : '-12px -14px') : 0,
        background: wallpaper ? 'color-mix(in srgb, var(--card) 72%, transparent)' : 'none',
        backdropFilter: wallpaper ? 'blur(10px)' : 'none',
        WebkitBackdropFilter: wallpaper ? 'blur(10px)' : 'none',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <h1 style={{
            fontSize: phone ? 22 : 27, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--tx)',
          }}>
            Your library
          </h1>
          <span className="metaline" style={{ fontWeight: 600, color: 'var(--tx2)' }}>{today || '\u00A0'}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {chip('Notebooks', notebooks, 'book', 'notebooks')}
          {chip('Notes', notes, 'pen', 'notebooks')}
          {chip('Canvas', canvases, 'grid', 'canvas')}
          {chip('Graphs', graphs, 'link', 'graph')}
          <button onClick={onNew} className="tap acc k-glass" style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '9px 15px', minHeight: 38,
            borderRadius: 0, background: 'var(--acc)', color: 'var(--accInk)', fontSize: 12.5, fontWeight: 800,
          }}>
            <Icon name="bookPlus" size={15} color="var(--accInk)" />New notebook
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyShelf({ onNew }: { onNew: () => void }) {
  return (
    <div className="clay" style={{
      padding: '34px 20px', borderRadius: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center',
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mascots/otter.svg" alt="" width={72} height={72} style={{ opacity: .92 }} />
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--tx)' }}>Your library is waiting</div>
        <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 3 }}>Make your first notebook and it moves in.</div>
      </div>
      <button onClick={onNew} className="tap acc k-glass" style={{
        display: 'flex', alignItems: 'center', gap: 7, padding: '9px 15px', minHeight: 38,
        borderRadius: 0, background: 'var(--acc)', color: 'var(--accInk)', fontSize: 12.5, fontWeight: 800,
      }}>
        <Icon name="bookPlus" size={15} color="var(--accInk)" />New notebook
      </button>
    </div>
  );
}
