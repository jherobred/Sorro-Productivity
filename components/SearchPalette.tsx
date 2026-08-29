'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, type IconName } from './Icon';
import { supabase } from '@/lib/supabase';
import { usePrefs } from '@/lib/prefs';
import { toast } from '@/lib/toast';
import { COMMUNITY_PROFILES } from '@/lib/people';

/**
 * Search + command palette. Ported from Basedly.dc.html markup 2572–2590 —
 * a `rise` panel, 520px wide, grouped rows under 9.5px kickers.
 */

type Row = { id: string; n: string; m: string; ic: IconName; go: () => void };
type Group = { g: string; items: Row[] };

const SECTIONS: [string, string, IconName][] = [
  ['home', 'Home', 'home'], ['calendar', 'Calendar', 'cal'], ['tasks', 'Tasks', 'task'],
  ['notebooks', 'Notebooks', 'book'], ['projects', 'Projects', 'proj'], ['habits', 'Habits', 'habit'],
  ['body', 'Body', 'heart'], ['money', 'Money', 'money'], ['community', 'Community', 'chat'],
  ['files', 'Files', 'files'], ['people', 'People', 'people'], ['profile', 'Profile', 'focus'],
];

export function SearchPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { prefs, update } = usePrefs();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Group[]>([]);
  // Bumped on every debounced fetch; a response only lands if it's still the
  // latest, so a slow earlier keystroke can't overwrite newer results.
  const reqIdRef = useRef(0);

  useEffect(() => {
    // preventDefault so useBackGuard's Escape does not also pop the overlay stack.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setHits([]); return; }
    const t = setTimeout(async () => {
      const id = ++reqIdRef.current;
      const like = `%${term}%`;
      const needle = term.replace(/^@/, '').toLowerCase();
      const [tasks, notes, events, people, profilesRes, projectsRes] = await Promise.all([
        supabase.from('bd_tasks').select('id,title').is('deleted_at', null).ilike('title', like).limit(5),
        supabase.from('bd_notes').select('id,title,body').is('deleted_at', null)
          .or(`title.ilike.${like},body.ilike.${like}`).limit(5),
        supabase.from('bd_events').select('id,title,starts_at').is('deleted_at', null).ilike('title', like).limit(5),
        supabase.from('bd_people').select('id,name,category').ilike('name', like).limit(5),
        supabase.from('bd_profiles').select('user_id,name,handle,animal').or(`name.ilike.${like},handle.ilike.${like}`).limit(5),
        supabase.from('bd_projects').select('id,name').is('deleted_at', null).ilike('name', like).limit(5),
      ]);
      if (id !== reqIdRef.current) return;
      const g: Group[] = [];
      const jump = (path: string) => () => { router.push(path); onClose(); };

      const foundPeople: Row[] = [];
      const seenHandles = new Set<string>();

      if (profilesRes.data?.length) {
        for (const p of profilesRes.data) {
          const h = (p.handle || p.name || p.user_id).replace(/^@/, '');
          seenHandles.add(h.toLowerCase());
          foundPeople.push({ id: p.user_id, n: p.name || `@${h}`, m: `@${h} · View profile`, ic: 'focus', go: jump(`/profile/?u=${encodeURIComponent(h)}`) });
        }
      }

      for (const [key, p] of Object.entries(COMMUNITY_PROFILES)) {
        const h = (p.handle || key).toLowerCase();
        if ((h.includes(needle) || p.name.toLowerCase().includes(needle)) && !seenHandles.has(h)) {
          seenHandles.add(h);
          foundPeople.push({ id: p.user_id, n: p.name, m: `@${p.handle} · Basedly Community`, ic: 'focus', go: jump(`/profile/?u=${encodeURIComponent(p.handle || h)}`) });
        }
      }

      if (people.data?.length) {
        for (const p of people.data) {
          const h = p.name.toLowerCase().replace(/\s+/g, '');
          if (!seenHandles.has(h)) {
            seenHandles.add(h);
            foundPeople.push({ id: p.id, n: p.name, m: `${p.category} · View profile`, ic: 'people', go: jump(`/profile/?u=${encodeURIComponent(h)}`) });
          }
        }
      }

      if (foundPeople.length) g.push({ g: 'People', items: foundPeople });
      if (tasks.data?.length) g.push({ g: 'Tasks', items: tasks.data.map((r) => ({ id: r.id, n: r.title, m: 'Task', ic: 'task', go: jump(`/tasks/?detail=${r.id}`) })) });
      if (notes.data?.length) g.push({ g: 'Notes', items: notes.data.map((r) => ({ id: r.id, n: r.title || 'Untitled', m: r.title.toLowerCase().includes(term.toLowerCase()) ? 'Note' : 'In the text', ic: 'book', go: jump(`/notebooks/?open=${r.id}`) })) });
      if (events.data?.length) g.push({ g: 'Calendar Events', items: events.data.map((r) => ({ id: r.id, n: r.title, m: new Date(r.starts_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), ic: 'cal', go: jump('/calendar/') })) });
      if (projectsRes.data?.length) g.push({ g: 'Projects', items: projectsRes.data.map((r) => ({ id: r.id, n: r.name, m: 'Project', ic: 'proj', go: jump(`/projects/${r.id}/`) })) });
      setHits(g);
    }, 180);
    return () => clearTimeout(t);
  }, [q, router, onClose]);

  const quickCommands = useMemo<Group[]>(() => {
    const term = q.trim().toLowerCase();
    const dark = prefs.theme === 'dark';
    const allCommands: Row[] = [
      { id: 'cmd-task', n: 'Create new task', m: 'Quick action (T)', ic: 'taskPlus', go: () => { onClose(); router.push('/tasks/'); } },
      { id: 'cmd-note', n: 'Create new note', m: 'Quick action (N)', ic: 'bookPlus', go: () => { onClose(); router.push('/notebooks/'); } },
      { id: 'cmd-expense', n: 'Log new expense', m: 'Quick action (E)', ic: 'money', go: () => { onClose(); router.push('/money/'); } },
      { id: 'cmd-theme', n: dark ? 'Switch to Light Theme' : 'Switch to Dark Theme', m: 'Preferences (⌘+Shift+L)', ic: 'moon', go: () => { void update({ theme: dark ? 'light' : 'dark' }); toast(dark ? 'Switched to Light theme' : 'Switched to Dark theme'); onClose(); } },
    ];
    const filtered = allCommands.filter(c => !term || c.n.toLowerCase().includes(term) || c.m.toLowerCase().includes(term));
    return filtered.length ? [{ g: 'Quick Actions & Commands', items: filtered }] : [];
  }, [q, prefs.theme, update, router, onClose]);

  const groups = q.trim() ? [...quickCommands, ...hits] : [...quickCommands];
  const allItems = useMemo(() => groups.flatMap(g => g.items), [groups]);
  const [selIndex, setSelIndex] = useState(0);

  useEffect(() => { setSelIndex(0); }, [allItems.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setSelIndex(i => (i + 1) % (allItems.length || 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelIndex(i => (i - 1 + allItems.length) % (allItems.length || 1)); }
      else if (e.key === 'Enter') { e.preventDefault(); if (allItems[selIndex]) allItems[selIndex].go(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, allItems, selIndex]);

  const getGroupStyle = (g: string) => {
    if (g === 'Quick Actions & Commands') return { bg: 'color-mix(in srgb, var(--acc) 15%, transparent)', fg: 'var(--accTx)' };
    if (g === 'Tasks') return { bg: 'color-mix(in srgb, var(--pal-coral) 15%, transparent)', fg: 'var(--pal-coral)' };
    if (g === 'Notes') return { bg: 'color-mix(in srgb, var(--pal-amber) 15%, transparent)', fg: 'var(--pal-amber)' };
    if (g === 'Calendar Events') return { bg: 'color-mix(in srgb, var(--pal-mint) 15%, transparent)', fg: 'var(--pal-mint)' };
    if (g === 'People') return { bg: 'color-mix(in srgb, var(--pal-sky) 15%, transparent)', fg: 'var(--pal-sky)' };
    if (g === 'Projects') return { bg: 'color-mix(in srgb, var(--pal-lavender) 15%, transparent)', fg: 'var(--pal-lavender)' };
    return { bg: 'var(--card2)', fg: 'var(--tx2)' };
  };

  return (
    <>
      <div onClick={onClose} className="fade" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.34)', zIndex: 50 }} />
      <div className="rise" style={{
        position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)',
        width: 520, maxWidth: 'calc(100% - 36px)', zIndex: 51,
        background: 'var(--card)', borderRadius: 16, boxShadow: 'var(--shl)',
        padding: 8, maxHeight: '70%', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 10px 10px' }}>
          <Icon name="search" size={16} color="var(--tx2)" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search everything or type a command…"
            style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--tx)', border: 'none', outline: 'none', background: 'transparent' }} />
          <kbd style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: 'var(--card2)', color: 'var(--tx3)', border: '1px solid var(--line2)' }}>ESC</kbd>
          <button onClick={onClose} className="hov" style={{ width: 24, height: 24, borderRadius: 7, color: 'var(--tx3)', fontSize: 14 }}>×</button>
        </div>

        {groups.map((g) => (
          <div key={g.g} style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)', padding: '8px 10px 5px' }}>
              {g.g}
            </div>
            {g.items.map((r, i) => {
              const globalIndex = groups.slice(0, groups.indexOf(g)).reduce((acc, curr) => acc + curr.items.length, 0) + i;
              const selected = selIndex === globalIndex;
              const style = getGroupStyle(g.g);
              return (
                <button key={`${g.g}-${r.id}`} onClick={r.go} className={`hov lensrow ${selected ? 'selected' : ''}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 10px', borderRadius: 9, textAlign: 'left', background: selected ? 'var(--card2)' : 'transparent', border: 'none', cursor: 'pointer' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: style.bg, flex: 'none' }}>
                    <Icon name={r.ic} size={15} color={style.fg} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: selected ? 700 : 600, color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.n}</span>
                    <span style={{ display: 'block', fontSize: 10.5, color: 'var(--tx3)', marginTop: 2 }}>{r.m}</span>
                  </span>
                  <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'var(--card)', border: '1px solid var(--line)', color: 'var(--tx3)' }}>{g.g}</span>
                </button>
              );
            })}
          </div>
        ))}

        {q.trim() && groups.length === 0 && (
          <div style={{ fontSize: 12.5, color: 'var(--tx3)', padding: '10px 12px 14px' }}>Nothing matches “{q.trim()}”.</div>
        )}
      </div>
    </>
  );
}
