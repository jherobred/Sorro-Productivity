'use client';

import { useEffect, useMemo, useState } from 'react';
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Cross-entity search. Debounced so typing does not hammer the API.
  useEffect(() => {
    const term = q.trim();
    if (!term) { setHits([]); return; }
    const t = setTimeout(async () => {
      const like = `%${term}%`;
      const needle = term.replace(/^@/, '').toLowerCase();
      const [tasks, notes, events, people, profilesRes] = await Promise.all([
        supabase.from('bd_tasks').select('id,title').is('deleted_at', null).ilike('title', like).limit(5),
        supabase.from('bd_notes').select('id,title,body').is('deleted_at', null)
          .or(`title.ilike.${like},body.ilike.${like}`).limit(5),
        supabase.from('bd_events').select('id,title,starts_at').is('deleted_at', null).ilike('title', like).limit(5),
        supabase.from('bd_people').select('id,name,category').ilike('name', like).limit(5),
        supabase.from('bd_profiles').select('user_id,name,handle,animal').or(`name.ilike.${like},handle.ilike.${like}`).limit(5),
      ]);
      const g: Group[] = [];
      const jump = (path: string) => () => { router.push(path); onClose(); };

      const foundPeople: Row[] = [];
      const seenHandles = new Set<string>();

      // From db profiles
      if (profilesRes.data?.length) {
        for (const p of profilesRes.data) {
          const h = (p.handle || p.name || p.user_id).replace(/^@/, '');
          seenHandles.add(h.toLowerCase());
          foundPeople.push({
            id: p.user_id,
            n: p.name || `@${h}`,
            m: `@${h} · View profile`,
            ic: 'focus',
            go: jump(`/profile/?u=${encodeURIComponent(h)}`),
          });
        }
      }

      // From community presets
      for (const [key, p] of Object.entries(COMMUNITY_PROFILES)) {
        const h = (p.handle || key).toLowerCase();
        if (
          (h.includes(needle) || p.name.toLowerCase().includes(needle)) &&
          !seenHandles.has(h)
        ) {
          seenHandles.add(h);
          foundPeople.push({
            id: p.user_id,
            n: p.name,
            m: `@${p.handle} · Basedly Community`,
            ic: 'focus',
            go: jump(`/profile/?u=${encodeURIComponent(p.handle || h)}`),
          });
        }
      }

      // From contacts (bd_people)
      if (people.data?.length) {
        for (const p of people.data) {
          const h = p.name.toLowerCase().replace(/\s+/g, '');
          if (!seenHandles.has(h)) {
            seenHandles.add(h);
            foundPeople.push({
              id: p.id,
              n: p.name,
              m: `${p.category} · View profile`,
              ic: 'people',
              go: jump(`/profile/?u=${encodeURIComponent(h)}`),
            });
          }
        }
      }

      if (foundPeople.length) {
        g.push({ g: 'People & Profiles', items: foundPeople });
      }

      if (tasks.data?.length) g.push({ g: 'Tasks', items: tasks.data.map((r) => ({ id: r.id, n: r.title, m: 'Task', ic: 'task', go: jump('/tasks/') })) });
      if (notes.data?.length) g.push({ g: 'Notes', items: notes.data.map((r) => ({
        id: r.id, n: r.title || 'Untitled',
        m: r.title.toLowerCase().includes(term.toLowerCase()) ? 'Note' : 'In the text',
        ic: 'book', go: jump('/notebooks/'),
      })) });
      if (events.data?.length) g.push({ g: 'Events', items: events.data.map((r) => ({ id: r.id, n: r.title, m: new Date(r.starts_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), ic: 'cal', go: jump('/calendar/') })) });
      setHits(g);
    }, 180);
    return () => clearTimeout(t);
  }, [q, router, onClose]);

  const quickCommands = useMemo<Group[]>(() => {
    const term = q.trim().toLowerCase();
    const dark = prefs.theme === 'dark';
    const allCommands: Row[] = [
      {
        id: 'cmd-task', n: 'Create new task', m: 'Quick action (T)', ic: 'taskPlus',
        go: () => {
          onClose();
          router.push('/tasks/');
        },
      },
      {
        id: 'cmd-note', n: 'Create new note', m: 'Quick action (N)', ic: 'bookPlus',
        go: () => {
          onClose();
          router.push('/notebooks/');
        },
      },
      {
        id: 'cmd-expense', n: 'Log new expense', m: 'Quick action (E)', ic: 'money',
        go: () => {
          onClose();
          router.push('/money/');
        },
      },
      {
        id: 'cmd-theme', n: dark ? 'Switch to Light Theme' : 'Switch to Dark Theme', m: 'Preferences (⌘+Shift+L)', ic: 'moon',
        go: () => {
          void update({ theme: dark ? 'light' : 'dark' });
          toast(dark ? 'Switched to Light theme' : 'Switched to Dark theme');
          onClose();
        },
      },
    ];

    const filtered = allCommands.filter(
      (c) => !term || c.n.toLowerCase().includes(term) || c.m.toLowerCase().includes(term)
    );

    return filtered.length ? [{ g: 'Commands', items: filtered }] : [];
  }, [q, prefs.theme, update, router, onClose]);

  const jumps = useMemo<Group[]>(() => {
    const term = q.trim().toLowerCase();
    const items = SECTIONS
      .filter(([, name]) => !term || name.toLowerCase().includes(term))
      .map(([id, name, ic]) => ({
        id, n: name, m: 'Jump to section', ic,
        go: () => { router.push(`/${id}/`); onClose(); },
      }));
    return items.length ? [{ g: 'Navigation', items }] : [];
  }, [q, router, onClose]);

  const groups = q.trim() ? [...quickCommands, ...hits, ...jumps] : [...quickCommands, ...jumps];

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
            style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--tx)' }} />
          <kbd
            style={{
              fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5,
              background: 'var(--card2)', color: 'var(--tx3)', border: '1px solid var(--line2)',
            }}
          >
            ESC
          </kbd>
          <button onClick={onClose} className="hov" style={{ width: 24, height: 24, borderRadius: 7, color: 'var(--tx3)', fontSize: 14 }}>×</button>
        </div>

        {groups.map((g) => (
          <div key={g.g} style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)', padding: '8px 10px 5px' }}>
              {g.g}
            </div>
            {g.items.map((r) => (
              <button key={`${g.g}-${r.id}`} onClick={r.go} className="hov lensrow"
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 10px', borderRadius: 9, textAlign: 'left' }}>
                <Icon name={r.ic} size={15} color="var(--tx3)" />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.n}</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: 'var(--tx3)', marginTop: 2 }}>{r.m}</span>
                </span>
              </button>
            ))}
          </div>
        ))}

        {q.trim() && groups.length === 0 && (
          <div style={{ fontSize: 12.5, color: 'var(--tx3)', padding: '10px 12px 14px' }}>Nothing matches “{q.trim()}”.</div>
        )}
      </div>
    </>
  );
}
