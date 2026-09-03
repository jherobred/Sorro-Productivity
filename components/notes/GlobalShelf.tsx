'use client';

import { useMemo, useState } from 'react';
import { Icon, type IconName } from '../Icon';
import { ProgressiveBlur } from '../core/progressive-blur';
import { useLayout } from '@/lib/useLayout';
import { PAL } from '@/lib/pal';
import { whenLabel, type Note, type Notebook } from '@/lib/notes';
import type { Board } from '@/lib/canvas';

/**
 * The shelf, drawn as covers rather than counted.
 *
 * The old shelf opened on four tallies — notebooks, notes, canvases, graphs —
 * which is the one thing you never need on the way to a notebook. Every card
 * now carries a colour field of its own with a ProgressiveBlur ramp that the
 * title sits on, so the thing you are looking for is identified by its cover
 * and not by a number beside it.
 *
 * Four layouts, because the same shelf reads differently at different sizes and
 * on different libraries: STACK for browsing covers, RAIL for skimming several
 * sections at once, COLUMN for a phone-width single file, MOSAIC when a few
 * notebooks matter more than the rest. The choice is remembered.
 */

type Layout = 'stack' | 'rail' | 'column' | 'mosaic';
type Filter = 'all' | 'notebooks' | 'notes' | 'canvas' | 'graph';

const LAYOUTS: { id: Layout; label: string; icon: IconName }[] = [
  { id: 'stack', label: 'Stack', icon: 'grid' },
  { id: 'rail', label: 'Rails', icon: 'agenda' },
  { id: 'column', label: 'Column', icon: 'list' },
  { id: 'mosaic', label: 'Mosaic', icon: 'layers' },
];

const LS_KEY = 'basedly:shelfLayout';

const HUES = [PAL.violet, PAL.indigo, PAL.cyan, PAL.mint, PAL.amber, PAL.pink, PAL.sky, PAL.coral];

/** Stable per-name variation, so a cover looks the same every time you open it. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * The colour field the blur ramp has something to blur. Two off-centre radials
 * over a tilted base: placement and the companion hue come from the name, the
 * dominant hue from the item's own colour.
 *
 * The base mixes toward a fixed ink rather than `--card`, so a cover is the same
 * depth of field in both themes. Mixing with `--card` made every light-theme
 * cover pale enough that the white title on it failed contrast.
 */
const INK = '#171526';

function cover(color: string, seed: string): string {
  const h = hash(seed);
  const mate = HUES[h % HUES.length];
  const ax = 12 + (h % 5) * 18;
  const ay = 6 + ((h >> 3) % 4) * 12;
  const bx = 68 + ((h >> 5) % 4) * 9;
  const angle = 130 + ((h >> 7) % 5) * 15;
  return [
    `radial-gradient(120% 96% at ${ax}% ${ay}%, color-mix(in srgb, ${color} 72%, transparent), transparent 68%)`,
    `radial-gradient(96% 84% at ${bx}% 92%, color-mix(in srgb, ${mate} 48%, transparent), transparent 70%)`,
    `linear-gradient(${angle}deg, color-mix(in srgb, ${color} 34%, ${INK}), ${INK})`,
  ].join(', ');
}

/**
 * A blur ramp over a smooth gradient is invisible — blurring a gradient gives
 * back the same gradient. The covers therefore carry a fine dot grid, and it is
 * the dots dissolving along the ramp that you actually read as depth.
 */
const GRAIN: React.CSSProperties = {
  position: 'absolute', inset: 0, pointerEvents: 'none',
  backgroundImage:
    'radial-gradient(rgba(255,255,255,.20) 1px, transparent 1.5px), radial-gradient(rgba(0,0,0,.16) 1px, transparent 1.5px)',
  backgroundSize: '11px 11px, 11px 11px',
  backgroundPosition: '0 0, 5.5px 5.5px',
};

/* ------------------------------------------------------------------- pieces */

const TITLE: React.CSSProperties = {
  fontSize: 15, fontWeight: 800, color: '#FFFFFF', textShadow: '0 1px 10px rgba(0,0,0,.5)',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block',
};

const SUB: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.76)', textShadow: '0 1px 8px rgba(0,0,0,.5)',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block',
};

/**
 * One cover card. The blur ramp is a child of the colour field so it reads that
 * field through `backdrop-filter`, and it takes no pointer events so the whole
 * card stays one button.
 */
function Cover({
  color, seed, height, ratio, blur = 5, ramp = 62, radius = 18, dim = 0.34, children, onClick, label,
}: {
  color: string;
  seed: string;
  height?: number | string;
  ratio?: string;
  /** Blur radius step in px; the ramp multiplies it by the layer index. */
  blur?: number;
  /** Height of the ramp, as a percentage of the card. */
  ramp?: number;
  radius?: number;
  /** Extra darkening under the text end, 0-1. Keeps pale covers readable. */
  dim?: number;
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="k-squish"
      style={{
        position: 'relative', display: 'block', width: '100%', height, aspectRatio: ratio,
        borderRadius: radius, overflow: 'hidden', textAlign: 'left', cursor: 'pointer',
        background: cover(color, seed), border: '1px solid var(--line2)', boxShadow: 'var(--sh)',
        padding: 0, isolation: 'isolate',
      }}
    >
      <div aria-hidden style={GRAIN} />
      <ProgressiveBlur
        direction="bottom"
        blurIntensity={blur}
        style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: `${ramp}%`, pointerEvents: 'none' }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute', left: 0, bottom: 0, width: '100%', height: `${ramp}%`, pointerEvents: 'none',
          background: `linear-gradient(to top, rgba(6,5,12,${dim}), transparent)`,
        }}
      />
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        justifyContent: 'flex-end', padding: 14, gap: 2,
      }}>
        {children}
      </div>
    </button>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      alignSelf: 'flex-start', padding: '2px 8px', borderRadius: 999, marginBottom: 6,
      fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase',
      color: 'rgba(255,255,255,.9)', background: 'rgba(255,255,255,.14)',
      border: '1px solid rgba(255,255,255,.2)', backdropFilter: 'blur(6px)',
    }}>{children}</span>
  );
}

function Head({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <h2 style={{
        fontSize: 12.5, fontWeight: 800, textTransform: 'uppercase',
        letterSpacing: '.09em', color: 'var(--tx3)',
      }}>{title}</h2>
      {action && onAction && (
        <button onClick={onAction} className="k-underline" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accTx)' }}>
          {action} →
        </button>
      )}
    </div>
  );
}

/** A sideways strip with its overflow blurred off at the trailing edge. */
function Rail({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'relative', minWidth: 0 }}>
      <div
        className="navsb"
        style={{
          display: 'flex', gap: 12, overflowX: 'auto', overflowY: 'hidden',
          paddingBottom: 4, scrollSnapType: 'x proximity',
        }}
      >
        {children}
      </div>
      <ProgressiveBlur
        direction="right"
        blurIntensity={4}
        style={{
          position: 'absolute', top: 0, right: 0, height: '100%', width: 64,
          pointerEvents: 'none', zIndex: 2,
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------- shelf */

interface GlobalShelfProps {
  notebooks: Notebook[];
  notes: Note[];
  boards: Board[];
  onOpenNotebook: (id: string) => void;
  onOpenNote: (notebookId: string, noteId: string) => void;
  onOpenBoard: (board: Board) => void;
  onJumpTab: (tab: 'notebooks' | 'canvas' | 'graph' | 'journal' | 'code') => void;
  onNewNotebook: () => void;
}

export function GlobalShelf({
  notebooks, notes, boards, onOpenNotebook, onOpenNote, onOpenBoard, onJumpTab, onNewNotebook,
}: GlobalShelfProps) {
  const { phone } = useLayout();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [scrolled, setScrolled] = useState(false);
  const [layout, setLayout] = useState<Layout>(() => {
    if (typeof localStorage === 'undefined') return 'stack';
    const v = localStorage.getItem(LS_KEY);
    return v === 'rail' || v === 'column' || v === 'mosaic' ? v : 'stack';
  });

  const pickLayout = (l: Layout) => {
    setLayout(l);
    try { localStorage.setItem(LS_KEY, l); } catch { /* private mode */ }
  };

  const term = q.trim().toLowerCase();

  const notesByBook = useMemo(() => {
    const map = new Map<string, Note[]>();
    for (const n of notes) {
      const list = map.get(n.notebook_id);
      if (list) list.push(n);
      else map.set(n.notebook_id, [n]);
    }
    for (const list of map.values()) list.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return map;
  }, [notes]);

  const showBooks = filter === 'all' || filter === 'notebooks';
  const showNotes = filter === 'all' || filter === 'notes';
  const showBoards = filter === 'all' || filter === 'canvas' || filter === 'graph';

  const books = useMemo(() => {
    if (!showBooks) return [];
    return term ? notebooks.filter((b) => b.name.toLowerCase().includes(term)) : notebooks;
  }, [notebooks, term, showBooks]);

  const brds = useMemo(() => {
    if (!showBoards) return [];
    const list = boards.filter((b) =>
      filter === 'graph' ? b.kind === 'graph' : filter === 'canvas' ? b.kind !== 'graph' : true);
    return term ? list.filter((b) => b.name.toLowerCase().includes(term)) : list;
  }, [boards, term, filter, showBoards]);

  const recent = useMemo(() => {
    if (!showNotes) return [];
    const list = term
      ? notes.filter((n) => n.title.toLowerCase().includes(term) || n.body.toLowerCase().includes(term))
      : notes;
    return [...list]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, layout === 'column' ? 12 : 8);
  }, [notes, term, showNotes, layout]);

  const empty = books.length === 0 && brds.length === 0 && recent.length === 0;

  const bookSub = (b: Notebook) => notesByBook.get(b.id)?.[0]?.title || 'Empty notebook';
  const boardKind = (b: Board) => (b.kind === 'graph' ? 'Knowledge graph' : 'Infinite canvas');
  const boardColor = (b: Board) => b.color || PAL.indigo;

  /* --------------------------------------------------------------- controls */

  const controls = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 'none' }}>
      <div style={{
        display: 'flex', gap: 3, padding: 3, borderRadius: 11,
        background: 'var(--card2)', border: '1px solid var(--line2)',
      }}>
        {(['all', 'notebooks', 'notes', 'canvas', 'graph'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className="k-chip"
            style={{
              padding: '5px 11px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, textTransform: 'capitalize',
              background: filter === f ? 'var(--acc)' : 'transparent',
              color: filter === f ? 'var(--ink)' : 'var(--tx2)', border: 'none', cursor: 'pointer',
            }}
          >
            {f === 'all' ? 'Everything' : f}
          </button>
        ))}
      </div>

      <div style={{
        display: 'flex', gap: 3, padding: 3, borderRadius: 11,
        background: 'var(--card2)', border: '1px solid var(--line2)',
      }}>
        {LAYOUTS.map((l) => (
          <button
            key={l.id}
            onClick={() => pickLayout(l.id)}
            aria-pressed={layout === l.id}
            title={`${l.label} layout`}
            aria-label={`${l.label} layout`}
            className="k-chip"
            style={{
              width: 30, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center',
              background: layout === l.id ? 'var(--acc)' : 'transparent', border: 'none', cursor: 'pointer',
            }}
          >
            <Icon name={l.icon} size={14} color={layout === l.id ? 'var(--ink)' : 'var(--tx2)'} />
          </button>
        ))}
      </div>

      <button onClick={onNewNotebook} className="tap acc" style={{
        marginLeft: phone ? 0 : 'auto',
        display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 999,
        minHeight: 34, background: 'var(--acc)', color: 'var(--ink)', fontSize: 12, fontWeight: 700,
      }}>
        <Icon name="bookPlus" size={14} color="var(--ink)" />New notebook
      </button>

      <label style={{
        display: 'flex', alignItems: 'center', gap: 8, flex: phone ? '1 1 100%' : '0 0 230px',
        padding: '0 12px', height: 34, borderRadius: 10, border: '1px solid var(--line2)', background: 'var(--card)',
      }}>
        <Icon name="search" size={14} color="var(--tx3)" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search everything..."
          aria-label="Search shelf"
          style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--tx)', fontFamily: 'inherit' }} />
      </label>
    </div>
  );

  /* ------------------------------------------------------------- L1 · stack */

  const stack = (
    <>
      {books.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Head title="Notebooks" action="Open table" onAction={() => onJumpTab('notebooks')} />
          <div style={{
            display: 'grid',
            gridTemplateColumns: phone ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(190px, 1fr))',
            gap: 12,
          }}>
            {books.map((b) => {
              const list = notesByBook.get(b.id) ?? [];
              return (
                <Cover key={b.id} color={b.color} seed={b.name || b.id} ratio="4 / 5" ramp={64} blur={5}
                  onClick={() => onOpenNotebook(b.id)} label={`Open ${b.name}`}>
                  <span style={TITLE}>{b.name}</span>
                  <span style={SUB}>{list[0]?.title || 'Empty notebook'}</span>
                  {list.length > 1 && (
                    <span style={{ ...SUB, color: 'rgba(255,255,255,.56)' }}>{list[1].title || 'Untitled note'}</span>
                  )}
                </Cover>
              );
            })}
          </div>
        </section>
      )}

      {brds.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Head title="Canvases & graphs" />
          <div style={{
            display: 'grid',
            gridTemplateColumns: phone ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(190px, 1fr))',
            gap: 12,
          }}>
            {brds.map((b) => (
              <Cover key={b.id} color={boardColor(b)} seed={b.name || b.id} ratio="1 / 1" ramp={58} blur={4.5}
                onClick={() => onOpenBoard(b)} label={`Open ${b.name}`}>
                <Kicker>{b.kind === 'graph' ? 'Graph' : 'Canvas'}</Kicker>
                <span style={TITLE}>{b.name || 'Untitled'}</span>
                <span style={SUB}>{whenLabel(b.updated_at)}</span>
              </Cover>
            ))}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Head title="Recent notes" />
          <div style={{
            display: 'grid',
            gridTemplateColumns: phone ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 12,
          }}>
            {recent.map((n) => (
              <Cover key={n.id} color={PAL.deep} seed={n.title || n.id} height={128} ramp={78} blur={4} radius={14}
                onClick={() => onOpenNote(n.notebook_id, n.id)} label={`Open ${n.title || 'Untitled'}`}>
                <span style={TITLE}>{n.title || 'Untitled'}</span>
                <span style={SUB}>{n.body ? n.body.slice(0, 90) : 'Empty note'}</span>
                <span style={{
                  ...SUB, fontSize: 9.5, color: 'rgba(255,255,255,.55)', fontVariantNumeric: 'tabular-nums',
                }}>{whenLabel(n.updated_at)}</span>
              </Cover>
            ))}
          </div>
        </section>
      )}
    </>
  );

  /* -------------------------------------------------------------- L2 · rail */

  const rail = (
    <>
      {books.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Head title="Notebooks" action="Open table" onAction={() => onJumpTab('notebooks')} />
          <Rail>
            {books.map((b) => (
              <div key={b.id} style={{ flex: 'none', width: phone ? 220 : 270, scrollSnapAlign: 'start' }}>
                <Cover color={b.color} seed={b.name || b.id} height={168} ramp={70} blur={6}
                  onClick={() => onOpenNotebook(b.id)} label={`Open ${b.name}`}>
                  <span style={{ ...TITLE, fontSize: 17 }}>{b.name}</span>
                  <span style={SUB}>{bookSub(b)}</span>
                </Cover>
              </div>
            ))}
          </Rail>
        </section>
      )}

      {brds.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Head title="Canvases & graphs" />
          <Rail>
            {brds.map((b) => (
              <div key={b.id} style={{ flex: 'none', width: phone ? 168 : 200, scrollSnapAlign: 'start' }}>
                <Cover color={boardColor(b)} seed={b.name || b.id} height={140} ramp={62} blur={5}
                  onClick={() => onOpenBoard(b)} label={`Open ${b.name}`}>
                  <Kicker>{b.kind === 'graph' ? 'Graph' : 'Canvas'}</Kicker>
                  <span style={{ ...TITLE, fontSize: 14 }}>{b.name || 'Untitled'}</span>
                </Cover>
              </div>
            ))}
          </Rail>
        </section>
      )}

      {recent.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Head title="Recent notes" />
          <Rail>
            {recent.map((n) => (
              <div key={n.id} style={{ flex: 'none', width: phone ? 230 : 280, scrollSnapAlign: 'start' }}>
                <Cover color={PAL.deep} seed={n.title || n.id} height={116} ramp={80} blur={4} radius={14}
                  onClick={() => onOpenNote(n.notebook_id, n.id)} label={`Open ${n.title || 'Untitled'}`}>
                  <span style={{ ...TITLE, fontSize: 14 }}>{n.title || 'Untitled'}</span>
                  <span style={SUB}>{n.body ? n.body.slice(0, 70) : 'Empty note'}</span>
                </Cover>
              </div>
            ))}
          </Rail>
        </section>
      )}
    </>
  );

  /* ------------------------------------------------------------ L3 · column */

  /**
   * One file, top to bottom. The colour field runs down the left of each band
   * and the ramp blurs rightward into it, so the text sits on the soft end
   * rather than on a swatch.
   */
  const band = (
    key: string, color: string, seed: string, title: string, sub: string,
    meta: string, onClick: () => void, kicker?: string,
  ) => (
    <button
      key={key}
      onClick={onClick}
      aria-label={`Open ${title}`}
      className="k-squish"
      style={{
        position: 'relative', display: 'block', width: '100%', minHeight: 74, borderRadius: 14,
        overflow: 'hidden', textAlign: 'left', cursor: 'pointer', padding: 0, isolation: 'isolate',
        background: cover(color, seed), border: '1px solid var(--line2)', boxShadow: 'var(--sh)',
      }}
    >
      <div aria-hidden style={GRAIN} />
      <ProgressiveBlur direction="right" blurIntensity={7}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(90deg, transparent, rgba(6,5,12,.32) 42%, rgba(6,5,12,.5))',
      }} />
      <div style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px 14px 74px',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {kicker && <div style={{ display: 'flex' }}><Kicker>{kicker}</Kicker></div>}
          <span style={TITLE}>{title}</span>
          <span style={SUB}>{sub}</span>
        </div>
        {meta && (
          <span style={{
            ...SUB, flex: 'none', fontSize: 10, color: 'rgba(255,255,255,.6)',
            fontVariantNumeric: 'tabular-nums',
          }}>{meta}</span>
        )}
        <Icon name="chev" size={15} color="rgba(255,255,255,.7)" />
      </div>
    </button>
  );

  const column = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 720, width: '100%', margin: '0 auto' }}>
      {books.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Head title="Notebooks" action="Open table" onAction={() => onJumpTab('notebooks')} />
          {/* The first notebook takes the hero cover; the rest are bands. */}
          <Cover color={books[0].color} seed={books[0].name || books[0].id} height={phone ? 190 : 230}
            ramp={66} blur={7} onClick={() => onOpenNotebook(books[0].id)} label={`Open ${books[0].name}`}>
            <Kicker>Notebook</Kicker>
            <span style={{ ...TITLE, fontSize: 22 }}>{books[0].name}</span>
            <span style={SUB}>{bookSub(books[0])}</span>
          </Cover>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {books.slice(1).map((b) =>
              band(b.id, b.color, b.name || b.id, b.name, bookSub(b), '', () => onOpenNotebook(b.id)))}
          </div>
        </section>
      )}

      {brds.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Head title="Canvases & graphs" />
          {brds.map((b) => band(
            b.id, boardColor(b), b.name || b.id, b.name || 'Untitled', boardKind(b),
            whenLabel(b.updated_at), () => onOpenBoard(b),
          ))}
        </section>
      )}

      {recent.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Head title="Recent notes" />
          {recent.map((n) => band(
            n.id, PAL.deep, n.id, n.title || 'Untitled', n.body ? n.body.slice(0, 80) : 'Empty note',
            whenLabel(n.updated_at), () => onOpenNote(n.notebook_id, n.id),
          ))}
        </section>
      )}
    </div>
  );

  /* ------------------------------------------------------------ L4 · mosaic */

  /**
   * Everything on one asymmetric grid, notebooks first. Blur depth scales with
   * the tile, so the hero covers get a long ramp and the small ones a short
   * one, and that difference is what stops the grid reading as noise.
   */
  const mosaic = (
    <div style={{
      display: 'grid',
      gridTemplateColumns: phone ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
      gridAutoRows: phone ? 108 : 132,
      // Without `dense`, a span-2 tile that does not fit the row leaves the
      // gap behind it empty rather than pulling the next single tile up.
      gridAutoFlow: 'dense',
      gap: 12,
    }}>
      {[
        ...books.map((b) => ({
          key: `b${b.id}`, color: b.color, seed: b.name || b.id, title: b.name,
          sub: bookSub(b), kicker: undefined as string | undefined, open: () => onOpenNotebook(b.id),
        })),
        ...brds.map((b) => ({
          key: `c${b.id}`, color: boardColor(b), seed: b.name || b.id, title: b.name || 'Untitled',
          sub: whenLabel(b.updated_at), kicker: b.kind === 'graph' ? 'Graph' : 'Canvas',
          open: () => onOpenBoard(b),
        })),
        ...recent.map((n) => ({
          key: `n${n.id}`, color: PAL.deep, seed: n.title || n.id, title: n.title || 'Untitled',
          sub: n.body ? n.body.slice(0, 70) : 'Empty note', kicker: 'Note',
          open: () => onOpenNote(n.notebook_id, n.id),
        })),
      ].map((t, i) => {
        // A repeating six-tile figure: one 2x2 hero, one wide, four single.
        const slot = i % 6;
        const big = slot === 0;
        const span = big || (slot === 3 && !phone) ? 2 : 1;
        return (
          <div key={t.key} style={{ gridColumn: `span ${span}`, gridRow: `span ${big ? 2 : 1}`, minWidth: 0 }}>
            <Cover
              color={t.color} seed={t.seed} height="100%" ramp={big ? 60 : 82} blur={big ? 8 : 4}
              radius={big ? 20 : 14} dim={big ? 0.3 : 0.4} onClick={t.open} label={`Open ${t.title}`}
            >
              {t.kicker && <Kicker>{t.kicker}</Kicker>}
              <span style={{ ...TITLE, fontSize: big ? 20 : 13.5 }}>{t.title}</span>
              <span style={SUB}>{t.sub}</span>
            </Cover>
          </div>
        );
      })}
    </div>
  );

  /* ------------------------------------------------------------------ frame */

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {controls}

      {/* The scroll container dissolves its content under the controls above
          instead of clipping it on a hard line — but only once something is
          actually under there, or the first heading just looks mushy at rest. */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div className="navsb"
          onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)}
          style={{
            position: 'absolute', inset: 0, overflowY: 'auto', overflowX: 'hidden',
            display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 8,
          }}>
          {layout === 'stack' && stack}
          {layout === 'rail' && rail}
          {layout === 'column' && column}
          {layout === 'mosaic' && mosaic}

          {empty && (
            <div style={{ padding: '48px 16px', textAlign: 'center' }}>
              <div className="metaline">
                {term
                  ? `Nothing on the shelf matches “${q.trim()}”.`
                  : 'Nothing on the shelf yet. Make a notebook.'}
              </div>
            </div>
          )}
        </div>

        <ProgressiveBlur
          direction="top"
          blurIntensity={3}
          style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: 26,
            pointerEvents: 'none', zIndex: 3,
            opacity: scrolled ? 1 : 0, transition: 'opacity .18s ease',
          }}
        />
      </div>
    </div>
  );
}
