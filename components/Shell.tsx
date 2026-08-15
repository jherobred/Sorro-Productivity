'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Icon, type IconName } from './Icon';
import { ToastHost } from './ToastHost';
import { useLayout } from '@/lib/useLayout';
import { usePrefs } from '@/lib/prefs';
import { SECHUE, PAL } from '@/lib/pal';
import { supabase } from '@/lib/supabase';
import { onlineManager } from '@tanstack/react-query';
import { lg, ON_ACCENT } from '@/lib/glass';
import { CaptureSheet, type CaptureKind } from './CaptureSheet';
import { SearchPalette } from './SearchPalette';
import { devFixturesOn, seedDevFixtures } from '@/lib/devFixtures';

/**
 * Shell ported from Basedly.dc.html — markup 190–312, computed styles 4337–4372
 * (nav), 4846–4867 (glass sidebar, aura, avatars), 5294–5304 (side actions),
 * 6473 (⌘K), 6897 (page transition).
 */

type Kid = { n: string; c: string; m?: string };
type Section = { id: string; name: string; ic: IconName; badge?: string; kids?: Kid[]; lock?: boolean };

const SECTIONS: Section[] = [
  { id: 'home', name: 'Home', ic: 'home' },
  { id: 'calendar', name: 'Calendar', ic: 'cal', kids: [{ n: 'Classes', c: PAL.indigo }, { n: 'Personal', c: PAL.mint }, { n: 'Org — CSSS', c: PAL.violet }] },
  { id: 'tasks', name: 'Tasks', ic: 'task', kids: [{ n: 'School', c: PAL.indigo, m: '7' }, { n: 'Personal', c: PAL.amber, m: '3' }, { n: 'Errands', c: PAL.mint, m: '2' }] },
  { id: 'notebooks', name: 'Notebooks', ic: 'book', kids: [{ n: '3rd year', c: PAL.indigo }, { n: 'Capstone research', c: PAL.violet }, { n: 'Journal', c: PAL.coral }, { n: 'Canvases', c: PAL.cyan }] },
  { id: 'projects', name: 'Projects', ic: 'proj' },
  { id: 'habits', name: 'Habits', ic: 'habit' },
  { id: 'body', name: 'Body', ic: 'heart', kids: [{ n: 'Health', c: PAL.pink }, { n: 'Food', c: PAL.amber }, { n: 'Gym', c: PAL.mint }] },
  { id: 'money', name: 'Money', ic: 'money', lock: true },
  { id: 'profile', name: 'Profile', ic: 'focus' },
  { id: 'community', name: 'Community', ic: 'chat', kids: [{ n: 'Feed', c: PAL.pink }, { n: 'Threads', c: PAL.sky }, { n: 'Challenges', c: PAL.amber }] },
  { id: 'files', name: 'Files', ic: 'files' },
  { id: 'people', name: 'People', ic: 'people' },
];

const BUILT = new Set(['home', 'tasks', 'calendar', 'habits', 'money', 'notebooks', 'people', 'files', 'body', 'projects', 'community', 'profile', 'more']);

const NAV_PHONE: Section[] = SECTIONS.filter((s) => ['home', 'calendar', 'tasks', 'notebooks'].includes(s.id))
  .concat([{ id: 'more', name: 'More', ic: 'more' }]);

export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { phone } = useLayout();
  const { prefs, update } = usePrefs();
  const [guard, setGuard] = useState<'checking' | 'ok'>('checking');
  const [capture, setCapture] = useState(false);
  const [sheet, setSheet] = useState<CaptureKind | null>(null);
  const [search, setSearch] = useState(false);
  const [openKids, setOpenKids] = useState<Record<string, boolean>>({ community: true });
  const [wsOpen, setWsOpen] = useState(false);
  const [sideMore, setSideMore] = useState(false);
  const [taskCount, setTaskCount] = useState<number | null>(null);

  const section = pathname.split('/').filter(Boolean)[0] ?? 'home';
  const dark = prefs.theme === 'dark';
  const acc = prefs.accent;

  useEffect(() => {
    // Dev-only preview. `NODE_ENV` is inlined at build time, so this whole
    // branch is stripped from production bundles — it cannot be enabled by an
    // env var on the deployed site.
    if (devFixturesOn()) { seedDevFixtures(); setGuard('ok'); return; }

    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace('/');
      else setGuard('ok');
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (!s) router.replace('/'); });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  // ⌘K / Ctrl-K opens the palette; the search field opens the same surface.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearch(true);
      }
      if (e.key === '/' && !/input|textarea/i.test((e.target as HTMLElement)?.tagName ?? '')) {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    supabase.from('bd_tasks').select('id', { count: 'exact', head: true })
      .is('deleted_at', null).eq('done', false)
      .then(({ count }) => setTaskCount(count ?? 0));
  }, [pathname]);

  if (guard === 'checking') return <div style={{ height: '100dvh', background: 'var(--bg)' }} />;

  const go = (id: string) => { if (BUILT.has(id)) router.push(`/${id}/`); };
  const hueTx = (hue: string) =>
    dark ? `color-mix(in srgb, ${hue} 84%, #FFFFFF)` : `color-mix(in srgb, ${hue} 62%, #1C1A26)`;

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: phone ? 'column' : 'row',
      background: 'var(--bg)', color: 'var(--tx)', overflow: 'hidden', position: 'relative',
    }}>
      {/* Ambient accent aura behind the chrome (auraA). */}
      <div aria-hidden className="aur" style={{
        position: 'absolute', width: '62%', height: '58%', left: '-14%', top: '-18%',
        borderRadius: '50%', pointerEvents: 'none',
        background: `radial-gradient(circle, color-mix(in srgb, ${acc} ${dark ? 34 : 20}%, transparent) 0%, transparent 68%)`,
        filter: 'blur(46px)', opacity: dark ? 0.85 : 0.6, zIndex: 0,
      }} />

      {!phone && (
        <div style={{
          ...lg({ tint: acc, strength: 1, dark }),
          width: 236, flex: 'none', position: 'relative', zIndex: 2,
          display: 'flex', flexDirection: 'column', padding: '14px 0', overflow: 'hidden',
          border: 0, borderRadius: 0,
          borderRight: `1px solid ${dark ? 'rgba(255,255,255,.13)' : 'rgba(255,255,255,.9)'}`,
          boxShadow: dark
            ? 'inset -1px 0 0 rgba(255,255,255,.07), inset 1px 0 0 rgba(255,255,255,.16)'
            : 'inset -1px 0 0 rgba(38,32,54,.05), inset 1px 0 0 rgba(255,255,255,.95)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 14px 14px' }}>
            <div style={{ width: 22, height: 22, background: acc, borderRadius: 6 }} />
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-.02em' }}>Basedly</div>
          </div>

          <div style={{ padding: '0 12px 12px' }}>
            <button onClick={() => setSearch(true)} className="hov" style={{
              display: 'flex', alignItems: 'center', gap: 9, width: '100%', height: 34, padding: '0 11px',
              borderRadius: 9, background: 'var(--card)', border: '1px solid var(--line)',
            }}>
              <Icon name="search" size={14} color="var(--tx3)" />
              <span style={{ flex: 1, textAlign: 'left', fontSize: 12, fontWeight: 500, color: 'var(--tx3)' }}>Search</span>
            </button>
          </div>

          <div style={{ position: 'relative', padding: '0 12px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <button className="acc" style={{
                display: 'flex', alignItems: 'center', gap: 7, flex: '1 1 auto', height: 34, padding: '0 13px',
                borderRadius: 9, background: acc, color: ON_ACCENT, fontSize: 12.5, fontWeight: 800,
              }}>
                <Icon name="bookPlus" size={15} color={ON_ACCENT} />Note
              </button>
              {([['taskPlus', 'New task'], ['spark', 'AI helper']] as [IconName, string][]).map(([ic, n]) => (
                <button key={n} title={n} className="hov" style={{
                  width: 30, height: 34, flex: 'none', borderRadius: 9, border: '1px solid var(--line2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon name={ic} size={15} color="var(--tx2)" />
                </button>
              ))}
              <button title="More actions" className="hov" style={{
                width: 30, height: 34, flex: 'none', borderRadius: 9, border: '1px solid var(--line2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name="dots" size={15} color="var(--tx2)" />
              </button>
            </div>
          </div>

          <div className="navsb" style={{ flex: 1, overflowY: 'auto', padding: '0 8px 0 17px' }}>
            {SECTIONS.map((sec) => {
              const on = sec.id === section;
              const hue = SECHUE[sec.id] || acc;
              const hasKids = !!sec.kids;
              const open = hasKids && openKids[sec.id] !== false && openKids[sec.id] !== undefined;
              const badge = sec.id === 'tasks' && taskCount !== null ? String(taskCount) : sec.badge ?? '';
              return (
                <div key={sec.id}>
                  <div className="hov" style={{
                    display: 'flex', alignItems: 'center', borderRadius: 10, position: 'relative',
                    background: on ? `color-mix(in srgb, ${hue} 16%, transparent)` : 'transparent',
                    boxShadow: on ? `inset 0 0 0 1px color-mix(in srgb, ${hue} 30%, transparent)` : 'none',
                  }}>
                    <span style={{
                      position: 'absolute', left: -9, top: 7, bottom: 7, width: 3, borderRadius: 2,
                      background: hue, opacity: on ? 1 : 0, transform: on ? 'scaleY(1)' : 'scaleY(.3)',
                      transition: 'opacity .3s cubic-bezier(.22,1,.36,1), transform .3s cubic-bezier(.22,1,.36,1)',
                    }} />
                    <button onClick={() => go(sec.id)} style={{
                      display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0,
                      padding: '7px 4px 7px 8px', borderRadius: 8, fontSize: 12.5, fontWeight: on ? 700 : 500,
                      background: 'transparent', color: on ? hueTx(hue) : 'var(--tx2)',
                      opacity: BUILT.has(sec.id) ? 1 : 0.45,
                    }}>
                      <Icon name={sec.ic} size={15} color={on ? hueTx(hue) : 'var(--tx2)'} />
                      <span style={{ flex: 1, textAlign: 'left' }}>{sec.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>{badge}</span>
                    </button>
                    <button
                      onClick={() => setOpenKids((k) => ({ ...k, [sec.id]: !open }))}
                      title="Show or hide sub-items"
                      style={{
                        width: 22, height: 22, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginRight: 4, borderRadius: 6, opacity: hasKids ? 1 : 0, pointerEvents: hasKids ? 'auto' : 'none',
                      }}>
                      <Icon name="chev" size={13} color={on ? hueTx(hue) : 'var(--tx3)'}
                        style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .28s cubic-bezier(0.16,1,0.3,1)' }} />
                    </button>
                  </div>

                  {open && sec.kids && (
                    <div style={{
                      display: 'flex', flexDirection: 'column', gap: 1, margin: '2px 0 6px 15px',
                      paddingLeft: 9, borderLeft: '1px solid var(--line2)',
                    }}>
                      {sec.kids.map((k) => (
                        <button key={k.n} onClick={() => go(sec.id)} className="hov" style={{
                          display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '5px 8px',
                          borderRadius: 6, fontSize: 11.5, fontWeight: 500, color: 'var(--tx2)',
                        }}>
                          <span style={{ width: 7, height: 7, borderRadius: 2, flex: 'none', background: k.c }} />
                          <span style={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.n}</span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>{k.m ?? ''}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 8px 4px', borderTop: '1px solid var(--line)' }}>
            <button onClick={() => setSideMore((v) => !v)} className="hov" style={{
              display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 8px',
              borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: 'var(--tx2)',
            }}>
              <Icon name="chev" size={13} color="var(--tx3)"
                style={{ transform: sideMore ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .28s cubic-bezier(0.16,1,0.3,1)' }} />
              <span style={{ flex: 1, textAlign: 'left' }}>More</span>
            </button>
            {sideMore && (
              <div className="lens" style={{ display: 'flex', flexDirection: 'column', gap: 1, margin: '2px 0 2px 15px', paddingLeft: 9, borderLeft: '1px solid var(--line2)' }}>
                <button onClick={() => update({ theme: dark ? 'light' : 'dark' })} className="hov"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, fontSize: 11.5, color: 'var(--tx2)' }}>
                  <Icon name="moon" size={13} color="var(--tx3)" />{dark ? 'Light mode' : 'Dark mode'}
                </button>
                <button onClick={() => update({ motion: !prefs.motion })} className="hov"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, fontSize: 11.5, color: 'var(--tx2)' }}>
                  <Icon name="spark" size={13} color="var(--tx3)" />{prefs.motion ? 'Reduce motion' : 'Enable motion'}
                </button>
                <button onClick={() => supabase.auth.signOut()} className="hov"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, fontSize: 11.5, color: 'var(--tx2)' }}>
                  <Icon name="back" size={13} color="var(--tx3)" />Sign out
                </button>
              </div>
            )}
          </div>

          <div style={{ padding: '8px 14px 0', borderTop: '1px solid var(--line)' }}>
            <button onClick={() => setWsOpen((v) => !v)} className="hov"
              style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: 6, borderRadius: 8 }}>
              <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--card2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--tx2)', flex: 'none' }}>MR</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx2)', flex: 1, textAlign: 'left' }}>Personal</span>
              <span style={{ fontSize: 10, color: 'var(--tx3)' }}>▲▼</span>
            </button>
            {wsOpen && (
              <div className="rise" style={{ margin: '6px 0 4px', padding: 5, borderRadius: 10, background: 'var(--card)', boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
                {[{ n: 'Personal', r: 'owner', c: acc }, { n: 'Capstone — Team 4', r: 'member', c: PAL.violet }, { n: 'CSSS Officers', r: 'viewer', c: PAL.mint }].map((w) => (
                  <button key={w.n} className="hov" style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px', borderRadius: 7, fontSize: 11.5, color: 'var(--tx2)' }}>
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: w.c, flex: 'none' }} />
                    <span style={{ flex: 1, textAlign: 'left' }}>{w.n}</span>
                    <span style={{ fontSize: 10, color: 'var(--tx3)' }}>{w.r}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
        {!phone && (
          <div style={{ height: 54, flex: 'none', display: 'flex', alignItems: 'center', gap: 9, padding: '0 18px', borderBottom: '1px solid var(--line)' }}>
            <button onClick={() => setSearch(true)} className="hov" title="Quick actions" style={{
              flex: 'none', height: 30, padding: '0 11px', borderRadius: 9, border: '1px solid var(--line2)',
              fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', color: 'var(--tx2)', display: 'flex', alignItems: 'center',
            }}>⌘K</button>

            <div className="pill" style={{
              display: 'flex', alignItems: 'center', height: 38, width: 38, borderRadius: 19,
              border: '1px solid var(--line2)', background: 'transparent',
            }}>
              <button onClick={() => setSearch(true)} aria-label="Search"
                style={{ width: 38, height: 38, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="search" size={16} color="var(--tx2)" />
              </button>
            </div>

            <button className="hov" title="AI helper" style={{
              width: 38, height: 38, flex: 'none', borderRadius: 19, border: '1px solid var(--line2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="spark" size={15} color="var(--tx2)" />
            </button>

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              <OfflinePill />
              <div style={{ display: 'flex' }}>
                {[{ i: 'JL', c: PAL.mint }, { i: 'RT', c: PAL.amber }, { i: 'BC', c: PAL.violet }].map((m, i) => (
                  <div key={m.i} style={{
                    width: 24, height: 24, borderRadius: '50%', background: m.c, marginLeft: i ? -7 : 0,
                    border: '2px solid var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 8.5, fontWeight: 700, color: ON_ACCENT,
                  }}>{m.i}</div>
                ))}
              </div>
              <button className="hov" style={{ width: 32, height: 32, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="set" size={16} color="var(--tx2)" />
              </button>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: PAL.indigo, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: ON_ACCENT }}>MR</div>
            </div>
          </div>
        )}

        {phone && (
          <div style={{ height: 44, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--tx)' }}>
            <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
            <span style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 10, color: 'var(--tx2)' }}>●●● ᯤ ▮</span>
          </div>
        )}

        {/* Content is capped and centred: the design was drawn against a ~986px
            frame, so letting it span a 1900px monitor stretches the flexible
            middle column far past its intended proportions. */}
        <div key={pathname} className="pagein" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', minHeight: '100%' }}>
            {children}
          </div>
        </div>

        {phone && <BottomNav section={section} go={go} accent={acc} dark={dark} onCapture={() => setCapture((c) => !c)} captureOpen={capture} />}
      </div>

      {!phone && (
        <button onClick={() => setCapture((c) => !c)} title="Capture — drag me anywhere" aria-expanded={capture}
          style={{
            position: 'fixed', right: 22, bottom: 22, width: 54, height: 54, borderRadius: 27, background: acc,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 10px 28px color-mix(in srgb, ${acc} 40%, transparent)`,
            transform: capture ? 'rotate(45deg)' : 'rotate(0)',
            transition: 'transform .3s cubic-bezier(0.34,1.56,0.64,1), box-shadow .2s', zIndex: 30,
          }}>
          <Icon name="plus" size={22} color={ON_ACCENT} />
        </button>
      )}

      {/* Capture fan — children stagger out of the FAB (fabi spring). */}
      {capture && (
        <div style={{ position: 'fixed', right: phone ? '50%' : 30, bottom: phone ? 152 : 88, zIndex: 31, display: 'flex', flexDirection: 'column', gap: 9, alignItems: phone ? 'center' : 'flex-end', transform: phone ? 'translateX(50%)' : undefined }}>
          {([['task', 'Task', 'taskPlus'], ['note', 'Note', 'bookPlus'], ['money', 'Expense', 'money']] as [CaptureKind, string, IconName][])
            .map(([k, label, ic], i) => (
              <button key={k} className="fabi pop"
                style={{ animationDelay: `${i * 0.04}s`, display: 'flex', alignItems: 'center', gap: 9, padding: '8px 13px', borderRadius: 22, background: 'var(--card2)', border: '1px solid var(--line2)', boxShadow: 'var(--shl)', fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}
                onClick={() => { setSheet(k); setCapture(false); }}>
                <Icon name={ic} size={15} color="var(--accTx)" />{label}
              </button>
            ))}
        </div>
      )}

      {sheet && <CaptureSheet kind={sheet} onClose={() => setSheet(null)} />}
      {search && <SearchPalette onClose={() => setSearch(false)} />}

      <ToastHost />
    </div>
  );
}

function OfflinePill() {
  const [online, setOnline] = useState(true);
  useEffect(() => onlineManager.subscribe(() => setOnline(onlineManager.isOnline())), []);
  if (online) return null;
  return (
    <span className="fade" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: PAL.amber }}>
      Offline — queued
    </span>
  );
}

function BottomNav({
  section, go, accent, dark, onCapture, captureOpen,
}: {
  section: string; go: (id: string) => void; accent: string; dark: boolean;
  onCapture: () => void; captureOpen: boolean;
}) {
  const half = Math.ceil(NAV_PHONE.length / 2);
  const slot = (s: Section) => {
    const on = s.id === section;
    return (
      <button key={s.id} onClick={() => go(s.id)} title={s.name} aria-label={s.name}
        style={{
          flex: 1, minWidth: 0, height: 44, borderRadius: 18, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: on ? accent : 'transparent', transition: 'background .24s',
          opacity: BUILT.has(s.id) ? 1 : 0.45,
        }}>
        <Icon name={s.ic} size={17} color={on ? ON_ACCENT : 'var(--tx2)'} />
        <span style={{ width: 3, height: 3, borderRadius: '50%', marginTop: 3, background: on ? ON_ACCENT : 'transparent' }} />
      </button>
    );
  };

  return (
    <div style={{ flex: 'none', padding: '4px 10px 12px', position: 'relative', zIndex: 12 }}>
      <nav style={{
        ...lg({ tint: accent, strength: 1.15, radius: 27, dark }),
        position: 'relative', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 2, padding: '7px 10px',
      }}>
        {NAV_PHONE.slice(0, half).map(slot)}
        <button onClick={onCapture} aria-label="Capture" aria-expanded={captureOpen}
          style={{
            flex: 'none', width: 54, height: 54, borderRadius: 27, background: accent, margin: '-12px 4px 0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `3px solid ${dark ? '#0C0F16' : '#F4F2F2'}`,
            boxShadow: `0 10px 26px color-mix(in srgb, ${accent} 52%, transparent)`,
            transform: captureOpen ? 'rotate(45deg)' : 'rotate(0)',
            transition: 'transform .3s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
          <Icon name="plus" size={22} color={ON_ACCENT} />
        </button>
        {NAV_PHONE.slice(half).map(slot)}
      </nav>
    </div>
  );
}
