'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from './Icon';
import { supabase, currentUserId } from '@/lib/supabase';
import { defineMutation } from '@/lib/offline';
import { toast } from '@/lib/toast';
import { PAL } from '@/lib/pal';
import { useLayout } from '@/lib/useLayout';
import { run, highlight, type RunResult, type Step } from '@/lib/java';
import { ask } from '@/lib/ask';
import { JAVA_TEMPLATES, type JavaTemplate } from '@/lib/javaTemplates';
import { Java3DVisualizer } from './java/Java3DVisualizer';
import { TracePlaybackHUD } from './java/TracePlaybackHUD';

/**
 * Notebooks → Java Lab & 3D Visualizer Workbench.
 *
 * Runs real Java in the browser with full step execution tracing,
 * interactive 3D memory & stack visualization, and a non-obstructive playback HUD.
 */

const CARD: React.CSSProperties = {
  background: 'var(--card)',
  borderRadius: 14,
  boxShadow: 'var(--sh)',
  border: '1px solid var(--line2)',
};
const KICKER: React.CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: '.11em',
  textTransform: 'uppercase',
  color: 'var(--tx3)',
};
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

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
        System.out.println("Hello from ${cls}");
    }
}`;

export function JavaLab() {
  const qc = useQueryClient();
  const { phone } = useLayout();
  const [selId, setSelId] = useState<string | null>(null);
  const [src, setSrc] = useState('');
  const [editing, setEditing] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [at, setAt] = useState<number | null>(null); // scrubber position; null = final state
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [activeTab, setActiveTab] = useState<RightTab>('3d');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('split');

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
  }, [file?.id, file?.src]);

  // Autosave
  useEffect(() => {
    if (!file || src === file.src) return;
    const t = setTimeout(() => save.mutate({ id: file.id, src }), 800);
    return () => clearTimeout(t);
  }, [src, file?.id, file?.src, save]);

  const doRun = useCallback(() => {
    const r = run(src);
    setResult(r);
    setAt(null);
    setPlaying(false);
    if (r.error) {
      toast(`Line ${r.error.line}: ${r.error.message}`);
    } else {
      toast(`Compiled & Executed in ${r.ms}ms!`);
    }
  }, [src]);

  // ⌘↵ / Ctrl+↵ to run
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

  // Playback loop with variable speed
  useEffect(() => {
    if (!playing || !result?.trace.length) return;
    const delay = Math.max(60, Math.round(280 / speed));
    const t = setInterval(() => {
      setAt((cur) => {
        const next = (cur ?? -1) + 1;
        if (next >= result.trace.length) {
          setPlaying(false);
          return null;
        }
        return next;
      });
    }, delay);
    return () => clearInterval(t);
  }, [playing, result, speed]);

  const step: Step | null = result && at !== null ? result.trace[at] ?? null : null;
  const frames = step ? step.frames : result?.frames ?? [];
  const heap = step ? step.heap : result?.heap ?? [];
  const consoleOutput = result ? (step ? result.out.slice(0, step.out) : result.out) : [];
  const activeLine = step?.line ?? null;

  const newFile = async () => {
    const n = await ask('New class', { initial: `Scratch${files.length + 1}`, placeholder: 'Class name', confirmLabel: 'Create' });
    if (!n) return;
    const cls = n.replace(/[^A-Za-z0-9_]/g, '') || 'Scratch';
    add.mutate(
      { id: crypto.randomUUID(), name: `${cls}.java`, src: STARTER(cls) },
      { onSuccess: () => toast(`${cls}.java created`) }
    );
  };

  const loadTemplate = (tmpl: JavaTemplate) => {
    const existing = files.find((f) => f.name === tmpl.name);
    if (existing) {
      setSelId(existing.id);
      toast(`Opened ${tmpl.name}`);
      return;
    }
    const newId = crypto.randomUUID();
    add.mutate(
      { id: newId, name: tmpl.name, src: tmpl.src },
      {
        onSuccess: () => {
          setSelId(newId);
          toast(`Loaded 3D template: ${tmpl.name}`);
        },
      }
    );
  };

  const leftSidebar = (
    <div style={{ width: phone ? '100%' : 220, flex: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* File Explorer */}
      <div style={{ ...CARD, padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={KICKER}>Source Files</span>
          <button
            onClick={() => void newFile()}
            className="hov k-squish"
            title="New Java File"
            aria-label="New Java File"
            style={{ width: 22, height: 22, borderRadius: 6, display: 'grid', placeItems: 'center', background: 'var(--card2)', border: '1px solid var(--line2)' }}
          >
            <Icon name="plus" size={12} color="var(--tx2)" />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {files.map((f) => {
            const on = f.id === file?.id;
            return (
              <button
                key={f.id}
                onClick={() => setSelId(f.id)}
                className="k-chip"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 9px',
                  borderRadius: 8,
                  background: on ? 'color-mix(in srgb, var(--acc) 14%, var(--card2))' : 'transparent',
                  border: `1px solid ${on ? 'color-mix(in srgb, var(--acc) 35%, transparent)' : 'transparent'}`,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Icon name="code" size={13} color={on ? 'var(--accTx)' : 'var(--tx3)'} />
                <span style={{ flex: 1, fontSize: 12, fontWeight: on ? 700 : 500, color: on ? 'var(--tx)' : 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.name}
                </span>
              </button>
            );
          })}
          {files.length === 0 && <div style={{ fontSize: 11, color: 'var(--tx3)', padding: '4px 2px' }}>No files yet.</div>}
        </div>
      </div>

      {/* 3D Algorithm Library */}
      <div style={{ ...CARD, padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Icon name="spark" size={13} color="var(--pal-amber)" />
          <span style={KICKER}>3D Templates</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
                padding: '6px 8px',
                borderRadius: 7,
                background: 'var(--card2)',
                border: '1px solid var(--line)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx)' }}>{tmpl.name}</span>
              <span style={{ fontSize: 9.5, color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                {tmpl.description}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: phone ? 'column' : 'row', gap: 12, flex: 1, minHeight: 0, position: 'relative' }}>
      {leftSidebar}

      {/* Main Workbench Area */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', position: 'relative' }} className="navsb">
        {/* Top Workbench Toolbar */}
        <div
          style={{
            ...CARD,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          {/* File Meta */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="code" size={15} color="var(--accTx)" />
            <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--tx)' }}>{file?.name ?? 'No file'}</span>
            <span style={{ fontSize: 10.5, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
              {src.split('\n').length} lines
            </span>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Run Button */}
            <button
              onClick={doRun}
              disabled={!file}
              className="acc k-squish"
              title="Run & Compile (Ctrl+Enter)"
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                background: 'var(--acc)',
                color: 'var(--ink)',
                fontSize: 12,
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                boxShadow: '0 2px 10px color-mix(in srgb, var(--acc) 30%, transparent)',
                opacity: file ? 1 : 0.4,
              }}
            >
              <Icon name="play" size={12} color="var(--ink)" />
              <span>Run (⌘↵)</span>
            </button>

            {/* View / Edit Mode */}
            <button
              onClick={() => setEditing((v) => !v)}
              className="hov k-squish"
              style={{
                padding: '6px 11px',
                borderRadius: 8,
                background: 'var(--card2)',
                border: '1px solid var(--line2)',
                fontSize: 11.5,
                fontWeight: 700,
                color: 'var(--tx2)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Icon name={editing ? 'eye' : 'edit'} size={12} color="var(--tx2)" />
              <span>{editing ? 'View' : 'Edit'}</span>
            </button>

            {/* Layout Toggle on Desktop */}
            {!phone && (
              <div style={{ display: 'flex', gap: 2, background: 'var(--card2)', padding: 2, borderRadius: 8, border: '1px solid var(--line2)' }}>
                {(
                  [
                    ['split', 'Split'],
                    ['3d-full', '3D Focus'],
                    ['code-full', 'Code'],
                  ] as [LayoutMode, string][]
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => setLayoutMode(mode)}
                    className="k-squish"
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      fontSize: 10.5,
                      fontWeight: 700,
                      border: 'none',
                      background: layoutMode === mode ? 'var(--acc)' : 'transparent',
                      color: layoutMode === mode ? 'var(--ink)' : 'var(--tx3)',
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Delete File */}
            <button
              onClick={() => {
                if (!file) return;
                del.mutate({ id: file.id }, { onSuccess: () => { setSelId(null); toast(`${file.name} deleted`); } });
              }}
              className="hov k-squish"
              title="Delete File"
              style={{
                width: 30,
                height: 30,
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

        {/* Workbench Layout Area (Split or Full) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              phone || layoutMode === 'code-full' || layoutMode === '3d-full'
                ? '1fr'
                : '1fr 1.15fr',
            gap: 12,
            alignItems: 'stretch',
            minHeight: 440,
          }}
        >
          {/* Left Pane: Code Editor */}
          {(layoutMode === 'split' || layoutMode === 'code-full' || phone) && (
            <div style={{ ...CARD, padding: '12px 14px', display: 'flex', flexDirection: 'column', minHeight: 340 }}>
              {editing ? (
                <textarea
                  value={src}
                  onChange={(e) => setSrc(e.target.value)}
                  spellCheck={false}
                  onKeyDown={(e) => {
                    if (e.key !== 'Tab') return;
                    e.preventDefault();
                    const el = e.currentTarget;
                    const { selectionStart: a, selectionEnd: b } = el;
                    const next = `${src.slice(0, a)}    ${src.slice(b)}`;
                    setSrc(next);
                    requestAnimationFrame(() => el.setSelectionRange(a + 4, a + 4));
                  }}
                  aria-label="Java source"
                  style={{
                    width: '100%',
                    flex: 1,
                    minHeight: 320,
                    resize: 'none',
                    padding: 12,
                    borderRadius: 10,
                    background: 'var(--card2)',
                    border: '1px solid var(--line2)',
                    fontFamily: MONO,
                    fontSize: 12.5,
                    lineHeight: 1.65,
                    color: 'var(--tx)',
                    outline: 'none',
                  }}
                />
              ) : (
                <CodeView
                  src={src}
                  activeLine={activeLine}
                  errorLine={result?.error?.line ?? null}
                  onEdit={() => setEditing(true)}
                />
              )}
            </div>
          )}

          {/* Right Pane: Multi-Tab Interactive 3D Inspector */}
          {(layoutMode === 'split' || layoutMode === '3d-full' || phone) && (
            <div style={{ ...CARD, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Tab Selector Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(
                    [
                      ['3d', '🌌 3D World'],
                      ['console', '💻 Console'],
                      ['memory', '📦 Memory & Stack'],
                      ['series', '📊 Series'],
                    ] as [RightTab, string][]
                  ).map(([t, label]) => (
                    <button
                      key={t}
                      onClick={() => setActiveTab(t)}
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
                  <span style={{ fontSize: 10, color: result.error ? PAL.coral : PAL.mint, fontVariantNumeric: 'tabular-nums' }}>
                    {result.error ? 'Error' : `${result.ms}ms · ${result.trace.length} steps`}
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
                    stepNote={step?.note}
                    phone={phone}
                  />
                </div>
              )}

              {/* Tab 2: Terminal Console */}
              {activeTab === 'console' && (
                <div
                  style={{
                    flex: 1,
                    minHeight: 300,
                    borderRadius: 10,
                    background: 'var(--card2)',
                    border: '1px solid var(--line2)',
                    padding: '12px 14px',
                    fontFamily: MONO,
                    fontSize: 12,
                    lineHeight: 1.65,
                    overflowY: 'auto',
                  }}
                  className="navsb"
                >
                  {!result ? (
                    <span style={{ color: 'var(--tx3)' }}>Press Run (⌘↵) to compile and view output.</span>
                  ) : (
                    <>
                      <div style={{ color: 'var(--tx3)', marginBottom: 6 }}>
                        $ javac {file?.name ?? 'Main.java'}
                        <br />$ java {(file?.name ?? 'Main.java').replace(/\.java$/, '')}
                      </div>
                      <div style={{ color: 'var(--tx)', whiteSpace: 'pre-wrap' }}>
                        {consoleOutput.join('\n')}
                      </div>
                      {result.error && (
                        <div style={{ color: PAL.coral, marginTop: 8 }}>
                          Exception on line {result.error.line}: {result.error.message}
                        </div>
                      )}
                      <div style={{ color: result.error ? PAL.coral : PAL.mint, marginTop: 10, fontWeight: 700 }}>
                        {result.error ? 'Execution Failed (exit code 1)' : `Process finished with exit code 0 (${result.ms}ms)`}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Tab 3: Memory & Stack Inspector */}
              {activeTab === 'memory' && (
                <div style={{ flex: 1, minHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }} className="navsb">
                  {/* Call Stack */}
                  <div style={{ background: 'var(--card2)', borderRadius: 10, padding: 10, border: '1px solid var(--line)' }}>
                    <div style={{ ...KICKER, marginBottom: 6 }}>Call Stack ({frames.length})</div>
                    {frames.length === 0 && <div style={{ fontSize: 11, color: 'var(--tx3)' }}>No active stack frames.</div>}
                    {[...frames].reverse().map((f, i) => (
                      <div key={`${f.sig}-${i}`} style={{ marginBottom: 6, padding: '6px 8px', borderRadius: 8, background: 'var(--card)', border: '1px solid var(--line2)' }}>
                        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: 'var(--accTx)' }}>{f.sig}</div>
                        {f.locals.map((l) => (
                          <div key={l.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, marginTop: 4, fontFamily: MONO }}>
                            <span style={{ color: 'var(--tx2)' }}>{l.type} {l.name}</span>
                            <span style={{ color: PAL.amber, fontWeight: 700 }}>{l.text}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>

                  {/* Heap Objects */}
                  <div style={{ background: 'var(--card2)', borderRadius: 10, padding: 10, border: '1px solid var(--line)' }}>
                    <div style={{ ...KICKER, marginBottom: 6 }}>Heap Objects ({heap.length})</div>
                    {heap.length === 0 && <div style={{ fontSize: 11, color: 'var(--tx3)' }}>No allocated objects on heap.</div>}
                    {heap.map((h) => (
                      <div key={h.name} style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: MONO, marginBottom: 4 }}>
                          <span style={{ color: PAL.mint, fontWeight: 700 }}>{h.type} {h.name}</span>
                          <span style={{ color: 'var(--tx3)' }}>{h.size} items</span>
                        </div>
                        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 4 }} className="hbar">
                          {(h.cells || []).map((c, cIdx) => (
                            <div key={cIdx} style={{ minWidth: 26, height: 26, borderRadius: 6, display: 'grid', placeItems: 'center', background: 'var(--card)', border: '1px solid var(--line2)', fontFamily: MONO, fontSize: 10.5, fontWeight: 700 }}>
                              {c}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab 4: Numerical Series Chart */}
              {activeTab === 'series' && (
                <div style={{ flex: 1, minHeight: 300 }}>
                  <Series values={result?.series || []} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Non-Obstructive Floating Playback HUD */}
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
          />
        )}
      </div>
    </div>
  );
}

/** Read-only line-numbered code viewer */
function CodeView({
  src,
  activeLine,
  errorLine,
  onEdit,
}: {
  src: string;
  activeLine: number | null;
  errorLine: number | null;
  onEdit: () => void;
}) {
  const lines = useMemo(() => {
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

  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (activeLine === null) return;
    scroller.current?.querySelector(`[data-line="${activeLine}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeLine]);

  return (
    <div
      ref={scroller}
      onDoubleClick={onEdit}
      title="Double-click to edit"
      className="navsb"
      style={{
        flex: 1,
        minHeight: 320,
        overflow: 'auto',
        borderRadius: 10,
        padding: '10px 0',
        background: 'var(--card2)',
        border: '1px solid var(--line2)',
        fontFamily: MONO,
        fontSize: 12.5,
        lineHeight: 1.65,
      }}
    >
      {lines.map((row, i) => {
        const n = i + 1;
        const on = n === activeLine;
        const bad = n === errorLine;
        return (
          <div
            key={n}
            data-line={n}
            style={{
              display: 'flex',
              gap: 12,
              padding: '0 12px',
              background: bad
                ? 'color-mix(in srgb, var(--pal-coral) 18%, transparent)'
                : on
                ? 'color-mix(in srgb, var(--acc) 18%, transparent)'
                : undefined,
              transition: 'background .2s ease',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 22,
                flex: 'none',
                textAlign: 'right',
                color: on ? 'var(--accTx)' : 'var(--tx3)',
                fontWeight: on ? 800 : 400,
                opacity: on ? 1 : 0.6,
                fontVariantNumeric: 'tabular-nums',
                userSelect: 'none',
              }}
            >
              {n}
            </span>
            <code style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {row.length === 0 ? ' ' : row.map((p, j) => (
                <span key={j} style={{ color: HUE[p.cls] ?? 'var(--tx)' }}>
                  {p.text}
                </span>
              ))}
            </code>
          </div>
        );
      })}
    </div>
  );
}

/** Numerical bar chart */
function Series({ values }: { values: number[] }) {
  if (!values.length) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--tx3)', fontSize: 12 }}>
        No numerical series logged via System.out yet.
      </div>
    );
  }
  const max = Math.max(...values.map(Math.abs), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={KICKER}>Numerical Output Graph</span>
        <span style={{ fontSize: 10, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
          {values.length} numbers
        </span>
      </div>
      <div className="hbar" style={{ display: 'flex', alignItems: 'flex-end', gap: 3, flex: 1, minHeight: 180, overflowX: 'auto', paddingBottom: 6 }}>
        {values.slice(0, 120).map((v, i) => (
          <span
            key={i}
            title={`Value: ${v}`}
            style={{
              flex: '1 0 10px',
              minWidth: 10,
              borderRadius: '4px 4px 2px 2px',
              height: `${Math.max(4, (Math.abs(v) / max) * 100)}%`,
              background: v < 0 ? PAL.coral : 'var(--acc)',
              transition: 'height .3s ease',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
        <span>First: {values[0]}</span>
        <span>Peak: {Math.max(...values)}</span>
        <span>Last: {values[values.length - 1]}</span>
      </div>
    </div>
  );
}
