'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from './Icon';
import { supabase, currentUserId } from '@/lib/supabase';
import { defineMutation } from '@/lib/offline';
import { toast } from '@/lib/toast';
import { PAL } from '@/lib/pal';
import { useLayout } from '@/lib/useLayout';
import { usePrefs } from '@/lib/prefs';
import { useOverlayBack } from '@/lib/nav';
import { playClick, playTick, playCelebration } from '@/lib/audio';
import { run, highlight, type RunResult, type Step, type FrameSnap, type HeapObj, type Local } from '@/lib/java';
import { ask } from '@/lib/ask';
import { JAVA_TEMPLATES, type JavaTemplate } from '@/lib/javaTemplates';
import { Java3DVisualizer, type AISimulationData } from './java/Java3DVisualizer';
import { TracePlaybackHUD } from './java/TracePlaybackHUD';

/**
 * Notebooks → Java Lab & 3D Visualizer Workbench.
 *
 * Runs real Java in the browser with full step execution tracing,
 * interactive 3D memory & stack visualization, non-obstructive playback HUD,
 * and mobile-first auto-scaling for vivo v25e / all Android, iOS & Desktop viewports.
 */

const CARD: React.CSSProperties = {
  background: 'var(--card)',
  borderRadius: 14,
  boxShadow: 'var(--sh)',
  border: '1px solid var(--line2)',
};

const KICKER: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '.1em',
  textTransform: 'uppercase',
  color: 'var(--tx3)',
};

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

const HUE: Record<string, string> = {
  kw: '#C792EA',
  str: '#C3E88D',
  num: '#F78C6C',
  com: '#6B6884',
  typ: '#82AAFF',
  fn: '#82AAFF',
  pun: '#89DDFF',
  txt: 'var(--tx)',
};

type JFile = { id: string; name: string; src: string; updated_at: string };
type RightTab = '3d' | 'console' | 'memory' | 'series';
type MobileTab = 'code' | '3d' | 'console' | 'memory' | 'files';
type LayoutMode = 'split' | 'code-full' | '3d-full';

const JAVA = ['java_files'] as const;

const SAVE = defineMutation('java.save', async (v: { id: string; src: string }) => {
  const { error } = await supabase.from('bd_java_files').update({ src: v.src, updated_at: new Date().toISOString() }).eq('id', v.id);
  if (error) throw error;
});
const ADD = defineMutation('java.add', async (v: { id: string; name: string; src: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_java_files').insert({ ...v, user_id });
  if (error) throw error;
});
const DEL = defineMutation('java.del', async (v: { id: string }) => {
  const { error } = await supabase.from('bd_java_files').delete().eq('id', v.id);
  if (error) throw error;
});

const STARTER = (cls: string) => `public class ${cls} {
    public static void main(String[] args) {
        System.out.println("Hello from ${cls}!");
        int[] arr = { 42, 17, 89, 5, 63 };
        for (int i = 0; i < arr.length; i++) {
            System.out.println("arr[" + i + "] = " + arr[i]);
        }
    }
}`;

export function JavaLab() {
  const qc = useQueryClient();
  const { phone } = useLayout();
  const [selId, setSelId] = useState<string | null>(null);
  const [src, setSrc] = useState('');
  const [result, setResult] = useState<RunResult | null>(null);
  const [aiSimulation, setAiSimulation] = useState<AISimulationData | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [at, setAt] = useState<number | null>(null); // scrubber position; null = final state
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [activeTab, setActiveTab] = useState<RightTab>('3d');
  const [mobileTab, setMobileTab] = useState<MobileTab>('code');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('split');
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);

  const { data: files = [] } = useQuery({
    queryKey: JAVA,
    queryFn: async (): Promise<JFile[]> => {
      const { data, error } = await supabase.from('bd_java_files').select('id,name,src,updated_at').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const settle = () => void qc.invalidateQueries({ queryKey: JAVA });
  const save = useMutation<unknown, Error, { id: string; src: string }>({ mutationKey: SAVE, onSettled: settle });
  const add = useMutation<unknown, Error, { id: string; name: string; src: string }>({ mutationKey: ADD, onSettled: settle });
  const del = useMutation<unknown, Error, { id: string }>({ mutationKey: DEL, onSettled: settle });

  const file = files.find((f) => f.id === selId) ?? files[0] ?? null;

  useEffect(() => {
    if (file && file.id !== selId) setSelId(file.id);
  }, [file, selId]);

  useEffect(() => {
    setSrc(file?.src ?? '');
    setResult(null);
    setAt(null);
    setPlaying(false);
  }, [file?.id]);

  // Autosave with debounce
  useEffect(() => {
    if (!file || src === file.src) return;
    const t = setTimeout(() => save.mutate({ id: file.id, src }), 800);
    return () => clearTimeout(t);
  }, [src, file?.id, file?.src, save.mutate]);

  // Execute Java Code
  const doRun = useCallback(() => {
    playClick();
    const r = run(src);
    setResult(r);
    setAt(null);
    setPlaying(false);
    if (r.error) {
      toast(`Line ${r.error.line}: ${r.error.message}`);
    } else {
      playCelebration();
      toast(
        r.truncated
          ? `Ran in ${r.ms}ms — trace capped at ${r.trace.length} steps, replay stops early`
          : `Compiled & Executed in ${r.ms}ms (${r.trace.length} trace steps)`
      );
      if (phone && mobileTab === 'code') {
        // Auto-switch to 3D World on phone so user immediately sees visual results
        setMobileTab('3d');
      }
    }
  }, [src, phone, mobileTab]);

  // Generate Gemini AI 3D/2.5D/2D Simulation
  const doAiSimulate = useCallback(async () => {
    if (!src.trim()) return;
    playClick();
    setIsSimulating(true);
    toast('Generating Gemini AI Simulation...');
    try {
      const res = await fetch('/api/java-simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ src }),
      });
      const data = await res.json();
      if (data.ok && data.simulation) {
        setAiSimulation(data.simulation);
        playCelebration();
        toast(`✨ Gemini AI Simulation Ready: ${data.simulation.title || data.simulation.algorithm || 'Simulation'}`);
        if (phone && mobileTab === 'code') {
          setMobileTab('3d');
        }
      } else {
        toast('Simulation synthesized with engine');
      }
    } catch {
      toast('Simulation synthesized with engine');
    } finally {
      setIsSimulating(false);
      doRun();
    }
  }, [src, phone, mobileTab, doRun]);

  // Shortcut: ⌘↵ / Ctrl+↵ to run
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        doRun();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doRun]);

  /**
   * Playback clock.
   *
   * The clock is the ONLY writer of `at` while `playing` is true — scrubbing
   * pauses first (see onStepChange), which tears this effect down. So the
   * interval can keep its own cursor `i` instead of reading `at` back through a
   * state updater, which is what the previous version did: it called
   * setPlaying(false) from inside a setAt updater, a side effect during the
   * render phase that React double-invokes in StrictMode.
   *
   * `at` is deliberately not a dependency. It is only read to seed the cursor
   * when the effect (re)starts, which happens on play and on a speed change —
   * at both of those moments `at` is already committed, so re-seeding neither
   * repeats nor skips a step. A speed change re-times the *next* step and
   * clears the pending timer, so nothing double-fires.
   */
  useEffect(() => {
    const total = result?.trace.length ?? 0;
    if (!playing || total < 2) return;
    let i = at ?? 0;
    const t = setInterval(() => {
      i += 1;
      if (i >= total) {
        // Ran off the end. `null` is the post-run final state, which is a real
        // snapshot java.ts computes after the last traced statement — not the
        // last step replayed again.
        clearInterval(t);
        setPlaying(false);
        setAt(null);
        return;
      }
      setAt(i);
    }, Math.max(50, Math.round(280 / speed)));
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, result, speed]);

  const step: Step | null = result && at !== null ? result.trace[at] ?? null : null;
  const frames: FrameSnap[] = step ? step.frames : result?.frames ?? [];
  const heap: HeapObj[] = step ? step.heap : result?.heap ?? [];
  // Scrubbing rewinds the console too: step.out is how many lines had been
  // printed by that statement, so anything past it has not happened yet.
  const consoleOutput: string[] = result ? (step ? result.out.slice(0, step.out) : result.out) : [];
  const activeLine = step?.line ?? null;

  const newFile = async () => {
    playClick();
    const n = await ask('New Java Class', { initial: `Scratch${files.length + 1}`, placeholder: 'Class name (e.g. QuickSort)', confirmLabel: 'Create File' });
    if (!n) return;
    const cls = n.replace(/[^A-Za-z0-9_]/g, '') || 'Scratch';
    const newId = crypto.randomUUID();
    add.mutate(
      { id: newId, name: `${cls}.java`, src: STARTER(cls) },
      {
        onSuccess: () => {
          setSelId(newId);
          if (phone) setMobileTab('code');
          toast(`${cls}.java created`);
        },
      }
    );
  };

  const loadTemplate = (tmpl: JavaTemplate) => {
    playClick();
    const existing = files.find((f) => f.name === tmpl.name);
    if (existing) {
      setSelId(existing.id);
      if (phone) setMobileTab('3d');
      toast(`Opened ${tmpl.name}`);
      return;
    }
    const newId = crypto.randomUUID();
    add.mutate(
      { id: newId, name: tmpl.name, src: tmpl.src },
      {
        onSuccess: () => {
          setSelId(newId);
          if (phone) setMobileTab('3d');
          toast(`Loaded 3D Template: ${tmpl.name}`);
        },
      }
    );
  };

  // ---------------------------------------------------------------------------
  // Desktop Left Sidebar: File Explorer + 3D Algorithm Library
  // ---------------------------------------------------------------------------
  const desktopSidebar = (
    <div style={{ width: 240, flex: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* File Explorer Card */}
      <div style={{ ...CARD, padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="files" size={13} color="var(--accTx)" />
            <span style={KICKER}>Source Files ({files.length})</span>
          </div>
          <button
            onClick={() => void newFile()}
            className="hov k-squish"
            title="Create New Java File"
            aria-label="Create New Java File"
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--card2)',
              border: '1px solid var(--line2)',
              cursor: 'pointer',
            }}
          >
            <Icon name="plus" size={13} color="var(--tx)" />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }} className="navsb">
          {files.map((f) => {
            const on = f.id === file?.id;
            return (
              <button
                key={f.id}
                onClick={() => {
                  playTick();
                  setSelId(f.id);
                }}
                className="k-chip"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: on ? 'color-mix(in srgb, var(--acc) 16%, var(--card2))' : 'transparent',
                  border: `1px solid ${on ? 'color-mix(in srgb, var(--acc) 40%, transparent)' : 'transparent'}`,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background .15s, border-color .15s',
                }}
              >
                <Icon name="code" size={13} color={on ? 'var(--accTx)' : 'var(--tx3)'} />
                <span
                  style={{
                    flex: 1,
                    fontSize: 12,
                    fontWeight: on ? 800 : 500,
                    color: on ? 'var(--tx)' : 'var(--tx2)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {f.name}
                </span>
                {on && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--acc)', flex: 'none' }} />
                )}
              </button>
            );
          })}
          {files.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--tx3)', padding: '8px 4px', textAlign: 'center' }}>
              No Java files yet. Click + to create one.
            </div>
          )}
        </div>
      </div>

      {/* Curated 3D Algorithm Library */}
      <div style={{ ...CARD, padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 220 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="spark" size={13} color="var(--pal-amber)" />
            <span style={KICKER}>3D Templates</span>
          </div>
          <span style={{ fontSize: 10, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
            {JAVA_TEMPLATES.length} loaded
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, overflowY: 'auto' }} className="navsb">
          {JAVA_TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.id}
              onClick={() => loadTemplate(tmpl)}
              className="hov k-squish"
              title={tmpl.description}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '7px 9px',
                borderRadius: 8,
                background: 'var(--card2)',
                border: '1px solid var(--line)',
                cursor: 'pointer',
                textAlign: 'left',
                gap: 2,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--tx)' }}>{tmpl.name}</span>
                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'var(--card)', color: 'var(--accTx)', fontWeight: 700 }}>
                  {tmpl.category}
                </span>
              </div>
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--tx3)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%',
                }}
              >
                {tmpl.description}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Mobile Files & Template Manager Pane (when activeTab === 'files' on phone)
  // ---------------------------------------------------------------------------
  const mobileFilesPane = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      {/* File Explorer Card */}
      <div style={{ ...CARD, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="files" size={15} color="var(--accTx)" />
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx)' }}>Your Java Files</span>
          </div>
          <button
            onClick={() => void newFile()}
            className="acc k-squish"
            style={{
              minHeight: 36,
              padding: '0 12px',
              borderRadius: 8,
              background: 'var(--acc)',
              color: 'var(--accent-ink)',
              fontSize: 11.5,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              cursor: 'pointer',
            }}
          >
            <Icon name="plus" size={13} color="var(--accent-ink)" />
            <span>New File</span>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {files.map((f) => {
            const on = f.id === file?.id;
            return (
              <div
                key={f.id}
                onClick={() => {
                  playTick();
                  setSelId(f.id);
                  setMobileTab('code');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: on ? 'color-mix(in srgb, var(--acc) 16%, var(--card2))' : 'var(--card2)',
                  border: `1px solid ${on ? 'color-mix(in srgb, var(--acc) 45%, transparent)' : 'var(--line2)'}`,
                  cursor: 'pointer',
                  minHeight: 44,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  <Icon name="code" size={15} color={on ? 'var(--accTx)' : 'var(--tx3)'} />
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: on ? 800 : 600, color: on ? 'var(--tx)' : 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.name}
                    </span>
                    <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>
                      {f.src.split('\n').length} lines
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {on && (
                    <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accTx)', background: 'var(--card)', padding: '2px 7px', borderRadius: 6 }}>
                      Active
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      del.mutate({ id: f.id }, { onSuccess: () => { setSelId(null); toast(`${f.name} deleted`); } });
                    }}
                    title="Delete file"
                    aria-label="Delete file"
                    className="hov k-squish"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 7,
                      display: 'grid',
                      placeItems: 'center',
                      background: 'transparent',
                      color: 'var(--tx3)',
                    }}
                  >
                    <Icon name="trash" size={13} color="var(--tx3)" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Curated 3D Templates */}
      <div style={{ ...CARD, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Icon name="spark" size={15} color="var(--pal-amber)" />
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx)' }}>3D Algorithm Templates</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {JAVA_TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.id}
              onClick={() => loadTemplate(tmpl)}
              className="hov k-squish"
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '10px 12px',
                borderRadius: 10,
                background: 'var(--card2)',
                border: '1px solid var(--line2)',
                textAlign: 'left',
                gap: 4,
                minHeight: 44,
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--tx)' }}>{tmpl.name}</span>
                <span style={{ fontSize: 9.5, padding: '2px 6px', borderRadius: 5, background: 'var(--card)', color: 'var(--accTx)', fontWeight: 700 }}>
                  {tmpl.category}
                </span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--tx3)', lineHeight: 1.4 }}>
                {tmpl.description}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: phone ? 'column' : 'row',
        gap: 12,
        flex: 1,
        minHeight: 0,
        position: 'relative',
      }}
    >
      {/* Desktop Left Sidebar */}
      {!phone && desktopSidebar}

      {/* Main Workbench Area */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          overflowY: 'auto',
          position: 'relative',
        }}
        className="navsb"
      >
        {/* Top Mobile Segmented View Switcher */}
        {phone && (
          <div
            style={{
              ...CARD,
              padding: '6px 8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 4,
              overflowX: 'auto',
              whiteSpace: 'nowrap',
            }}
            className="hbar"
          >
            {(
              [
                ['code', 'Editor', 'code'],
                ['3d', '3D World', 'spark'],
                ['console', 'Console', 'text'],
                ['memory', 'Memory', 'layers'],
                ['files', 'Files', 'files'],
              ] as [MobileTab, string, import('./Icon').IconName][]
            ).map(([t, label, iconName]) => {
              const on = mobileTab === t;
              return (
                <button
                  key={t}
                  onClick={() => {
                    playTick();
                    setMobileTab(t);
                  }}
                  className="k-squish"
                  style={{
                    flex: '1 0 auto',
                    minHeight: 38,
                    padding: '0 10px',
                    borderRadius: 8,
                    fontSize: 11.5,
                    fontWeight: on ? 800 : 600,
                    border: 'none',
                    background: on ? 'var(--acc)' : 'transparent',
                    color: on ? 'var(--accent-ink)' : 'var(--tx2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    cursor: 'pointer',
                    transition: 'background .15s, color .15s',
                  }}
                >
                  <Icon name={iconName} size={13} color={on ? 'var(--accent-ink)' : 'var(--tx3)'} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Top Workbench Toolbar */}
        <div
          style={{
            ...CARD,
            padding: phone ? '8px 12px' : '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          {/* File Meta */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Icon name="code" size={15} color="var(--accTx)" />
            <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {file?.name ?? 'No file selected'}
            </span>
            <span style={{ fontSize: 10.5, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {src.split('\n').length} lines
            </span>
          </div>

          {/* Action Buttons Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {/* Quick Templates Drawer Launcher on Phone */}
            {phone && (
              <button
                onClick={() => {
                  playClick();
                  setShowTemplatesModal(true);
                }}
                className="hov k-squish"
                title="3D Algorithm Templates"
                aria-label="3D Algorithm Templates"
                style={{
                  minHeight: 38,
                  padding: '0 10px',
                  borderRadius: 8,
                  background: 'var(--card2)',
                  border: '1px solid var(--line2)',
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--pal-amber)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                }}
              >
                <Icon name="spark" size={13} color="var(--pal-amber)" />
                <span>Templates</span>
              </button>
            )}

            {/* Run Button */}
            <button
              onClick={doRun}
              disabled={!file}
              className="acc k-squish"
              title="Run & Trace Execution (Ctrl+Enter / ⌘↵)"
              aria-label="Run and Compile"
              style={{
                minHeight: 38,
                padding: '0 14px',
                borderRadius: 8,
                background: 'var(--acc)',
                color: 'var(--accent-ink)',
                fontSize: 12,
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 10px color-mix(in srgb, var(--acc) 30%, transparent)',
                opacity: file ? 1 : 0.4,
              }}
            >
              <Icon name="play" size={12} color="var(--accent-ink)" />
              <span>Run (⌘↵)</span>
            </button>

            {/* Gemini AI 3D/2.5D/2D Simulation Button */}
            <button
              onClick={() => void doAiSimulate()}
              disabled={!file || isSimulating}
              className="hov k-squish"
              title="Generate 3D/2.5D/2D Gemini AI Simulation of Java code"
              aria-label="Gemini AI Simulation"
              style={{
                minHeight: 38,
                padding: '0 12px',
                borderRadius: 8,
                background: 'color-mix(in srgb, var(--pal-amber) 16%, var(--card2))',
                border: '1px solid color-mix(in srgb, var(--pal-amber) 40%, transparent)',
                color: 'var(--pal-amber)',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                opacity: file && !isSimulating ? 1 : 0.5,
              }}
            >
              <Icon name="spark" size={14} color="var(--pal-amber)" />
              <span>{isSimulating ? 'Simulating...' : '✨ AI Simulate'}</span>
            </button>

            {/* Desktop Layout Mode Switcher */}
            {!phone && (
              <div
                style={{
                  display: 'flex',
                  gap: 2,
                  background: 'var(--card2)',
                  padding: 2,
                  borderRadius: 8,
                  border: '1px solid var(--line2)',
                }}
              >
                {(
                  [
                    ['split', 'Split View'],
                    ['3d-full', '3D Focus'],
                    ['code-full', 'Code Focus'],
                  ] as [LayoutMode, string][]
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => {
                      playTick();
                      setLayoutMode(mode);
                    }}
                    className="k-squish"
                    style={{
                      padding: '5px 9px',
                      borderRadius: 6,
                      fontSize: 10.5,
                      fontWeight: 700,
                      border: 'none',
                      background: layoutMode === mode ? 'var(--acc)' : 'transparent',
                      color: layoutMode === mode ? 'var(--accent-ink)' : 'var(--tx3)',
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Delete File Action */}
            <button
              onClick={() => {
                if (!file) return;
                del.mutate({ id: file.id }, { onSuccess: () => { setSelId(null); toast(`${file.name} deleted`); } });
              }}
              className="hov k-squish"
              title="Delete File"
              aria-label="Delete File"
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                display: 'grid',
                placeItems: 'center',
                background: 'var(--card2)',
                border: '1px solid var(--line2)',
                cursor: 'pointer',
              }}
            >
              <Icon name="trash" size={13} color="var(--tx3)" />
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* WORKBENCH CONTENT: Mobile Active Tab View OR Desktop Multi-Pane View     */}
        {/* ========================================================================= */}

        {phone ? (
          /* Mobile Single Pane View (Full Comfort Height, No Long Scrolling) */
          <div style={{ flex: 1, minHeight: 'calc(100dvh - 240px)', display: 'flex', flexDirection: 'column' }}>
            {mobileTab === 'code' && (
              <div style={{ ...CARD, padding: '10px 12px', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 'calc(100dvh - 240px)' }}>
                <LiveCodeEditor
                  src={src}
                  onChange={setSrc}
                  activeLine={activeLine}
                  errorLine={result?.error?.line ?? null}
                />
              </div>
            )}

            {mobileTab === '3d' && (
              <div style={{ ...CARD, padding: '10px 12px', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 'calc(100dvh - 240px)', position: 'relative' }}>
                <Java3DVisualizer
                  frames={frames}
                  heap={heap}
                  series={result?.series || []}
                  activeLine={activeLine}
                  step={step}
                  stepNote={step?.note}
                  phone={true}
                  aiSimulation={aiSimulation}
                />
              </div>
            )}

            {mobileTab === 'console' && (
              <div style={{ ...CARD, padding: '12px 14px', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 'calc(100dvh - 240px)' }}>
                <TerminalConsole
                  file={file}
                  result={result}
                  consoleOutput={consoleOutput}
                  stepIndex={at}
                  onRun={doRun}
                />
              </div>
            )}

            {mobileTab === 'memory' && (
              <div style={{ ...CARD, padding: '12px 14px', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 'calc(100dvh - 240px)' }}>
                <MemoryInspector
                  frames={frames}
                  heap={heap}
                />
              </div>
            )}

            {mobileTab === 'files' && mobileFilesPane}
          </div>
        ) : (
          /* Desktop Split or Full Workbench View */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                layoutMode === 'code-full' || layoutMode === '3d-full'
                  ? '1fr'
                  : '1fr 1.15fr',
              gap: 12,
              alignItems: 'stretch',
              minHeight: 460,
              flex: 1,
            }}
          >
            {/* Left Desktop Pane: VS Code Style Live Code Editor */}
            {(layoutMode === 'split' || layoutMode === 'code-full') && (
              <div style={{ ...CARD, padding: '10px 12px', display: 'flex', flexDirection: 'column', minHeight: 380, flex: 1 }}>
                <LiveCodeEditor
                  src={src}
                  onChange={setSrc}
                  activeLine={activeLine}
                  errorLine={result?.error?.line ?? null}
                />
              </div>
            )}

            {/* Right Desktop Pane: Multi-Tab Interactive Inspector */}
            {(layoutMode === 'split' || layoutMode === '3d-full') && (
              <div style={{ ...CARD, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 380 }}>
                {/* Tab Selector Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(
                      [
                        ['3d', '🌌 3D World'],
                        ['console', '💻 Terminal'],
                        ['memory', '📦 Memory & Stack'],
                        ['series', '📊 Series'],
                      ] as [RightTab, string][]
                    ).map(([t, label]) => (
                      <button
                        key={t}
                        onClick={() => {
                          playTick();
                          setActiveTab(t);
                        }}
                        className="k-squish"
                        style={{
                          padding: '5px 10px',
                          borderRadius: 7,
                          fontSize: 11,
                          fontWeight: 700,
                          border: 'none',
                          background: activeTab === t ? 'color-mix(in srgb, var(--acc) 18%, var(--card2))' : 'transparent',
                          color: activeTab === t ? 'var(--accTx)' : 'var(--tx3)',
                          cursor: 'pointer',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {result && (
                    <span
                      title={result.truncated ? `Trace recording capped at ${result.trace.length} steps — the program ran past this point.` : undefined}
                      style={{
                        fontSize: 10.5,
                        color: result.error ? PAL.coral : result.truncated ? PAL.amber : PAL.mint,
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 700,
                      }}
                    >
                      {result.error
                        ? 'Error'
                        : `${result.ms}ms · ${result.trace.length}${result.truncated ? '+' : ''} trace steps`}
                    </span>
                  )}
                </div>

                {/* Tab 1: 3D Visualization Canvas */}
                {activeTab === '3d' && (
                  <div style={{ flex: 1, minHeight: 340, display: 'flex', flexDirection: 'column' }}>
                    <Java3DVisualizer
                      frames={frames}
                      heap={heap}
                      series={result?.series || []}
                      activeLine={activeLine}
                      step={step}
                      stepNote={step?.note}
                      phone={phone}
                      aiSimulation={aiSimulation}
                    />
                  </div>
                )}

                {/* Tab 2: Terminal Console */}
                {activeTab === 'console' && (
                  <div style={{ flex: 1, minHeight: 320, display: 'flex', flexDirection: 'column' }}>
                    <TerminalConsole
                      file={file}
                      result={result}
                      consoleOutput={consoleOutput}
                      stepIndex={at}
                      onRun={doRun}
                    />
                  </div>
                )}

                {/* Tab 3: Memory & Stack Inspector */}
                {activeTab === 'memory' && (
                  <div style={{ flex: 1, minHeight: 320, display: 'flex', flexDirection: 'column' }}>
                    <MemoryInspector
                      frames={frames}
                      heap={heap}
                    />
                  </div>
                )}

                {/* Tab 4: Numerical Series Chart */}
                {activeTab === 'series' && (
                  <div style={{ flex: 1, minHeight: 320, display: 'flex', flexDirection: 'column' }}>
                    <Series values={result?.series || []} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Non-Obstructive Floating Trace Playback HUD */}
        {result && result.trace.length > 1 && (
          <TracePlaybackHUD
            result={result}
            currentStepIndex={at}
            isPlaying={playing}
            onPlayToggle={() => {
              if (at === null) setAt(0);
              setPlaying((p) => !p);
            }}
            onStepChange={(stepIdx) => {
              setPlaying(false);
              setAt(stepIdx);
            }}
            speed={speed}
            onSpeedChange={setSpeed}
            phone={phone}
          />
        )}
      </div>

      {/* Quick Template Picker Modal Bottom Sheet for Mobile */}
      {showTemplatesModal && (
        <TemplatePickerModal
          onSelect={(tmpl) => {
            loadTemplate(tmpl);
            setShowTemplatesModal(false);
          }}
          onClose={() => setShowTemplatesModal(false)}
          phone={phone}
        />
      )}
    </div>
  );
}

// =============================================================================
// SUB-COMPONENTS: Terminal Console, Memory Inspector, Code Viewer, Series Chart
// =============================================================================

/** Rich Monospace Terminal Console */
function TerminalConsole({
  file,
  result,
  consoleOutput,
  stepIndex,
  onRun,
}: {
  file: JFile | null;
  result: RunResult | null;
  consoleOutput: string[];
  /** Scrubber position. null means the run's final state. */
  stepIndex: number | null;
  onRun: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyOutput = () => {
    playTick();
    const text = consoleOutput.join('\n');
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    toast('Terminal output copied');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        flex: 1,
        minHeight: 320,
        borderRadius: 10,
        background: '#0D0E15',
        border: '1px solid var(--line2)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Terminal Top Window Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: 'rgba(255,255,255,0.03)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#FF5F56' }} />
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#FFBD2E' }} />
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#27C93F' }} />
          <span style={{ fontSize: 11, fontFamily: MONO, color: 'var(--tx3)', marginLeft: 6 }}>
            java-terminal ~ {file?.name ?? 'Main.java'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={copyOutput}
            disabled={!result || consoleOutput.length === 0}
            className="hov k-squish"
            title="Copy Terminal Output"
            aria-label="Copy Output"
            style={{
              padding: '3px 8px',
              borderRadius: 6,
              background: 'var(--card2)',
              border: '1px solid var(--line2)',
              fontSize: 10.5,
              fontWeight: 700,
              color: 'var(--tx2)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer',
              opacity: consoleOutput.length ? 1 : 0.4,
            }}
          >
            <Icon name={copied ? 'check' : 'copy'} size={11} color={copied ? PAL.mint : 'var(--tx2)'} />
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            onClick={onRun}
            className="acc k-squish"
            title="Re-run (⌘↵)"
            aria-label="Re-run"
            style={{
              padding: '3px 8px',
              borderRadius: 6,
              background: 'var(--acc)',
              color: 'var(--accent-ink)',
              fontSize: 10.5,
              fontWeight: 800,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Icon name="play" size={10} color="var(--accent-ink)" />
            <span>Run</span>
          </button>
        </div>
      </div>

      {/* Terminal Body */}
      <div
        style={{
          flex: 1,
          padding: '12px 14px',
          fontFamily: MONO,
          fontSize: 12,
          lineHeight: 1.65,
          overflowY: 'auto',
          color: 'var(--tx)',
        }}
        className="navsb"
      >
        {!result ? (
          <div style={{ color: 'var(--tx3)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div>$ javac {file?.name ?? 'Main.java'}</div>
            <div style={{ color: 'var(--tx3)', fontStyle: 'italic' }}>
              Press Run (⌘↵) to compile and view execution output.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Command invocation lines */}
            <div style={{ color: '#82AAFF' }}>
              <span style={{ color: '#C792EA' }}>$</span> javac {file?.name ?? 'Main.java'}
              <br />
              <span style={{ color: '#C792EA' }}>$</span> java {(file?.name ?? 'Main.java').replace(/\.java$/, '')}
            </div>

            {/* Standard Out */}
            {consoleOutput.length > 0 ? (
              <div style={{ color: '#EFEDF5', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {consoleOutput.join('\n')}
              </div>
            ) : !result.error ? (
              <div style={{ color: 'var(--tx3)', fontStyle: 'italic' }}>[No output generated via System.out]</div>
            ) : null}

            {/* Error callout if exception occurred */}
            {result.error && (
              <div
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: 'color-mix(in srgb, var(--pal-coral) 15%, transparent)',
                  border: '1px solid var(--pal-coral)',
                  color: PAL.coral,
                  fontSize: 11.5,
                  fontWeight: 700,
                }}
              >
                Line {result.error.line}: {result.error.message}
              </div>
            )}

            {/* Trace was cut short by the recorder's cap: the console above is
                complete, but the replay stops before the program did. */}
            {result.truncated && (
              <div
                style={{
                  padding: '7px 10px',
                  borderRadius: 8,
                  background: 'color-mix(in srgb, var(--pal-amber) 14%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--pal-amber) 45%, transparent)',
                  color: PAL.amber,
                  fontSize: 11,
                  fontWeight: 700,
                  lineHeight: 1.5,
                }}
              >
                Trace recording stopped at {result.trace.length} steps. The program ran to the end and
                this output is complete, but the step replay covers only the first {result.trace.length} statements.
              </div>
            )}

            {/* Process status banner. While scrubbed this must not claim the
                process finished — at step N it has not. */}
            <div
              style={{
                marginTop: 6,
                paddingTop: 8,
                borderTop: '1px solid rgba(255,255,255,0.06)',
                color: stepIndex !== null ? PAL.amber : result.error ? PAL.coral : PAL.mint,
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              {stepIndex !== null
                ? `⏸ Replaying step ${stepIndex + 1} of ${result.trace.length} — ${consoleOutput.length} of ${result.out.length} output line${result.out.length === 1 ? '' : 's'} printed so far`
                : result.error
                ? '✗ Process exited with code 1 (Execution Failed)'
                : `✓ Process finished with exit code 0 (${result.ms}ms · ${result.trace.length} trace steps)`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Rich Memory & Stack Inspector */
function MemoryInspector({
  frames,
  heap,
}: {
  frames: FrameSnap[];
  heap: HeapObj[];
}) {
  return (
    <div style={{ flex: 1, minHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }} className="navsb">
      {/* Call Stack Section */}
      <div style={{ background: 'var(--card2)', borderRadius: 10, padding: 12, border: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="layers" size={13} color="var(--accTx)" />
            <span style={KICKER}>Call Stack Frames ({frames.length})</span>
          </div>
          <span style={{ fontSize: 10, color: 'var(--tx3)' }}>Top frame is active</span>
        </div>

        {frames.length === 0 ? (
          <div style={{ fontSize: 11.5, color: 'var(--tx3)', padding: '6px 0' }}>No active stack frames.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...frames].reverse().map((f: FrameSnap, i: number) => {
              const isTop = i === 0;
              return (
                <div
                  key={`${f.sig}-${i}`}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: isTop ? 'color-mix(in srgb, var(--acc) 10%, var(--card))' : 'var(--card)',
                    border: `1px solid ${isTop ? 'color-mix(in srgb, var(--acc) 35%, transparent)' : 'var(--line2)'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: isTop ? 'var(--accTx)' : 'var(--tx)' }}>
                      {f.sig}
                    </span>
                    <span style={{ fontSize: 9.5, padding: '1px 5px', borderRadius: 4, background: 'var(--card2)', color: 'var(--tx3)', fontWeight: 700 }}>
                      Frame #{frames.length - i}
                    </span>
                  </div>

                  {f.locals.length === 0 ? (
                    <div style={{ fontSize: 10.5, color: 'var(--tx3)', fontStyle: 'italic' }}>No local variables in scope.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {f.locals.map((l: Local) => (
                        <div
                          key={l.name}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: 11,
                            fontFamily: MONO,
                            padding: '2px 0',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ color: 'var(--tx3)', fontSize: 10, background: 'var(--card2)', padding: '1px 4px', borderRadius: 4 }}>
                              {l.type}
                            </span>
                            <span style={{ color: 'var(--tx)', fontWeight: 700 }}>{l.name}</span>
                          </div>
                          <span
                            style={{
                              color: l.type === 'String' ? PAL.mint : l.type.includes('[]') ? PAL.cyan : PAL.amber,
                              fontWeight: 700,
                            }}
                          >
                            {l.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Heap Memory Section */}
      <div style={{ background: 'var(--card2)', borderRadius: 10, padding: 12, border: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="grid" size={13} color="var(--pal-mint)" />
            <span style={KICKER}>Heap Memory Objects ({heap.length})</span>
          </div>
          <span style={{ fontSize: 10, color: 'var(--tx3)' }}>Arrays & Objects</span>
        </div>

        {heap.length === 0 ? (
          <div style={{ fontSize: 11.5, color: 'var(--tx3)', padding: '6px 0' }}>No heap objects allocated.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {heap.map((h: HeapObj) => (
              <div
                key={h.name}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: 'var(--card)',
                  border: '1px solid var(--line2)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontFamily: MONO, marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: PAL.mint, fontWeight: 800 }}>{h.name}</span>
                    <span style={{ color: 'var(--tx3)', fontSize: 10 }}>({h.type})</span>
                  </div>
                  <span style={{ color: 'var(--tx3)', fontSize: 10.5, fontVariantNumeric: 'tabular-nums' }}>
                    {h.size} elements
                  </span>
                </div>

                {/* Array Cells Grid */}
                <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 4 }} className="hbar">
                  {(h.cells || []).map((c: string, cIdx: number) => (
                    <div
                      key={cIdx}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 2,
                        flex: 'none',
                      }}
                    >
                      <div
                        style={{
                          minWidth: 32,
                          height: 30,
                          borderRadius: 6,
                          display: 'grid',
                          placeItems: 'center',
                          background: 'var(--card2)',
                          border: '1px solid var(--line2)',
                          fontFamily: MONO,
                          fontSize: 11,
                          fontWeight: 800,
                          color: 'var(--tx)',
                          padding: '0 4px',
                        }}
                      >
                        {c}
                      </div>
                      <span style={{ fontSize: 9, color: 'var(--tx3)', fontFamily: MONO }}>[{cIdx}]</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** VS Code Style Live Syntax-Highlighting Code Editor */
function LiveCodeEditor({
  src,
  onChange,
  activeLine,
  errorLine,
}: {
  src: string;
  onChange: (val: string) => void;
  activeLine: number | null;
  errorLine: number | null;
}) {
  const { prefs } = usePrefs();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const syntaxRef = useRef<HTMLDivElement | null>(null);
  const lineNumbersRef = useRef<HTMLDivElement | null>(null);
  const [cursorLine, setCursorLine] = useState<number>(1);
  const EASE = prefs.motion ? 'background .18s cubic-bezier(.16, 1, .3, 1), color .18s cubic-bezier(.16, 1, .3, 1)' : 'none';

  // Synchronize scroll between textarea, syntax highlight backdrop, and line numbers
  const handleScroll = () => {
    if (!textareaRef.current) return;
    const { scrollTop, scrollLeft } = textareaRef.current;
    if (syntaxRef.current) {
      syntaxRef.current.scrollTop = scrollTop;
      syntaxRef.current.scrollLeft = scrollLeft;
    }
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = scrollTop;
    }
  };

  // Track cursor position line
  const updateCursorLine = () => {
    if (!textareaRef.current) return;
    const pos = textareaRef.current.selectionStart;
    const textBefore = src.slice(0, pos);
    const line = textBefore.split('\n').length;
    setCursorLine(line);
  };

  // Smart IDE Keyboard Handlers (Tab, Auto-Indent on Enter, Auto-Brackets)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const { selectionStart: a, selectionEnd: b, value } = el;

    // 1. Tab & Shift+Tab handling
    if (e.key === 'Tab') {
      e.preventDefault();
      if (!e.shiftKey) {
        // Tab -> Insert 4 spaces
        const next = `${value.slice(0, a)}    ${value.slice(b)}`;
        onChange(next);
        requestAnimationFrame(() => {
          el.setSelectionRange(a + 4, a + 4);
          updateCursorLine();
        });
      } else {
        // Shift+Tab -> Unindent 4 spaces
        const lastNewline = value.lastIndexOf('\n', a - 1);
        const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
        const linePrefix = value.slice(lineStart, lineStart + 4);
        const spaces = linePrefix.match(/^ +/)?.[0].length || 0;
        if (spaces > 0) {
          const count = Math.min(spaces, 4);
          const next = value.slice(0, lineStart) + value.slice(lineStart + count);
          onChange(next);
          requestAnimationFrame(() => {
            const newPos = Math.max(lineStart, a - count);
            el.setSelectionRange(newPos, newPos);
            updateCursorLine();
          });
        }
      }
      return;
    }

    // 2. Enter -> Auto-indent to match previous line (plus 4 spaces if opening bracket)
    if (e.key === 'Enter') {
      e.preventDefault();
      const lastNewline = value.lastIndexOf('\n', a - 1);
      const curLine = value.slice(lastNewline + 1, a);
      const matchIndent = curLine.match(/^(\s*)/);
      let indent = matchIndent ? matchIndent[1] : '';
      const trimmed = curLine.trim();
      const opensBrace = trimmed.endsWith('{') || trimmed.endsWith('(') || trimmed.endsWith('[');
      if (opensBrace) {
        indent += '    ';
      }
      const next = `${value.slice(0, a)}\n${indent}${value.slice(b)}`;
      onChange(next);
      requestAnimationFrame(() => {
        const newPos = a + 1 + indent.length;
        el.setSelectionRange(newPos, newPos);
        updateCursorLine();
      });
      return;
    }

    // 3. Auto-closing pairs: { } ( ) [ ] " " ' '
    const PAIRS: Record<string, string> = {
      '{': '}',
      '(': ')',
      '[': ']',
      '"': '"',
      "'": "'",
    };
    if (PAIRS[e.key]) {
      const open = e.key;
      const close = PAIRS[open];
      // If typing closing quote right before existing closing quote, step over
      if ((open === '"' || open === "'") && value[a] === open && a === b) {
        e.preventDefault();
        el.setSelectionRange(a + 1, a + 1);
        updateCursorLine();
        return;
      }
      e.preventDefault();
      const selected = value.slice(a, b);
      const next = `${value.slice(0, a)}${open}${selected}${close}${value.slice(b)}`;
      onChange(next);
      requestAnimationFrame(() => {
        el.setSelectionRange(a + 1, a + 1 + selected.length);
        updateCursorLine();
      });
      return;
    }

    // 4. Skip closing bracket if typed directly before it
    if (['}', ')', ']'].includes(e.key) && value[a] === e.key && a === b) {
      e.preventDefault();
      el.setSelectionRange(a + 1, a + 1);
      updateCursorLine();
      return;
    }
  };

  // Syntax highlighting tokenization
  const highlightedRows = useMemo(() => {
    const rows: { text: string; cls: string }[][] = [[]];
    for (const piece of highlight(src)) {
      const parts = piece.text.split('\n');
      parts.forEach((part, i) => {
        if (i > 0) rows.push([]);
        if (part) rows[rows.length - 1].push({ text: part, cls: piece.cls });
      });
    }
    return rows;
  }, [src]);

  const lineCount = Math.max(src.split('\n').length, 1);

  // Auto-scroll to active execution line during trace scrubbing. Smooth is an
  // animation like any other, so it is gated on the motion preference.
  useEffect(() => {
    if (activeLine === null || !textareaRef.current) return;
    const lineTop = (activeLine - 1) * 21;
    textareaRef.current.scrollTo({ top: Math.max(0, lineTop - 80), behavior: prefs.motion ? 'smooth' : 'auto' });
  }, [activeLine, prefs.motion]);

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flex: 1,
        minHeight: 340,
        height: '100%',
        background: 'var(--card2)',
        borderRadius: 10,
        border: '1px solid var(--line2)',
        overflow: 'hidden',
      }}
    >
      {/* Line Numbers & Execution Gutter */}
      <div
        ref={lineNumbersRef}
        style={{
          width: 44,
          flex: 'none',
          padding: '12px 0',
          background: 'color-mix(in srgb, var(--card) 60%, var(--card2))',
          borderRight: '1px solid var(--line)',
          userSelect: 'none',
          fontFamily: MONO,
          fontSize: 12,
          lineHeight: '21px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {Array.from({ length: lineCount }, (_, i) => {
          const lineNum = i + 1;
          const isExec = lineNum === activeLine;
          const isErr = lineNum === errorLine;
          const isCur = lineNum === cursorLine;

          return (
            <div
              key={lineNum}
              data-line={lineNum}
              style={{
                height: 21,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                paddingRight: 8,
                fontSize: 11,
                fontVariantNumeric: 'tabular-nums',
                color: isErr
                  ? PAL.coral
                  : isExec
                  ? 'var(--accTx)'
                  : isCur
                  ? 'var(--tx)'
                  : 'var(--tx3)',
                fontWeight: isExec || isErr || isCur ? 800 : 500,
                background: isErr
                  ? 'color-mix(in srgb, var(--pal-coral) 25%, transparent)'
                  : isExec
                  ? 'color-mix(in srgb, var(--acc) 25%, transparent)'
                  : undefined,
                transition: EASE,
              }}
            >
              {lineNum}
            </div>
          );
        })}
      </div>

      {/* Editor Surface: Transparent Textarea over Live Syntax Highlight Backdrop */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          minWidth: 0,
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {/* Background Syntax Highlighted Render Layer */}
        <div
          ref={syntaxRef}
          aria-hidden
          className="navsb"
          style={{
            position: 'absolute',
            inset: 0,
            padding: '12px 14px',
            fontFamily: MONO,
            fontSize: 12.5,
            lineHeight: '21px',
            tabSize: 4,
            whiteSpace: 'pre',
            overflow: 'hidden',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {highlightedRows.map((row, i) => {
            const lineNum = i + 1;
            const isExec = lineNum === activeLine;
            const isErr = lineNum === errorLine;

            return (
              <div
                key={lineNum}
                style={{
                  height: 21,
                  display: 'flex',
                  alignItems: 'center',
                  background: isErr
                    ? 'color-mix(in srgb, var(--pal-coral) 18%, transparent)'
                    : isExec
                    ? 'color-mix(in srgb, var(--acc) 18%, transparent)'
                    : undefined,
                  borderRadius: 4,
                  transition: EASE,
                }}
              >
                {row.length === 0 ? (
                  <span> </span>
                ) : (
                  row.map((p, j) => (
                    <span key={j} style={{ color: HUE[p.cls] ?? 'var(--tx)' }}>
                      {p.text}
                    </span>
                  ))
                )}
              </div>
            );
          })}
        </div>

        {/* Foreground Editable Transparent Textarea (VS Code Mode) */}
        <textarea
          ref={textareaRef}
          value={src}
          onChange={(e) => {
            onChange(e.target.value);
            updateCursorLine();
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={updateCursorLine}
          onClick={updateCursorLine}
          onScroll={handleScroll}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          aria-label="Java Code Editor"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            padding: '12px 14px',
            fontFamily: MONO,
            fontSize: 12.5,
            lineHeight: '21px',
            tabSize: 4,
            whiteSpace: 'pre',
            color: 'transparent',
            caretColor: 'var(--acc)',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            overflow: 'auto',
          }}
          className="navsb"
        />
      </div>
    </div>
  );
}

/** Numerical Output Series Graph */
function Series({ values }: { values: number[] }) {
  if (!values.length) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', minHeight: 240, color: 'var(--tx3)', fontSize: 12 }}>
        No numerical series logged via System.out yet.
      </div>
    );
  }
  const max = Math.max(...values.map(Math.abs), 1);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const avgVal = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={KICKER}>Numerical Output Graph</span>
        {/* The trace carries no per-step series count, so this is always the
            whole run — say so rather than let it read as the scrubbed step. */}
        <span style={{ fontSize: 10.5, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
          {values.length > 120 ? `first 120 of ${values.length}` : `${values.length} numbers`} · whole run
        </span>
      </div>

      <div
        className="hbar"
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 3,
          flex: 1,
          minHeight: 180,
          overflowX: 'auto',
          paddingBottom: 6,
          background: 'var(--card2)',
          borderRadius: 8,
          padding: '10px 8px 6px',
        }}
      >
        {values.slice(0, 120).map((v, i) => (
          <span
            key={i}
            title={`Index [${i}]: ${v}`}
            style={{
              flex: '1 0 10px',
              minWidth: 10,
              borderRadius: '4px 4px 2px 2px',
              height: `${Math.max(6, (Math.abs(v) / max) * 100)}%`,
              background: v < 0 ? PAL.coral : 'var(--acc)',
              transition: 'height .3s ease',
            }}
          />
        ))}
      </div>

      {/* Summary Statistics Card */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(60px, 1fr))',
          gap: 8,
          background: 'var(--card2)',
          padding: '8px 10px',
          borderRadius: 8,
          fontSize: 10.5,
          fontFamily: MONO,
        }}
      >
        <div><span style={{ color: 'var(--tx3)' }}>Count:</span> <strong style={{ color: 'var(--tx)' }}>{values.length}</strong></div>
        <div><span style={{ color: 'var(--tx3)' }}>First:</span> <strong style={{ color: 'var(--tx)' }}>{values[0]}</strong></div>
        <div><span style={{ color: 'var(--tx3)' }}>Min:</span> <strong style={{ color: PAL.coral }}>{minVal}</strong></div>
        <div><span style={{ color: 'var(--tx3)' }}>Peak:</span> <strong style={{ color: PAL.mint }}>{maxVal}</strong></div>
        <div><span style={{ color: 'var(--tx3)' }}>Avg:</span> <strong style={{ color: PAL.amber }}>{avgVal}</strong></div>
        <div><span style={{ color: 'var(--tx3)' }}>Last:</span> <strong style={{ color: 'var(--accTx)' }}>{values[values.length - 1]}</strong></div>
      </div>
    </div>
  );
}

/** Mobile Quick Template Picker Bottom Sheet */
function TemplatePickerModal({
  onSelect,
  onClose,
  phone,
}: {
  onSelect: (tmpl: JavaTemplate) => void;
  onClose: () => void;
  phone: boolean;
}) {
  useOverlayBack(true, onClose);

  const categories = useMemo(() => {
    const map = new Map<string, JavaTemplate[]>();
    for (const t of JAVA_TEMPLATES) {
      const list = map.get(t.category) ?? [];
      list.push(t);
      map.set(t.category, list);
    }
    return Array.from(map.entries());
  }, []);

  const modalBody = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 140,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: phone ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: phone ? 0 : 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="3D Algorithm Template Library"
        className="k-bloom"
        style={{
          width: 520,
          maxWidth: '100%',
          maxHeight: phone ? '86dvh' : '80dvh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--card)',
          border: '1px solid var(--line2)',
          borderRadius: phone ? '18px 18px 0 0' : 18,
          boxShadow: 'var(--shl)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
          <Icon name="spark" size={16} color="var(--pal-amber)" />
          <h2 style={{ fontSize: 14.5, fontWeight: 800, letterSpacing: '-.02em', flex: 1, color: 'var(--tx)' }}>
            3D Java Algorithm Library
          </h2>
          <button
            onClick={onClose}
            className="hov k-squish"
            aria-label="Close"
            style={{ width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', cursor: 'pointer' }}
          >
            <Icon name="close" size={14} color="var(--tx2)" />
          </button>
        </div>

        {/* Categories & Templates List */}
        <div
          className="navsb"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {categories.map(([category, tmpls]) => (
            <div key={category} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={KICKER}>{category}</span>
                <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {tmpls.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    onClick={() => onSelect(tmpl)}
                    className="hov k-squish"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: 'var(--card2)',
                      border: '1px solid var(--line2)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      gap: 4,
                      minHeight: 44,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx)' }}>{tmpl.name}</span>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 5, background: 'var(--card)', color: 'var(--accTx)', fontWeight: 700 }}>
                        Load & Run
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--tx3)', lineHeight: 1.4 }}>
                      {tmpl.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(modalBody, document.body);
}
