'use client';

import { useMemo, useState } from 'react';
import { Icon } from '../Icon';
import { useLayout } from '@/lib/useLayout';
import { whenLabel, type Note, type Notebook } from '@/lib/notes';
import type { Board } from '@/lib/canvas';
import { ask } from '@/lib/ask';
import { toast } from '@/lib/toast';

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

const ART_PRESETS = [
  'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=80',
];

function getAutoCover(id: string, name: string): string {
  let hash = 0;
  const str = id + name;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return ART_PRESETS[Math.abs(hash) % ART_PRESETS.length];
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
  const [customCovers, setCustomCovers] = useState<Record<string, string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('bd_shelf_covers');
        return raw ? JSON.parse(raw) : {};
      } catch {
        return {};
      }
    }
    return {};
  });

  const saveCover = (id: string, url: string | null) => {
    setCustomCovers((prev) => {
      const next = { ...prev };
      if (!url) delete next[id];
      else next[id] = url;
      if (typeof window !== 'undefined') {
        localStorage.setItem('bd_shelf_covers', JSON.stringify(next));
      }
      return next;
    });
    toast(url ? 'Cover image updated' : 'Cover image reset');
  };

  const handleEditCover = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    const current = customCovers[id] || '';
    const res = await ask('Set Cover Image', {
      initial: current,
      placeholder: 'Enter image URL (https://...) or leave blank to reset',
    });
    if (res !== null) {
      saveCover(id, res.trim() || null);
    }
  };

  const notesByBook = useMemo(() => {
    const map = new Map<string, Note[]>();
    for (const n of notes) {
      const list = map.get(n.notebook_id);
      if (list) list.push(n);
      else map.set(n.notebook_id, [n]);
    }
    return map;
  }, [notes]);

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
    <div style={{
      flex: 1, minHeight: 0, width: '100%', maxWidth: '100%',
      display: 'flex', flexDirection: 'column', gap: 24, overflowY: 'auto',
      boxSizing: 'border-box',
    }} className="navsb">
      
      {/* Header Bar with Search & Quick Filters */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', flex: 'none', width: '100%',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {(['all', 'notebooks', 'canvas', 'graph', 'notes'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 13px', borderRadius: 8, fontSize: 11.5, fontWeight: 700,
                textTransform: 'capitalize',
                background: filter === f ? 'var(--acc)' : 'var(--card2)',
                color: filter === f ? 'var(--ink)' : 'var(--tx2)',
                border: `1px solid ${filter === f ? 'var(--acc)' : 'var(--line2)'}`,
                cursor: 'pointer', transition: 'all .15s ease',
              }}
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: phone ? '1 1 100%' : '0 0 auto' }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8, width: phone ? '100%' : 260,
            padding: '0 12px', height: 34, borderRadius: 10, border: '1px solid var(--line2)', background: 'var(--card)',
          }}>
            <Icon name="search" size={14} color="var(--tx3)" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search shelf…"
              aria-label="Search shelf"
              style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--tx)', fontFamily: 'inherit', background: 'transparent', border: 'none', outline: 'none' }}
            />
          </label>

          <button
            onClick={onNewNotebook}
            className="hov tap"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 14px', height: 34,
              borderRadius: 10, background: 'var(--acc)', color: 'var(--ink)', fontSize: 12, fontWeight: 800,
              border: 'none', cursor: 'pointer', flex: 'none',
            }}
          >
            <Icon name="bookPlus" size={14} color="var(--ink)" />
            <span>New notebook</span>
          </button>
        </div>
      </div>

      {/* Section 1: Notebooks (Standalone Square Cards with Progressive Blur) */}
      {(filter === 'all' || filter === 'notebooks') && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--tx3)' }}>
              Notebooks {filteredNotebooks.length >= 20 ? `(${filteredNotebooks.length})` : ''}
            </h2>
            <button onClick={() => onJumpTab('notebooks')} className="k-underline" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accTx)' }}>
              Open Notebooks View →
            </button>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: phone ? 'repeat(auto-fill, minmax(160px, 1fr))' : 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 16,
            width: '100%',
          }}>
            {filteredNotebooks.map((b) => {
              const bookNotes = notesByBook.get(b.id) ?? [];
              const coverImg = customCovers[b.id] || getAutoCover(b.id, b.name);

              return (
                <div
                  key={b.id}
                  onClick={() => onOpenNotebook(b.id)}
                  className="hov group"
                  style={{
                    position: 'relative',
                    aspectRatio: '1 / 1',
                    borderRadius: 18,
                    overflow: 'hidden',
                    background: 'var(--card)',
                    border: '1px solid var(--line2)',
                    boxShadow: 'var(--sh)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                  }}
                >
                  {/* Full-bleed cover photo */}
                  <img
                    src={coverImg}
                    alt={b.name}
                    loading="lazy"
                    decoding="async"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transition: 'transform .3s ease',
                    }}
                  />

                  {/* Top-right Edit Cover Button */}
                  <button
                    onClick={(e) => handleEditCover(e, b.id, b.name)}
                    title="Change cover image"
                    className="hov"
                    style={{
                      position: 'absolute',
                      top: 10,
                      right: 10,
                      zIndex: 2,
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: 'rgba(0, 0, 0, 0.45)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      display: 'grid',
                      placeItems: 'center',
                      color: '#FFFFFF',
                      cursor: 'pointer',
                    }}
                  >
                    <Icon name="spark" size={13} color="#FFFFFF" />
                  </button>

                  {/* Progressive Blur Bottom Overlay (Reference Component style) */}
                  <div style={{
                    position: 'relative',
                    zIndex: 1,
                    width: '100%',
                    padding: phone ? '12px 12px 14px' : '16px 16px 16px',
                    boxSizing: 'border-box',
                    background: 'linear-gradient(to top, rgba(0, 0, 0, 0.88) 0%, rgba(0, 0, 0, 0.55) 65%, transparent 100%)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                  }}>
                    <div style={{
                      fontSize: phone ? 14 : 15.5,
                      fontWeight: 800,
                      color: '#FFFFFF',
                      lineHeight: 1.25,
                      letterSpacing: '-.02em',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {b.name}
                    </div>
                    <div style={{
                      fontSize: phone ? 11 : 12,
                      fontWeight: 600,
                      color: 'rgba(255, 255, 255, 0.82)',
                      marginTop: 3,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {bookNotes.length} {bookNotes.length === 1 ? 'note' : 'notes'}
                    </div>
                    <div style={{
                      fontSize: 10,
                      color: 'rgba(255, 255, 255, 0.62)',
                      marginTop: 2,
                    }}>
                      Notebook
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Section 2: Canvases & Knowledge Graphs (Standalone Square Cards with Progressive Blur) */}
      {(filter === 'all' || filter === 'canvas' || filter === 'graph') && filteredBoards.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--tx3)' }}>
              Canvases & Mindmaps {filteredBoards.length >= 20 ? `(${filteredBoards.length})` : ''}
            </h2>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: phone ? 'repeat(auto-fill, minmax(160px, 1fr))' : 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 16,
            width: '100%',
          }}>
            {filteredBoards.map((b) => {
              const coverImg = customCovers[b.id] || getAutoCover(b.id, b.name);

              return (
                <div
                  key={b.id}
                  onClick={() => onOpenBoard(b)}
                  className="hov group"
                  style={{
                    position: 'relative',
                    aspectRatio: '1 / 1',
                    borderRadius: 18,
                    overflow: 'hidden',
                    background: 'var(--card)',
                    border: '1px solid var(--line2)',
                    boxShadow: 'var(--sh)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                  }}
                >
                  <img
                    src={coverImg}
                    alt={b.name}
                    loading="lazy"
                    decoding="async"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transition: 'transform .3s ease',
                    }}
                  />

                  <button
                    onClick={(e) => handleEditCover(e, b.id, b.name)}
                    title="Change cover image"
                    className="hov"
                    style={{
                      position: 'absolute',
                      top: 10,
                      right: 10,
                      zIndex: 2,
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: 'rgba(0, 0, 0, 0.45)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      display: 'grid',
                      placeItems: 'center',
                      color: '#FFFFFF',
                      cursor: 'pointer',
                    }}
                  >
                    <Icon name="spark" size={13} color="#FFFFFF" />
                  </button>

                  <div style={{
                    position: 'relative',
                    zIndex: 1,
                    width: '100%',
                    padding: phone ? '12px 12px 14px' : '16px 16px 16px',
                    boxSizing: 'border-box',
                    background: 'linear-gradient(to top, rgba(0, 0, 0, 0.88) 0%, rgba(0, 0, 0, 0.55) 65%, transparent 100%)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                  }}>
                    <div style={{
                      fontSize: phone ? 14 : 15.5,
                      fontWeight: 800,
                      color: '#FFFFFF',
                      lineHeight: 1.25,
                      letterSpacing: '-.02em',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {b.name}
                    </div>
                    <div style={{
                      fontSize: phone ? 11 : 12,
                      fontWeight: 600,
                      color: 'rgba(255, 255, 255, 0.82)',
                      marginTop: 3,
                    }}>
                      {b.kind === 'graph' ? 'Knowledge Graph' : 'Infinite Canvas'}
                    </div>
                    <div style={{
                      fontSize: 10,
                      color: 'rgba(255, 255, 255, 0.62)',
                      marginTop: 2,
                    }}>
                      Visual Board
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Section 3: Recent Notes (Clean Standalone Stream) */}
      {(filter === 'all' || filter === 'notes') && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
          <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--tx3)' }}>
            Recent Notes
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: phone ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 12,
            width: '100%',
          }}>
            {recentNotes.map((n) => (
              <div
                key={n.id}
                onClick={() => onOpenNote(n.notebook_id, n.id)}
                className="hov"
                style={{
                  padding: '14px 16px', borderRadius: 14, background: 'var(--card)', border: '1px solid var(--line2)',
                  boxShadow: 'var(--sh)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4,
                }}
              >
                <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {n.title || 'Untitled'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {n.body ? n.body.slice(0, 90) : 'Empty note'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
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
