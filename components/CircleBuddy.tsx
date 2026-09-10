'use client';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useOverlayBack } from '@/lib/nav';
import { useEffect, useRef } from 'react';

export function CircleBuddy({ size = 48, happy = false }: { size?: number; happy?: boolean }) {
  return <span className={`circle-buddy ${happy ? 'is-happy' : ''}`} aria-hidden="true" style={{ width: size, height: size }}><svg viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="30" fill="currentColor" /><g className="buddy-face" stroke="var(--buddy-ink)" strokeWidth="3.5" strokeLinecap="round"><path d="M23 27v4M41 27v4" /><path d={happy ? 'M24 39q8 10 16 0' : 'M27 40q5 4 10 0'} /></g></svg></span>;
}
const HELP: Record<string, { title: string; body: string; links: [string, string][] }> = {
  home: { title: 'One thing at a time.', body: 'Your day starts here. Check what’s next, finish a task, or pick up a thought. Everything else can wait.', links: [['Plan my day', '/calendar/'], ['Write something', '/notebooks/']] },
  calendar: { title: 'Make a little room.', body: 'Click an empty time to add an event. Use Day on your phone, Week to plan ahead, or Agenda for a simple list. Import can read a timetable photo.', links: [['See my tasks', '/tasks/']] },
  tasks: { title: 'Small steps count.', body: 'Type into Add a task to capture it. Open a task to add a due date or details. Groups shows what needs attention; Board organizes by list.', links: [['Find time for it', '/calendar/']] },
  notebooks: { title: 'Think your way.', body: 'Write for documents, Whiteboard for spatial ideas, Graph for connections, Journal for your day, and Java for code. You can always come back to your library.', links: [['Open whiteboards', '/notebooks/?focus=canvas'], ['Open my journal', '/notebooks/?focus=journal']] },
};
export function BuddyHelp({ section, onClose }: { section: string; onClose: () => void }) {
  const info = HELP[section] || { title: 'Find what works for you.', body: 'Calendar, Tasks, and Notes are always one tap away. Explore brings the rest together by what you want to do.', links: [['Explore features', '/more/']] as [string, string][] };
  const ref = useRef<HTMLDivElement>(null);
  useOverlayBack(true, onClose);
  useEffect(() => { const previous = document.activeElement as HTMLElement; ref.current?.focus(); return () => previous?.focus(); }, []);
  return createPortal(<div className="studio-help-backdrop" onClick={onClose}><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="buddy-title" className="studio-help-panel" onClick={e => e.stopPropagation()} onKeyDown={e => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Tab') { const all = ref.current?.querySelectorAll<HTMLElement>('button,a[href]'); if (!all?.length) return; const first = all[0], last = all[all.length - 1]; if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
  }}><button className="studio-icon-button studio-help-close" onClick={onClose} aria-label="Close buddy"><Icon name="close" size={20} /></button><CircleBuddy size={78} happy /><h2 id="buddy-title">{info.title}</h2><p>{info.body}</p><div className="studio-help-links">{info.links.map(([name, href]) => <Link key={href} href={href} onClick={onClose} className="studio-button">{name}<Icon name="chev" size={16} /></Link>)}</div><button className="studio-text-button" onClick={onClose}>Got it. Let’s go.</button></div></div>, document.body);
}
