'use client';

import { useEffect, useState } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { Icon } from '../Icon';
import { ProgBlur } from '../core/ProgBlur';
import { useLayout } from '@/lib/useLayout';
import { whenLabel, type Note, type Notebook } from '@/lib/notes';
import { coverArt, NotebookCover } from './NotebookCover';
import type { Board } from '@/lib/canvas';

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

/**
 * The shelf — the landing screen of Notebooks.
 *
 * Image-led, not word-led. A hero band opens the tab, every notebook wears
 * generated cover art with its name on a progressive-blur veil, and canvases
 * and graphs sit in a snap-scrolling strip under it. Counts live on the hero
 * as tappable stat chips; there is no filter row and no search field here —
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
}: GlobalShelfProps) {
  const { phone } = useLayout();

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
        onJump={onJumpTab}
        onNew={onNewNotebook}
      />

      {/* Notebooks — cover cards. The art identifies the notebook faster than
          a fourth line of metadata would. */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SectionHead title="Notebooks" count={notebooks.length} />
        {notebooks.length === 0 ? (
          <EmptyShelf onNew={onNewNotebook} />
        ) : (
          <div className="k-stagger" style={{
            display: 'grid',
            gridTemplateColumns: phone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(215px, 1fr))',
            gap: 12,
            alignItems: 'start',
          }}>
            {notebooks.map((b, i) => {
              const list = notes.filter((n) => n.notebook_id === b.id);
              const last = lastTouched(list);
              return (
                <button
                  key={b.id}
                  onClick={() => onOpenNotebook(b.id)}
                  className="clay k-squish"
                  style={{ ['--i' as string]: i, position: 'relative', overflow: 'hidden', padding: 0, textAlign: 'left', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: phone ? 132 : 150, width: '100%' }}
                >
                  <NotebookCover seed={b.id} color={b.color} />
                  <ProgBlur edge="bottom" size={phone ? 58 : 66} strength={13} />
                  <span style={{ position: 'relative', padding: '10px 12px 11px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{
                      fontSize: 13.5, fontWeight: 800, letterSpacing: '-.01em', color: 'var(--tx)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {b.name}
                    </span>
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--tx3)' }}>
                      {list.length} note{list.length === 1 ? '' : 's'}{last ? ` · ${whenLabel(last)}` : ''}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Canvases & graphs — a snap strip of the same cover language, smaller. */}
      {boards.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SectionHead title="Canvas & graphs" count={boards.length} />
          <div style={{
            display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4,
            scrollSnapType: 'x proximity', margin: '0 -2px', padding: '0 2px 4px',
          }}>
            {[...canvases, ...graphs].map((b) => (
              <button
                key={b.id}
                onClick={() => onOpenBoard(b)}
                className="clay k-squish"
                style={{
                  position: 'relative', overflow: 'hidden', flex: '0 0 auto', width: phone ? 138 : 156, height: 92,
                  scrollSnapAlign: 'start', textAlign: 'left', padding: 0,
                  display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                }}
              >
                <NotebookCover seed={b.id} color={b.color} />
                <span style={{
                  position: 'absolute', top: 8, left: 8, width: 24, height: 24, borderRadius: 8,
                  display: 'grid', placeItems: 'center',
                  background: 'color-mix(in srgb, var(--card) 62%, transparent)',
                  border: '1px solid var(--line2)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                }}>
                  <Icon name={b.kind === 'graph' ? 'link' : 'grid'} size={12} color="var(--tx2)" />
                </span>
                <ProgBlur edge="bottom" size={44} strength={11} />
                <span style={{
                  position: 'relative', padding: '8px 10px 9px', fontSize: 11.5, fontWeight: 800,
                  color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block',
                }}>
                  {b.name}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Recently touched notes — the "carry on where I left" row. */}
      {recentNotes.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SectionHead title="Picked up lately" count={undefined} />
          <div style={{
            display: 'flex', gap: 10, overflowX: 'auto',
            scrollSnapType: 'x proximity', padding: '0 2px 4px',
          }}>
            {recentNotes.map((n) => {
              const book = notebooks.find((b) => b.id === n.notebook_id);
              return (
                <button
                  key={n.id}
                  onClick={() => onOpenNote(n.notebook_id, n.id)}
                  className="clay k-squish"
                  style={{
                    position: 'relative', flex: '0 0 auto', width: phone ? 190 : 224, scrollSnapAlign: 'start',
                    textAlign: 'left', padding: '11px 13px 10px', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 3,
                  }}
                >
                  <span aria-hidden style={{
                    position: 'absolute', top: 10, bottom: 10, left: 0, width: 3, borderRadius: '0 3px 3px 0',
                    background: book?.color ?? 'var(--acc)',
                  }} />
                  <span style={{
                    fontSize: 12.5, fontWeight: 800, color: 'var(--tx)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {n.title || 'Untitled'}
                  </span>
                  <span style={{
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    fontSize: 11, lineHeight: 1.45, color: 'var(--tx3)', minHeight: 31,
                  }}>
                    {n.body ? n.body.replace(/[#*`>\[\]]/g, '').slice(0, 110) : 'Empty note'}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
                    {book?.name ?? 'Notebook'} · {whenLabel(n.updated_at)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function SectionHead({ title, count }: { title: string; count: number | undefined }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.015em', color: 'var(--tx)' }}>{title}</h2>
      {count !== undefined && (
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      )}
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
  notebooks, notes, canvases, graphs, phone, onJump, onNew,
}: {
  notebooks: number; notes: number; canvases: number; graphs: number; phone: boolean;
  onJump: GlobalShelfProps['onJumpTab'];
  onNew: () => void;
}) {
  const [today, setToday] = useState('');
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
        display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 999,
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
      position: 'relative', overflow: 'hidden', minHeight: phone ? 128 : 152,
      display: 'flex', alignItems: 'flex-end', padding: phone ? 14 : 18, borderRadius: 'var(--r-xl)',
    }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: coverArt('basedly-shelf-hero') }} />
      <ProgBlur edge="bottom" size={phone ? 76 : 92} strength={16} />

      <div style={{
        position: 'relative', width: '100%', display: 'flex', alignItems: 'flex-end',
        justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <h1 style={{
            fontSize: phone ? 22 : 27, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--tx)',
          }}>
            Your shelf
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
            borderRadius: 999, background: 'var(--acc)', color: 'var(--accInk)', fontSize: 12.5, fontWeight: 800,
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
      padding: '34px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center',
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mascots/otter.svg" alt="" width={72} height={72} style={{ opacity: .92 }} />
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--tx)' }}>Your shelf is waiting</div>
        <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 3 }}>Make your first notebook and it moves in.</div>
      </div>
      <button onClick={onNew} className="tap acc k-glass" style={{
        display: 'flex', alignItems: 'center', gap: 7, padding: '9px 15px', minHeight: 38,
        borderRadius: 999, background: 'var(--acc)', color: 'var(--accInk)', fontSize: 12.5, fontWeight: 800,
      }}>
        <Icon name="bookPlus" size={15} color="var(--accInk)" />New notebook
      </button>
    </div>
  );
}
