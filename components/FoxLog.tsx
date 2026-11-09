'use client';
/** S.foxlog: the bell in the top strip. Everything the fox has said first, newest on top, kept on the account. */
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { Fox } from './Fox';
import { ago, useNotifications, useNotifActions } from '@/lib/notify';

export const FOX_SOURCE = 'fox';

export function FoxLog({ onAsk }: { onAsk(line: string): void }) {
  const q = useNotifications();
  const { read, clear } = useNotifActions();
  const rows = (q.data ?? []).filter(n => n.source === FOX_SOURCE);
  const unread = rows.filter(n => !n.read_at);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // What was new when the list opened stays marked while it is open, and counts as read once it shuts.
  const fresh = useRef<string[]>([]);
  const toggle = (next: boolean) => {
    if (next) fresh.current = unread.map(n => n.id);
    else for (const id of fresh.current) read.mutate({ id });
    setOpen(next);
  };
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) toggle(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { toggle(false); box.current?.querySelector<HTMLElement>('.sx-icon')?.focus(); } };
    addEventListener('pointerdown', away); addEventListener('keydown', esc);
    return () => { removeEventListener('pointerdown', away); removeEventListener('keydown', esc); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="fl" ref={box}>
    <button type="button" className="sx-icon" aria-label={unread.length ? `Sorro’s notes, ${unread.length} new` : 'Sorro’s notes'} title="Sorro’s notes" aria-expanded={open} onClick={() => toggle(!open)}>
      <Icon name="bell" size={18} />{unread.length > 0 && <span className="fl-dot" aria-hidden="true" />}
    </button>
    {open && <div className="fl-pop" role="dialog" aria-label="Sorro’s notes" data-part="S.foxlog">
      <p className="fl-h">Sorro’s notes</p>
      {q.isPending ? <p className="fl-empty">Loading.</p> : q.isError ? <p className="fl-empty">Couldn’t load the notes. <button type="button" onClick={() => q.refetch()}>Try again</button></p> : rows.length
        ? <ul>{rows.map(n => <li key={n.id} data-new={fresh.current.includes(n.id)}>
            <span className="fl-fox" aria-hidden="true"><Fox pose="sit" size={16} tone="muted" /></span>
            <button type="button" className="fl-line" onClick={() => { toggle(false); onAsk(n.body); }}>{n.body}<small>{ago(n.created_at)}</small></button>
            <button type="button" className="fl-x" aria-label="Remove this note" onClick={() => clear.mutate({ id: n.id })}><Icon name="close" size={12} /></button>
          </li>)}</ul>
        : <p className="fl-empty">Nothing yet. When Sorro speaks up, it is kept here.</p>}
    </div>}
  </div>;
}
