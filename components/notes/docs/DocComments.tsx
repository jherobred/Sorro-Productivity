'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { Icon } from '@/components/Icon';
import type { DocComment } from '@/lib/docFormat';
import type { SuggestionSummary } from './extensions';
import { MenuPanel } from './DocMenu';

export type CommentDraft = { id: string; quote: string };

const when = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) + ' Today' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const clip = (text: string, n = 60) => (text.length > n ? text.slice(0, n) + '…' : text);

type Thread = { key: string; kind: 'draft' | 'comment' | 'suggestion'; anchor: string };

/**
 * Comments and suggestions in the margin beside the text they are about.
 *
 * Each card is placed level with its highlighted text, then pushed down just
 * enough not to overlap the card above. On a phone there is no margin, so the
 * same cards are listed in order instead.
 */
export function DocComments({ editor, comments, suggestions, draft, activeId, stacked, editable, onActivate, onCreate, onCancelDraft, onReply, onResolve, onDelete, onEdit, onAccept, onReject }: {
  editor: Editor;
  comments: DocComment[];
  suggestions: SuggestionSummary[];
  /** A comment being written: not in the document yet, so it is placed by where its text starts. */
  draft: (CommentDraft & { from: number }) | null;
  activeId: string | null;
  stacked: boolean;
  editable: boolean;
  onActivate: (id: string | null) => void;
  onCreate: (text: string) => void;
  onCancelDraft: () => void;
  onReply: (id: string, text: string) => void;
  onResolve: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const column = useRef<HTMLDivElement>(null);
  const [tops, setTops] = useState<Record<string, number>>({});
  const [menu, setMenu] = useState<{ id: string; rect: DOMRect } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const open = comments.filter((c) => !c.resolved);
  const threads: Thread[] = [
    ...(draft ? [{ key: draft.id, kind: 'draft' as const, anchor: `[data-comment-id="${draft.id}"]` }] : []),
    ...open.filter((c) => c.id !== draft?.id).map((c) => ({ key: c.id, kind: 'comment' as const, anchor: `[data-comment-id="${c.id}"]` })),
    ...suggestions.map((s) => ({ key: s.id, kind: 'suggestion' as const, anchor: `[data-suggestion="${s.id}"]` })),
  ];
  useLayoutEffect(() => {
    if (stacked) return;
    const place = () => {
      const col = column.current;
      if (!col || editor.isDestroyed) return;
      const base = col.getBoundingClientRect().top;
      const scale = col.getBoundingClientRect().height / Math.max(1, col.offsetHeight) || 1;
      const wanted = threads.map((t) => {
        if (t.kind === 'draft' && draft) {
          const at = Math.min(draft.from, editor.state.doc.content.size);
          return { key: t.key, top: (editor.view.coordsAtPos(at).top - base) / scale };
        }
        const anchor = editor.view.dom.querySelector<HTMLElement>(t.anchor);
        return { key: t.key, top: anchor ? (anchor.getBoundingClientRect().top - base) / scale : Number.POSITIVE_INFINITY };
      }).filter((t) => Number.isFinite(t.top)).sort((a, b) => a.top - b.top);
      const next: Record<string, number> = {};
      let floor = 0;
      for (const t of wanted) {
        const card = col.querySelector<HTMLElement>(`[data-thread="${CSS.escape(t.key)}"]`);
        const top = Math.max(t.top - 6, floor);
        next[t.key] = top;
        floor = top + (card?.offsetHeight ?? 90) + 10;
      }
      setTops((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    place();
    editor.on('update', place);
    const observer = new ResizeObserver(place);
    observer.observe(editor.view.dom);
    if (column.current) observer.observe(column.current);
    return () => { editor.off('update', place); observer.disconnect(); };
  });

  const card = (thread: Thread) => {
    const style = stacked ? undefined : { top: tops[thread.key] ?? -9999, visibility: tops[thread.key] === undefined ? 'hidden' as const : undefined };
    if (thread.kind === 'draft' && draft) {
      return (
        <div key={thread.key} data-thread={thread.key} className="doc-card is-active is-draft" style={style}>
          <CardHead name="You" time="" />
          <ReplyBox autoFocus label="Comment" placeholder="Comment" submit="Comment" onSubmit={onCreate} onCancel={onCancelDraft} />
        </div>
      );
    }
    if (thread.kind === 'comment') {
      const c = comments.find((x) => x.id === thread.key)!;
      const active = activeId === c.id;
      return (
        <div key={c.id} data-thread={c.id} className={'doc-card' + (active ? ' is-active' : '')} style={style}
          onClick={() => onActivate(c.id)} role="group" aria-label={`Comment: ${c.text}`}>
          <CardHead name="You" time={when(c.created)}>
            {editable && <button type="button" className="doc-card-icon" aria-label="Mark as resolved and hide" data-doc-tip="Resolve" onClick={(e) => { e.stopPropagation(); onResolve(c.id); }}><Icon name="check" size={17} /></button>}
            {editable && <button type="button" className="doc-card-icon" data-menu-anchor aria-label="More options" onClick={(e) => { e.stopPropagation(); setMenu({ id: c.id, rect: e.currentTarget.getBoundingClientRect() }); }}><Icon name="moreVert" size={17} /></button>}
          </CardHead>
          {active && c.quote && <p className="doc-card-quote">“{clip(c.quote, 90)}”</p>}
          {editing === c.id
            ? <ReplyBox autoFocus label="Edit comment" initial={c.text} submit="Save" onSubmit={(text) => { onEdit(c.id, text); setEditing(null); }} onCancel={() => setEditing(null)} />
            : <p className="doc-card-text">{c.text}</p>}
          {c.replies?.map((r) => (
            <div key={r.id} className="doc-card-reply"><CardHead name="You" time={when(r.created)} /><p className="doc-card-text">{r.text}</p></div>
          ))}
          {active && editable && editing !== c.id && <ReplyBox label="Reply" placeholder="Reply" submit="Reply" onSubmit={(text) => onReply(c.id, text)} />}
        </div>
      );
    }
    const s = suggestions.find((x) => x.id === thread.key)!;
    const active = activeId === s.id;
    const what = s.inserted && s.deleted ? <>Replace: <del>“{clip(s.deleted)}”</del> with <ins>“{clip(s.inserted)}”</ins></>
      : s.inserted ? <>Add: <ins>“{clip(s.inserted)}”</ins></> : <>Delete: <del>“{clip(s.deleted)}”</del></>;
    return (
      <div key={s.id} data-thread={s.id} className={'doc-card is-suggestion' + (active ? ' is-active' : '')} style={style} onClick={() => onActivate(s.id)}>
        <CardHead name="You" time={when(s.created)}>
          {editable && <button type="button" className="doc-card-icon is-accept" aria-label="Accept suggestion" data-doc-tip="Accept suggestion" onClick={(e) => { e.stopPropagation(); onAccept(s.id); }}><Icon name="check" size={17} /></button>}
          {editable && <button type="button" className="doc-card-icon is-reject" aria-label="Reject suggestion" data-doc-tip="Reject suggestion" onClick={(e) => { e.stopPropagation(); onReject(s.id); }}><Icon name="close" size={17} /></button>}
        </CardHead>
        <p className="doc-card-text">{what}</p>
      </div>
    );
  };

  return (
    <div ref={column} className={'doc-comments' + (stacked ? ' is-stacked' : '')} aria-label="Comments and suggestions">
      {threads.map(card)}
      {stacked && !threads.length && <p className="doc-hint is-center">No open comments or suggestions.</p>}
      {menu && (
        <MenuPanel x={menu.rect.left} y={menu.rect.bottom + 4} label="Comment options" onClose={() => setMenu(null)} entries={[
          { label: 'Edit', icon: 'edit', run: () => { setEditing(menu.id); onActivate(menu.id); } },
          { label: 'Delete', icon: 'trash', run: () => onDelete(menu.id) },
        ]} />
      )}
    </div>
  );
}

function CardHead({ name, time, children }: { name: string; time: string; children?: React.ReactNode }) {
  return (
    <div className="doc-card-head">
      <span className="doc-avatar" aria-hidden>{name[0]}</span>
      <span className="doc-card-who"><strong>{name}</strong>{time && <small>{time}</small>}</span>
      {children}
    </div>
  );
}

function ReplyBox({ label, placeholder, submit, initial = '', autoFocus, onSubmit, onCancel }: {
  label: string; placeholder?: string; submit: string; initial?: string; autoFocus?: boolean; onSubmit: (text: string) => void; onCancel?: () => void;
}) {
  const [text, setText] = useState(initial);
  const [focused, setFocused] = useState(!!autoFocus);
  const send = () => { if (text.trim()) { onSubmit(text.trim()); setText(''); } };
  return (
    <div className="doc-reply" onClick={(e) => e.stopPropagation()}>
      <textarea aria-label={label} placeholder={placeholder} value={text} autoFocus={autoFocus} rows={focused || text ? 2 : 1}
        onFocus={() => setFocused(true)} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
          if (e.key === 'Escape') { e.stopPropagation(); onCancel?.(); setFocused(false); }
        }} />
      {(focused || text) && (
        <div className="doc-reply-actions">
          <button type="button" className="doc-button" onClick={() => { setText(initial); setFocused(false); onCancel?.(); }}>Cancel</button>
          <button type="button" className="doc-button is-primary" disabled={!text.trim()} onClick={send}>{submit}</button>
        </div>
      )}
    </div>
  );
}
