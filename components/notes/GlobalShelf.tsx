'use client';

import { useMemo, useState } from 'react';
import { Icon } from '../Icon';
import { useLayout } from '@/lib/useLayout';
import { whenLabel, type Note, type Notebook } from '@/lib/notes';
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
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'notebooks' | 'notes' | 'canvas' | 'graph'>('all');

  const notesByBook = useMemo(() => {
    const map = new Map<string, Note[]>();
    for (const n of notes) {
      const list = map.get(n.notebook_id);
      if (list) list.push(n);
      else map.set(n.notebook_id, [n]);
    }
    return map;
  }, [notes]);

  const canvases = useMemo(() => boards.filter((b) => b.kind !== 'graph'), [boards]);
  const graphs = useMemo(() => boards.filter((b) => b.kind === 'graph'), [boards]);

  const recentNotes = useMemo(() => {
    return [...notes].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 8);
  }, [notes]);

  const term = q.trim().toLowerCase();

  const filteredNotebooks = useMemo(() => {
    if (filter !== 'all' && filter !== 'notebooks') return [];
    if (!term) return notebooks;
    return notebooks.filter((b) => b.name.toLowerCase().includes(term));
  }, [notebooks, term, filter]);

  const filteredBoards = useMemo(() => {
    if (filter !== 'all' && filter !== 'canvas' && filter !== 'graph') return [];
    const list = boards.filter((b) => filter === 'all' || (filter === 'canvas' ? b.kind !== 'graph' : b.kind === 'graph'));
    if (!term) return list;
    return list.filter((b) => b.name.toLowerCase().includes(term));
  }, [boards, term, filter]);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto' }} className="navsb">
      {/* Top Shelf Stats Overview Bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: phone ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        gap: 10,
        flex: 'none',
      }}>
        <button
          onClick={() => onJumpTab('notebooks')}
          className="hov k-squish"
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 14,
            background: 'var(--card)', border: '1px solid var(--line2)', textAlign: 'left',
            boxShadow: 'var(--sh)', cursor: 'pointer',
          }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center',
            background: 'color-mix(in srgb, var(--pal-indigo) 18%, transparent)',
            color: 'var(--pal-indigo)', flex: 'none',
          }}>
            <Icon name="book" size={18} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--tx)', lineHeight: 1.1 }}>{notebooks.length}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx3)', marginTop: 2 }}>Notebooks</div>
          </div>
        </button>

        <button
          onClick={() => onJumpTab('notebooks')}
          className="hov k-squish"
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 14,
            background: 'var(--card)', border: '1px solid var(--line2)', textAlign: 'left',
            boxShadow: 'var(--sh)', cursor: 'pointer',
          }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center',
            background: 'color-mix(in srgb, var(--pal-mint) 18%, transparent)',
            color: 'var(--pal-mint)', flex: 'none',
          }}>
            <Icon name="pen" size={18} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--tx)', lineHeight: 1.1 }}>{notes.length}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx3)', marginTop: 2 }}>Total Notes</div>
          </div>
        </button>

        <button
          onClick={() => onJumpTab('canvas')}
          className="hov k-squish"
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 14,
            background: 'var(--card)', border: '1px solid var(--line2)', textAlign: 'left',
            boxShadow: 'var(--sh)', cursor: 'pointer',
          }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center',
            background: 'color-mix(in srgb, var(--pal-cyan) 18%, transparent)',
            color: 'var(--pal-cyan)', flex: 'none',
          }}>
            <Icon name="grid" size={18} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--tx)', lineHeight: 1.1 }}>{canvases.length}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx3)', marginTop: 2 }}>Canvases</div>
          </div>
        </button>

        <button
          onClick={() => onJumpTab('graph')}
          className="hov k-squish"
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 14,
            background: 'var(--card)', border: '1px solid var(--line2)', textAlign: 'left',
            boxShadow: 'var(--sh)', cursor: 'pointer',
          }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center',
            background: 'color-mix(in srgb, var(--pal-violet) 18%, transparent)',
            color: 'var(--pal-violet)', flex: 'none',
          }}>
            <Icon name="link" size={18} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--tx)', lineHeight: 1.1 }}>{graphs.length}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx3)', marginTop: 2 }}>Knowledge Graphs</div>
          </div>
        </button>
      </div>

      {/* Global Filter & Search Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 'none' }}>
        <div style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 10, background: 'var(--card2)', border: '1px solid var(--line2)' }}>
          {(['all', 'notebooks', 'notes', 'canvas', 'graph'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="k-chip"
              style={{
                padding: '5px 12px', borderRadius: 7, fontSize: 11.5, fontWeight: 700,
                textTransform: 'capitalize',
                background: filter === f ? 'var(--acc)' : 'transparent',
                color: filter === f ? 'var(--ink)' : 'var(--tx2)',
                border: 'none', cursor: 'pointer',
              }}
            >
              {f === 'all' ? 'All Shelf' : f}
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
          display: 'flex', alignItems: 'center', gap: 8, flex: phone ? '1 1 100%' : '0 0 240px',
          padding: '0 12px', height: 34, borderRadius: 10, border: '1px solid var(--line2)', background: 'var(--card)',
        }}>
          <Icon name="search" size={14} color="var(--tx3)" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search everything..."
            aria-label="Search shelf"
            style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--tx)', fontFamily: 'inherit' }} />
        </label>
      </div>

      {/* Notebooks Shelf Section */}
      {(filter === 'all' || filter === 'notebooks') && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--tx3)' }}>
              Notebooks ({filteredNotebooks.length})
            </h2>
            <button onClick={() => onJumpTab('notebooks')} className="k-underline" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accTx)' }}>
              Open Notebooks Table →
            </button>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: phone ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 12,
          }}>
            {filteredNotebooks.map((b) => {
              const bookNotes = notesByBook.get(b.id) ?? [];
              return (
                <div
                  key={b.id}
                  onClick={() => onOpenNotebook(b.id)}
                  className="hov k-squish"
                  style={{
                    padding: 14, borderRadius: 14, background: 'var(--card)', border: '1px solid var(--line2)',
                    boxShadow: 'var(--sh)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: b.color, flex: 'none' }} />
                      <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.name}
                      </span>
                    </div>
                    <span style={{
                      padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800,
                      background: 'color-mix(in srgb, var(--acc) 14%, transparent)', color: 'var(--accTx)',
                    }}>
                      {bookNotes.length} notes
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                    {bookNotes.slice(0, 3).map((n) => (
                      <div
                        key={n.id}
                        onClick={(e) => { e.stopPropagation(); onOpenNote(b.id, n.id); }}
                        className="hov"
                        style={{
                          padding: '4px 8px', borderRadius: 6, fontSize: 11.5, color: 'var(--tx2)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          background: 'color-mix(in srgb, var(--card2) 60%, transparent)',
                        }}
                      >
                        • {n.title || 'Untitled note'}
                      </div>
                    ))}
                    {bookNotes.length === 0 && (
                      <div style={{ fontSize: 11, color: 'var(--tx3)', fontStyle: 'italic', padding: '2px 4px' }}>Empty notebook</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Visual Boards (Canvas & Graph) Shelf */}
      {(filter === 'all' || filter === 'canvas' || filter === 'graph') && filteredBoards.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--tx3)' }}>
              Canvases & Knowledge Graphs ({filteredBoards.length})
            </h2>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: phone ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 12,
          }}>
            {filteredBoards.map((b) => (
              <div
                key={b.id}
                onClick={() => onOpenBoard(b)}
                className="hov k-squish"
                style={{
                  padding: 14, borderRadius: 14, background: 'var(--card)', border: '1px solid var(--line2)',
                  boxShadow: 'var(--sh)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                }}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: 10, display: 'grid', placeItems: 'center',
                  background: `color-mix(in srgb, ${b.color || '#7C6CFF'} 18%, transparent)`,
                  color: b.color || '#7C6CFF', flex: 'none',
                }}>
                  <Icon name={b.kind === 'graph' ? 'link' : 'grid'} size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.name}
                  </div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--tx3)', marginTop: 2 }}>
                    {b.kind === 'graph' ? 'Knowledge Graph' : 'Infinite Canvas'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent Notes Stream */}
      {(filter === 'all' || filter === 'notes') && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--tx3)' }}>
            Recent Notes
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: phone ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 10,
          }}>
            {recentNotes.map((n) => (
              <div
                key={n.id}
                onClick={() => onOpenNote(n.notebook_id, n.id)}
                className="hov k-squish"
                style={{
                  padding: '12px 14px', borderRadius: 12, background: 'var(--card)', border: '1px solid var(--line2)',
                  boxShadow: 'var(--sh)', cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {n.title || 'Untitled'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {n.body ? n.body.slice(0, 80) : 'Empty note'}
                </div>
                <div style={{ fontSize: 9.5, color: 'var(--tx3)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                  Updated {whenLabel(n.updated_at)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
